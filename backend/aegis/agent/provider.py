"""Reasoning providers.

AnthropicProvider is the real one: Claude with structured outputs, so every node
returns a schema-validated object. HeuristicProvider is a deterministic
rule-based stand-in used when no API key is configured - CI and the offline demo
run on it. It is a fallback, not a simulation of the model: results produced
with it are labelled as such everywhere they surface.
"""

from __future__ import annotations

import json
from typing import Protocol

from aegis.agent.context import InvestigationContext
from aegis.agent.prompts import (
    CRITIC_SYSTEM,
    INVESTIGATOR_SYSTEM,
    PLANNER_SYSTEM,
    SUMMARY_SYSTEM,
)
from aegis.agent.schema_utils import strict_json_schema
from aegis.agent.schemas import (
    CriticReview,
    CriticVerdict,
    HypothesisOut,
    HypothesisSet,
    IncidentSummary,
    RemediationProposal,
    Usage,
)
from aegis.remediation.actions import catalogue
from aegis.sim.topology import SERVICES

# claude-opus-5 list price, USD per million tokens.
INPUT_COST_PER_MTOK = 5.0
OUTPUT_COST_PER_MTOK = 25.0


class LLMError(RuntimeError):
    """A reasoning node failed to produce a valid result."""


class LLMProvider(Protocol):
    name: str
    model: str
    usage: Usage

    async def hypotheses(self, ctx: InvestigationContext) -> HypothesisSet: ...

    async def critique(
        self, ctx: InvestigationContext, hypotheses: list[HypothesisOut]
    ) -> CriticReview: ...

    async def plan(
        self, ctx: InvestigationContext, top: HypothesisOut
    ) -> RemediationProposal: ...

    async def summarise(
        self, ctx: InvestigationContext, top: HypothesisOut, plan: RemediationProposal
    ) -> IncidentSummary: ...


def _render_catalogue() -> str:
    lines = []
    for action in catalogue():
        params = ", ".join(
            f"{p['name']}:{p['kind']}"
            + (f" in {p['choices']}" if p["choices"] else "")
            + (
                f" [{p['minimum']}..{p['maximum']}]"
                if p["minimum"] is not None or p["maximum"] is not None
                else ""
            )
            for p in action["params"]
        )
        lines.append(
            f"- {action['id']} ({action['risk']} risk): {action['description']} "
            f"Parameters: {params}."
        )
    return "\n".join(lines)


def _render_hypotheses(hypotheses: list[HypothesisOut]) -> str:
    lines = []
    for i, h in enumerate(hypotheses):
        lines.append(
            f"[{i}] cause_type={h.cause_type} suspect={h.suspect_service} "
            f"confidence={h.confidence:.2f}\n"
            f"    statement: {h.statement}\n"
            f"    mechanism: {h.mechanism}\n"
            f"    citations: {', '.join(h.citations) or '(none)'}"
        )
    return "\n".join(lines)


