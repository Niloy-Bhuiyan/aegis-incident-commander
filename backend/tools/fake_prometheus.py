"""A Prometheus-shaped endpoint backed by the simulator.

This is a TEST DOUBLE, not Prometheus. It speaks enough of the instant-query API
(`GET /api/v1/query`) to exercise the real PrometheusSource over real HTTP, so
the adapter can be demonstrated without installing Prometheus and instrumenting
six services.

It recognises queries by exact string, which is why it is paired with
`telemetry.local-demo.yml` rather than the production example config: real PromQL
would need a real query engine.

Run it:
    python -m tools.fake_prometheus --port 9090

Then point Aegis at it:
    AEGIS_TELEMETRY_SOURCE=prometheus \
    AEGIS_TELEMETRY_CONFIG=telemetry.local-demo.yml \
    uvicorn aegis.main:app --port 8000

Inject a fault into this server (the Demo Lab talks to Aegis, not to here):
    curl -X POST localhost:9090/control/inject/payments_db_timeout
    curl -X POST localhost:9090/control/restore
"""

from __future__ import annotations

import argparse
import re
import time

import uvicorn
from fastapi import FastAPI, HTTPException, Response

from aegis.sim.engine import SimulationEngine

QUERY_RE = re.compile(r'^aegis_demo_(?P<signal>[a-z0-9_]+)\{service="(?P<service>[^"]+)"\}$')

SIGNALS = {
    "latency_p50_ms": lambda s: s.latency_p50_ms,
    "latency_p95_ms": lambda s: s.latency_p95_ms,
    "error_rate": lambda s: s.error_rate,
    "rps": lambda s: s.rps,
    "saturation": lambda s: s.saturation,
}

app = FastAPI(title="Fake Prometheus (Aegis test double)", docs_url=None, redoc_url=None)
engine = SimulationEngine()
latest: dict[str, object] = {}


def refresh() -> None:
    for sample in engine.tick():
        latest[sample.service] = sample


def vector(values: list[tuple[dict, float]]) -> dict:
    now = time.time()
    return {
        "status": "success",
        "data": {
            "resultType": "vector",
            "result": [
                {"metric": labels, "value": [now, repr(float(value))]}
                for labels, value in values
            ],
        },
    }


@app.on_event("startup")
async def _seed() -> None:
    for _ in range(3):
        refresh()


@app.get("/api/v1/query")
async def query(query: str) -> dict:
    refresh()

    if query == "aegis_demo_change_timestamp_seconds":
        now = time.time()
        return vector(
            [
                (
                    {
                        "service": change["service"],
                        "version": change["version"],
                        "kind": change["kind"],
                        "risk": change["risk"],
                        "summary": change["summary"],
                    },
                    change["ts"].timestamp() if hasattr(change["ts"], "timestamp") else now,
                )
                for change in engine.change_log
            ]
        )

    match = QUERY_RE.match(query.strip())
    if not match:
        return {
            "status": "error",
            "errorType": "bad_data",
            "error": f"this test double does not implement: {query}",
        }

    signal, service = match.group("signal"), match.group("service")
    sample = latest.get(service)
    if sample is None or signal not in SIGNALS:
        return vector([])
    return vector([({"service": service}, SIGNALS[signal](sample))])


@app.post("/control/inject/{scenario_id}")
async def inject(scenario_id: str) -> dict:
    try:
        scenario = engine.inject(scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"injected": scenario.id, "active": sorted(engine.active_scenarios)}


@app.post("/control/restore")
async def restore() -> dict:
    engine.restore()
    return {"restored": True}


@app.get("/-/healthy")
async def healthy() -> Response:
    return Response("Prometheus is Healthy.\n", media_type="text/plain")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=9090)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
