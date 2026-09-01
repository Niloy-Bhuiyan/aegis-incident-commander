"""The remediation allowlist.

The model never emits a command. It selects an action id from this catalogue and
supplies parameters, which are then validated against the schema below. Anything
that is not in the catalogue, or that fails validation, is rejected before it
reaches the executor.
"""

from __future__ import annotations

from dataclasses import dataclass

from aegis.sim.topology import SERVICES


class ActionValidationError(ValueError):
    """Raised when a proposed action is not executable as specified."""


@dataclass(frozen=True)
class ParamSpec:
    name: str
    kind: str  # "service" | "int" | "string"
    required: bool = True
    minimum: int | None = None
    maximum: int | None = None
    choices: tuple[str, ...] | None = None
    description: str = ""


@dataclass(frozen=True)
class ActionSpec:
    id: str
    title: str
    description: str
    risk: str
    rollback: str
    params: tuple[ParamSpec, ...]

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "risk": self.risk,
            "rollback": self.rollback,
            "params": [
                {
                    "name": p.name,
                    "kind": p.kind,
                    "required": p.required,
                    "minimum": p.minimum,
                    "maximum": p.maximum,
                    "choices": list(p.choices) if p.choices else None,
                    "description": p.description,
                }
                for p in self.params
            ],
        }


SERVICE_PARAM = ParamSpec(
    name="service",
    kind="service",
    description="Target service. Must be a known service in the topology.",
)

ACTIONS: dict[str, ActionSpec] = {
    "rollback_deployment": ActionSpec(
        id="rollback_deployment",
        title="Roll back deployment",
        description="Revert a service to its previous released artifact.",
        risk="medium",
        rollback="Redeploy the newer version once a fix exists.",
        params=(SERVICE_PARAM,),
    ),
    "revert_config": ActionSpec(
        id="revert_config",
        title="Revert configuration key",
        description="Restore the previous value of a single configuration key.",
        risk="low",
        rollback="Re-apply the new value after correcting the procedure.",
        params=(
            SERVICE_PARAM,
            ParamSpec(
                name="key",
                kind="string",
                choices=("jwt_signing_key_id", "pricing_cache_mode", "pool_mode"),
                description="Configuration key to revert.",
            ),
        ),
    ),
    "increase_connection_pool": ActionSpec(
        id="increase_connection_pool",
        title="Increase connection pool",
        description="Raise the connection ceiling on a datastore. Online change.",
        risk="medium",
        rollback="Restore the previous ceiling during a maintenance window.",
        params=(
            SERVICE_PARAM,
            ParamSpec(
                name="max_connections",
                kind="int",
                minimum=120,
                maximum=600,
                description="New connection ceiling.",
            ),
        ),
    ),
    "scale_out": ActionSpec(
        id="scale_out",
        title="Scale out replicas",
        description="Add replicas. Mitigates demand saturation only.",
        risk="low",
        rollback="Scale back to the previous replica count.",
        params=(
            SERVICE_PARAM,
            ParamSpec(
                name="replicas",
                kind="int",
                minimum=1,
                maximum=48,
                description="Target replica count.",
            ),
        ),
    ),
    "restart_service": ActionSpec(
        id="restart_service",
        title="Rolling restart",
        description="Restart replicas in a rolling fashion. Clears in-process state only.",
        risk="low",
        rollback="No rollback required.",
        params=(SERVICE_PARAM,),
    ),
    "enable_circuit_breaker": ActionSpec(
        id="enable_circuit_breaker",
        title="Enable circuit breaker",
        description="Shed calls from a service to a failing dependency. Mitigation only.",
        risk="low",
        rollback="Disable the breaker once the dependency recovers.",
        params=(
            SERVICE_PARAM,
            ParamSpec(name="dependency", kind="service", description="Dependency to shed."),
        ),
    ),
}


def catalogue() -> list[dict]:
    return [action.as_dict() for action in ACTIONS.values()]


def validate(action_id: str, params: dict) -> dict:
    """Validate a proposed action. Returns the normalised parameter dict."""
    spec = ACTIONS.get(action_id)
    if spec is None:
        raise ActionValidationError(
            f"action '{action_id}' is not in the approved catalogue: {sorted(ACTIONS)}"
        )

    params = params or {}
    allowed = {p.name for p in spec.params}
    unexpected = set(params) - allowed
    if unexpected:
        raise ActionValidationError(
            f"action '{action_id}' received unexpected parameters: {sorted(unexpected)}"
        )

    normalised: dict = {}
    for param in spec.params:
        if param.name not in params:
            if param.required:
                raise ActionValidationError(
                    f"action '{action_id}' requires parameter '{param.name}'"
                )
            continue
        value = params[param.name]

        if param.kind == "service":
            if not isinstance(value, str) or value not in SERVICES:
                raise ActionValidationError(
                    f"parameter '{param.name}' must be a known service, got {value!r}"
                )
        elif param.kind == "int":
            if isinstance(value, bool) or not isinstance(value, int):
                raise ActionValidationError(
                    f"parameter '{param.name}' must be an integer, got {value!r}"
                )
            if param.minimum is not None and value < param.minimum:
                raise ActionValidationError(
                    f"parameter '{param.name}' must be >= {param.minimum}, got {value}"
                )
            if param.maximum is not None and value > param.maximum:
                raise ActionValidationError(
                    f"parameter '{param.name}' must be <= {param.maximum}, got {value}"
                )
        elif param.kind == "string":
            if not isinstance(value, str) or not value.strip():
                raise ActionValidationError(f"parameter '{param.name}' must be a non-empty string")
            if param.choices and value not in param.choices:
                raise ActionValidationError(
                    f"parameter '{param.name}' must be one of {list(param.choices)}, got {value!r}"
                )
        else:  # pragma: no cover - guards against a malformed catalogue entry
            raise ActionValidationError(f"unsupported parameter kind: {param.kind}")

        normalised[param.name] = value

    return normalised
