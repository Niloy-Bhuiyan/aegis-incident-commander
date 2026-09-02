"""The telemetry source boundary.

Everything upstream of this interface is "where the numbers come from"; everything
downstream - detection, evidence, hypotheses, verification - is unchanged whether
those numbers are simulated or scraped from a real Prometheus.

A source also owns whether remediation can actually be executed. The simulator
can apply an action to itself; a read-only Prometheus cannot, and says so rather
than pretending.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol, runtime_checkable

from sqlalchemy.ext.asyncio import AsyncSession

from aegis.sim.engine import Sample


@dataclass
class ChangeRecord:
    service: str
    kind: str
    version: str
    summary: str
    risk: str
    ts: datetime


@dataclass
class ExecutionOutcome:
    """Result of an approved action. `executed` is false for read-only sources."""

    action_id: str
    params: dict
    executed: bool
    resolved_fault: bool
    detail: str

    def as_dict(self) -> dict:
        return {
            "action_id": self.action_id,
            "params": self.params,
            "applied": self.executed,
            "resolved_fault": self.resolved_fault,
            "detail": self.detail,
        }


@runtime_checkable
class TelemetrySource(Protocol):
    """Where Aegis gets its numbers, and what it may do about them."""

    name: str
    kind: str
    supports_remediation: bool

    async def collect(self) -> list[Sample]:
        """One sample per known service, newest reading."""
        ...

    async def sync_changes(self, session: AsyncSession) -> None:
        """Refresh the persisted change log from this source."""
        ...

    def scenario_label(self) -> str:
        """Ground-truth label, only meaningful for the simulator."""
        ...

    def execute(self, action_id: str, service: str, params: dict) -> ExecutionOutcome:
        """Apply an already-validated action."""
        ...

    def status(self) -> dict:
        ...


def utcnow() -> datetime:
    return datetime.now(UTC)
