"""Static topology of the simulated e-commerce platform.

This is ordinary configuration, not something a model infers. The dependency
graph drives blast-radius reasoning, the System Map page, and propagation in
the metric engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Baseline:
    latency_p50_ms: float
    latency_p95_ms: float
    error_rate: float
    rps: float
    saturation: float


@dataclass(frozen=True)
class Slo:
    """Deterministic alerting thresholds. Breaching these opens an incident."""

    latency_p95_ms: float
    error_rate: float
    saturation: float = 0.92


@dataclass(frozen=True)
class ServiceSpec:
    name: str
    tier: str
    description: str
    depends_on: tuple[str, ...]
    baseline: Baseline
    slo: Slo
    # How much of a dependency's degradation this service inherits.
    latency_coupling: float = 0.6
    error_coupling: float = 0.7
    tags: tuple[str, ...] = field(default_factory=tuple)


SERVICES: dict[str, ServiceSpec] = {
    "gateway": ServiceSpec(
        name="gateway",
        tier="edge",
        description="Public API gateway. Terminates TLS, routes to internal services.",
        depends_on=("auth-service", "checkout-service"),
        baseline=Baseline(45.0, 120.0, 0.002, 850.0, 0.35),
        slo=Slo(latency_p95_ms=400.0, error_rate=0.02),
        latency_coupling=0.85,
        error_coupling=0.9,
        tags=("customer-facing",),
    ),
    "auth-service": ServiceSpec(
        name="auth-service",
        tier="application",
        description="Issues and validates session tokens for all authenticated routes.",
        depends_on=("session-cache",),
        baseline=Baseline(22.0, 60.0, 0.001, 900.0, 0.30),
        slo=Slo(latency_p95_ms=180.0, error_rate=0.015),
        latency_coupling=0.5,
        error_coupling=0.6,
        tags=("critical-path",),
    ),
    "checkout-service": ServiceSpec(
        name="checkout-service",
        tier="application",
        description="Cart pricing, payment authorisation and order placement.",
        depends_on=("payments-db", "inventory-service"),
        baseline=Baseline(95.0, 210.0, 0.004, 320.0, 0.42),
        slo=Slo(latency_p95_ms=600.0, error_rate=0.02),
        latency_coupling=0.75,
        error_coupling=0.8,
        tags=("critical-path", "revenue"),
    ),
    "inventory-service": ServiceSpec(
        name="inventory-service",
        tier="application",
        description="Stock levels and reservation holds.",
        depends_on=("payments-db",),
        baseline=Baseline(35.0, 90.0, 0.002, 280.0, 0.33),
        slo=Slo(latency_p95_ms=300.0, error_rate=0.02),
        latency_coupling=0.55,
        error_coupling=0.6,
    ),
    "payments-db": ServiceSpec(
        name="payments-db",
        tier="datastore",
        description="Primary PostgreSQL cluster for orders and payment intents.",
        depends_on=(),
        baseline=Baseline(12.0, 38.0, 0.0005, 640.0, 0.45),
        slo=Slo(latency_p95_ms=150.0, error_rate=0.01),
        tags=("stateful",),
    ),
    "session-cache": ServiceSpec(
        name="session-cache",
        tier="datastore",
        description="Redis cache holding decoded session material.",
        depends_on=(),
        baseline=Baseline(2.0, 6.0, 0.0001, 1200.0, 0.25),
        slo=Slo(latency_p95_ms=40.0, error_rate=0.01),
        tags=("stateful",),
    ),
}


def topological_order() -> list[str]:
    """Dependencies before dependents, so propagation can be a single pass."""
    ordered: list[str] = []
    seen: set[str] = set()

    def visit(name: str, stack: tuple[str, ...] = ()) -> None:
        if name in seen:
            return
        if name in stack:
            raise ValueError(f"dependency cycle at {name}: {stack}")
        for dep in SERVICES[name].depends_on:
            visit(dep, stack + (name,))
        seen.add(name)
        ordered.append(name)

    for svc in SERVICES:
        visit(svc)
    return ordered


def dependents_of(service: str) -> list[str]:
    return [s.name for s in SERVICES.values() if service in s.depends_on]


def blast_radius(service: str) -> list[str]:
    """Every service transitively downstream of the given one."""
    out: list[str] = []
    frontier = [service]
    while frontier:
        current = frontier.pop()
        for dependent in dependents_of(current):
            if dependent not in out:
                out.append(dependent)
                frontier.append(dependent)
    return out
