"""The simulator and the deterministic detector."""

from __future__ import annotations

import pytest

from aegis.detect.rules import CONSECUTIVE_BREACHES_REQUIRED, _breaches_for, evaluate
from aegis.sim.engine import SimulationEngine
from aegis.sim.scenarios import SCENARIOS
from aegis.sim.topology import SERVICES, blast_radius, topological_order


def windows_from(engine: SimulationEngine, ticks: int = 4) -> dict[str, list]:
    windows: dict[str, list] = {name: [] for name in SERVICES}
    for _ in range(ticks):
        for sample in engine.tick():
            windows[sample.service].append(sample)
    return windows


def test_topological_order_puts_dependencies_first():
    order = topological_order()
    for name, spec in SERVICES.items():
        for dep in spec.depends_on:
            assert order.index(dep) < order.index(name)


def test_blast_radius_of_payments_db_reaches_the_gateway():
    assert set(blast_radius("payments-db")) == {
        "checkout-service",
        "inventory-service",
        "gateway",
    }


def test_healthy_platform_breaches_nothing():
    engine = SimulationEngine()
    for sample in engine.tick():
        assert _breaches_for(sample) == [], f"{sample.service} breached while healthy"


def test_healthy_platform_produces_no_detection():
    engine = SimulationEngine()
    assert evaluate(windows_from(engine)) is None


@pytest.mark.parametrize(
    ("scenario_id", "expected_origin"),
    [
        ("checkout_latency_regression", "checkout-service"),
        ("auth_error_spike", "auth-service"),
        ("payments_db_timeout", "payments-db"),
    ],
)
def test_each_scenario_is_detected_at_its_origin(scenario_id, expected_origin):
    engine = SimulationEngine()
    engine.inject(scenario_id)
    detection = evaluate(windows_from(engine))

    assert detection is not None, "failure was not detected"
    assert detection.origin_service == expected_origin
    assert expected_origin in detection.breaching_services


def test_detection_requires_sustained_breach():
    engine = SimulationEngine()
    engine.inject("auth_error_spike")
    windows = windows_from(engine, ticks=CONSECUTIVE_BREACHES_REQUIRED - 1)
    assert evaluate(windows) is None


def test_gateway_is_never_chosen_as_origin_when_a_dependency_breaches():
    engine = SimulationEngine()
    engine.inject("auth_error_spike")
    detection = evaluate(windows_from(engine))
    assert "gateway" in detection.breaching_services
    assert detection.origin_service != "gateway"


@pytest.mark.parametrize("scenario_id", list(SCENARIOS))
def test_correct_action_clears_the_fault_and_wrong_one_does_not(scenario_id):
    scenario = SCENARIOS[scenario_id]
    truth = scenario.ground_truth

    wrong = SimulationEngine()
    wrong.inject(scenario_id)
    wrong.apply_action("restart_service", "gateway", {"service": "gateway"})
    assert wrong.active_scenarios == {scenario_id}
    assert evaluate(windows_from(wrong)) is not None

    right = SimulationEngine()
    right.inject(scenario_id)
    applied = right.apply_action(truth.action_id, truth.suspect_service, truth.action_params)
    assert applied.resolved_fault is True
    assert right.healthy
    assert evaluate(windows_from(right)) is None


def test_restore_returns_the_platform_to_baseline():
    engine = SimulationEngine()
    engine.inject("payments_db_timeout")
    engine.restore()
    assert engine.healthy
    assert evaluate(windows_from(engine)) is None
