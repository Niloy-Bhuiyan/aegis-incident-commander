"""End to end over the Prometheus adapter, using the shipped test double.

The real PrometheusSource talks to tools/fake_prometheus.py through httpx, and
the samples it returns drive the unchanged detection path. This is the check
that the adapter works as a whole rather than per-function.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from aegis.detect.rules import evaluate
from aegis.sim.topology import SERVICES, set_topology
from aegis.sources.config import load
from aegis.sources.prometheus import PrometheusClient, PrometheusSource
from tools.fake_prometheus import app as fake_prometheus
from tools.fake_prometheus import engine as fake_engine

CONFIG = Path(__file__).resolve().parents[1] / "telemetry.local-demo.yml"


@pytest.fixture
async def prometheus_source():
    original = dict(SERVICES)
    config = load(CONFIG)
    set_topology(config.services)

    transport = httpx.ASGITransport(app=fake_prometheus)
    http = httpx.AsyncClient(transport=transport, base_url="http://prom.test")
    source = PrometheusSource(config, PrometheusClient("http://prom.test", client=http))

    fake_engine.restore()
    for _ in range(3):
        fake_engine.tick()

    yield source

    await http.aclose()
    fake_engine.restore()
    set_topology(original)


async def collect_windows(source: PrometheusSource, ticks: int) -> dict[str, list]:
    windows: dict[str, list] = {name: [] for name in SERVICES}
    for _ in range(ticks):
        for sample in await source.collect():
            windows[sample.service].append(sample)
    return windows


async def test_every_service_is_scraped_over_http(prometheus_source):
    samples = await prometheus_source.collect()
    assert {s.service for s in samples} == set(SERVICES)
    assert all(s.rps > 0 for s in samples)


async def test_a_healthy_platform_produces_no_detection(prometheus_source):
    windows = await collect_windows(prometheus_source, ticks=4)
    assert evaluate(windows) is None


@pytest.mark.parametrize(
    ("scenario_id", "expected_origin"),
    [
        ("checkout_latency_regression", "checkout-service"),
        ("auth_error_spike", "auth-service"),
        ("payments_db_timeout", "payments-db"),
    ],
)
async def test_a_fault_is_detected_through_the_prometheus_adapter(
    prometheus_source, scenario_id, expected_origin
):
    fake_engine.inject(scenario_id)
    windows = await collect_windows(prometheus_source, ticks=4)

    detection = evaluate(windows)
    assert detection is not None, "fault was not detected through the Prometheus path"
    assert detection.origin_service == expected_origin


async def test_the_change_log_is_read_over_http(prometheus_source):
    fake_engine.inject("checkout_latency_regression")
    records = await prometheus_source.fetch_changes()

    services = {r.service for r in records}
    assert "checkout-service" in services
    deploy = next(r for r in records if r.service == "checkout-service" and r.kind == "deploy")
    assert deploy.risk == "high"
    assert "pricing" in deploy.summary


async def test_status_surfaces_the_endpoint_after_a_real_scrape(prometheus_source):
    await prometheus_source.collect()
    status = prometheus_source.status()
    assert status["healthy"] is True
    assert status["missing_signals"] == {}
    assert status["last_collect"] is not None
