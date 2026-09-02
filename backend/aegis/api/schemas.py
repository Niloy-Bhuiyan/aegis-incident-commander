"""Response models for the HTTP API."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, PlainSerializer


def _as_utc(value: datetime) -> str:
    """Always emit an explicit UTC offset.

    SQLite does not persist tzinfo, so timestamps come back naive. Serialising
    them without an offset makes every browser read them as local time, which
    showed a freshly opened incident as hours old.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


UtcDateTime = Annotated[datetime, PlainSerializer(_as_utc, return_type=str)]


class ServiceHealth(BaseModel):
    name: str
    tier: str
    description: str
    depends_on: list[str]
    status: str
    latency_p50_ms: float | None = None
    latency_p95_ms: float | None = None
    error_rate: float | None = None
    rps: float | None = None
    saturation: float | None = None
    slo_latency_p95_ms: float
    slo_error_rate: float
    breaches: list[str] = []


class SystemStatus(BaseModel):
    healthy: bool
    services: list[ServiceHealth]
    active_incidents: int
    telemetry: dict
    provider: str
    model: str
    knowledge_chunks: int


class MetricPoint(BaseModel):
    ts: UtcDateTime
    latency_p50_ms: float
    latency_p95_ms: float
    error_rate: float
    rps: float
    saturation: float


class ChangeEntry(BaseModel):
    id: int
    service: str
    kind: str
    version: str
    ts: UtcDateTime
    change_summary: str
    risk: str


class TopologyNode(BaseModel):
    id: str
    tier: str
    description: str
    status: str
    latency_p95_ms: float | None = None
    error_rate: float | None = None
    saturation: float | None = None


class TopologyEdge(BaseModel):
    source: str
    target: str


class Topology(BaseModel):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]


class EventOut(BaseModel):
    id: int
    ts: UtcDateTime
    kind: str
    actor: str
    message: str
    data: dict


class EvidenceOut(BaseModel):
    id: int
    ref: str
    kind: str
    source: str
    title: str
    content: str
    data: dict


class HypothesisOutModel(BaseModel):
    id: int
    rank: int
    cause_type: str
    statement: str
    mechanism: str
    suspect_service: str
    confidence: float
    citations: list[str]
    verdict: str
    support_score: float
    critic_note: str
    unsupported_claims: list[str]
    final_score: float


class PlanOut(BaseModel):
    id: int
    action_id: str
    params: dict
    rationale: str
    expected_effect: str
    rollback: str
    risk: str
    citations: list[str]
    status: str
    approved_by: str
    approved_at: UtcDateTime | None
    executed_at: UtcDateTime | None
    result: dict


class IncidentSummaryOut(BaseModel):
    id: int
    title: str
    service: str
    severity: str
    status: str
    workflow_state: str
    detector: str
    summary: str
    root_cause: str
    opened_at: UtcDateTime
    resolved_at: UtcDateTime | None
    scenario: str


class IncidentDetail(IncidentSummaryOut):
    trigger: dict
    workflow_error: str
    llm_usage: dict
    events: list[EventOut]
    evidence: list[EvidenceOut]
    hypotheses: list[HypothesisOutModel]
    plans: list[PlanOut]


class DocumentSummary(BaseModel):
    id: int
    path: str
    title: str
    doc_type: str
    service: str
    tags: list[str]
    chunks: int
    updated_at: UtcDateTime


class DocumentDetail(DocumentSummary):
    content: str


class SearchHit(BaseModel):
    ref: str
    chunk_id: int
    document_id: int
    title: str
    path: str
    doc_type: str
    service: str
    heading: str
    text: str
    score: float
    lexical_rank: int | None
    dense_rank: int | None


class ScenarioOut(BaseModel):
    id: str
    title: str
    description: str
    primary_service: str


class ApprovalRequest(BaseModel):
    approver: str = "operator"


class RejectionRequest(BaseModel):
    approver: str = "operator"
    reason: str = "not approved"


class InjectRequest(BaseModel):
    scenario_id: str
