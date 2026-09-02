"""The Prometheus telemetry source, against a stub Prometheus HTTP API.

These exercise the real client and the real parsing path - only the network is
replaced, by an httpx MockTransport that answers /api/v1/query the way
Prometheus does.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from aegis.detect.rules import evaluate
from aegis.sim.topology import SERVICES, ServiceSpec, set_topology
from aegis.sources.config import TelemetryConfigError, load, parse
from aegis.sources.prometheus import PrometheusClient, PrometheusError, PrometheusSource

EXAMPLE_CONFIG = Path(__file__).resolve().parents[1] / "telemetry.prometheus.example.yml"


def minimal_config(**overrides) -> dict:
    base = {
        "prometheus": {"url": "http://prom.test:9090"},
        "services": [
            {
                "name": "api",
                "tier": "edge",
                "depends_on": ["db"],
                "slo": {"latency_p95_ms": 400, "error_rate": 0.02},
                "baseline": {
                    "latency_p50_ms": 45,
                    "latency_p95_ms": 120,
                    "error_rate": 0.002,
                    "rps": 850,
                    "saturation": 0.35,
                },
                "queries": {
                    "latency_p50_ms": "q_p50_api",
                    "latency_p95_ms": "q_p95_api",
                    "error_rate": "q_err_api",
                    "rps": "q_rps_api",
                    "saturation": "q_sat_api",
                },
            },
            {
                "name": "db",
                "tier": "datastore",
                "depends_on": [],
                "slo": {"latency_p95_ms": 150, "error_rate": 0.01},
                "baseline": {
                    "latency_p50_ms": 12,
                    "latency_p95_ms": 38,
                    "error_rate": 0.0005,
                    "rps": 640,
                    "saturation": 0.45,
                },
                "queries": {
                    "latency_p50_ms": "q_p50_db",
                    "latency_p95_ms": "q_p95_db",
                    "error_rate": "q_err_db",
                    "rps": "q_rps_db",
                    "saturation": "q_sat_db",
                },
            },
        ],
    }
    base.update(overrides)
    return base


def vector(value: float, labels: dict | None = None) -> dict:
    return {
        "status": "success",
        "data": {
            "resultType": "vector",
            "result": [{"metric": labels or {}, "value": [1756000000, str(value)]}],
        },
    }


def stub_client(responses: dict, record: list | None = None) -> PrometheusClient:
    """Answer each PromQL expression with a canned Prometheus payload."""

    def handler(request: httpx.Request) -> httpx.Response:
        expression = request.url.params.get("query", "")
        if record is not None:
            record.append(expression)
        payload = responses.get(expression)
        if payload is None:
            return httpx.Response(200, json={"status": "success", "data": {"result": []}})
        if isinstance(payload, int):
            return httpx.Response(payload, text="boom")
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(handler)
    return PrometheusClient(
        "http://prom.test:9090", client=httpx.AsyncClient(transport=transport)
    )


HEALTHY = {
    "q_p50_api": vector(45.0),
    "q_p95_api": vector(118.0),
    "q_err_api": vector(0.002),
    "q_rps_api": vector(840.0),
    "q_sat_api": vector(0.35),
    "q_p50_db": vector(12.0),
    "q_p95_db": vector(37.0),
    "q_err_db": vector(0.0005),
    "q_rps_db": vector(650.0),
    "q_sat_db": vector(0.45),
}


# ---------------------------------------------------------------- config


def test_config_requires_a_dependency_graph_slos_and_baselines():
    raw = minimal_config()
    del raw["services"][0]["slo"]
    with pytest.raises(TelemetryConfigError, match="missing required key 'slo'"):
        parse(raw)

    raw = minimal_config()
    del raw["services"][0]["baseline"]
    with pytest.raises(TelemetryConfigError, match="missing required key 'baseline'"):
        parse(raw)


def test_config_rejects_a_missing_signal_query():
    raw = minimal_config()
    del raw["services"][0]["queries"]["saturation"]
    with pytest.raises(TelemetryConfigError, match="missing queries for.*saturation"):
        parse(raw)


def test_config_rejects_a_dangling_dependency():
    raw = minimal_config()
    raw["services"][0]["depends_on"] = ["nonexistent"]
    with pytest.raises(TelemetryConfigError, match="services not in this config"):
        parse(raw)


def test_config_reports_a_missing_file():
    with pytest.raises(TelemetryConfigError, match="not found"):
        load("no/such/telemetry.yml")


def test_shipped_example_config_parses():
    config = load(EXAMPLE_CONFIG)
    assert set(config.services) == {
        "gateway",
        "auth-service",
        "checkout-service",
        "inventory-service",
        "payments-db",
        "session-cache",
    }
    assert config.services["checkout-service"].depends_on == ("payments-db", "inventory-service")
    assert config.changes is not None
    for spec in config.queries.values():
        assert len(spec.queries) == 5


# ---------------------------------------------------------------- topology


def test_topology_can_be_replaced_from_config_and_restored():
    original = dict(SERVICES)
    try:
        set_topology(parse(minimal_config()).services)
        assert set(SERVICES) == {"api", "db"}
        assert SERVICES["api"].depends_on == ("db",)
    finally:
        set_topology(original)
    assert "gateway" in SERVICES


def test_topology_rejects_a_cycle():
    original = dict(SERVICES)
    spec_a = ServiceSpec(
        name="a",
        tier="application",
        description="",
        depends_on=("b",),
        baseline=SERVICES["gateway"].baseline,
        slo=SERVICES["gateway"].slo,
    )
    spec_b = ServiceSpec(
        name="b",
        tier="application",
        description="",
        depends_on=("a",),
        baseline=SERVICES["gateway"].baseline,
        slo=SERVICES["gateway"].slo,
    )
    try:
        with pytest.raises(ValueError, match="cycle"):
            set_topology({"a": spec_a, "b": spec_b})
    finally:
        set_topology(original)


# ------------------------------------------------------------------ client


async def test_client_parses_an_instant_query():
    client = stub_client({"q_p95_api": vector(118.5)})
    assert await client.scalar("q_p95_api") == pytest.approx(118.5)
    await client.aclose()


async def test_client_returns_none_for_an_empty_result():
    client = stub_client({})
    assert await client.scalar("anything") is None
    await client.aclose()


async def test_client_treats_nan_as_no_data():
    client = stub_client({"q": vector(float("nan"))})
    assert await client.scalar("q") is None
    await client.aclose()


async def test_client_raises_on_a_rejected_query():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={"status": "error", "errorType": "bad_data", "error": "parse error"},
        )

    client = PrometheusClient(
        "http://prom.test:9090", client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    with pytest.raises(PrometheusError, match="HTTP 400"):
        await client.query("nonsense{")
    await client.aclose()


async def test_client_raises_on_a_transport_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = PrometheusClient(
        "http://prom.test:9090", client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    with pytest.raises(PrometheusError, match="request failed"):
        await client.query("up")
    await client.aclose()


# ------------------------------------------------------------------ source


async def test_source_collects_one_sample_per_service():
    config = parse(minimal_config())
    seen: list[str] = []
    source = PrometheusSource(config, stub_client(HEALTHY, record=seen))

    samples = await source.collect()

    assert {s.service for s in samples} == {"api", "db"}
    api = next(s for s in samples if s.service == "api")
    assert api.latency_p95_ms == pytest.approx(118.0)
    assert api.error_rate == pytest.approx(0.002)
    # Exactly the configured PromQL was issued - nothing invented.
    assert set(seen) == set(HEALTHY)
    await source.client.aclose()


async def test_a_partially_scraped_service_is_dropped_not_faked():
    """A missing signal must never be back-filled into a healthy-looking sample."""
    responses = dict(HEALTHY)
    del responses["q_sat_api"]
    config = parse(minimal_config())
    source = PrometheusSource(config, stub_client(responses))

    samples = await source.collect()

    assert {s.service for s in samples} == {"db"}
    assert source.status()["missing_signals"] == {"api": ["saturation"]}
    await source.client.aclose()


async def test_collected_samples_drive_the_normal_detector():
    """The whole point: real telemetry flows into the unchanged detection path."""
    original = dict(SERVICES)
    config = parse(minimal_config())
    breaching = dict(HEALTHY)
    breaching["q_p95_db"] = vector(420.0)  # SLO is 150ms
    breaching["q_sat_db"] = vector(0.97)
    breaching["q_err_db"] = vector(0.08)

    try:
        set_topology(config.services)
        source = PrometheusSource(config, stub_client(breaching))
        windows: dict[str, list] = {"api": [], "db": []}
        for _ in range(3):
            for sample in await source.collect():
                windows[sample.service].append(sample)
        await source.client.aclose()

        detection = evaluate(windows)
        assert detection is not None
        assert detection.origin_service == "db"
        assert "latency_p95" in {b.signal for b in detection.breaches}
    finally:
        set_topology(original)


async def test_changes_are_read_from_labelled_series():
    raw = minimal_config()
    raw["changes"] = {"query": "aegis_change_timestamp_seconds"}
    config = parse(raw)

    payload = {
        "status": "success",
        "data": {
            "resultType": "vector",
            "result": [
                {
                    "metric": {
                        "service": "api",
                        "version": "api@4.12.0",
                        "kind": "deploy",
                        "risk": "high",
                        "summary": "pricing moved into the per-item loop",
                    },
                    "value": [1756000000, "1756000000"],
                },
                {
                    "metric": {"service": "not-in-config", "version": "x@1"},
                    "value": [1756000000, "1756000000"],
                },
            ],
        },
    }
    source = PrometheusSource(config, stub_client({"aegis_change_timestamp_seconds": payload}))

    records = await source.fetch_changes()

    assert len(records) == 1, "series for unknown services must be ignored"
    assert records[0].service == "api"
    assert records[0].risk == "high"
    assert records[0].ts == datetime.fromtimestamp(1756000000, tz=UTC)
    await source.client.aclose()


async def test_remediation_is_a_dry_run_and_says_so():
    config = parse(minimal_config())
    source = PrometheusSource(config, stub_client(HEALTHY))

    outcome = source.execute("rollback_deployment", "api", {"service": "api"})

    assert outcome.executed is False
    assert outcome.resolved_fault is False
    assert "read-only" in outcome.detail
    assert source.supports_remediation is False
    await source.client.aclose()


async def test_status_reports_the_endpoint_and_last_error():
    config = parse(minimal_config())
    source = PrometheusSource(config, stub_client(HEALTHY))
    await source.collect()

    status = source.status()
    assert status["source"] == "prometheus"
    assert status["url"] == "http://prom.test:9090"
    assert status["healthy"] is True
    assert status["supports_remediation"] is False
    assert json.dumps(status)  # serialisable for the API response
    await source.client.aclose()
