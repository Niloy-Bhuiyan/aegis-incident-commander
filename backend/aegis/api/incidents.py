"""Incident listing, detail and the human approval gate."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aegis.agent.workflow import InvestigationWorkflow
from aegis.api.deps import get_workflow, require_token
from aegis.api.schemas import (
    ApprovalRequest,
    EventOut,
    EvidenceOut,
    HypothesisOutModel,
    IncidentDetail,
    IncidentSummaryOut,
    PlanOut,
    RejectionRequest,
)
from aegis.db import get_session
from aegis.models import Incident

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


def _summary(incident: Incident) -> IncidentSummaryOut:
    return IncidentSummaryOut(
        id=incident.id,
        title=incident.title,
        service=incident.service,
        severity=incident.severity,
        status=incident.status,
        workflow_state=incident.workflow_state,
        detector=incident.detector,
        summary=incident.summary,
        root_cause=incident.root_cause,
        opened_at=incident.opened_at,
        resolved_at=incident.resolved_at,
        scenario=incident.scenario,
    )


@router.get("", response_model=list[IncidentSummaryOut])
async def list_incidents(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> list[IncidentSummaryOut]:
    rows = (
        await session.execute(select(Incident).order_by(Incident.id.desc()).limit(limit))
    ).scalars().all()
    return [_summary(row) for row in rows]


@router.get("/{incident_id}", response_model=IncidentDetail)
async def get_incident(
    incident_id: int, session: AsyncSession = Depends(get_session)
) -> IncidentDetail:
    incident = (
        await session.execute(
            select(Incident)
            .where(Incident.id == incident_id)
            .options(
                selectinload(Incident.events),
                selectinload(Incident.evidence),
                selectinload(Incident.hypotheses),
                selectinload(Incident.plans),
            )
        )
    ).scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=404, detail="incident not found")

    return IncidentDetail(
        **_summary(incident).model_dump(),
        trigger=incident.trigger,
        workflow_error=incident.workflow_error,
        llm_usage=incident.llm_usage,
        events=[
            EventOut(
                id=e.id, ts=e.ts, kind=e.kind, actor=e.actor, message=e.message, data=e.data
            )
            for e in incident.events
        ],
        evidence=[
            EvidenceOut(
                id=e.id,
                ref=e.ref,
                kind=e.kind,
                source=e.source,
                title=e.title,
                content=e.content,
                data=e.data,
            )
            for e in incident.evidence
        ],
        hypotheses=[
            HypothesisOutModel(
                id=h.id,
                rank=h.rank,
                cause_type=h.cause_type,
                statement=h.statement,
                mechanism=h.mechanism,
                suspect_service=h.suspect_service,
                confidence=h.confidence,
                citations=h.citations,
                verdict=h.verdict,
                support_score=h.support_score,
                critic_note=h.critic_note,
                unsupported_claims=h.unsupported_claims,
                final_score=h.final_score,
            )
            for h in incident.hypotheses
        ],
        plans=[
            PlanOut(
                id=p.id,
                action_id=p.action_id,
                params=p.params,
                rationale=p.rationale,
                expected_effect=p.expected_effect,
                rollback=p.rollback,
                risk=p.risk,
                citations=p.citations,
                status=p.status,
                approved_by=p.approved_by,
                approved_at=p.approved_at,
                executed_at=p.executed_at,
                result=p.result,
            )
            for p in incident.plans
        ],
    )


@router.post("/{incident_id}/plans/{plan_id}/approve", dependencies=[Depends(require_token)])
async def approve_plan(
    incident_id: int,
    plan_id: int,
    body: ApprovalRequest,
    workflow: InvestigationWorkflow = Depends(get_workflow),
) -> dict:
    """Approve and execute. This is the only path from proposal to execution."""
    try:
        return await workflow.approve(incident_id, plan_id, body.approver)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{incident_id}/plans/{plan_id}/reject", dependencies=[Depends(require_token)])
async def reject_plan(
    incident_id: int,
    plan_id: int,
    body: RejectionRequest,
    workflow: InvestigationWorkflow = Depends(get_workflow),
) -> dict:
    try:
        await workflow.reject(incident_id, plan_id, body.approver, body.reason)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "rejected"}
