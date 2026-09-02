"""Run the whole pipeline against every evaluation case and score it.

Each case injects a failure into a fresh simulator, waits for the deterministic
detector, runs the investigation, approves the proposed action, and then checks
whether the platform actually recovered. Nothing is mocked, so the numbers
reflect the system that ships.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from aegis.agent.provider import build_provider
from aegis.agent.workflow import InvestigationWorkflow
from aegis.config import get_settings
from aegis.detect.monitor import Monitor
from aegis.evaluation.dataset import EvalCase, cases
from aegis.models import Base, Evidence, Hypothesis, Incident, RemediationPlan
from aegis.rag.embeddings import build_embedder
from aegis.rag.ingest import ingest_directory
from aegis.rag.store import KnowledgeStore
from aegis.sim.engine import SimulationEngine
from aegis.sim.persistence import sync_change_log, sync_services

MAX_DETECTION_TICKS = 10
MAX_RECOVERY_TICKS = 10


@dataclass
class CaseResult:
    scenario_id: str
    detected: bool = False
    detection_ticks: int | None = None
    origin_correct: bool = False
    root_cause_top1_correct: bool = False
    root_cause_in_ranked_set: bool = False
    citation_validity: float = 0.0
    unsupported_claims_per_hypothesis: float = 0.0
    retrieval_hit_rate: float = 0.0
    remediation_correct: bool = False
    remediation_executed: bool = False
    recovery_verified: bool = False
    investigation_seconds: float = 0.0
    total_seconds: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    notes: list[str] = field(default_factory=list)


def _mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0


def _rate(flags: list[bool]) -> float:
    return round(sum(1 for f in flags if f) / len(flags), 4) if flags else 0.0


class Evaluator:
    def __init__(self, database_url: str) -> None:
        self.settings = get_settings()
        self.engine = create_async_engine(database_url, future=True)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)
        self.embedder = build_embedder(self.settings.voyage_api_key, self.settings.embedding_model)
        self.store = KnowledgeStore(self.embedder)
        self.provider_name = "anthropic" if self.settings.llm_enabled else "offline-heuristic"
        self.model = self.settings.llm_model if self.settings.llm_enabled else "rules/v1"

    async def setup(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        async with self.session_factory() as session:
            await sync_services(session)
            await ingest_directory(session, self.embedder)
            await self.store.load(session)

    async def teardown(self) -> None:
        await self.engine.dispose()

    async def run(self) -> dict:
        await self.setup()
        results = [await self.run_case(case) for case in cases()]
        await self.teardown()

        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "provider": self.provider_name,
            "model": self.model,
            "embedder": self.embedder.name,
            "cases": [asdict(r) for r in results],
            "metrics": self.aggregate(results),
        }

    @staticmethod
    def aggregate(results: list[CaseResult]) -> dict:
        return {
            "cases": len(results),
            "detection_rate": _rate([r.detected for r in results]),
            "origin_service_accuracy": _rate([r.origin_correct for r in results]),
            "root_cause_top1_accuracy": _rate([r.root_cause_top1_correct for r in results]),
            "root_cause_recall_in_ranked_set": _rate(
                [r.root_cause_in_ranked_set for r in results]
            ),
            "citation_validity": _mean([r.citation_validity for r in results]),
            "unsupported_claims_per_hypothesis": _mean(
                [r.unsupported_claims_per_hypothesis for r in results]
            ),
            "retrieval_hit_rate": _mean([r.retrieval_hit_rate for r in results]),
            "remediation_accuracy": _rate([r.remediation_correct for r in results]),
            "recovery_success_rate": _rate([r.recovery_verified for r in results]),
            "mean_detection_ticks": _mean(
                [float(r.detection_ticks) for r in results if r.detection_ticks is not None]
            ),
            "mean_investigation_seconds": _mean([r.investigation_seconds for r in results]),
            "mean_case_seconds": _mean([r.total_seconds for r in results]),
            "total_input_tokens": sum(r.input_tokens for r in results),
            "total_output_tokens": sum(r.output_tokens for r in results),
            "total_cost_usd": round(sum(r.cost_usd for r in results), 6),
        }

    async def run_case(self, case: EvalCase) -> CaseResult:
        result = CaseResult(scenario_id=case.scenario_id)
        started = time.perf_counter()

        sim = SimulationEngine()
        provider = build_provider(
            self.settings.anthropic_api_key, self.settings.llm_model, self.settings.llm_effort
        )

        def workflow_factory() -> InvestigationWorkflow:
            return InvestigationWorkflow(self.session_factory, self.store, provider, sim)

        monitor = Monitor(self.session_factory, sim, workflow_factory)

        # Warm the baseline, then inject.
        for _ in range(3):
            await monitor.tick_once()
        sim.inject(case.scenario_id)
        async with self.session_factory() as session:
            await sync_change_log(session, sim)

        incident_id = await self._await_detection(monitor, case, result)
        if incident_id is None:
            result.notes.append("no incident was opened within the detection budget")
            result.total_seconds = round(time.perf_counter() - started, 3)
            return result

        investigation_started = time.perf_counter()
        await monitor.wait_for_investigations()
        result.investigation_seconds = round(time.perf_counter() - investigation_started, 3)

        await self._score_investigation(incident_id, case, result, provider)
        await self._approve_and_verify(monitor, workflow_factory, incident_id, result)

        result.total_seconds = round(time.perf_counter() - started, 3)
        return result

    async def _await_detection(
        self, monitor: Monitor, case: EvalCase, result: CaseResult
    ) -> int | None:
        for tick in range(1, MAX_DETECTION_TICKS + 1):
            await monitor.tick_once()
            async with self.session_factory() as session:
                incident = (
                    await session.execute(select(Incident).order_by(Incident.id.desc()).limit(1))
                ).scalar_one_or_none()
            if incident is not None and incident.scenario == case.scenario_id:
                result.detected = True
                result.detection_ticks = tick
                result.origin_correct = incident.service == case.expected_origin
                return incident.id
        return None

    async def _score_investigation(
        self, incident_id: int, case: EvalCase, result: CaseResult, provider
    ) -> None:
        async with self.session_factory() as session:
            evidence = (
                await session.execute(select(Evidence).where(Evidence.incident_id == incident_id))
            ).scalars().all()
            hypotheses = (
                await session.execute(
                    select(Hypothesis)
                    .where(Hypothesis.incident_id == incident_id)
                    .order_by(Hypothesis.rank)
                )
            ).scalars().all()
            plan = (
                await session.execute(
                    select(RemediationPlan).where(RemediationPlan.incident_id == incident_id)
                )
            ).scalars().first()

        valid_refs = {e.ref for e in evidence}
        retrieved_paths = {e.source for e in evidence if e.kind == "knowledge"}

        result.retrieval_hit_rate = round(
            sum(
                1
                for fragment in case.expected_document_fragments
                if any(fragment in path for path in retrieved_paths)
            )
            / len(case.expected_document_fragments),
            4,
        )

        if hypotheses:
            citations = [c for h in hypotheses for c in h.citations]
            result.citation_validity = round(
                sum(1 for c in citations if c in valid_refs) / len(citations), 4
            ) if citations else 0.0
            result.unsupported_claims_per_hypothesis = round(
                sum(len(h.unsupported_claims) for h in hypotheses) / len(hypotheses), 4
            )
            top = hypotheses[0]
            result.root_cause_top1_correct = (
                top.cause_type == case.expected_cause_type
                and top.suspect_service == case.expected_origin
            )
            result.root_cause_in_ranked_set = any(
                h.cause_type == case.expected_cause_type
                and h.suspect_service == case.expected_origin
                for h in hypotheses
            )
        else:
            result.notes.append("no hypotheses were produced")

        if plan is not None:
            expected_params = {
                k: v for k, v in case.expected_action_params.items() if k in plan.params
            }
            result.remediation_correct = (
                plan.action_id == case.expected_action_id
                and plan.params.get("service") == case.expected_action_params.get("service")
                and all(
                    plan.params.get(k) == v
                    for k, v in expected_params.items()
                    if k != "service"
                )
            )
        else:
            result.notes.append("no remediation plan was proposed")

        usage = provider.usage
        result.input_tokens = usage.input_tokens
        result.output_tokens = usage.output_tokens
        result.cost_usd = round(usage.cost_usd, 6)

    async def _approve_and_verify(
        self, monitor: Monitor, workflow_factory, incident_id: int, result: CaseResult
    ) -> None:
        async with self.session_factory() as session:
            plan = (
                await session.execute(
                    select(RemediationPlan).where(RemediationPlan.incident_id == incident_id)
                )
            ).scalars().first()
        if plan is None:
            return

        workflow = workflow_factory()
        try:
            execution = await workflow.approve(incident_id, plan.id, "evaluator")
            result.remediation_executed = bool(execution.get("applied"))
        except Exception as exc:  # noqa: BLE001 - a failed approval is a scored outcome
            result.notes.append(f"approval failed: {exc}")
            return

        for _ in range(MAX_RECOVERY_TICKS):
            await monitor.tick_once()
            async with self.session_factory() as session:
                incident = await session.get(Incident, incident_id)
                if incident and incident.status == "resolved":
                    result.recovery_verified = True
                    return
        result.notes.append("recovery was not verified within the budget")
