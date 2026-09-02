"""End-to-end through the HTTP API: inject, detect, investigate, approve, recover."""

from __future__ import annotations

import pytest

from tests.conftest import TOKEN_HEADER


async def warm_up(client, ticks: int = 3):
    response = await client.post(f"/api/demo/tick?count={ticks}", headers=TOKEN_HEADER)
    assert response.status_code == 200


async def drive_to_incident(client, scenario_id: str) -> dict:
    await warm_up(client)
    inject = await client.post(
        "/api/demo/inject", json={"scenario_id": scenario_id}, headers=TOKEN_HEADER
    )
    assert inject.status_code == 200

    await client.post("/api/demo/tick?count=4", headers=TOKEN_HEADER)
    await client.post("/api/demo/await-investigations", headers=TOKEN_HEADER)

    incidents = (await client.get("/api/incidents")).json()
    assert incidents, "no incident was opened"
    detail = await client.get(f"/api/incidents/{incidents[0]['id']}")
    assert detail.status_code == 200
    return detail.json()


async def test_healthy_system_reports_no_incident(client):
    await warm_up(client, ticks=4)
    status = (await client.get("/api/system/status")).json()
    assert status["active_incidents"] == 0
    assert status["healthy"] is True
    assert {s["status"] for s in status["services"]} == {"healthy"}
    assert status["knowledge_chunks"] > 0


async def test_topology_endpoint_matches_the_service_graph(client):
    topology = (await client.get("/api/system/topology")).json()
    ids = {n["id"] for n in topology["nodes"]}
    assert "gateway" in ids and "payments-db" in ids
    assert {"source": "gateway", "target": "auth-service"} in topology["edges"]


@pytest.mark.parametrize(
    ("scenario_id", "expected_service", "expected_action"),
    [
        ("checkout_latency_regression", "checkout-service", "rollback_deployment"),
        ("auth_error_spike", "auth-service", "revert_config"),
        ("payments_db_timeout", "payments-db", "increase_connection_pool"),
    ],
)
async def test_full_incident_lifecycle(client, scenario_id, expected_service, expected_action):
    incident = await drive_to_incident(client, scenario_id)

    assert incident["service"] == expected_service
    assert incident["workflow_state"] == "awaiting_approval"
    assert incident["detector"] == "slo_breach_rule/v1"
    assert incident["summary"]
    assert incident["root_cause"]

    # Evidence is collected deterministically and knowledge is retrieved.
    kinds = {e["kind"] for e in incident["evidence"]}
    assert {"metrics", "topology", "change_log", "knowledge"} <= kinds

    # Every citation resolves to a real evidence reference - no fabrication.
    valid_refs = {e["ref"] for e in incident["evidence"]}
    for hypothesis in incident["hypotheses"]:
        assert hypothesis["citations"], "hypothesis has no citations"
        assert set(hypothesis["citations"]) <= valid_refs

    # The critic ran and ranking is monotonic.
    assert all(h["verdict"] != "unreviewed" for h in incident["hypotheses"])
    scores = [h["final_score"] for h in incident["hypotheses"]]
    assert scores == sorted(scores, reverse=True)

    plan = incident["plans"][0]
    assert plan["action_id"] == expected_action
    assert plan["params"]["service"] == expected_service
    assert plan["status"] == "awaiting_approval"

    # Nothing executes without approval.
    assert incident["status"] == "awaiting_approval"

    approve = await client.post(
        f"/api/incidents/{incident['id']}/plans/{plan['id']}/approve",
        json={"approver": "test-operator"},
        headers=TOKEN_HEADER,
    )
    assert approve.status_code == 200
    assert approve.json()["resolved_fault"] is True

    await client.post("/api/demo/tick?count=4", headers=TOKEN_HEADER)

    resolved = (await client.get(f"/api/incidents/{incident['id']}")).json()
    assert resolved["status"] == "resolved"
    assert resolved["workflow_state"] == "resolved"
    assert resolved["resolved_at"] is not None

    timeline = [e["kind"] for e in resolved["events"]]
    assert timeline[:1] == ["detected"]
    for expected in (
        "evidence_collected",
        "knowledge_retrieved",
        "hypotheses_generated",
        "hypotheses_reviewed",
        "remediation_proposed",
        "approved",
        "remediation_executed",
        "recovery_verified",
        "resolved",
    ):
        assert expected in timeline, f"{expected} missing from the audit timeline"

    status = (await client.get("/api/system/status")).json()
    assert status["active_incidents"] == 0


async def test_rejecting_a_plan_leaves_the_system_untouched(client):
    incident = await drive_to_incident(client, "checkout_latency_regression")
    plan = incident["plans"][0]

    reject = await client.post(
        f"/api/incidents/{incident['id']}/plans/{plan['id']}/reject",
        json={"approver": "test-operator", "reason": "want a human to look first"},
        headers=TOKEN_HEADER,
    )
    assert reject.status_code == 200

    state = (await client.get("/api/demo/state")).json()
    assert state["applied_actions"] == []
    assert state["active_scenarios"] == ["checkout_latency_regression"]

    after = (await client.get(f"/api/incidents/{incident['id']}")).json()
    assert after["plans"][0]["status"] == "rejected"
    assert "rejected" in [e["kind"] for e in after["events"]]


async def test_approving_twice_is_refused(client):
    incident = await drive_to_incident(client, "auth_error_spike")
    plan = incident["plans"][0]
    url = f"/api/incidents/{incident['id']}/plans/{plan['id']}/approve"

    assert (await client.post(url, json={}, headers=TOKEN_HEADER)).status_code == 200
    second = await client.post(url, json={}, headers=TOKEN_HEADER)
    assert second.status_code == 409


async def test_restore_cancels_active_incidents(client):
    incident = await drive_to_incident(client, "payments_db_timeout")
    restore = await client.post("/api/demo/restore", headers=TOKEN_HEADER)
    assert restore.status_code == 200
    assert restore.json()["cancelled_incidents"] == 1

    after = (await client.get(f"/api/incidents/{incident['id']}")).json()
    assert after["status"] == "cancelled"


async def test_timestamps_carry_an_explicit_utc_offset(client):
    """Naive timestamps would be read as local time by every browser."""
    incident = await drive_to_incident(client, "checkout_latency_regression")

    assert incident["opened_at"].endswith("+00:00")
    assert all(event["ts"].endswith("+00:00") for event in incident["events"])

    changes = (await client.get("/api/changes")).json()
    assert all(change["ts"].endswith("+00:00") for change in changes)

    metrics = (await client.get("/api/services/gateway/metrics?limit=3")).json()
    assert all(point["ts"].endswith("+00:00") for point in metrics)
