"""Async SQLAlchemy engine/session wiring.

The same schema runs on SQLite (local, tests, CI) and PostgreSQL (deployment);
only AEGIS_DATABASE_URL changes.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from aegis.config import get_settings
from aegis.models import Base

_settings = get_settings()

engine = create_async_engine(
    _settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=not _settings.database_url.startswith("sqlite"),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a request-scoped session."""
    async with SessionLocal() as session:
        yield session


async def create_all() -> None:
    """Create tables directly.

    Used by tests and the SQLite quickstart. PostgreSQL deployments run
    "alembic upgrade head" instead - see README, Database migrations.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
