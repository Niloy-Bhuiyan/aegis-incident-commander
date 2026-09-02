"""The simulated platform as a telemetry source."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from aegis.remediation.executor import execute as execute_action
from aegis.sim.engine import Sample, SimulationEngine
from aegis.sim.persistence import sync_change_log
from aegis.sources.base import ExecutionOutcome


class SimulatedSource:
    """Wraps the in-process metric engine. This is the demo and evaluation path."""

    name = "simulated"
    kind = "simulator"
    supports_remediation = True

    def __init__(self, engine: SimulationEngine) -> None:
        self.engine = engine

    async def collect(self) -> list[Sample]:
        return self.engine.tick()

    async def sync_changes(self, session: AsyncSession) -> None:
        await sync_change_log(session, self.engine)

    def scenario_label(self) -> str:
        return ",".join(sorted(self.engine.active_scenarios))

    def execute(self, action_id: str, service: str, params: dict) -> ExecutionOutcome:
        result = execute_action(self.engine, action_id, params)
        return ExecutionOutcome(
            action_id=result.action_id,
            params=result.params,
            executed=True,
            resolved_fault=result.resolved_fault,
            detail=result.detail,
        )

    def status(self) -> dict:
        return {"source": self.name, **self.engine.status()}
