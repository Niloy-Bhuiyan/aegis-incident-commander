"""Typed contracts for every model output.

Each node returns a validated object, never free text. A response that does not
satisfy the schema is a failed node, not something downstream code has to parse
defensively.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

CauseType = Literal[
    "bad_deploy",
    "bad_config_change",
    "resource_exhaustion",
    "dependency_failure",
    "traffic_surge",
    "unknown",
]

Verdict = Literal["supported", "partially_supported", "unsupported", "contradicted"]


class Strict(BaseModel):
    """Base for schemas sent to the model: no extra keys allowed."""

    model_config = ConfigDict(extra="forbid")


class HypothesisOut(Strict):
    cause_type: CauseType
    statement: str = Field(description="One sentence stating the suspected root cause.")
    mechanism: str = Field(description="How that cause produces the observed signals.")
    suspect_service: str = Field(description="Service the cause originates in.")
    confidence: float = Field(ge=0.0, le=1.0)
    citations: list[str] = Field(
        description="Evidence refs (E1, E2, ...) and knowledge refs (K1, K2, ...) supporting this."
    )


class HypothesisSet(Strict):
    hypotheses: list[HypothesisOut]


class CriticVerdict(Strict):
    hypothesis_index: int = Field(ge=0, description="Zero-based index into the reviewed list.")
    verdict: Verdict
    support_score: float = Field(ge=0.0, le=1.0)
    unsupported_claims: list[str] = Field(
        description="Claims in the hypothesis not backed by any cited reference."
    )
    note: str


class CriticReview(Strict):
    verdicts: list[CriticVerdict]


class RemediationProposal(Strict):
    action_id: str = Field(description="Action id from the approved catalogue.")
    service: str
    key: str | None = Field(description="Config key, for revert_config. Null otherwise.")
    max_connections: int | None = Field(
        description="New ceiling, for increase_connection_pool. Null otherwise."
    )
    replicas: int | None = Field(description="Target replicas, for scale_out. Null otherwise.")
    dependency: str | None = Field(
        description="Dependency to shed, for enable_circuit_breaker. Null otherwise."
    )
    rationale: str
    expected_effect: str
    citations: list[str]

    def to_params(self, allowed: set[str]) -> dict[str, Any]:
        """Project the flat proposal onto the parameter names this action takes."""
        candidate = {
            "service": self.service,
            "key": self.key,
            "max_connections": self.max_connections,
            "replicas": self.replicas,
            "dependency": self.dependency,
        }
        return {k: v for k, v in candidate.items() if k in allowed and v is not None}


class IncidentSummary(Strict):
    summary: str = Field(description="Two or three sentences an on-call engineer can act on.")
    root_cause: str = Field(description="One sentence naming the root cause.")


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0
    cost_usd: float = 0.0

    def add(self, other: Usage) -> Usage:
        return Usage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            calls=self.calls + other.calls,
            cost_usd=round(self.cost_usd + other.cost_usd, 6),
        )
