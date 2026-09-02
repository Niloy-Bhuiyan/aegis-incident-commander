"""Evaluation cases.

Ground truth for the three injectable failures, plus the knowledge base
documents a competent investigation should retrieve. The workflow never sees any
of this - it only observes telemetry, the change log and retrieved documents.
"""

from __future__ import annotations

from dataclasses import dataclass

from aegis.sim.scenarios import SCENARIOS


@dataclass(frozen=True)
class EvalCase:
    scenario_id: str
    expected_origin: str
    expected_cause_type: str
    expected_action_id: str
    expected_action_params: dict
    expected_document_fragments: tuple[str, ...]


EXPECTED_DOCUMENTS: dict[str, tuple[str, ...]] = {
    "checkout_latency_regression": (
        "runbooks/latency-regression-after-release.md",
        "incidents/INC-2041-checkout-pricing-loop.md",
        "architecture/checkout-service.md",
    ),
    "auth_error_spike": (
        "runbooks/auth-5xx-spike.md",
        "incidents/INC-1987-jwt-keyset-rotation.md",
        "architecture/auth-service.md",
    ),
    "payments_db_timeout": (
        "runbooks/database-connection-exhaustion.md",
        "incidents/INC-2103-payments-pool-exhaustion.md",
        "architecture/payments-db.md",
    ),
}


def cases() -> list[EvalCase]:
    out: list[EvalCase] = []
    for scenario in SCENARIOS.values():
        truth = scenario.ground_truth
        out.append(
            EvalCase(
                scenario_id=scenario.id,
                expected_origin=truth.suspect_service,
                expected_cause_type=truth.cause_type,
                expected_action_id=truth.action_id,
                expected_action_params=dict(truth.action_params),
                expected_document_fragments=EXPECTED_DOCUMENTS[scenario.id],
            )
        )
    return out
