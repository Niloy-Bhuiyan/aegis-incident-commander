"""Injectable failure scenarios and their ground truth.

Ground truth lives next to the scenario so the evaluation harness scores the
agent against something it never sees. Nothing in this module is exposed to the
LLM: the workflow only ever observes telemetry, change events and documents.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Effect:
    """Multiplicative/additive distortion applied to one service."""

    latency_mult: float = 1.0
    error_add: float = 0.0
    saturation_add: float = 0.0
    rps_mult: float = 1.0


@dataclass(frozen=True)
class ChangeEvent:
    """A deploy or config change written to the change log when injecting."""

    service: str
    kind: str
    version: str
    summary: str
    risk: str
    age_seconds: int


@dataclass(frozen=True)
class GroundTruth:
    cause_type: str
    suspect_service: str
    action_id: str
    action_params: dict
    expected_evidence_kinds: tuple[str, ...]


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    description: str
    primary_service: str
    effects: dict[str, Effect]
    change_events: tuple[ChangeEvent, ...]
    ground_truth: GroundTruth
    # (action_id, target service) pairs that actually clear this fault.
    resolving_actions: frozenset[tuple[str, str]] = field(default_factory=frozenset)


SCENARIOS: dict[str, Scenario] = {
    "checkout_latency_regression": Scenario(
        id="checkout_latency_regression",
        title="Checkout latency regression",
        description=(
            "checkout-service p95 latency climbs roughly 5x after a release. "
            "Errors stay low; the gateway inherits the slowdown."
        ),
        primary_service="checkout-service",
        effects={
            "checkout-service": Effect(latency_mult=5.2, error_add=0.006, saturation_add=0.34),
        },
        change_events=(
            ChangeEvent(
                service="checkout-service",
                kind="deploy",
                version="checkout-service@4.12.0",
                summary=(
                    "Release 4.12.0: replace cached price lookup with a per-item pricing call "
                    "inside the cart loop; adds N queries per checkout."
                ),
                risk="high",
                age_seconds=240,
            ),
            ChangeEvent(
                service="inventory-service",
                kind="deploy",
                version="inventory-service@2.3.1",
                summary="Release 2.3.1: dependency bump, no behaviour change.",
                risk="low",
                age_seconds=5400,
            ),
        ),
        ground_truth=GroundTruth(
            cause_type="bad_deploy",
            suspect_service="checkout-service",
            action_id="rollback_deployment",
            action_params={"service": "checkout-service"},
            expected_evidence_kinds=("metrics", "change_log", "topology"),
        ),
        resolving_actions=frozenset({("rollback_deployment", "checkout-service")}),
    ),
    "auth_error_spike": Scenario(
        id="auth_error_spike",
        title="Authentication 5xx spike",
        description=(
            "auth-service starts returning HTTP 500 for a large share of token "
            "validations after a configuration change. The gateway error rate follows."
        ),
        primary_service="auth-service",
        effects={
            "auth-service": Effect(latency_mult=1.4, error_add=0.21, saturation_add=0.12),
        },
        change_events=(
            ChangeEvent(
                service="auth-service",
                kind="config_change",
                version="auth-service/config@2026-09-02.3",
                summary=(
                    "Rotated jwt_signing_key_id to key-2026-09 without publishing the public "
                    "half to the verification keyset."
                ),
                risk="high",
                age_seconds=200,
            ),
        ),
        ground_truth=GroundTruth(
            cause_type="bad_config_change",
            suspect_service="auth-service",
            action_id="revert_config",
            action_params={"service": "auth-service", "key": "jwt_signing_key_id"},
            expected_evidence_kinds=("metrics", "change_log", "topology"),
        ),
        resolving_actions=frozenset({("revert_config", "auth-service")}),
    ),
    "payments_db_timeout": Scenario(
        id="payments_db_timeout",
        title="Payments database connection exhaustion",
        description=(
            "payments-db saturates its connection pool. Queries queue, checkout and "
            "inventory time out, and the failure surfaces at the gateway."
        ),
        primary_service="payments-db",
        effects={
            "payments-db": Effect(latency_mult=7.5, error_add=0.09, saturation_add=0.52),
        },
        change_events=(
            ChangeEvent(
                service="payments-db",
                kind="capacity_event",
                version="payments-db/pool@default",
                summary=(
                    "Read traffic shifted from the replica to the primary during replica "
                    "maintenance; pool max_connections left at 120."
                ),
                risk="medium",
                age_seconds=300,
            ),
        ),
        ground_truth=GroundTruth(
            cause_type="resource_exhaustion",
            suspect_service="payments-db",
            action_id="increase_connection_pool",
            action_params={"service": "payments-db", "max_connections": 300},
            expected_evidence_kinds=("metrics", "change_log", "topology"),
        ),
        resolving_actions=frozenset({("increase_connection_pool", "payments-db")}),
    ),
}


def get_scenario(scenario_id: str) -> Scenario:
    if scenario_id not in SCENARIOS:
        raise KeyError(f"unknown scenario: {scenario_id}")
    return SCENARIOS[scenario_id]
