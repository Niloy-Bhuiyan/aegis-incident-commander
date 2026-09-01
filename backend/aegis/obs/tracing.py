"""OpenTelemetry tracing.

Spans are always produced. Without AEGIS_OTLP_ENDPOINT they stay in-process
(useful for tests and for the FastAPI instrumentation to attach to); with it
they are exported over OTLP/HTTP.
"""

from __future__ import annotations

import structlog
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

log = structlog.get_logger(__name__)

_configured = False


def configure_tracing(service_name: str, otlp_endpoint: str | None) -> None:
    global _configured
    if _configured:
        return

    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    if otlp_endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

            provider.add_span_processor(
                BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint))
            )
        except ImportError:
            log.warning("otlp_exporter_missing", hint="install aegis[otlp] to export spans")

    trace.set_tracer_provider(provider)
    _configured = True


def tracer() -> trace.Tracer:
    return trace.get_tracer("aegis")
