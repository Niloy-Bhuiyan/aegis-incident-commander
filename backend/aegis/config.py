"""Application settings. Everything is environment-driven; no secrets in code."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="sqlite+aiosqlite:///./aegis.db",
        alias="AEGIS_DATABASE_URL",
    )
    api_token: str = Field(default="dev-local-token", alias="AEGIS_API_TOKEN")
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="AEGIS_CORS_ORIGINS",
    )
    tick_seconds: float = Field(default=2.0, alias="AEGIS_TICK_SECONDS")

    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    llm_model: str = Field(default="claude-opus-5", alias="AEGIS_LLM_MODEL")
    llm_effort: str = Field(default="medium", alias="AEGIS_LLM_EFFORT")

    voyage_api_key: str | None = Field(default=None, alias="VOYAGE_API_KEY")
    embedding_model: str = Field(default="voyage-3.5-lite", alias="AEGIS_EMBEDDING_MODEL")

    otlp_endpoint: str | None = Field(default=None, alias="AEGIS_OTLP_ENDPOINT")
    service_name: str = Field(default="aegis-backend", alias="AEGIS_SERVICE_NAME")

    # "simulated" runs the in-process platform; "prometheus" reads a real one.
    telemetry_source: str = Field(default="simulated", alias="AEGIS_TELEMETRY_SOURCE")
    telemetry_config: str | None = Field(default=None, alias="AEGIS_TELEMETRY_CONFIG")

    # Set by tests / eval runs to keep the background ticker off.
    autostart_simulator: bool = Field(default=True, alias="AEGIS_AUTOSTART_SIMULATOR")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
