"""Deterministic detection.

No model is involved here. Alerting on SLO breaches and picking the origin
service in a dependency graph are solved problems - ordinary code does it
faster, cheaper and identically every time.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aegis.sim.engine import Sample
from aegis.sim.topology import SERVICES, blast_radius

CONSECUTIVE_BREACHES_REQUIRED = 3


@dataclass
class Breach:
    service: str
    signal: str
    observed: float
    threshold: float

    def describe(self) -> str:
        if self.signal == "error_rate":
            return (
                f"{self.service} error_rate {self.observed * 100:.2f}% "
                f"over SLO {self.threshold * 100:.2f}%"
            )
        if self.signal == "saturation":
            return (
                f"{self.service} saturation {self.observed:.2f} over SLO {self.threshold:.2f}"
            )
        return (
            f"{self.service} latency_p95 {self.observed:.0f}ms over SLO {self.threshold:.0f}ms"
        )


@dataclass
class DetectionResult:
    origin_service: str
    severity: str
    breaches: list[Breach]
    breaching_services: list[str]
    affected_services: list[str] = field(default_factory=list)

    @property
    def title(self) -> str:
        signals = sorted({b.signal for b in self.breaches if b.service == self.origin_service})
        label = {
            "latency_p95": "latency",
            "error_rate": "error rate",
            "saturation": "saturation",
        }
        names = [label.get(s, s) for s in signals]
        if not names:
            readable = "SLO"
        elif len(names) == 1:
            readable = names[0]
        else:
            readable = f"{', '.join(names[:-1])} and {names[-1]}"
        return f"{self.origin_service}: {readable} SLO breach"

    def as_trigger(self) -> dict:
        return {
            "breaches": [
                {
                    "service": b.service,
                    "signal": b.signal,
                    "observed": b.observed,
                    "threshold": b.threshold,
                }
                for b in self.breaches
            ],
            "breaching_services": self.breaching_services,
            "affected_services": self.affected_services,
        }


def _breaches_for(sample: Sample) -> list[Breach]:
    slo = SERVICES[sample.service].slo
    found: list[Breach] = []
    if sample.latency_p95_ms > slo.latency_p95_ms:
        found.append(
            Breach(sample.service, "latency_p95", sample.latency_p95_ms, slo.latency_p95_ms)
        )
    if sample.error_rate > slo.error_rate:
        found.append(Breach(sample.service, "error_rate", sample.error_rate, slo.error_rate))
    if sample.saturation > slo.saturation:
        found.append(Breach(sample.service, "saturation", sample.saturation, slo.saturation))
    return found


def evaluate(windows: dict[str, list[Sample]]) -> DetectionResult | None:
    """Return a detection when a service has breached for N consecutive samples.

    windows maps service name to its most recent samples, oldest first.
    """
    sustained: dict[str, list[Breach]] = {}

    for service, samples in windows.items():
        if len(samples) < CONSECUTIVE_BREACHES_REQUIRED:
            continue
        recent = samples[-CONSECUTIVE_BREACHES_REQUIRED:]
        per_sample = [_breaches_for(s) for s in recent]
        if not all(per_sample):
            continue
        # A signal only counts when it breached in every sample of the window.
        signals = set.intersection(*({b.signal for b in bs} for bs in per_sample))
        if not signals:
            continue
        latest = {b.signal: b for b in per_sample[-1]}
        sustained[service] = [latest[s] for s in sorted(signals)]

    if not sustained:
        return None

    breaching = set(sustained)
    # The origin is a breaching service with no breaching dependency: everything
    # downstream of it is explained by propagation.
    origins = [
        svc
        for svc in sustained
        if not any(dep in breaching for dep in SERVICES[svc].depends_on)
    ]
    if not origins:
        origins = sorted(sustained)

    origin = sorted(origins, key=lambda s: (-len(sustained[s]), s))[0]

    error_breach = any(b.signal == "error_rate" for bs in sustained.values() for b in bs)
    if "gateway" in breaching and error_breach:
        severity = "SEV1"
    elif "gateway" in breaching:
        severity = "SEV2"
    else:
        severity = "SEV3"

    all_breaches = [b for svc in sorted(sustained) for b in sustained[svc]]
    affected = [s for s in blast_radius(origin) if s in breaching]

    return DetectionResult(
        origin_service=origin,
        severity=severity,
        breaches=all_breaches,
        breaching_services=sorted(breaching),
        affected_services=affected,
    )
