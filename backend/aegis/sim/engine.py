"""In-process simulation of the e-commerce platform.

Pure state plus arithmetic - no database, no I/O, fully deterministic given a
seed. That makes the whole detection and evaluation path reproducible.
"""

from __future__ import annotations

import random
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta

from aegis.sim.scenarios import SCENARIOS, ChangeEvent, Effect, Scenario, get_scenario
from aegis.sim.topology import SERVICES, topological_order


@dataclass
class Sample:
    service: str
    latency_p50_ms: float
    latency_p95_ms: float
    error_rate: float
    rps: float
    saturation: float

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class Mitigation:
    """A non-curative action that still has a bounded, honest effect."""

    latency_mult: float = 1.0
    saturation_add: float = 0.0
    error_coupling_mult: float = 1.0


# Actions that only ever mitigate. Curative power is decided per scenario.
MITIGATION_EFFECTS: dict[str, Mitigation] = {
    "restart_service": Mitigation(latency_mult=0.95),
    "scale_out": Mitigation(latency_mult=0.88, saturation_add=-0.15),
    "enable_circuit_breaker": Mitigation(error_coupling_mult=0.4),
}


@dataclass
class AppliedAction:
    action_id: str
    service: str
    params: dict
    at: datetime
    resolved_fault: bool


@dataclass
class SimulationEngine:
    seed: int = 1337
    active_scenarios: set[str] = field(default_factory=set)
    applied: list[AppliedAction] = field(default_factory=list)
    change_log: list[dict] = field(default_factory=list)
    _rng: random.Random = field(init=False, repr=False)
    _tick: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self._rng = random.Random(self.seed)
        if not self.change_log:
            self._seed_baseline_change_log()

    # ---------------------------------------------------------------- state

    def _seed_baseline_change_log(self) -> None:
        now = datetime.now(UTC)
        for service, version, summary, age in (
            ("gateway", "gateway@8.4.2", "Routine dependency refresh.", 86400),
            ("auth-service", "auth-service@3.1.0", "Add structured audit logging.", 43200),
            ("payments-db", "payments-db@15.4", "Minor version patch, no schema change.", 172800),
        ):
            self.change_log.append(
                {
                    "service": service,
                    "kind": "deploy",
                    "version": version,
                    "summary": summary,
                    "risk": "low",
                    "ts": now - timedelta(seconds=age),
                }
            )

    @property
    def healthy(self) -> bool:
        return not self.active_scenarios

    def status(self) -> dict:
        return {
            "healthy": self.healthy,
            "active_scenarios": sorted(self.active_scenarios),
            "applied_actions": [
                {
                    "action_id": a.action_id,
                    "service": a.service,
                    "params": a.params,
                    "at": a.at.isoformat(),
                    "resolved_fault": a.resolved_fault,
                }
                for a in self.applied
            ],
            "tick": self._tick,
        }

    # ------------------------------------------------------------ injection

    def inject(self, scenario_id: str) -> Scenario:
        scenario = get_scenario(scenario_id)
        self.active_scenarios.add(scenario.id)
        now = datetime.now(UTC)
        for change in scenario.change_events:
            self.change_log.append(self._change_row(change, now))
        return scenario

    @staticmethod
    def _change_row(change: ChangeEvent, now: datetime) -> dict:
        return {
            "service": change.service,
            "kind": change.kind,
            "version": change.version,
            "summary": change.summary,
            "risk": change.risk,
            "ts": now - timedelta(seconds=change.age_seconds),
        }

    def restore(self) -> None:
        """Return the platform to its healthy baseline (Demo Lab reset)."""
        self.active_scenarios.clear()
        self.applied.clear()
        self.change_log.clear()
        self._seed_baseline_change_log()
        self._rng = random.Random(self.seed)

    # -------------------------------------------------------------- actions

    def apply_action(self, action_id: str, service: str, params: dict) -> AppliedAction:
        """Apply a sandboxed action. Only clears a fault it genuinely addresses."""
        resolved = False
        for scenario_id in sorted(self.active_scenarios):
            scenario = SCENARIOS[scenario_id]
            if (action_id, service) in scenario.resolving_actions:
                self.active_scenarios.discard(scenario_id)
                resolved = True
        applied = AppliedAction(
            action_id=action_id,
            service=service,
            params=params,
            at=datetime.now(UTC),
            resolved_fault=resolved,
        )
        self.applied.append(applied)
        return applied

    def _mitigation_for(self, service: str) -> Mitigation:
        combined = Mitigation()
        for action in self.applied:
            if action.service != service or action.resolved_fault:
                continue
            effect = MITIGATION_EFFECTS.get(action.action_id)
            if effect is None:
                continue
            combined = Mitigation(
                latency_mult=combined.latency_mult * effect.latency_mult,
                saturation_add=combined.saturation_add + effect.saturation_add,
                error_coupling_mult=combined.error_coupling_mult * effect.error_coupling_mult,
            )
        return combined

    def _effect_for(self, service: str) -> Effect:
        latency_mult = 1.0
        error_add = 0.0
        saturation_add = 0.0
        rps_mult = 1.0
        for scenario_id in sorted(self.active_scenarios):
            effect = SCENARIOS[scenario_id].effects.get(service)
            if effect is None:
                continue
            latency_mult *= effect.latency_mult
            error_add += effect.error_add
            saturation_add += effect.saturation_add
            rps_mult *= effect.rps_mult
        return Effect(latency_mult, error_add, saturation_add, rps_mult)

    # -------------------------------------------------------------- metrics

    def tick(self) -> list[Sample]:
        """Produce one metric sample per service, dependencies first."""
        self._tick += 1
        computed: dict[str, Sample] = {}

        for name in topological_order():
            spec = SERVICES[name]
            base = spec.baseline
            effect = self._effect_for(name)
            mitigation = self._mitigation_for(name)

            latency_mult = effect.latency_mult * mitigation.latency_mult
            p50 = base.latency_p50_ms * latency_mult
            p95 = base.latency_p95_ms * latency_mult
            error_rate = base.error_rate + effect.error_add
            saturation = base.saturation + effect.saturation_add + mitigation.saturation_add
            rps = base.rps * effect.rps_mult

            error_coupling = spec.error_coupling * mitigation.error_coupling_mult
            for dep in spec.depends_on:
                dep_sample = computed[dep]
                dep_base = SERVICES[dep].baseline
                p50 += spec.latency_coupling * max(
                    0.0, dep_sample.latency_p50_ms - dep_base.latency_p50_ms
                )
                p95 += spec.latency_coupling * max(
                    0.0, dep_sample.latency_p95_ms - dep_base.latency_p95_ms
                )
                error_rate += error_coupling * max(0.0, dep_sample.error_rate - dep_base.error_rate)
                saturation += 0.25 * max(0.0, dep_sample.saturation - dep_base.saturation)

            computed[name] = Sample(
                service=name,
                latency_p50_ms=round(self._jitter(p50, 0.04), 2),
                latency_p95_ms=round(self._jitter(p95, 0.05), 2),
                error_rate=round(min(max(self._jitter(error_rate, 0.06), 0.0), 1.0), 5),
                rps=round(self._jitter(rps, 0.05), 1),
                saturation=round(min(max(self._jitter(saturation, 0.03), 0.0), 1.0), 4),
            )

        return list(computed.values())

    def _jitter(self, value: float, pct: float) -> float:
        return value * (1.0 + self._rng.uniform(-pct, pct))
