"""FastAPI application wiring."""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from aegis.agent.provider import build_provider
from aegis.agent.workflow import InvestigationWorkflow
from aegis.api import demo, incidents, knowledge, system
from aegis.config import get_settings
from aegis.db import SessionLocal, create_all
from aegis.detect.monitor import Monitor
from aegis.obs import metrics as obs_metrics
from aegis.obs.logging import configure_logging
from aegis.obs.tracing import configure_tracing
from aegis.rag.embeddings import build_embedder
from aegis.rag.ingest import ingest_directory
from aegis.rag.store import KnowledgeStore
from aegis.sim.engine import SimulationEngine
from aegis.sim.persistence import sync_change_log, sync_services

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging()
    configure_tracing(settings.service_name, settings.otlp_endpoint)

    await create_all()

    engine = SimulationEngine()
    embedder = build_embedder(settings.voyage_api_key, settings.embedding_model)
    store = KnowledgeStore(embedder)

    async with SessionLocal() as session:
        await sync_services(session)
        await sync_change_log(session, engine)
        stats = await ingest_directory(session, embedder)
        await store.load(session)
    log.info("knowledge_indexed", **stats, chunks_in_index=store.size)

    provider = build_provider(settings.anthropic_api_key, settings.llm_model, settings.llm_effort)
    log.info("reasoning_provider", provider=provider.name, model=provider.model)

    def workflow_factory() -> InvestigationWorkflow:
        return InvestigationWorkflow(SessionLocal, store, provider, engine)

    monitor = Monitor(SessionLocal, engine, workflow_factory, interval=settings.tick_seconds)

    app.state.engine = engine
    app.state.store = store
    app.state.monitor = monitor
    app.state.workflow_factory = workflow_factory
    app.state.provider = provider

    if settings.autostart_simulator:
        monitor.start()
        log.info("monitor_started", interval=settings.tick_seconds)

    try:
        yield
    finally:
        await monitor.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Aegis Incident Commander",
        description=(
            "Autonomous incident investigation for a simulated e-commerce platform. "
            "Detection, evidence collection, remediation execution and recovery verification "
            "are deterministic; hypothesis generation, criticism and remediation selection "
            "are model-driven."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Aegis-Token"],
    )

    app.include_router(system.router)
    app.include_router(incidents.router)
    app.include_router(knowledge.router)
    app.include_router(demo.router)

    @app.get("/metrics", include_in_schema=False)
    async def prometheus_metrics() -> Response:
        return Response(content=obs_metrics.render(), media_type="text/plain; version=0.0.4")

    FastAPIInstrumentor.instrument_app(app)
    return app


app = create_app()
