"""Reading telemetry back out of the database."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.models import MetricSample
from aegis.sim.engine import Sample
from aegis.sim.topology import SERVICES

WINDOW = 20


def _to_sample(row: MetricSample) -> Sample:
    return Sample(
        service=row.service,
        latency_p50_ms=row.latency_p50_ms,
        latency_p95_ms=row.latency_p95_ms,
        error_rate=row.error_rate,
        rps=row.rps,
        saturation=row.saturation,
    )


async def recent_windows(session: AsyncSession, window: int = WINDOW) -> dict[str, list[Sample]]:
    """Most recent samples per service, oldest first."""
    windows: dict[str, list[Sample]] = {}
    for service in SERVICES:
        rows = (
            await session.execute(
                select(MetricSample)
                .where(MetricSample.service == service)
                .order_by(MetricSample.id.desc())
                .limit(window)
            )
        ).scalars().all()
        windows[service] = [_to_sample(r) for r in reversed(rows)]
    return windows


def summarise(service: str, samples: list[Sample]) -> dict:
    """Compare the latest sample against the documented service baseline."""
    baseline = SERVICES[service].baseline
    if not samples:
        return {"service": service, "samples": 0}
    latest = samples[-1]
    return {
        "service": service,
        "samples": len(samples),
        "latency_p50_ms": latest.latency_p50_ms,
        "latency_p95_ms": latest.latency_p95_ms,
        "error_rate": latest.error_rate,
        "rps": latest.rps,
        "saturation": latest.saturation,
        "baseline_latency_p95_ms": baseline.latency_p95_ms,
        "baseline_error_rate": baseline.error_rate,
        "baseline_rps": baseline.rps,
        "latency_p95_ratio": round(latest.latency_p95_ms / baseline.latency_p95_ms, 3),
        "error_rate_delta": round(latest.error_rate - baseline.error_rate, 5),
        "rps_ratio": round(latest.rps / baseline.rps, 3) if baseline.rps else 1.0,
    }
