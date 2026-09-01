"""Every state-changing endpoint is behind the API token."""

from __future__ import annotations

import pytest

from tests.conftest import TOKEN_HEADER

MUTATING_ENDPOINTS = [
    ("/api/demo/inject", {"scenario_id": "auth_error_spike"}),
    ("/api/demo/restore", None),
    ("/api/demo/tick", None),
    ("/api/knowledge/reindex", None),
    ("/api/incidents/1/plans/1/approve", {"approver": "x"}),
    ("/api/incidents/1/plans/1/reject", {"approver": "x", "reason": "no"}),
]


@pytest.mark.parametrize(("path", "body"), MUTATING_ENDPOINTS)
async def test_mutation_requires_a_token(client, path, body):
    response = await client.post(path, json=body)
    assert response.status_code == 401


@pytest.mark.parametrize(("path", "body"), MUTATING_ENDPOINTS)
async def test_wrong_token_is_rejected(client, path, body):
    response = await client.post(path, json=body, headers={"X-Aegis-Token": "not-the-token"})
    assert response.status_code == 401


async def test_read_endpoints_are_open(client):
    for path in ("/api/health", "/api/system/status", "/api/incidents", "/api/actions"):
        assert (await client.get(path)).status_code == 200


async def test_unknown_scenario_is_a_404_not_a_crash(client):
    response = await client.post(
        "/api/demo/inject", json={"scenario_id": "drop-database"}, headers=TOKEN_HEADER
    )
    assert response.status_code == 404


async def test_metrics_endpoint_exposes_prometheus_series(client):
    await client.post("/api/demo/tick?count=2", headers=TOKEN_HEADER)
    body = (await client.get("/metrics")).text
    assert "aegis_service_latency_p95_ms" in body
    assert "aegis_incidents_opened_total" in body


async def test_action_catalogue_is_the_complete_allowlist(client):
    actions = (await client.get("/api/actions")).json()
    ids = {a["id"] for a in actions}
    assert ids == {
        "rollback_deployment",
        "revert_config",
        "increase_connection_pool",
        "scale_out",
        "restart_service",
        "enable_circuit_breaker",
    }
    for action in actions:
        assert action["params"], f"{action['id']} has no parameter schema"
