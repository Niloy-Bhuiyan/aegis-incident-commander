"""Prometheus as a telemetry source.

Reads real metrics over the HTTP query API. Everything downstream - detection,
evidence, hypotheses, verification - is untouched: the only thing that changes
is where a Sample comes from.

Remediation is deliberately not executable here. Aegis will still investigate and
propose an action, but approving it records a dry run rather than pretending to
have changed infrastructure it has no credentials for.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.models import Deployment
from aegis.sim.engine import Sample
from aegis.sources.base import ChangeRecord, ExecutionOutcome
from aegis.sources.config import REQUIRED_SIGNALS, TelemetryConfig

log = structlog.get_logger(__name__)


class PrometheusError(RuntimeError):
    """The Prometheus endpoint could not answer a query."""


class PrometheusClient:
    """Thin wrapper over the instant-query API."""

    def __init__(
        self,
        base_url: str,
        timeout: float = 10.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def query(self, expression: str) -> list[dict]:
        """Run an instant query, returning the raw result vector."""
        try:
            response = await self._client.get(
                f"{self.base_url}/api/v1/query",
                params={"query": expression},
            )
        except httpx.HTTPError as exc:
            raise PrometheusError(f"request failed: {exc}") from exc

        if response.status_code != 200:
            raise PrometheusError(f"HTTP {response.status_code} for query: {expression}")

        payload = response.json()
        if payload.get("status") != "success":
            raise PrometheusError(
                f"query rejected ({payload.get('errorType')}): {payload.get('error')}"
            )
        return payload.get("data", {}).get("result", [])

    async def scalar(self, expression: str) -> float | None:
        """First sample value of an instant query, or None when nothing matched."""
        result = await self.query(expression)
        if not result:
            return None
        value = result[0].get("value")
        if not value or len(value) < 2:
            return None
        try:
            parsed = float(value[1])
        except (TypeError, ValueError):
            return None
        # Prometheus returns NaN as the string "NaN"; treat it as no data.
        return None if parsed != parsed else parsed

    async def health(self) -> bool:
        try:
            await self.query("vector(1)")
        except PrometheusError:
            return False
        return True


class PrometheusSource:
    """Read-only telemetry from a live Prometheus."""

    name = "prometheus"
    kind = "prometheus"
    supports_remediation = False

    def __init__(self, config: TelemetryConfig, client: PrometheusClient | None = None) -> None:
        self.config = config
        self.client = client or PrometheusClient(config.url, config.timeout_seconds)
        self._last_error: str | None = None
        self._last_collect: datetime | None = None
        self._missing_signals: dict[str, list[str]] = {}

    async def aclose(self) -> None:
        await self.client.aclose()

    # ----------------------------------------------------------- collection

    async def _collect_service(self, service: str) -> Sample | None:
        queries = self.config.queries[service].queries
        baseline = self.config.services[service].baseline

        values = await asyncio.gather(
            *(self.client.scalar(queries[signal]) for signal in REQUIRED_SIGNALS),
            return_exceptions=True,
        )

        readings: dict[str, float] = {}
        missing: list[str] = []
        for signal, value in zip(REQUIRED_SIGNALS, values, strict=True):
            if isinstance(value, Exception) or value is None:
                missing.append(signal)
                continue
            readings[signal] = float(value)

        if missing:
            self._missing_signals[service] = missing
            log.warning("prometheus_signal_missing", service=service, signals=missing)
        else:
            self._missing_signals.pop(service, None)

        # A partially-scraped service must not look healthy. Detection needs a
        # full sample, so an incomplete one is dropped rather than back-filled
        # with a baseline that would mask a real breach.
        if len(readings) != len(REQUIRED_SIGNALS):
            return None

        _ = baseline  # baselines are used downstream for ratio evidence
        return Sample(
            service=service,
            latency_p50_ms=readings["latency_p50_ms"],
            latency_p95_ms=readings["latency_p95_ms"],
            error_rate=readings["error_rate"],
            rps=readings["rps"],
            saturation=readings["saturation"],
        )

    async def collect(self) -> list[Sample]:
        results = await asyncio.gather(
            *(self._collect_service(service) for service in self.config.services),
            return_exceptions=True,
        )
        samples: list[Sample] = []
        errors: list[str] = []
        for service, result in zip(self.config.services, results, strict=True):
            if isinstance(result, Exception):
                errors.append(f"{service}: {result}")
                continue
            if result is not None:
                samples.append(result)

        self._last_error = "; ".join(errors) if errors else None
        self._last_collect = datetime.now(UTC)
        if errors:
            log.warning("prometheus_collect_partial", errors=errors)
        return samples

    # --------------------------------------------------------- change log

    async def fetch_changes(self) -> list[ChangeRecord]:
        spec = self.config.changes
        if spec is None:
            return []
        try:
            series = await self.client.query(spec.query)
        except PrometheusError as exc:
            log.warning("prometheus_changes_failed", error=str(exc))
            return []

        records: list[ChangeRecord] = []
        for item in series:
            labels = item.get("metric", {}) or {}
            service = labels.get(spec.service_label)
            if service not in self.config.services:
                continue
            value = item.get("value") or [None, None]
            try:
                ts = datetime.fromtimestamp(float(value[1]), tz=UTC)
            except (TypeError, ValueError):
                continue
            records.append(
                ChangeRecord(
                    service=service,
                    kind=labels.get(spec.kind_label, "deploy"),
                    version=labels.get(spec.version_label, "unknown"),
                    summary=labels.get(spec.summary_label, ""),
                    risk=labels.get(spec.risk_label, "unknown"),
                    ts=ts,
                )
            )
        return records

    async def sync_changes(self, session: AsyncSession) -> None:
        records = await self.fetch_changes()
        await session.execute(delete(Deployment))
        for record in records:
            session.add(
                Deployment(
                    service=record.service,
                    kind=record.kind,
                    version=record.version,
                    ts=record.ts,
                    change_summary=record.summary,
                    risk=record.risk,
                )
            )
        await session.commit()

    # -------------------------------------------------------------- rest

    def scenario_label(self) -> str:
        return ""

    def execute(self, action_id: str, service: str, params: dict) -> ExecutionOutcome:
        """Record the approved action without executing it.

        Aegis holds no credentials for the systems behind a Prometheus endpoint.
        Wiring a real executor means implementing this method against whatever
        performs the change - a deploy API, a config service, a runbook runner.
        """
        return ExecutionOutcome(
            action_id=action_id,
            params=params,
            executed=False,
            resolved_fault=False,
            detail=(
                f"Dry run: {action_id} on {service} was approved but not executed. "
                "The Prometheus source is read-only; no remediation executor is configured."
            ),
        )

    def status(self) -> dict:
        return {
            "source": self.name,
            "url": self.config.url,
            "services": list(self.config.services),
            "healthy": self._last_error is None,
            "last_error": self._last_error,
            "last_collect": self._last_collect.isoformat() if self._last_collect else None,
            "missing_signals": self._missing_signals,
            "supports_remediation": self.supports_remediation,
        }
