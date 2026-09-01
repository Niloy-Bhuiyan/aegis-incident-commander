"""Prometheus-compatible metrics, exposed at /metrics."""

from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest

from aegis.sim.engine import Sample

REGISTRY = CollectorRegistry()

service_latency_p95 = Gauge(
    "aegis_service_latency_p95_ms",
    "Observed p95 latency per service",
    ["service"],
    registry=REGISTRY,
)
service_error_rate = Gauge(
    "aegis_service_error_rate",
    "Observed error rate per service",
    ["service"],
    registry=REGISTRY,
)
service_saturation = Gauge(
    "aegis_service_saturation",
    "Observed saturation per service",
    ["service"],
    registry=REGISTRY,
)
service_rps = Gauge(
    "aegis_service_requests_per_second",
    "Observed request rate per service",
    ["service"],
    registry=REGISTRY,
)

incidents_opened = Counter(
    "aegis_incidents_opened_total",
    "Incidents opened by the deterministic detector",
    registry=REGISTRY,
)
incidents_resolved = Counter(
    "aegis_incidents_resolved_total",
    "Incidents resolved after verified recovery",
    registry=REGISTRY,
)
workflow_state_gauge = Gauge(
    "aegis_workflow_state_entered_total",
    "Workflow states entered",
    ["state"],
    registry=REGISTRY,
)
node_duration = Histogram(
    "aegis_workflow_node_seconds",
    "Wall time per workflow node",
    ["node"],
    registry=REGISTRY,
)
llm_calls = Counter(
    "aegis_llm_calls_total",
    "Reasoning calls by provider",
    ["provider", "node"],
    registry=REGISTRY,
)


def observe_service_sample(sample: Sample) -> None:
    service_latency_p95.labels(service=sample.service).set(sample.latency_p95_ms)
    service_error_rate.labels(service=sample.service).set(sample.error_rate)
    service_saturation.labels(service=sample.service).set(sample.saturation)
    service_rps.labels(service=sample.service).set(sample.rps)


def render() -> bytes:
    return generate_latest(REGISTRY)
