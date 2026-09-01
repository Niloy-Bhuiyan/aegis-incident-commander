"""System health, topology, telemetry and the action catalogue."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.api.deps import get_engine, get_store
from aegis.api.schemas import (
    ChangeEntry,
    MetricPoint,
    ServiceHealth,
    SystemStatus,
    Topology,
    TopologyEdge,
    TopologyNode,
)
from aegis.config import get_settings
from aegis.db import get_session
from aegis.detect.monitor import ACTIVE_STATUSES
from aegis.detect.rules import _breaches_for
from aegis.models import Deployment, Incident, MetricSample
from aegis.rag.store import KnowledgeStore
from aegis.remediation.actions import catalogue
from aegis.sim.engine import SimulationEngine
from aegis.sim.topology import SERVICES
from aegis.telemetry import recent_windows

router = APIRouter(prefix="/api", tags=["system"])


def _service_status(samples) -> tuple[str, list[str]]:
    if not samples:
        return "unknown", []
    breaches = _breaches_for(samples[-1])
    if not breaches:
        return "healthy", []
    return "degraded", [b.describe() for b in breaches]


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/system/status", response_model=SystemStatus)
async def system_status(
    session: AsyncSession = Depends(get_session),
    engine: SimulationEngine = Depends(get_engine),
    store: KnowledgeStore = Depends(get_store),
) -> SystemStatus:
    settings = get_settings()
    windows = await recent_windows(session, window=5)
    services: list[ServiceHealth] = []

    for spec in SERVICES.values():
        samples = windows.get(spec.name, [])
        status_label, breaches = _service_status(samples)
        latest = samples[-1] if samples else None
        services.append(
            ServiceHealth(
                name=spec.name,
                tier=spec.tier,
                description=spec.description,
                depends_on=list(spec.depends_on),
                status=status_label,
                latency_p50_ms=latest.latency_p50_ms if latest else None,
                latency_p95_ms=latest.latency_p95_ms if latest else None,
                error_rate=latest.error_rate if latest else None,
                rps=latest.rps if latest else None,
                saturation=latest.saturation if latest else None,
                slo_latency_p95_ms=spec.slo.latency_p95_ms,
                slo_error_rate=spec.slo.error_rate,
                breaches=breaches,
            )
        )

    active = (
        await session.execute(select(Incident).where(Incident.status.in_(ACTIVE_STATUSES)))
    ).scalars().all()

    return SystemStatus(
        healthy=all(s.status == "healthy" for s in services) and not active,
        services=services,
        active_incidents=len(active),
        simulator=engine.status(),
        provider="anthropic" if settings.llm_enabled else "offline-heuristic",
        model=settings.llm_model if settings.llm_enabled else "rules/v1",
        knowledge_chunks=store.size,
    )


@router.get("/system/topology", response_model=Topology)
async def topology(session: AsyncSession = Depends(get_session)) -> Topology:
    windows = await recent_windows(session, window=3)
    nodes: list[TopologyNode] = []
    edges: list[TopologyEdge] = []

    for spec in SERVICES.values():
        samples = windows.get(spec.name, [])
        status_label, _ = _service_status(samples)
        latest = samples[-1] if samples else None
        nodes.append(
            TopologyNode(
                id=spec.name,
                tier=spec.tier,
                description=spec.description,
                status=status_label,
                latency_p95_ms=latest.latency_p95_ms if latest else None,
                error_rate=latest.error_rate if latest else None,
                saturation=latest.saturation if latest else None,
            )
        )
        for dep in spec.depends_on:
            edges.append(TopologyEdge(source=spec.name, target=dep))

    return Topology(nodes=nodes, edges=edges)


@router.get("/services/{name}/metrics", response_model=list[MetricPoint])
async def service_metrics(
    name: str,
    limit: int = Query(default=60, ge=1, le=240),
    session: AsyncSession = Depends(get_session),
) -> list[MetricPoint]:
    if name not in SERVICES:
        raise HTTPException(status_code=404, detail="unknown service")
    rows = (
        await session.execute(
            select(MetricSample)
            .where(MetricSample.service == name)
            .order_by(MetricSample.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        MetricPoint(
            ts=row.ts,
            latency_p50_ms=row.latency_p50_ms,
            latency_p95_ms=row.latency_p95_ms,
            error_rate=row.error_rate,
            rps=row.rps,
            saturation=row.saturation,
        )
        for row in reversed(rows)
    ]


@router.get("/changes", response_model=list[ChangeEntry])
async def changes(
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> list[ChangeEntry]:
    rows = (
        await session.execute(
            select(Deployment).order_by(Deployment.ts.desc()).limit(limit)
        )
    ).scalars().all()
    return [
        ChangeEntry(
            id=row.id,
            service=row.service,
            kind=row.kind,
            version=row.version,
            ts=row.ts,
            change_summary=row.change_summary,
            risk=row.risk,
        )
        for row in rows
    ]


@router.get("/actions")
async def actions() -> list[dict]:
    """The complete remediation allowlist. Nothing outside this can execute."""
    return catalogue()
