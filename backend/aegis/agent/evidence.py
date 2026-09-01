"""Deterministic evidence collection.

Querying metrics, walking a dependency graph and filtering a change log are
database operations. Doing them in code makes the evidence complete, cheap and
identical on every run - which is exactly what a critic needs in order to call
out a claim the evidence does not support.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.agent.context import EvidenceItem
from aegis.detect.rules import _breaches_for
from aegis.models import Deployment, Incident
from aegis.sim.topology import SERVICES, blast_radius
from aegis.telemetry import recent_windows, summarise

CHANGE_WINDOW_MINUTES = 30


def _fmt_metrics(stats: dict) -> str:
    return (
        f"p95 latency {stats['latency_p95_ms']:.0f}ms "
        f"({stats['latency_p95_ratio']:.2f}x baseline {stats['baseline_latency_p95_ms']:.0f}ms), "
        f"error rate {stats['error_rate'] * 100:.2f}% "
        f"(baseline {stats['baseline_error_rate'] * 100:.2f}%, "
        f"delta {stats['error_rate_delta'] * 100:+.2f} points), "
        f"saturation {stats['saturation']:.2f}, "
        f"request rate {stats['rps']:.0f}/s ({stats['rps_ratio']:.2f}x baseline)"
    )


async def collect(session: AsyncSession, incident: Incident) -> list[EvidenceItem]:
    """Assemble the evidence bundle for an incident."""
    windows = await recent_windows(session)
    origin = incident.service
    spec = SERVICES[origin]
    items: list[EvidenceItem] = []

    dependency_stats = {dep: summarise(dep, windows.get(dep, [])) for dep in spec.depends_on}
    dependencies_healthy = all(
        not _breaches_for(windows[dep][-1]) for dep in spec.depends_on if windows.get(dep)
    )

    origin_stats = summarise(origin, windows.get(origin, []))
    origin_stats["role"] = "origin"
    origin_stats["dependencies_healthy"] = dependencies_healthy
    items.append(
        EvidenceItem(
            ref="E1",
            kind="metrics",
            source="metrics store",
            title=f"{origin} current telemetry vs baseline",
            content=(
                f"{origin}: {_fmt_metrics(origin_stats)}. "
                f"Measured over the last {origin_stats['samples']} sample windows."
            ),
            data=origin_stats,
        )
    )

    # Fan-out: which other services are outside their SLO right now.
    breaching: list[str] = []
    lines: list[str] = []
    for service, samples in windows.items():
        if not samples:
            continue
        breaches = _breaches_for(samples[-1])
        if breaches:
            breaching.append(service)
            lines.append(f"{service}: " + "; ".join(b.describe() for b in breaches))
    items.append(
        EvidenceItem(
            ref="E2",
            kind="metrics",
            source="metrics store",
            title="Services currently outside their SLO",
            content="\n".join(lines) if lines else "No service is currently breaching.",
            data={"role": "fanout", "breaching_services": breaching},
        )
    )

    dep_lines = [
        f"{dep}: {_fmt_metrics(stats)}" if stats.get("samples") else f"{dep}: no samples"
        for dep, stats in dependency_stats.items()
    ]
    items.append(
        EvidenceItem(
            ref="E3",
            kind="topology",
            source="service topology",
            title=f"Dependencies and blast radius of {origin}",
            content=(
                f"{origin} ({spec.tier}) depends on: "
                f"{', '.join(spec.depends_on) if spec.depends_on else 'nothing'}.\n"
                f"Services downstream of {origin}: "
                f"{', '.join(blast_radius(origin)) or 'none'}.\n"
                f"Dependency health:\n" + ("\n".join(dep_lines) if dep_lines else "n/a") + "\n"
                f"All dependencies inside SLO: {dependencies_healthy}."
            ),
            data={
                "depends_on": list(spec.depends_on),
                "blast_radius": blast_radius(origin),
                "dependencies_healthy": dependencies_healthy,
                "dependency_stats": dependency_stats,
            },
        )
    )

    # Change log: deploys, config changes and capacity events near the incident.
    since = datetime.now(UTC) - timedelta(minutes=CHANGE_WINDOW_MINUTES)
    relevant = [origin, *spec.depends_on]
    rows = (
        await session.execute(
            select(Deployment)
            .where(Deployment.service.in_(relevant))
            .order_by(Deployment.ts.desc())
            .limit(20)
        )
    ).scalars().all()

    changes = []
    change_lines = []
    for row in rows:
        ts = row.ts if row.ts.tzinfo else row.ts.replace(tzinfo=UTC)
        age_s = int((datetime.now(UTC) - ts).total_seconds())
        entry = {
            "service": row.service,
            "kind": row.kind,
            "version": row.version,
            "summary": row.change_summary,
            "risk": row.risk,
            "age_seconds": age_s,
            "within_window": ts >= since,
        }
        changes.append(entry)
        change_lines.append(
            f"{row.service} [{row.kind}, risk={row.risk}] {row.version} "
            f"{age_s // 60}m{age_s % 60}s before now: {row.change_summary}"
        )

    items.append(
        EvidenceItem(
            ref="E4",
            kind="change_log",
            source="change log",
            title=f"Recent changes to {origin} and its dependencies",
            content=(
                "\n".join(change_lines)
                if change_lines
                else f"No recorded change to {origin} or its dependencies."
            ),
            data={"changes": changes, "window_minutes": CHANGE_WINDOW_MINUTES},
        )
    )

    return items


def build_query(incident: Incident, evidence: list[EvidenceItem]) -> str:
    """Retrieval query built from the incident and its measured signal shape."""
    origin = next((e for e in evidence if e.data.get("role") == "origin"), None)
    parts = [incident.service, incident.title]
    if origin:
        if origin.data.get("latency_p95_ratio", 1) >= 2:
            parts.append("latency regression rollback deploy")
        if origin.data.get("error_rate_delta", 0) >= 0.02:
            parts.append("error rate 5xx configuration revert")
        if origin.data.get("saturation", 0) >= 0.85:
            parts.append("saturation connection pool exhaustion capacity")
    changes = next((e for e in evidence if e.kind == "change_log"), None)
    if changes:
        kinds = {c["kind"] for c in changes.data.get("changes", []) if c.get("within_window")}
        parts.extend(sorted(kinds))
    return " ".join(parts)
