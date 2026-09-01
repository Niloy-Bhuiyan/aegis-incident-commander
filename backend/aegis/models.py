"""Persistence model. Every AI decision is written here so it can be audited."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Service(Base):
    __tablename__ = "services"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    tier: Mapped[str] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(Text, default="")
    depends_on: Mapped[list] = mapped_column(JSON, default=list)


class MetricSample(Base):
    __tablename__ = "metric_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service: Mapped[str] = mapped_column(String(64), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    latency_p50_ms: Mapped[float] = mapped_column(Float)
    latency_p95_ms: Mapped[float] = mapped_column(Float)
    error_rate: Mapped[float] = mapped_column(Float)
    rps: Mapped[float] = mapped_column(Float)
    saturation: Mapped[float] = mapped_column(Float)

    __table_args__ = (Index("ix_metric_service_ts", "service", "ts"),)


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(32), default="deploy")
    version: Mapped[str] = mapped_column(String(96))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    change_summary: Mapped[str] = mapped_column(Text, default="")
    risk: Mapped[str] = mapped_column(String(16), default="low")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    service: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(8), default="SEV3")
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    workflow_state: Mapped[str] = mapped_column(String(40), default="detected")
    detector: Mapped[str] = mapped_column(String(64), default="")
    trigger: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[str] = mapped_column(Text, default="")
    root_cause: Mapped[str] = mapped_column(Text, default="")
    scenario: Mapped[str] = mapped_column(String(64), default="")
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    workflow_error: Mapped[str] = mapped_column(Text, default="")
    llm_usage: Mapped[dict] = mapped_column(JSON, default=dict)

    events: Mapped[list[IncidentEvent]] = relationship(
        back_populates="incident", cascade="all, delete-orphan", order_by="IncidentEvent.id"
    )
    evidence: Mapped[list[Evidence]] = relationship(
        back_populates="incident", cascade="all, delete-orphan", order_by="Evidence.id"
    )
    hypotheses: Mapped[list[Hypothesis]] = relationship(
        back_populates="incident", cascade="all, delete-orphan", order_by="Hypothesis.rank"
    )
    plans: Mapped[list[RemediationPlan]] = relationship(
        back_populates="incident", cascade="all, delete-orphan", order_by="RemediationPlan.id"
    )


class IncidentEvent(Base):
    """Append-only audit timeline: actions taken, not hidden reasoning."""

    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    kind: Mapped[str] = mapped_column(String(48))
    actor: Mapped[str] = mapped_column(String(32), default="aegis")
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)

    incident: Mapped[Incident] = relationship(back_populates="events")


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    ref: Mapped[str] = mapped_column(String(16))
    kind: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    incident: Mapped[Incident] = relationship(back_populates="evidence")


class Hypothesis(Base):
    __tablename__ = "hypotheses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    rank: Mapped[int] = mapped_column(Integer, default=0)
    cause_type: Mapped[str] = mapped_column(String(48), default="unknown")
    statement: Mapped[str] = mapped_column(Text)
    mechanism: Mapped[str] = mapped_column(Text, default="")
    suspect_service: Mapped[str] = mapped_column(String(64), default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    verdict: Mapped[str] = mapped_column(String(24), default="unreviewed")
    support_score: Mapped[float] = mapped_column(Float, default=0.0)
    critic_note: Mapped[str] = mapped_column(Text, default="")
    unsupported_claims: Mapped[list] = mapped_column(JSON, default=list)
    final_score: Mapped[float] = mapped_column(Float, default=0.0)

    incident: Mapped[Incident] = relationship(back_populates="hypotheses")


class RemediationPlan(Base):
    __tablename__ = "remediation_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    action_id: Mapped[str] = mapped_column(String(64))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    rationale: Mapped[str] = mapped_column(Text, default="")
    expected_effect: Mapped[str] = mapped_column(Text, default="")
    rollback: Mapped[str] = mapped_column(Text, default="")
    risk: Mapped[str] = mapped_column(String(16), default="low")
    citations: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(24), default="awaiting_approval")
    approved_by: Mapped[str] = mapped_column(String(64), default="")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)

    incident: Mapped[Incident] = relationship(back_populates="plans")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String(256), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str] = mapped_column(String(32), index=True)
    service: Mapped[str] = mapped_column(String(64), default="", index=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    chunks: Mapped[list[DocChunk]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="DocChunk.ordinal"
    )


class DocChunk(Base):
    __tablename__ = "doc_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    ordinal: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str] = mapped_column(String(200), default="")
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(JSON, default=list)

    document: Mapped[Document] = relationship(back_populates="chunks")


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(64), default="")
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    cases: Mapped[list] = mapped_column(JSON, default=list)
