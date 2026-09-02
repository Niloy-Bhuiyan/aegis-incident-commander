"""The monitoring loop: tick the platform, persist telemetry, detect, verify.

Everything in this module is deterministic. It decides when an incident exists
and when one is over; the model is only invoked for the investigation in
between.
"""

from __future__ import annotations

import asyncio
import contextlib

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from aegis.detect.rules import evaluate
from aegis.models import Incident, IncidentEvent, MetricSample
from aegis.obs.metrics import (
    incidents_opened,
    incidents_resolved,
    observe_service_sample,
    workflow_state_gauge,
)
from aegis.sim.topology import SERVICES
from aegis.sources.base import TelemetrySource
from aegis.telemetry import recent_windows

log = structlog.get_logger(__name__)

ACTIVE_STATUSES = (
    "open",
    "investigating",
    "awaiting_approval",
    "remediating",
    "verifying",
    "awaiting_execution",
)
RETAIN_SAMPLES_PER_SERVICE = 240
PRUNE_EVERY_TICKS = 60
# Changes move far more slowly than metrics, so they get their own cadence.
CHANGE_SYNC_EVERY_TICKS = 30


class Monitor:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        source: TelemetrySource,
        workflow_factory,
        interval: float = 2.0,
    ) -> None:
        self.session_factory = session_factory
        self.source = source
        self.workflow_factory = workflow_factory
        self.interval = interval
        self._task: asyncio.Task | None = None
        self._investigations: set[asyncio.Task] = set()
        self._ticks = 0

    # ------------------------------------------------------------ lifecycle

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        for task in list(self._investigations):
            task.cancel()
        self._investigations.clear()

    async def _run(self) -> None:
        while True:
            try:
                await self.tick_once()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - the loop must survive a bad tick
                log.exception("monitor_tick_failed")
            await asyncio.sleep(self.interval)

    async def wait_for_investigations(self) -> None:
        """Test and evaluation helper: block until spawned investigations finish."""
        while self._investigations:
            await asyncio.gather(*list(self._investigations), return_exceptions=True)

    # ----------------------------------------------------------------- tick

    async def tick_once(self) -> None:
        self._ticks += 1
        async with self.session_factory() as session:
            samples = await self.source.collect()
            for sample in samples:
                session.add(MetricSample(**sample.as_dict()))
                observe_service_sample(sample)
            await session.commit()

            if self._ticks % PRUNE_EVERY_TICKS == 0:
                await self._prune(session)
            if self._ticks % CHANGE_SYNC_EVERY_TICKS == 0:
                try:
                    await self.source.sync_changes(session)
                except Exception:  # noqa: BLE001 - a stale change log is survivable
                    log.warning("change_log_refresh_failed")

            await self._verify_open_incidents(session)
            await self._detect(session)

    async def _prune(self, session: AsyncSession) -> None:
        """Keep the metric table bounded: newest N samples per service."""
        for service in SERVICES:
            cutoff = (
                await session.execute(
                    select(MetricSample.id)
                    .where(MetricSample.service == service)
                    .order_by(MetricSample.id.desc())
                    .offset(RETAIN_SAMPLES_PER_SERVICE)
                    .limit(1)
                )
            ).scalar()
            if cutoff:
                await session.execute(
                    delete(MetricSample).where(
                        MetricSample.service == service, MetricSample.id <= cutoff
                    )
                )
        await session.commit()

    async def _verify_open_incidents(self, session: AsyncSession) -> None:
        incidents = (
            await session.execute(select(Incident).where(Incident.status == "verifying"))
        ).scalars().all()
        if not incidents:
            return
        workflow = self.workflow_factory()
        for incident in incidents:
            resolved = await workflow.check_recovery(session, incident)
            if resolved:
                incidents_resolved.inc()
                log.info("incident_resolved", incident_id=incident.id)
        await session.commit()

    async def _detect(self, session: AsyncSession) -> None:
        windows = await recent_windows(session)
        detection = evaluate(windows)
        if detection is None:
            return

        active = (
            await session.execute(
                select(Incident).where(
                    Incident.service == detection.origin_service,
                    Incident.status.in_(ACTIVE_STATUSES),
                )
            )
        ).scalars().first()
        if active is not None:
            return

        incident = Incident(
            title=detection.title,
            service=detection.origin_service,
            severity=detection.severity,
            status="investigating",
            workflow_state="detected",
            detector="slo_breach_rule/v1",
            trigger=detection.as_trigger(),
            scenario=self.source.scenario_label(),
        )
        session.add(incident)
        await session.flush()
        session.add(
            IncidentEvent(
                incident_id=incident.id,
                kind="detected",
                actor="detector",
                message=(
                    f"{detection.severity} opened by slo_breach_rule/v1. "
                    + "; ".join(b.describe() for b in detection.breaches)
                ),
                data=detection.as_trigger(),
            )
        )
        await session.commit()
        incidents_opened.inc()
        workflow_state_gauge.labels(state="detected").inc()
        log.info(
            "incident_opened",
            incident_id=incident.id,
            service=incident.service,
            severity=incident.severity,
        )

        workflow = self.workflow_factory()
        task = asyncio.create_task(workflow.run_investigation(incident.id))
        self._investigations.add(task)
        task.add_done_callback(self._investigations.discard)
