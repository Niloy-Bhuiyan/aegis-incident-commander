"""Mirror simulator state into the database so the API can serve it."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.models import Deployment, Service
from aegis.sim.engine import SimulationEngine
from aegis.sim.topology import SERVICES


async def sync_services(session: AsyncSession) -> None:
    existing = {s.name for s in (await session.execute(select(Service))).scalars().all()}
    for spec in SERVICES.values():
        if spec.name in existing:
            continue
        session.add(
            Service(
                name=spec.name,
                tier=spec.tier,
                description=spec.description,
                depends_on=list(spec.depends_on),
            )
        )
    await session.commit()


async def sync_change_log(session: AsyncSession, engine: SimulationEngine) -> None:
    """Replace the persisted change log with the simulator's current view."""
    await session.execute(delete(Deployment))
    for entry in engine.change_log:
        session.add(
            Deployment(
                service=entry["service"],
                kind=entry["kind"],
                version=entry["version"],
                ts=entry["ts"],
                change_summary=entry["summary"],
                risk=entry["risk"],
            )
        )
    await session.commit()
