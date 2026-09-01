"""Test fixtures.

Environment is set before any aegis import because settings are cached on first
read and the database engine is built at import time.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="aegis-tests-"))
os.environ["AEGIS_DATABASE_URL"] = f"sqlite+aiosqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["AEGIS_AUTOSTART_SIMULATOR"] = "0"
os.environ["AEGIS_API_TOKEN"] = "test-token"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["VOYAGE_API_KEY"] = ""

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from aegis.db import SessionLocal, engine  # noqa: E402
from aegis.main import app  # noqa: E402
from aegis.models import Base  # noqa: E402

TOKEN_HEADER = {"X-Aegis-Token": "test-token"}


@pytest.fixture
async def client():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://aegis.test") as http:
            yield http
    await engine.dispose()


@pytest.fixture
async def session():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        yield db
    await engine.dispose()
