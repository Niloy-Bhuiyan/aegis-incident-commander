"""Sandboxed execution of approved remediation actions.

The only effect an action can have is a state transition inside the in-process
simulator. There is no shell, no subprocess and no network egress on this path.
"""

from __future__ import annotations

from dataclasses import dataclass

from aegis.remediation.actions import ACTIONS, validate
from aegis.sim.engine import SimulationEngine


@dataclass
class ExecutionResult:
    action_id: str
    params: dict
    applied: bool
    resolved_fault: bool
    detail: str

    def as_dict(self) -> dict:
        return {
            "action_id": self.action_id,
            "params": self.params,
            "applied": self.applied,
            "resolved_fault": self.resolved_fault,
            "detail": self.detail,
        }


def execute(engine: SimulationEngine, action_id: str, params: dict) -> ExecutionResult:
    """Validate then apply. Validation failure never reaches the simulator."""
    normalised = validate(action_id, params)
    spec = ACTIONS[action_id]
    applied = engine.apply_action(action_id, normalised["service"], normalised)

    detail = (
        f"{spec.title} applied to {normalised['service']}"
        if applied.resolved_fault
        else f"{spec.title} applied to {normalised['service']}; underlying fault still present"
    )
    return ExecutionResult(
        action_id=action_id,
        params=normalised,
        applied=True,
        resolved_fault=applied.resolved_fault,
        detail=detail,
    )
