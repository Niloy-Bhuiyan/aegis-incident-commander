"""The investigation state machine.

A fixed sequence of nodes, each persisting what it did before the next one runs.
Deterministic nodes (evidence, retrieval, ranking, execution, verification) sit
either side of the three reasoning nodes, which is where the model earns its
place: hypothesis generation, criticism and remediation selection.

State: detected -> collecting_evidence -> retrieving_knowledge ->
generating_hypotheses -> critiquing -> ranking -> planning_remediation ->
awaiting_approval -> executing -> verifying -> resolved
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from aegis.agent import evidence as evidence_mod
from aegis.agent.context import EvidenceItem, InvestigationContext
from aegis.agent.provider import HeuristicProvider, LLMError, LLMProvider
from aegis.agent.schemas import HypothesisOut
from aegis.models import Evidence, Hypothesis, Incident, IncidentEvent, RemediationPlan, utcnow
from aegis.rag.store import KnowledgeStore
from aegis.remediation.actions import ACTIONS, ActionValidationError, validate
from aegis.remediation.executor import execute as execute_action
from aegis.remediation.verifier import verify
from aegis.sim.engine import SimulationEngine
from aegis.telemetry import recent_windows

log = structlog.get_logger(__name__)

VERDICT_MULTIPLIER = {
    "supported": 1.0,
    "partially_supported": 0.8,
    "unsupported": 0.35,
    "contradicted": 0.15,
    "unreviewed": 0.6,
}

KNOWLEDGE_TOP_K = 6


@dataclass
class RankedHypothesis:
    out: HypothesisOut
    verdict: str
    support_score: float
    unsupported_claims: list[str]
    critic_note: str
    citation_validity: float
    final_score: float


class InvestigationWorkflow:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        store: KnowledgeStore,
        provider: LLMProvider,
        engine: SimulationEngine,
    ) -> None:
        self.session_factory = session_factory
        self.store = store
        self.provider = provider
        self.engine = engine

    # ------------------------------------------------------------ plumbing

    async def _event(
        self,
        session: AsyncSession,
        incident: Incident,
        kind: str,
        message: str,
        data: dict | None = None,
        actor: str = "aegis",
    ) -> None:
        session.add(
            IncidentEvent(
                incident_id=incident.id,
                kind=kind,
                actor=actor,
                message=message,
                data=data or {},
            )
        )
        await session.flush()

    async def _set_state(self, session: AsyncSession, incident: Incident, state: str) -> None:
        incident.workflow_state = state
        await session.flush()

    async def _degrade(self, session: AsyncSession, incident: Incident, exc: LLMError) -> None:
        """Record an LLM failure and finish the incident on the offline provider."""
        log.warning("llm_node_failed", incident_id=incident.id, error=str(exc))
        await self._event(
            session,
            incident,
            "llm_error",
            f"Reasoning provider failed ({exc}). Continuing on the offline heuristic provider.",
            {"error": str(exc), "previous_provider": self.provider.name},
        )
        self.provider = HeuristicProvider()

    # --------------------------------------------------------- main phases

    async def run_investigation(self, incident_id: int) -> None:
        """Run from evidence collection to awaiting_approval."""
        async with self.session_factory() as session:
            incident = await session.get(Incident, incident_id)
            if incident is None:
                return
            try:
                await self._investigate(session, incident)
            except Exception as exc:  # noqa: BLE001 - an incident must never crash the loop
                log.exception("investigation_failed", incident_id=incident_id)
                incident.workflow_state = "failed"
                incident.workflow_error = f"{type(exc).__name__}: {exc}"
                await self._event(
                    session, incident, "workflow_failed", f"Investigation failed: {exc}"
                )
            await session.commit()

    async def _investigate(self, session: AsyncSession, incident: Incident) -> None:
        # --- deterministic: evidence -----------------------------------
        await self._set_state(session, incident, "collecting_evidence")
        items = await evidence_mod.collect(session, incident)
        for item in items:
            session.add(
                Evidence(
                    incident_id=incident.id,
                    ref=item.ref,
                    kind=item.kind,
                    source=item.source,
                    title=item.title,
                    content=item.content,
                    data=item.data,
                )
            )
        await session.flush()
        await self._event(
            session,
            incident,
            "evidence_collected",
            f"Collected {len(items)} evidence items from telemetry, topology and the change log.",
            {"refs": [i.ref for i in items]},
        )

        # --- deterministic: retrieval ----------------------------------
        await self._set_state(session, incident, "retrieving_knowledge")
        query = evidence_mod.build_query(incident, items)
        retrieved = self.store.search(query, k=KNOWLEDGE_TOP_K, service=incident.service)
        knowledge: list[EvidenceItem] = []
        for chunk in retrieved:
            item = EvidenceItem(
                ref=chunk.ref,
                kind="knowledge",
                source=chunk.path,
                title=f"{chunk.title} - {chunk.heading}" if chunk.heading else chunk.title,
                content=chunk.text,
                data=chunk.as_dict(),
            )
            knowledge.append(item)
            session.add(
                Evidence(
                    incident_id=incident.id,
                    ref=item.ref,
                    kind="knowledge",
                    source=item.source,
                    title=item.title,
                    content=item.content,
                    data=item.data,
                )
            )
        await session.flush()
        await self._event(
            session,
            incident,
            "knowledge_retrieved",
            f"Retrieved {len(knowledge)} knowledge base excerpts for query: {query}",
            {"query": query, "refs": [k.ref for k in knowledge], "index_size": self.store.size},
        )

        ctx = InvestigationContext(
            incident_title=incident.title,
            service=incident.service,
            severity=incident.severity,
            breach_summary="; ".join(
                f"{b['service']} {b['signal']}" for b in incident.trigger.get("breaches", [])
            ),
            evidence=items,
            knowledge=knowledge,
        )

        # --- reasoning: hypotheses -------------------------------------
        await self._set_state(session, incident, "generating_hypotheses")
        try:
            generated = await self.provider.hypotheses(ctx)
        except LLMError as exc:
            await self._degrade(session, incident, exc)
            generated = await self.provider.hypotheses(ctx)
        await self._event(
            session,
            incident,
            "hypotheses_generated",
            f"{self.provider.name} produced {len(generated.hypotheses)} candidate root causes.",
            {"provider": self.provider.name, "model": self.provider.model},
        )

        # --- reasoning: criticism --------------------------------------
        await self._set_state(session, incident, "critiquing")
        try:
            review = await self.provider.critique(ctx, generated.hypotheses)
        except LLMError as exc:
            await self._degrade(session, incident, exc)
            review = await self.provider.critique(ctx, generated.hypotheses)

        # --- deterministic: ranking ------------------------------------
        await self._set_state(session, incident, "ranking")
        ranked = self._rank(ctx, generated.hypotheses, review)
        for position, item in enumerate(ranked, start=1):
            session.add(
                Hypothesis(
                    incident_id=incident.id,
                    rank=position,
                    cause_type=item.out.cause_type,
                    statement=item.out.statement,
                    mechanism=item.out.mechanism,
                    suspect_service=item.out.suspect_service,
                    confidence=item.out.confidence,
                    citations=item.out.citations,
                    verdict=item.verdict,
                    support_score=item.support_score,
                    critic_note=item.critic_note,
                    unsupported_claims=item.unsupported_claims,
                    final_score=item.final_score,
                )
            )
        await session.flush()
        unsupported_total = sum(len(r.unsupported_claims) for r in ranked)
        await self._event(
            session,
            incident,
            "hypotheses_reviewed",
            (
                f"Critic reviewed {len(ranked)} hypotheses and flagged {unsupported_total} "
                "unsupported claim(s). Ranked by confidence, critic support and citation validity."
            ),
            {
                "ranking": [
                    {
                        "rank": i + 1,
                        "cause_type": r.out.cause_type,
                        "verdict": r.verdict,
                        "final_score": round(r.final_score, 3),
                    }
                    for i, r in enumerate(ranked)
                ]
            },
        )

        if not ranked:
            raise RuntimeError("no hypotheses survived review")

        # --- reasoning: remediation plan -------------------------------
        await self._set_state(session, incident, "planning_remediation")
        top = ranked[0]
        try:
            proposal = await self.provider.plan(ctx, top.out)
        except LLMError as exc:
            await self._degrade(session, incident, exc)
            proposal = await self.provider.plan(ctx, top.out)

        spec = ACTIONS.get(proposal.action_id)
        if spec is None:
            raise RuntimeError(f"proposed action not in catalogue: {proposal.action_id}")
        params = proposal.to_params({p.name for p in spec.params})
        try:
            params = validate(proposal.action_id, params)
        except ActionValidationError as exc:
            await self._event(
                session,
                incident,
                "plan_rejected",
                f"Proposed action failed validation and was not offered for approval: {exc}",
                {"action_id": proposal.action_id, "params": params},
            )
            raise

        plan = RemediationPlan(
            incident_id=incident.id,
            action_id=proposal.action_id,
            params=params,
            rationale=proposal.rationale,
            expected_effect=proposal.expected_effect,
            rollback=spec.rollback,
            risk=spec.risk,
            citations=[c for c in proposal.citations if c in ctx.valid_refs],
            status="awaiting_approval",
        )
        session.add(plan)
        await session.flush()

        # --- reasoning: summary ----------------------------------------
        try:
            summary = await self.provider.summarise(ctx, top.out, proposal)
        except LLMError as exc:
            await self._degrade(session, incident, exc)
            summary = await self.provider.summarise(ctx, top.out, proposal)

        incident.summary = summary.summary
        incident.root_cause = summary.root_cause
        incident.llm_usage = self.provider.usage.model_dump()

        await self._set_state(session, incident, "awaiting_approval")
        incident.status = "awaiting_approval"
        await self._event(
            session,
            incident,
            "remediation_proposed",
            (
                f"Proposed {plan.action_id} on {params.get('service')} "
                f"({spec.risk} risk). Awaiting human approval."
            ),
            {"plan_id": plan.id, "action_id": plan.action_id, "params": params},
        )

    def _rank(self, ctx: InvestigationContext, hypotheses, review) -> list[RankedHypothesis]:
        by_index = {v.hypothesis_index: v for v in review.verdicts}
        ranked: list[RankedHypothesis] = []

        for index, hypothesis in enumerate(hypotheses):
            verdict = by_index.get(index)
            valid = [c for c in hypothesis.citations if c in ctx.valid_refs]
            citation_validity = (
                len(valid) / len(hypothesis.citations) if hypothesis.citations else 0.0
            )
            support = verdict.support_score if verdict else 0.5
            verdict_label = verdict.verdict if verdict else "unreviewed"
            unsupported = list(verdict.unsupported_claims) if verdict else []
            invalid_refs = [c for c in hypothesis.citations if c not in ctx.valid_refs]
            if invalid_refs:
                unsupported.append(f"unresolvable citations: {invalid_refs}")

            base = 0.5 * hypothesis.confidence + 0.4 * support + 0.1 * citation_validity
            final = base * VERDICT_MULTIPLIER.get(verdict_label, 0.6)

            ranked.append(
                RankedHypothesis(
                    out=hypothesis,
                    verdict=verdict_label,
                    support_score=support,
                    unsupported_claims=unsupported,
                    critic_note=verdict.note if verdict else "",
                    citation_validity=citation_validity,
                    final_score=final,
                )
            )

        ranked.sort(key=lambda r: r.final_score, reverse=True)
        return ranked

    # -------------------------------------------------- approval and after

    async def approve(self, incident_id: int, plan_id: int, approver: str) -> dict:
        async with self.session_factory() as session:
            incident = await session.get(Incident, incident_id)
            plan = await session.get(RemediationPlan, plan_id)
            if incident is None or plan is None or plan.incident_id != incident_id:
                raise LookupError("incident or plan not found")
            if plan.status != "awaiting_approval":
                raise ValueError(f"plan is {plan.status}, not awaiting approval")

            plan.status = "approved"
            plan.approved_by = approver
            plan.approved_at = utcnow()
            await self._event(
                session,
                incident,
                "approved",
                f"{approver} approved {plan.action_id} on {plan.params.get('service')}.",
                {"plan_id": plan.id},
                actor=approver,
            )

            await self._set_state(session, incident, "executing")
            incident.status = "remediating"
            result = execute_action(self.engine, plan.action_id, plan.params)
            plan.status = "executed"
            plan.executed_at = utcnow()
            plan.result = result.as_dict()

            await self._event(
                session,
                incident,
                "remediation_executed",
                f"Executed in sandbox: {result.detail}",
                result.as_dict(),
            )
            await self._set_state(session, incident, "verifying")
            incident.status = "verifying"
            await session.commit()
            return result.as_dict()

    async def reject(self, incident_id: int, plan_id: int, approver: str, reason: str) -> None:
        async with self.session_factory() as session:
            incident = await session.get(Incident, incident_id)
            plan = await session.get(RemediationPlan, plan_id)
            if incident is None or plan is None or plan.incident_id != incident_id:
                raise LookupError("incident or plan not found")
            plan.status = "rejected"
            plan.approved_by = approver
            await self._event(
                session,
                incident,
                "rejected",
                f"{approver} rejected {plan.action_id}: {reason}",
                {"plan_id": plan.id, "reason": reason},
                actor=approver,
            )
            incident.status = "open"
            incident.workflow_state = "awaiting_approval"
            await session.commit()

    async def check_recovery(self, session: AsyncSession, incident: Incident) -> bool:
        """Deterministic verification, driven by the monitor as samples arrive."""
        windows = await recent_windows(session)
        result = verify(windows, incident.service)
        if not result.recovered:
            return False

        incident.status = "resolved"
        incident.workflow_state = "resolved"
        incident.resolved_at = utcnow()
        await self._event(
            session,
            incident,
            "recovery_verified",
            f"Recovery verified: {result.detail}",
            result.as_dict(),
        )
        await self._event(session, incident, "resolved", "Incident resolved.")
        return True
