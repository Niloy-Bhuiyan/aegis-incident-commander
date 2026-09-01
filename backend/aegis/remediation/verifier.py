"""Deterministic recovery verification.

Whether a system recovered is a measurement, not a judgement call, so no model
is asked. The affected service and everything downstream of it must sit inside
their SLOs for a fixed number of consecutive sample windows.
"""

from __future__ import annotations

from dataclasses import dataclass

from aegis.detect.rules import _breaches_for
from aegis.sim.engine import Sample
from aegis.sim.topology import blast_radius

REQUIRED_HEALTHY_WINDOWS = 3


@dataclass
class VerificationResult:
    recovered: bool
    checked_services: list[str]
    unhealthy: dict[str, list[str]]
    windows_required: int
    detail: str

    def as_dict(self) -> dict:
        return {
            "recovered": self.recovered,
            "checked_services": self.checked_services,
            "unhealthy": self.unhealthy,
            "windows_required": self.windows_required,
            "detail": self.detail,
        }


def services_to_verify(origin: str) -> list[str]:
    return [origin, *blast_radius(origin)]


def verify(
    windows: dict[str, list[Sample]],
    origin: str,
    required: int = REQUIRED_HEALTHY_WINDOWS,
) -> VerificationResult:
    checked = services_to_verify(origin)
    unhealthy: dict[str, list[str]] = {}
    insufficient: list[str] = []

    for service in checked:
        samples = windows.get(service, [])
        if len(samples) < required:
            insufficient.append(service)
            continue
        signals: list[str] = []
        for sample in samples[-required:]:
            for breach in _breaches_for(sample):
                if breach.signal not in signals:
                    signals.append(breach.signal)
        if signals:
            unhealthy[service] = signals

    if insufficient:
        return VerificationResult(
            recovered=False,
            checked_services=checked,
            unhealthy=unhealthy,
            windows_required=required,
            detail=f"waiting for {required} samples on: {', '.join(sorted(insufficient))}",
        )

    if unhealthy:
        breakdown = ", ".join(f"{svc} ({'/'.join(sig)})" for svc, sig in sorted(unhealthy.items()))
        return VerificationResult(
            recovered=False,
            checked_services=checked,
            unhealthy=unhealthy,
            windows_required=required,
            detail=f"still breaching: {breakdown}",
        )

    return VerificationResult(
        recovered=True,
        checked_services=checked,
        unhealthy={},
        windows_required=required,
        detail=(
            f"{origin} and {len(checked) - 1} downstream service(s) inside SLO "
            f"for {required} consecutive windows"
        ),
    )
