"""Shared FastAPI dependencies: app state accessors and API-token auth."""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, Request, status

from aegis.agent.workflow import InvestigationWorkflow
from aegis.config import get_settings
from aegis.detect.monitor import Monitor
from aegis.rag.store import KnowledgeStore
from aegis.sim.engine import SimulationEngine
from aegis.sources.base import TelemetrySource


def get_source(request: Request) -> TelemetrySource:
    return request.app.state.source


def get_engine(request: Request) -> SimulationEngine:
    """The Demo Lab only exists for the simulated platform."""
    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "the Demo Lab requires the simulated telemetry source; "
                "this instance reads a real metrics backend"
            ),
        )
    return engine


def get_store(request: Request) -> KnowledgeStore:
    return request.app.state.store


def get_monitor(request: Request) -> Monitor:
    return request.app.state.monitor


def get_workflow(request: Request) -> InvestigationWorkflow:
    return request.app.state.workflow_factory()


async def require_token(x_aegis_token: str = Header(default="")) -> None:
    """Guard every state-changing endpoint.

    Constant-time comparison, and a configured token is mandatory - an empty
    AEGIS_API_TOKEN locks mutations rather than opening them.
    """
    expected = get_settings().api_token
    if not expected or not hmac.compare_digest(x_aegis_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing or invalid X-Aegis-Token header",
        )
