"""The Anthropic provider's request shape and response handling.

No network: a stub client stands in for the SDK so the contract we depend on -
strict structured outputs, adaptive thinking, refusal handling, usage
accounting - is asserted rather than assumed.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from aegis.agent.context import EvidenceItem, InvestigationContext
from aegis.agent.provider import AnthropicProvider, HeuristicProvider, LLMError, build_provider
from aegis.agent.schemas import HypothesisOut


def make_context() -> InvestigationContext:
    return InvestigationContext(
        incident_title="checkout-service: latency SLO breach",
        service="checkout-service",
        severity="SEV2",
        breach_summary="checkout-service latency_p95",
        evidence=[
            EvidenceItem(
                ref="E1",
                kind="metrics",
                source="metrics store",
                title="telemetry",
                content="p95 1092ms (5.2x baseline)",
                data={
                    "role": "origin",
                    "latency_p95_ratio": 5.2,
                    "error_rate_delta": 0.005,
                    "saturation": 0.76,
                    "rps_ratio": 1.0,
                    "dependencies_healthy": True,
                },
            ),
            EvidenceItem(
                ref="E4",
                kind="change_log",
                source="change log",
                title="changes",
                content="checkout-service@4.12.0 deployed 4m ago",
                data={
                    "changes": [
                        {
                            "service": "checkout-service",
                            "kind": "deploy",
                            "risk": "high",
                            "summary": "pricing moved into the per-item loop",
                        }
                    ]
                },
            ),
        ],
        knowledge=[
            EvidenceItem(
                ref="K1",
                kind="knowledge",
                source="runbooks/latency-regression-after-release.md",
                title="Latency regression runbook",
                content="Roll back the offending release.",
            )
        ],
    )


class StubMessages:
    def __init__(self, payload: dict, stop_reason: str = "end_turn") -> None:
        self.payload = payload
        self.stop_reason = stop_reason
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[
                SimpleNamespace(type="thinking", text=""),
                SimpleNamespace(type="text", text=json.dumps(self.payload)),
            ],
            usage=SimpleNamespace(input_tokens=1200, output_tokens=340),
        )


def provider_with(payload: dict, stop_reason: str = "end_turn"):
    provider = AnthropicProvider(api_key="test-key", model="claude-opus-5", effort="medium")
    stub = StubMessages(payload, stop_reason)
    provider._client = SimpleNamespace(messages=stub)
    return provider, stub


HYPOTHESES_PAYLOAD = {
    "hypotheses": [
        {
            "cause_type": "bad_deploy",
            "statement": "Release 4.12.0 regressed checkout latency.",
            "mechanism": "p95 is 5.2x baseline with a flat error rate.",
            "suspect_service": "checkout-service",
            "confidence": 0.85,
            "citations": ["E1", "E4", "K1"],
        }
    ]
}


async def test_request_uses_strict_structured_outputs_and_adaptive_thinking():
    provider, stub = provider_with(HYPOTHESES_PAYLOAD)
    await provider.hypotheses(make_context())

    assert len(stub.calls) == 1
    call = stub.calls[0]
    assert call["model"] == "claude-opus-5"
    assert call["thinking"] == {"type": "adaptive"}
    assert call["output_config"]["effort"] == "medium"

    schema = call["output_config"]["format"]["schema"]
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert schema["additionalProperties"] is False
    assert "$ref" not in json.dumps(schema)


async def test_prompt_carries_the_evidence_and_the_valid_reference_set():
    provider, stub = provider_with(HYPOTHESES_PAYLOAD)
    await provider.hypotheses(make_context())

    prompt = stub.calls[0]["messages"][0]["content"]
    assert "[E1]" in prompt and "[K1]" in prompt
    assert "Valid citation references: E1, E4, K1" in prompt


async def test_response_is_parsed_and_usage_is_accumulated():
    provider, _ = provider_with(HYPOTHESES_PAYLOAD)
    result = await provider.hypotheses(make_context())

    assert result.hypotheses[0].cause_type == "bad_deploy"
    assert provider.usage.calls == 1
    assert provider.usage.input_tokens == 1200
    assert provider.usage.output_tokens == 340
    # 1200/1e6*5 + 340/1e6*25
    assert provider.usage.cost_usd == pytest.approx(0.0145, abs=1e-6)


async def test_a_refusal_is_surfaced_as_an_llm_error():
    provider, _ = provider_with(HYPOTHESES_PAYLOAD, stop_reason="refusal")
    with pytest.raises(LLMError, match="declined"):
        await provider.hypotheses(make_context())


async def test_a_schema_violation_is_surfaced_as_an_llm_error():
    provider, _ = provider_with({"hypotheses": [{"cause_type": "bad_deploy"}]})
    with pytest.raises(LLMError, match="schema validation failed"):
        await provider.hypotheses(make_context())


async def test_planner_prompt_lists_only_catalogue_actions():
    payload = {
        "action_id": "rollback_deployment",
        "service": "checkout-service",
        "key": None,
        "max_connections": None,
        "replicas": None,
        "dependency": None,
        "rationale": "r",
        "expected_effect": "e",
        "citations": ["E1"],
    }
    provider, stub = provider_with(payload)
    top = HypothesisOut(
        cause_type="bad_deploy",
        statement="s",
        mechanism="m",
        suspect_service="checkout-service",
        confidence=0.8,
        citations=["E1"],
    )
    proposal = await provider.plan(make_context(), top)

    prompt = stub.calls[0]["messages"][0]["content"]
    for action_id in ("rollback_deployment", "revert_config", "increase_connection_pool"):
        assert action_id in prompt
    assert proposal.action_id == "rollback_deployment"


def test_build_provider_falls_back_when_no_key_is_configured():
    assert isinstance(build_provider(None, "claude-opus-5", "medium"), HeuristicProvider)
    assert isinstance(build_provider("", "claude-opus-5", "medium"), HeuristicProvider)
    assert isinstance(build_provider("key", "claude-opus-5", "medium"), AnthropicProvider)


async def test_workflow_degrades_to_the_offline_provider_when_a_node_fails():
    from aegis.agent.workflow import InvestigationWorkflow

    class Failing(HeuristicProvider):
        def __init__(self) -> None:
            super().__init__()
            self.name = "anthropic"

        async def hypotheses(self, ctx):
            raise LLMError("connection error: boom")

    workflow = InvestigationWorkflow.__new__(InvestigationWorkflow)
    workflow.provider = Failing()

    class Session:
        def add(self, _obj):
            pass

        async def flush(self):
            pass

    incident = SimpleNamespace(id=1)
    await workflow._degrade(Session(), incident, LLMError("boom"))
    assert workflow.provider.name == "offline-heuristic"