class AnthropicProvider:
    """Claude via the Anthropic SDK, one structured call per reasoning node."""

    def __init__(self, api_key: str, model: str, effort: str = "medium") -> None:
        from anthropic import AsyncAnthropic

        self.name = "anthropic"
        self.model = model
        self.usage = Usage()
        self._effort = effort
        self._client = AsyncAnthropic(api_key=api_key)

    async def _call(self, system: str, prompt: str, schema: type):
        import anthropic

        try:
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=8000,
                system=system,
                messages=[{"role": "user", "content": prompt}],
                thinking={"type": "adaptive"},
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": strict_json_schema(schema),
                    },
                    "effort": self._effort,
                },
            )
        except anthropic.RateLimitError as exc:
            raise LLMError(f"rate limited: {exc}") from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"api error {exc.status_code}: {exc}") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError(f"connection error: {exc}") from exc

        if response.stop_reason == "refusal":
            raise LLMError("model declined to answer this request")

        self.usage = self.usage.add(
            Usage(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                calls=1,
                cost_usd=(
                    response.usage.input_tokens / 1_000_000 * INPUT_COST_PER_MTOK
                    + response.usage.output_tokens / 1_000_000 * OUTPUT_COST_PER_MTOK
                ),
            )
        )

        text = next((b.text for b in response.content if b.type == "text"), None)
        if text is None:
            raise LLMError("response contained no text block")
        try:
            return schema.model_validate(json.loads(text))
        except (json.JSONDecodeError, ValueError) as exc:
            raise LLMError(f"schema validation failed: {exc}") from exc

    async def hypotheses(self, ctx: InvestigationContext) -> HypothesisSet:
        prompt = (
            f"{ctx.render()}\n\n"
            "Produce candidate root-cause hypotheses for this incident. "
            f"Valid citation references: {', '.join(sorted(ctx.valid_refs))}."
        )
        return await self._call(INVESTIGATOR_SYSTEM, prompt, HypothesisSet)

    async def critique(
        self, ctx: InvestigationContext, hypotheses: list[HypothesisOut]
    ) -> CriticReview:
        prompt = (
            f"{ctx.render()}\n\n"
            "== HYPOTHESES UNDER REVIEW ==\n"
            f"{_render_hypotheses(hypotheses)}\n\n"
            f"Valid citation references: {', '.join(sorted(ctx.valid_refs))}. "
            "Return one verdict per hypothesis, using its zero-based index."
        )
        return await self._call(CRITIC_SYSTEM, prompt, CriticReview)

    async def plan(self, ctx: InvestigationContext, top: HypothesisOut) -> RemediationProposal:
        prompt = (
            f"{ctx.render()}\n\n"
            "== LEADING ROOT CAUSE ==\n"
            f"{_render_hypotheses([top])}\n\n"
            "== APPROVED ACTION CATALOGUE ==\n"
            f"{_render_catalogue()}\n\n"
            "Select exactly one action that addresses this root cause."
        )
        return await self._call(PLANNER_SYSTEM, prompt, RemediationProposal)

    async def summarise(
        self, ctx: InvestigationContext, top: HypothesisOut, plan: RemediationProposal
    ) -> IncidentSummary:
        prompt = (
            f"{ctx.render()}\n\n"
            "== LEADING ROOT CAUSE ==\n"
            f"{_render_hypotheses([top])}\n\n"
            f"== PROPOSED ACTION ==\n{plan.action_id} on {plan.service}: {plan.rationale}\n\n"
            "Write the incident summary."
        )
        return await self._call(SUMMARY_SYSTEM, prompt, IncidentSummary)


