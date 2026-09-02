"""Telemetry configuration for a real metrics backend.

A Prometheus endpoint exposes numbers, not meaning. Three things it cannot tell
us have to be declared: which services exist, what depends on what, and what
"healthy" means for each. That is what this config carries, alongside the PromQL
that produces each signal.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from aegis.sim.topology import Baseline, ServiceSpec, Slo

REQUIRED_SIGNALS = ("latency_p50_ms", "latency_p95_ms", "error_rate", "rps", "saturation")


class TelemetryConfigError(ValueError):
    """The telemetry config is missing something Aegis cannot infer."""


@dataclass(frozen=True)
class ChangeSourceConfig:
    """PromQL returning one series per recent change.

    Labels carry the metadata; the sample value is a unix timestamp. This suits
    the common pattern of a deploy pipeline pushing a `deploy_timestamp` gauge.
    """

    query: str
    service_label: str = "service"
    version_label: str = "version"
    kind_label: str = "kind"
    risk_label: str = "risk"
    summary_label: str = "summary"


@dataclass(frozen=True)
class ServiceQueries:
    service: str
    queries: dict[str, str]


@dataclass(frozen=True)
class TelemetryConfig:
    url: str
    timeout_seconds: float
    services: dict[str, ServiceSpec]
    queries: dict[str, ServiceQueries]
    changes: ChangeSourceConfig | None


def _require(mapping: dict, key: str, where: str):
    if key not in mapping:
        raise TelemetryConfigError(f"{where} is missing required key '{key}'")
    return mapping[key]


def parse(raw: dict) -> TelemetryConfig:
    prometheus = _require(raw, "prometheus", "config root")
    url = str(_require(prometheus, "url", "prometheus")).rstrip("/")
    timeout = float(prometheus.get("timeout_seconds", 10.0))

    service_entries = _require(raw, "services", "config root")
    if not isinstance(service_entries, list) or not service_entries:
        raise TelemetryConfigError("'services' must be a non-empty list")

    specs: dict[str, ServiceSpec] = {}
    queries: dict[str, ServiceQueries] = {}

    for entry in service_entries:
        name = str(_require(entry, "name", "service entry"))
        where = f"service '{name}'"

        slo_raw = _require(entry, "slo", where)
        baseline_raw = _require(entry, "baseline", where)
        query_raw = _require(entry, "queries", where)

        missing = [s for s in REQUIRED_SIGNALS if s not in query_raw]
        if missing:
            raise TelemetryConfigError(f"{where} is missing queries for: {missing}")

        specs[name] = ServiceSpec(
            name=name,
            tier=str(entry.get("tier", "application")),
            description=str(entry.get("description", "")),
            depends_on=tuple(entry.get("depends_on", []) or ()),
            baseline=Baseline(
                latency_p50_ms=float(_require(baseline_raw, "latency_p50_ms", where)),
                latency_p95_ms=float(_require(baseline_raw, "latency_p95_ms", where)),
                error_rate=float(_require(baseline_raw, "error_rate", where)),
                rps=float(_require(baseline_raw, "rps", where)),
                saturation=float(_require(baseline_raw, "saturation", where)),
            ),
            slo=Slo(
                latency_p95_ms=float(_require(slo_raw, "latency_p95_ms", where)),
                error_rate=float(_require(slo_raw, "error_rate", where)),
                saturation=float(slo_raw.get("saturation", 0.92)),
            ),
            latency_coupling=float(entry.get("latency_coupling", 0.6)),
            error_coupling=float(entry.get("error_coupling", 0.7)),
            tags=tuple(entry.get("tags", []) or ()),
        )
        queries[name] = ServiceQueries(
            service=name,
            queries={signal: str(query_raw[signal]) for signal in REQUIRED_SIGNALS},
        )

    unknown = {
        dep for spec in specs.values() for dep in spec.depends_on if dep not in specs
    }
    if unknown:
        raise TelemetryConfigError(
            f"depends_on references services not in this config: {sorted(unknown)}"
        )

    changes_raw = raw.get("changes")
    changes = None
    if changes_raw:
        changes = ChangeSourceConfig(
            query=str(_require(changes_raw, "query", "changes")),
            service_label=str(changes_raw.get("service_label", "service")),
            version_label=str(changes_raw.get("version_label", "version")),
            kind_label=str(changes_raw.get("kind_label", "kind")),
            risk_label=str(changes_raw.get("risk_label", "risk")),
            summary_label=str(changes_raw.get("summary_label", "summary")),
        )

    return TelemetryConfig(
        url=url,
        timeout_seconds=timeout,
        services=specs,
        queries=queries,
        changes=changes,
    )


def load(path: str | Path) -> TelemetryConfig:
    path = Path(path)
    if not path.exists():
        raise TelemetryConfigError(f"telemetry config not found: {path}")
    return parse(yaml.safe_load(path.read_text(encoding="utf-8")) or {})
