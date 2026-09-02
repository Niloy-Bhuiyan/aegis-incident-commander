"""Telemetry sources: where Aegis gets its numbers."""

from __future__ import annotations

import structlog

from aegis.sim.engine import SimulationEngine
from aegis.sim.topology import set_topology
from aegis.sources.base import ChangeRecord, ExecutionOutcome, TelemetrySource
from aegis.sources.config import TelemetryConfigError, load
from aegis.sources.prometheus import PrometheusClient, PrometheusSource
from aegis.sources.simulated import SimulatedSource

log = structlog.get_logger(__name__)

__all__ = [
    "ChangeRecord",
    "ExecutionOutcome",
    "PrometheusClient",
    "PrometheusSource",
    "SimulatedSource",
    "TelemetrySource",
    "build_source",
]


def build_source(kind: str, config_path: str | None, engine: SimulationEngine) -> TelemetrySource:
    """Construct the configured source.

    Falls back to the simulator if Prometheus is requested without a usable
    config - loudly, so a misconfiguration is visible rather than silently
    producing an empty platform.
    """
    if kind != "prometheus":
        return SimulatedSource(engine)

    if not config_path:
        raise TelemetryConfigError(
            "AEGIS_TELEMETRY_SOURCE=prometheus requires AEGIS_TELEMETRY_CONFIG"
        )

    config = load(config_path)
    set_topology(config.services)
    log.info(
        "telemetry_source_configured",
        source="prometheus",
        url=config.url,
        services=len(config.services),
        change_query=config.changes is not None,
    )
    return PrometheusSource(config)
