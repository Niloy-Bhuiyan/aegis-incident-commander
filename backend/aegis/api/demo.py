"""Demo Lab: inject failures, restore the platform, step the simulator."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.api.deps import get_engine, get_monitor, require_token
from aegis.api.schemas import InjectRequest, ScenarioOut
from aegis.db import get_session
from aegis.detect.monitor import ACTIVE_STATUSES, Monitor
from aegis.models import Incident, IncidentEvent, utcnow
from aegis.sim.engine import SimulationEngine
from aegis.sim.persistence import sync_change_log
from aegis.sim.scenarios import SCENARIOS

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/scenarios", response_model=list[ScenarioOut])
async def scenarios() -> list[ScenarioOut]:
    return [
        ScenarioOut(
            id=s.id,
            title=s.title,
            description=s.description,
            primary_service=s.primary_service,
        )
        for s in SCENARIOS.values()
    ]


@router.get("/state")
async def state(engine: SimulationEngine = Depends(get_engine)) -> dict:
    return engine.status()


@router.post("/inject", dependencies=[Depends(require_token)])
async def inject(
    body: InjectRequest,
    session: AsyncSession = Depends(get_session),
    engine: SimulationEngine = Depends(get_engine),
) -> dict:
    try:
        scenario = engine.inject(body.scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await sync_change_log(session, engine)
    return {"injected": scenario.id, "title": scenario.title, "state": engine.status()}


@router.post("/restore", dependencies=[Depends(require_token)])
async def restore(
    session: AsyncSession = Depends(get_session),
    engine: SimulationEngine = Depends(get_engine),
) -> dict:
    engine.restore()
    await sync_change_log(session, engine)

    active = (
        await session.execute(select(Incident).where(Incident.status.in_(ACTIVE_STATUSES)))
    ).scalars().all()
    for incident in active:
        incident.status = "cancelled"
        incident.workflow_state = "cancelled"
        incident.resolved_at = utcnow()
        session.add(
            IncidentEvent(
                incident_id=incident.id,
                kind="cancelled",
                actor="operator",
                message="Platform restored from the Demo Lab; incident cancelled.",
            )
        )
    await session.commit()
    return {"restored": True, "cancelled_incidents": len(active), "state": engine.status()}


@router.post("/tick", dependencies=[Depends(require_token)])
async def tick(monitor: Monitor = Depends(get_monitor), count: int = 1) -> dict:
    """Advance the simulator by hand.

    The background loop already ticks on a timer; this lets tests and the
    end-to-end run drive time deterministically instead of sleeping.
    """
    if count < 1 or count > 60:
        raise HTTPException(status_code=422, detail="count must be between 1 and 60")
    for _ in range(count):
        await monitor.tick_once()
    return {"ticks": count}


@router.post("/await-investigations", dependencies=[Depends(require_token)])
async def await_investigations(monitor: Monitor = Depends(get_monitor)) -> dict:
    """Block until in-flight investigations finish. Used by the E2E test."""
    await monitor.wait_for_investigations()
    return {"pending": 0}