class HeuristicProvider:
    """Deterministic fallback reasoning driven by signal fingerprints.

    Encodes the same triage heuristics the runbooks describe. Used when no API
    key is present so the product, the tests and the demo still run end to end.
    """

    def __init__(self) -> None:
        self.name = "offline-heuristic"
        self.model = "rules/v1"
        self.usage = Usage()

    # -- helpers ---------------------------------------------------------

    @staticmethod
    def _signals(ctx: InvestigationContext) -> dict:
        for item in ctx.evidence:
            if item.kind == "metrics" and item.data.get("role") == "origin":
                return item.data
        return {}

    @staticmethod
    def _ref_for(ctx: InvestigationContext, kind: str) -> list[str]:
        return [item.ref for item in ctx.evidence if item.kind == kind]

    @staticmethod
    def _knowledge_refs(ctx: InvestigationContext, *keywords: str) -> list[str]:
        refs = []
        for item in ctx.knowledge:
            haystack = f"{item.title} {item.content}".lower()
            if any(word in haystack for word in keywords):
                refs.append(item.ref)
        return refs[:2]

    def _changes(self, ctx: InvestigationContext) -> list[dict]:
        for item in ctx.evidence:
            if item.kind == "change_log":
                return item.data.get("changes", [])
        return []

    # -- nodes -----------------------------------------------------------

    async def hypotheses(self, ctx: InvestigationContext) -> HypothesisSet:
        signals = self._signals(ctx)
        service = ctx.service
        latency_ratio = float(signals.get("latency_p95_ratio", 1.0))
        error_delta = float(signals.get("error_rate_delta", 0.0))
        saturation = float(signals.get("saturation", 0.0))
        rps_ratio = float(signals.get("rps_ratio", 1.0))

        metric_refs = self._ref_for(ctx, "metrics")
        change_refs = self._ref_for(ctx, "change_log")
        topo_refs = self._ref_for(ctx, "topology")
        changes = [c for c in self._changes(ctx) if c.get("service") == service]
        config_change = next((c for c in changes if c.get("kind") == "config_change"), None)
        deploy = next((c for c in changes if c.get("kind") == "deploy"), None)

        out: list[HypothesisOut] = []

        if saturation >= 0.9 and latency_ratio >= 3.0:
            out.append(
                HypothesisOut(
                    cause_type="resource_exhaustion",
                    statement=(
                        f"{service} has exhausted its connection pool, so queries queue for a "
                        "connection."
                    ),
                    mechanism=(
                        f"Saturation is {saturation:.2f} and p95 latency is {latency_ratio:.1f}x "
                        f"baseline while request rate is {rps_ratio:.2f}x baseline, so demand did "
                        "not rise. Dependents degrade together because they share this datastore."
                    ),
                    suspect_service=service,
                    confidence=0.82,
                    citations=[*metric_refs, *topo_refs, *change_refs][:4]
                    + self._knowledge_refs(ctx, "connection", "pool", "exhaustion"),
                )
            )
        if error_delta >= 0.05 and latency_ratio < 2.0:
            cause = "bad_config_change" if config_change else "bad_deploy"
            change_desc = (
                config_change.get("summary", "") if config_change else
                (deploy.get("summary", "") if deploy else "no matching change found")
            )
            out.append(
                HypothesisOut(
                    cause_type=cause,
                    statement=(
                        f"A recent {'configuration change' if config_change else 'release'} to "
                        f"{service} is causing requests to fail during validation."
                    ),
                    mechanism=(
                        f"Error rate rose {error_delta * 100:.1f} points while p95 latency is only "
                        f"{latency_ratio:.2f}x baseline, so requests fail early rather than "
                        f"running slowly. Change log: {change_desc}"
                    ),
                    suspect_service=service,
                    confidence=0.85 if config_change else 0.6,
                    citations=[*metric_refs, *change_refs][:4]
                    + self._knowledge_refs(ctx, "5xx", "keyset", "config"),
                )
            )
        if latency_ratio >= 2.5 and error_delta < 0.05:
            out.append(
                HypothesisOut(
                    cause_type="bad_deploy",
                    statement=(
                        f"A recent release to {service} added per-request work and regressed "
                        "latency."
                    ),
                    mechanism=(
                        f"p95 latency is {latency_ratio:.1f}x baseline with the error rate broadly "
                        f"unchanged ({error_delta * 100:.2f} points) and request rate flat at "
                        f"{rps_ratio:.2f}x. Dependencies are inside their SLOs, so the extra work "
                        "is local to the service."
                    ),
                    suspect_service=service,
                    confidence=0.84 if deploy else 0.5,
                    citations=[*metric_refs, *change_refs, *topo_refs][:4]
                    + self._knowledge_refs(ctx, "latency regression", "rollback", "pricing"),
                )
            )

        if not out:
            out.append(
                HypothesisOut(
                    cause_type="unknown",
                    statement=(
                        f"{service} is breaching its SLO for reasons the signals do not "
                        "separate."
                    ),
                    mechanism=(
                        f"p95 latency {latency_ratio:.2f}x baseline, error delta "
                        f"{error_delta * 100:.2f} points, saturation {saturation:.2f}. No single "
                        "fingerprint dominates."
                    ),
                    suspect_service=service,
                    confidence=0.3,
                    citations=metric_refs[:2],
                )
            )

        # Always carry one alternative so the critic has something to rule out.
        if len(out) < 3:
            if SERVICES[service].depends_on:
                out.append(
                    HypothesisOut(
                        cause_type="dependency_failure",
                        statement=(
                            f"A dependency of {service} is degraded and {service} inherits it."
                        ),
                        mechanism=(
                            "Considered because degradation propagates from dependencies. The "
                            "dependency health evidence is what confirms or rules this out."
                        ),
                        suspect_service=service,
                        confidence=0.2,
                        citations=topo_refs[:1] or metric_refs[:1],
                    )
                )
            else:
                out.append(
                    HypothesisOut(
                        cause_type="traffic_surge",
                        statement=f"Increased demand has pushed {service} past its capacity.",
                        mechanism=(
                            "Considered because saturation and latency also rise under load. The "
                            "request rate evidence is what confirms or rules this out."
                        ),
                        suspect_service=service,
                        confidence=0.2,
                        citations=metric_refs[:1],
                    )
                )

        return HypothesisSet(hypotheses=out[:3])

    async def critique(
        self, ctx: InvestigationContext, hypotheses: list[HypothesisOut]
    ) -> CriticReview:
        valid = ctx.valid_refs
        signals = self._signals(ctx)
        deps_healthy = bool(signals.get("dependencies_healthy", True))
        rps_ratio = float(signals.get("rps_ratio", 1.0))
        verdicts: list[CriticVerdict] = []

        for index, hypothesis in enumerate(hypotheses):
            unsupported: list[str] = []
            contradicted = False
            invalid = [c for c in hypothesis.citations if c not in valid]
            if invalid:
                unsupported.append(f"cites references not present in the context: {invalid}")
            if not hypothesis.citations:
                unsupported.append("no citations at all")
            if hypothesis.cause_type == "dependency_failure" and deps_healthy:
                unsupported.append(
                    "claims a dependency is degraded, but every dependency is inside its SLO"
                )
                contradicted = True
            if hypothesis.cause_type == "traffic_surge" and rps_ratio < 1.2:
                unsupported.append(
                    f"claims a demand increase, but request rate is {rps_ratio:.2f}x baseline"
                )
                contradicted = True

            if contradicted:
                verdict, score = "contradicted", 0.05
            elif unsupported:
                verdict, score = "partially_supported", 0.45
            else:
                verdict, score = "supported", min(0.95, 0.6 + 0.1 * len(hypothesis.citations))

            verdicts.append(
                CriticVerdict(
                    hypothesis_index=index,
                    verdict=verdict,
                    support_score=score,
                    unsupported_claims=unsupported,
                    note=(
                        "Every cited reference resolves and matches the claimed signal shape."
                        if not unsupported
                        else "; ".join(unsupported)
                    ),
                )
            )
        return CriticReview(verdicts=verdicts)

    async def plan(self, ctx: InvestigationContext, top: HypothesisOut) -> RemediationProposal:
        mapping = {
            "bad_deploy": ("rollback_deployment", {}),
            "bad_config_change": ("revert_config", {"key": "jwt_signing_key_id"}),
            "resource_exhaustion": ("increase_connection_pool", {"max_connections": 300}),
            "dependency_failure": ("enable_circuit_breaker", {"dependency": "payments-db"}),
            "traffic_surge": ("scale_out", {"replicas": 18}),
            "unknown": ("restart_service", {}),
        }
        action_id, extra = mapping[top.cause_type]
        return RemediationProposal(
            action_id=action_id,
            service=top.suspect_service or ctx.service,
            key=extra.get("key"),
            max_connections=extra.get("max_connections"),
            replicas=extra.get("replicas"),
            dependency=extra.get("dependency"),
            rationale=(
                f"The leading hypothesis is {top.cause_type} in {top.suspect_service}. "
                f"{action_id} is the catalogue action that addresses that cause directly rather "
                "than masking the symptom."
            ),
            expected_effect=(
                f"{top.suspect_service} returns inside its SLO within two sample windows, and "
                "every downstream service follows."
            ),
            citations=top.citations[:3],
        )

    async def summarise(
        self, ctx: InvestigationContext, top: HypothesisOut, plan: RemediationProposal
    ) -> IncidentSummary:
        return IncidentSummary(
            summary=(
                f"{ctx.incident_title}. {ctx.breach_summary.rstrip('.')}. "
                f"Correlation places the origin at {ctx.service}, whose own dependencies are "
                f"within SLO. Proposed remediation is {plan.action_id} on {plan.service}."
            ),
            root_cause=top.statement,
        )


def build_provider(api_key: str | None, model: str, effort: str) -> LLMProvider:
    if api_key:
        return AnthropicProvider(api_key, model, effort)
    return HeuristicProvider()
