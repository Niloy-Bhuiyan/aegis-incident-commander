<div align="center">

<img src="docs/banner.svg" alt="Aegis - Autonomous AI Incident Commander" width="100%">

<p>
  <a href="https://github.com/Niloy-Bhuiyan/aegis-incident-commander/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/Niloy-Bhuiyan/aegis-incident-commander/actions/workflows/ci.yml/badge.svg">
  </a>
  <img alt="tests" src="https://img.shields.io/badge/tests-145%20passing-1f7a4d?style=flat-square&labelColor=1b1a16">
  <img alt="backend" src="https://img.shields.io/badge/python-3.12%2B-1b1a16?style=flat-square&logo=python&logoColor=white&labelColor=1b1a16">
  <img alt="frontend" src="https://img.shields.io/badge/react-19-1b1a16?style=flat-square&logo=react&logoColor=white&labelColor=1b1a16">
  <img alt="model" src="https://img.shields.io/badge/claude--opus--5-9a7b4f?style=flat-square&labelColor=1b1a16">
</p>

<p><strong>Finds the cause. Cites the evidence. Waits for your approval.</strong></p>

<p>
  <a href="#the-problem">Problem</a> ·
  <a href="#tech-stack">Tech stack</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#the-investigation-workflow">Workflow</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#running-it">Run it</a> ·
  <a href="#evaluation">Evaluation</a> ·
  <a href="#limitations">Limitations</a>
</p>

</div>

---

Aegis investigates production incidents the way a good on-call engineer does: it
notices an SLO breach, works out which service the failure actually originates
in, pulls the telemetry and change history that bear on it, reads the relevant
runbooks and postmortems, proposes a ranked set of root causes with citations,
has those hypotheses attacked by a critic, recommends one action from an
approved catalogue, waits for a human to approve it, executes it in a sandbox,
and then measures whether the platform actually recovered.

Telemetry is a pluggable boundary. Out of the box Aegis runs against a
**simulated** six-service e-commerce platform with injectable failures; pointed
at a **live Prometheus** it reads real metrics through the same pipeline. What it
does *not* have is credentials to change anything real - against Prometheus,
approving a plan records a dry run rather than pretending to have acted.

![Command Center](docs/screenshots/01-command-center-healthy.png)

---

## Contents

- [The problem](#the-problem)
- [What is AI and what is not](#what-is-ai-and-what-is-not)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [The investigation workflow](#the-investigation-workflow)
- [Why no agent framework](#why-no-agent-framework)
- [Telemetry sources](#telemetry-sources)
- [Retrieval](#retrieval)
- [Safety model](#safety-model)
- [The simulated platform](#the-simulated-platform)
- [Screenshots](#screenshots)
- [Running it](#running-it)
- [Testing](#testing)
- [Evaluation](#evaluation)
- [Deployment](#deployment)
- [Limitations](#limitations)
- [Roadmap](#roadmap)

---

## The problem

During an incident the expensive minutes are rarely spent fixing anything. They
go on orientation: which of the twelve alerts is the cause and which are
consequences, what changed recently, whether this has happened before, and which
of several plausible actions is the one that addresses the cause instead of
masking it.

That work is mostly retrieval and correlation over evidence a system already
has. It is also the part where a language model is genuinely useful — and the
part where an ungrounded model is genuinely dangerous, because a confident wrong
root cause sends a responder down a 20-minute detour.

Aegis is built around that asymmetry. The model reasons; it never decides
whether something is broken, and it never decides whether something is fixed.

---

## What is AI and what is not

The dividing line is whether the task has a correct answer that ordinary code
can compute. If it does, ordinary code computes it.

| Stage | Implementation | Why |
| --- | --- | --- |
| Telemetry collection | Deterministic | Arithmetic over a metric store |
| SLO breach detection | Deterministic (`slo_breach_rule/v1`) | A threshold with a sustain window. A model here would be slower, costlier, and non-reproducible |
| Origin-service correlation | Deterministic (graph walk) | "The breaching service with no breaching dependency" is a graph property, not a judgement |
| Evidence collection | Deterministic | Database queries |
| Knowledge retrieval | Deterministic (BM25 + embeddings) | Ranking, not reasoning |
| **Hypothesis generation** | **Claude** | Open-ended: map a signal shape and a change log onto a causal story |
| **Hypothesis criticism** | **Claude** | Judging whether cited evidence actually establishes a claim |
| **Remediation selection** | **Claude** | Choosing among plausible actions given a cause |
| **Incident summary** | **Claude** | Natural-language explanation |
| Action validation | Deterministic (allowlist + schema) | A safety boundary must not be probabilistic |
| Execution | Deterministic (sandbox) | Applying a validated state transition |
| Recovery verification | Deterministic | Whether metrics are inside SLO is a measurement |

Three model calls per incident, plus one for the summary. Everything else is
code.

---

## Tech stack

<table>
<tr>
<td><strong>Backend</strong></td>
<td>
<img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-1b1a16?style=flat-square&logo=fastapi&logoColor=white&labelColor=1b1a16">
<img alt="Python 3.12" src="https://img.shields.io/badge/Python%203.12-1b1a16?style=flat-square&logo=python&logoColor=white&labelColor=1b1a16">
<img alt="SQLAlchemy 2.0" src="https://img.shields.io/badge/SQLAlchemy%202.0-1b1a16?style=flat-square&logo=sqlalchemy&logoColor=white&labelColor=1b1a16">
<img alt="Alembic" src="https://img.shields.io/badge/Alembic-1b1a16?style=flat-square&labelColor=1b1a16">
<img alt="Pydantic" src="https://img.shields.io/badge/Pydantic-1b1a16?style=flat-square&logo=pydantic&logoColor=white&labelColor=1b1a16">
</td>
</tr>
<tr>
<td><strong>Reasoning</strong></td>
<td>
<img alt="Claude Opus 5" src="https://img.shields.io/badge/Claude%20Opus%205-9a7b4f?style=flat-square&logo=anthropic&logoColor=white&labelColor=1b1a16">
<img alt="structured outputs" src="https://img.shields.io/badge/structured%20outputs-9a7b4f?style=flat-square&labelColor=1b1a16">
<img alt="adaptive thinking" src="https://img.shields.io/badge/adaptive%20thinking-9a7b4f?style=flat-square&labelColor=1b1a16">
</td>
</tr>
<tr>
<td><strong>Retrieval</strong></td>
<td>
<img alt="BM25" src="https://img.shields.io/badge/BM25-5b5648?style=flat-square&labelColor=1b1a16">
<img alt="dense embeddings" src="https://img.shields.io/badge/dense%20embeddings-5b5648?style=flat-square&labelColor=1b1a16">
<img alt="reciprocal rank fusion" src="https://img.shields.io/badge/reciprocal%20rank%20fusion-5b5648?style=flat-square&labelColor=1b1a16">
<img alt="Voyage AI" src="https://img.shields.io/badge/Voyage%20AI-5b5648?style=flat-square&labelColor=1b1a16">
</td>
</tr>
<tr>
<td><strong>Data</strong></td>
<td>
<img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-1b1a16?style=flat-square&logo=postgresql&logoColor=white&labelColor=1b1a16">
<img alt="SQLite" src="https://img.shields.io/badge/SQLite-1b1a16?style=flat-square&logo=sqlite&logoColor=white&labelColor=1b1a16">
</td>
</tr>
<tr>
<td><strong>Telemetry</strong></td>
<td>
<img alt="Prometheus" src="https://img.shields.io/badge/Prometheus-1b1a16?style=flat-square&logo=prometheus&logoColor=white&labelColor=1b1a16">
<img alt="OpenTelemetry" src="https://img.shields.io/badge/OpenTelemetry-1b1a16?style=flat-square&logo=opentelemetry&logoColor=white&labelColor=1b1a16">
<img alt="structlog" src="https://img.shields.io/badge/structlog-1b1a16?style=flat-square&labelColor=1b1a16">
</td>
</tr>
<tr>
<td><strong>Frontend</strong></td>
<td>
<img alt="React 19" src="https://img.shields.io/badge/React%2019-1b1a16?style=flat-square&logo=react&logoColor=white&labelColor=1b1a16">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-1b1a16?style=flat-square&logo=typescript&logoColor=white&labelColor=1b1a16">
<img alt="Vite" src="https://img.shields.io/badge/Vite-1b1a16?style=flat-square&logo=vite&logoColor=white&labelColor=1b1a16">
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind%20CSS-1b1a16?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=1b1a16">
<img alt="TanStack Query" src="https://img.shields.io/badge/TanStack%20Query-1b1a16?style=flat-square&logo=reactquery&logoColor=white&labelColor=1b1a16">
<img alt="Recharts" src="https://img.shields.io/badge/Recharts-1b1a16?style=flat-square&labelColor=1b1a16">
<img alt="React Flow" src="https://img.shields.io/badge/React%20Flow-1b1a16?style=flat-square&labelColor=1b1a16">
</td>
</tr>
<tr>
<td><strong>Quality</strong></td>
<td>
<img alt="pytest" src="https://img.shields.io/badge/pytest-1f7a4d?style=flat-square&logo=pytest&logoColor=white&labelColor=1b1a16">
<img alt="Vitest" src="https://img.shields.io/badge/Vitest-1f7a4d?style=flat-square&logo=vitest&logoColor=white&labelColor=1b1a16">
<img alt="Playwright" src="https://img.shields.io/badge/Playwright-1f7a4d?style=flat-square&logo=playwright&logoColor=white&labelColor=1b1a16">
<img alt="Ruff" src="https://img.shields.io/badge/Ruff-1f7a4d?style=flat-square&logo=ruff&logoColor=white&labelColor=1b1a16">
<img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub%20Actions-1f7a4d?style=flat-square&logo=githubactions&logoColor=white&labelColor=1b1a16">
</td>
</tr>
<tr>
<td><strong>Delivery</strong></td>
<td>
<img alt="Docker" src="https://img.shields.io/badge/Docker-1b1a16?style=flat-square&logo=docker&logoColor=white&labelColor=1b1a16">
<img alt="nginx" src="https://img.shields.io/badge/nginx-1b1a16?style=flat-square&logo=nginx&logoColor=white&labelColor=1b1a16">
<img alt="Render" src="https://img.shields.io/badge/Render-1b1a16?style=flat-square&logo=render&logoColor=white&labelColor=1b1a16">
</td>
</tr>
</table>

**Why each choice:**

| Layer | Choice | Rationale |
|

---

## Architecture

```mermaid
flowchart LR
    subgraph src["Telemetry sources"]
        SIM["Simulator<br/>propagation + fault injection"]
        PROM["Prometheus<br/>live instant queries"]
    end

    subgraph det["Deterministic core"]
        MON["Monitor loop"]
        DET["SLO breach detector"]
        EV["Evidence collector"]
        RANK["Ranking"]
        EXE["Sandbox executor"]
        VER["Recovery verifier"]
    end

    subgraph ai["Reasoning nodes (Claude)"]
        HYP["Hypotheses"]
        CRIT["Critic"]
        PLAN["Remediation plan"]
    end

    subgraph data["Storage"]
        PG[("PostgreSQL / SQLite")]
        KB["Knowledge base<br/>BM25 + embeddings"]
    end

    SIM --> MON
    PROM --> MON
    MON --> DET --> EV
    EV --> KB
    EV --> HYP --> CRIT --> RANK --> PLAN
    KB --> HYP
    PLAN --> HUMAN{{"Human approval"}}
    HUMAN -->|approved| EXE --> SIM
    EXE -.->|dry run, read-only| PROM
    EXE --> VER --> PG
    MON --> PG
    EV --> PG
    RANK --> PG

    API["FastAPI"] --> PG
    UI["React console"] --> API
```

--- | --- | --- |
| Backend | FastAPI, SQLAlchemy 2.0 async, Alembic | Typed request/response models, async fits the LLM-call-heavy workload, migrations from day one |
| Database | PostgreSQL in deployment, SQLite locally | One schema, one migration history; `AEGIS_DATABASE_URL` selects the driver |
| Reasoning | `anthropic` SDK, `claude-opus-5`, structured outputs, adaptive thinking | Every node returns a schema-validated object rather than prose to parse |
| Retrieval | BM25 + dense embeddings, reciprocal rank fusion | Lexical precision for identifiers, dense recall for topic; no vector-DB service to operate at this corpus size |
| Telemetry | `TelemetrySource` interface: simulator or live Prometheus | The rest of the pipeline never learns which one it is reading |
| Observability | OpenTelemetry, Prometheus metrics, structlog | Standard, exportable, no vendor lock |
| Frontend | Vite, React, TypeScript, Tailwind, React Flow, Recharts, TanStack Query | Fast build, typed API surface, polling fits a 2-second telemetry cadence |
| Workflow | Hand-written state machine | See below |

---

**One incident, end to end.** The gate is the load-bearing part: everything left
of it is analysis, and nothing right of it happens without a named approver.

```mermaid
sequenceDiagram
    autonumber
    participant T as Telemetry source
    participant M as Monitor - deterministic
    participant E as Evidence + retrieval
    participant C as Claude
    participant H as Operator
    participant V as Verifier - deterministic

    loop every 2s
        M->>T: collect()
        T-->>M: one sample per service
    end
    Note over M: SLO breach sustained 3 windows<br/>origin = breaching service with<br/>no breaching dependency
    M->>E: open incident
    E->>E: metrics, topology, change log (E1-E4)
    E->>E: hybrid BM25 + dense retrieval (K1-Kn)
    E->>C: evidence bundle + valid citation refs
    C-->>E: ranked hypotheses with citations
    C-->>E: critic verdicts + unsupported claims
    C-->>E: one action from the allowlist
    Note over E: citations that do not resolve<br/>are stripped and penalised
    E->>H: proposal, parked
    H->>V: approve (named)
    V->>T: execute validated action
    loop until 3 healthy windows
        V->>T: collect()
    end
    V-->>H: recovery verified, incident resolved
```

---

## The investigation workflow

```mermaid
stateDiagram-v2
    [*] --> detected: SLO breach sustained 3 windows
    detected --> collecting_evidence
    collecting_evidence --> retrieving_knowledge
    retrieving_knowledge --> generating_hypotheses
    generating_hypotheses --> critiquing
    critiquing --> ranking
    ranking --> planning_remediation
    planning_remediation --> awaiting_approval
    awaiting_approval --> executing: human approves
    awaiting_approval --> awaiting_approval: human rejects
    executing --> verifying
    verifying --> resolved: origin and blast radius inside SLO<br/>for 3 consecutive windows
    verifying --> verifying: not yet recovered
    resolved --> [*]
```

Every transition writes a row to an append-only event log. The console renders
that log as the incident timeline: what was done, what was found, what was
decided. Model reasoning traces are not surfaced — only actions, evidence and
conclusions.

**Ranking** is deterministic, and combines three signals:

```
base  = 0.5 · model_confidence + 0.4 · critic_support + 0.1 · citation_validity
score = base · verdict_multiplier      # supported 1.0, partial 0.8,
                                       # unsupported 0.35, contradicted 0.15
```

`citation_validity` is the fraction of a hypothesis's citations that resolve to
a reference actually present in the evidence bundle. A hypothesis that cites
something the system never produced is penalised automatically, before any human
sees it.

---

## Why no agent framework

LangGraph, the OpenAI Agents SDK, Google ADK, Microsoft Agent Framework,
PydanticAI and LlamaIndex Workflows were all considered. Aegis uses none of them,
for three reasons specific to this problem:

1. **The control flow is a fixed DAG with one human gate.** There is no
   open-ended tool loop for a framework to manage. Every node's input and output
   is known in advance. A framework would add a scheduler for a sequence that a
   function already expresses.
2. **State already lives in PostgreSQL.** Incidents, evidence, hypotheses, plans
   and events are first-class rows because operators need to query them and
   auditors need to read them. A framework's checkpointer would be a second,
   parallel persistence model over the same facts — with the durable audit trail
   in one and the resumability in the other.
3. **Debuggability during an incident.** A failing node here is a stack trace in
   one file. The cost of that choice is real — retries, fan-out and streaming are
   hand-rolled — but this workflow needs none of them.

The judgement would flip if the workflow became genuinely agentic: dynamic tool
selection, model-decided iteration depth, or parallel sub-investigations. At
that point LangGraph's checkpointing and interrupt model would be worth its
dependency. The reasoning nodes are isolated behind a provider interface
(`aegis/agent/provider.py`) precisely so that swap stays cheap.

---

## Telemetry sources

`TelemetrySource` (`backend/aegis/sources/`) is the seam between "where the
numbers come from" and everything that reasons about them. Detection, evidence
collection, retrieval, hypotheses and verification are identical either way.

| | `simulated` | `prometheus` |
| --- | --- | --- |
| Metrics | In-process engine with dependency propagation | Live instant queries over the HTTP API |
| Change log | Injected deploy/config/capacity events | PromQL returning one labelled series per change |
| Failure injection | Yes, from the Demo Lab | No - faults come from reality |
| Remediation | Executed against the simulator | **Dry run.** Recorded, not executed |

### What Prometheus cannot tell you

A metrics endpoint exposes numbers, not meaning. Three things are declared in
`telemetry.prometheus.example.yml` because they cannot be inferred:

- **`depends_on`** — the dependency graph. Without it there is no way to
  separate a cause from its downstream consequences, which is the single most
  valuable thing Aegis does.
- **`slo`** — what healthy means. This is what opens an incident.
- **`baseline`** — the steady state. "7x baseline" is a signal; "285ms" is a
  number.

Each service also supplies the PromQL for its five signals. The shipped example
uses standard client conventions (`http_requests_total`,
`http_request_duration_seconds_bucket`, `pg_stat_activity_count` over
`pg_settings_max_connections` for pool saturation).

### Honest behaviour on partial data

If any signal for a service fails to scrape, that service's sample is **dropped
rather than back-filled**. A half-scraped service must never look healthy. The
misses surface in `/api/system/status` and in the console's status strip.

### Remediation is not faked

Aegis holds no credentials for the systems behind a Prometheus endpoint, so
`PrometheusSource.execute` records the approved action and returns
`executed: false`. The incident parks in `awaiting_execution` instead of waiting
for a recovery that nothing was done to cause. Wiring a real executor means
implementing that one method against whatever performs the change.

### Trying it without installing Prometheus

`backend/tools/fake_prometheus.py` is a Prometheus-shaped **test double** backed
by the simulator. It speaks enough of `/api/v1/query` to exercise the real
adapter over real HTTP:

```bash
cd backend
python -m tools.fake_prometheus --port 9090
```

```bash
cd backend
AEGIS_TELEMETRY_SOURCE=prometheus AEGIS_TELEMETRY_CONFIG=telemetry.local-demo.yml uvicorn aegis.main:app --port 8000
```

Then inject a fault into the *metrics backend* rather than into Aegis:

```bash
curl -X POST localhost:9090/control/inject/payments_db_timeout
```

Aegis detects it through the normal path, attributes it to `payments-db`,
retrieves the matching runbook and postmortem, proposes
`increase_connection_pool`, and on approval records a dry run.

---

## Retrieval

Thirteen markdown documents — architecture notes, runbooks, three postmortems,
release process, triage methodology — are chunked on section headings, embedded,
and indexed at startup.

Search is hybrid:

- **BM25** over tokenised chunks, which is what actually matches
  `jwt_signing_key_id`, `max_connections`, or a service name.
- **Dense cosine similarity**, for topical recall when the query and the document
  share no vocabulary.
- **Reciprocal rank fusion** (`k = 60`) to combine the two rankings.

The retrieval query is built deterministically from the measured signal shape —
a sustained saturation breach adds "connection pool exhaustion capacity" to the
query — so retrieval is driven by evidence rather than by the model's phrasing.

**Embeddings.** The default embedder is a local hashed bag-of-words model: no
API key, no network, deterministic in CI. It is genuinely weaker than a trained
embedding model, which is exactly why retrieval is hybrid — BM25 carries the
precision. Setting `VOYAGE_API_KEY` swaps in a real embedding model with no other
change.

**Citations cannot be fabricated.** Every retrieved chunk keeps its document id
and gets a reference (`K1`, `K2`, …); telemetry evidence gets `E1`–`E4`. The
model is told the exact set of valid references, and any citation outside that
set is stripped from remediation plans, counted against the hypothesis's
citation validity, and recorded as an unsupported claim.

---

## Safety model

- **No arbitrary execution.** The model cannot emit a command. It selects an
  `action_id` from a fixed catalogue of six actions and supplies parameters,
  which are validated against a schema (known service names, bounded integers,
  enumerated config keys, no extra fields) before a human is shown the proposal.
  There is no shell, no subprocess and no network egress on the execution path.
- **Human approval is a hard gate.** Nothing executes without a `POST` carrying a
  named approver. Rejecting a plan leaves the platform untouched — asserted by
  both an API test and a browser test.
- **Authenticated mutations.** Every state-changing endpoint requires
  `X-Aegis-Token`, compared in constant time. An unset token locks mutations
  rather than opening them.
- **Secrets stay in the environment.** No credentials in the repository;
  `.env.example` documents every variable.
- **Degraded mode is visible.** If a reasoning call fails, the incident records
  an `llm_error` event and finishes on the offline provider rather than stalling.

---

## The simulated platform

```mermaid
flowchart TD
    GW["gateway<br/><i>edge</i>"] --> AUTH["auth-service"]
    GW --> CO["checkout-service"]
    AUTH --> SC[("session-cache")]
    CO --> PDB[("payments-db")]
    CO --> INV["inventory-service"]
    INV --> PDB
```

Latency, errors and saturation propagate from a dependency to its dependents in
proportion to call-path coupling, so a single fault produces a realistic fan-out
of alerts. Three failures can be injected:

| Scenario | Fingerprint | Correct action |
| --- | --- | --- |
| Checkout latency regression | p95 ~5x baseline, error rate flat, dependencies healthy, traffic flat | `rollback_deployment` |
| Authentication 5xx spike | error rate +21 points, latency flat, dependencies healthy | `revert_config` |
| Payments DB connection exhaustion | saturation > 0.95, p95 ~7x, two dependents degrade together, traffic flat | `increase_connection_pool` |

Applying the *wrong* action genuinely does not fix the fault — the simulator only
clears a fault for the action that addresses it. That is what makes remediation
accuracy a real measurement rather than a formality.

---

## Screenshots

All captured from the running application by `npm run screenshots`.

The console is deliberately plain, and written so that someone who has never
seen it can work out what it is and what to do. It runs on a warm, layered light
palette: the application sits on a tinted sand ground and panels are a lighter
ivory, so surfaces separate by tone rather than by heavy borders — nothing is
pure white. Hierarchy comes from type, whitespace and a single soft elevation
step. Bronze marks the wordmark and the active page and never touches data;
colour is otherwise reserved for status, shown as a small dot beside a word
rather than a block of fill, so meaning never depends on distinguishing hues.

Every page opens with a sentence explaining what it shows, each nav item says
what it is for, and the Command Center leads with the single next action: either
*"Nothing is wrong right now — break something to watch Aegis work"* or *"Aegis
has finished investigating and is waiting for you to approve or reject its
proposed fix."* On the investigation page the sections are named in plain
language — what is wrong, possible causes, proposed fix, what Aegis did — and
the approval gate says so outright: nothing has run yet.

The status strip reports whether telemetry is genuinely live or stale rather
than assuming the poll succeeded. `g c` / `g i` / `g m` / `g k` / `g l` jump
between pages, `?` lists the shortcuts, focus rings are visible throughout, and
the layout holds from 375px up.

**Incident under investigation** — evidence, ranked hypotheses with resolvable
citations, the critic's verdict, and the proposed action parked on the approval
gate:

![Incident investigation](docs/screenshots/03-incident-investigation.png)

**Command Center during an incident:**

![Command Center with an incident](docs/screenshots/02-command-center-incident.png)

**System Map** — dependency graph with live health; degraded edges animate:

![System map](docs/screenshots/04-system-map.png)

**Knowledge Base** — the indexed corpus, with a live hybrid-retrieval preview
showing BM25 and dense ranks per hit:

![Knowledge base](docs/screenshots/05-knowledge-base.png)

**Demo Lab** — failure injection, simulator state, and the complete remediation
allowlist:

![Demo lab](docs/screenshots/06-demo-lab.png)

**Resolved incident** — the full audit timeline through recovery verification:

![Resolved incident](docs/screenshots/07-incident-resolved.png)

---

## Running it

Requires Python 3.11+ and Node 20+.

```bash
git clone https://github.com/Niloy-Bhuiyan/aegis-incident-commander.git
cd aegis-incident-commander
cp .env.example .env
```

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn aegis.main:app --reload --port 8000
```

**Frontend, in a second terminal:**

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>, go to **Demo Lab**, and inject a failure. The
platform ticks every two seconds; an incident opens within about three ticks and
the investigation completes immediately after.

The backend creates the SQLite schema and ingests the knowledge base on startup,
so there is nothing else to set up.

**With Claude reasoning.** Without `ANTHROPIC_API_KEY` the system runs a
deterministic offline provider (see [Limitations](#limitations)). Set the key in
`.env` to use `claude-opus-5`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
AEGIS_LLM_MODEL=claude-opus-5
AEGIS_LLM_EFFORT=medium
```

**Against a real Prometheus.** See [Telemetry sources](#telemetry-sources):

```bash
AEGIS_TELEMETRY_SOURCE=prometheus
AEGIS_TELEMETRY_CONFIG=telemetry.prometheus.example.yml
```

**Database migrations.** SQLite is created automatically; PostgreSQL uses
Alembic:

```bash
cd backend
AEGIS_DATABASE_URL=postgresql+asyncpg://user:pass@host/aegis alembic upgrade head
```

**Docker Compose** brings up PostgreSQL, the API and the console together:

```bash
docker compose up --build
```

---

## Testing

| Suite | Command | Count |
| --- | --- | --- |
| Backend | `cd backend && pytest -q` | 98 |
| Backend lint | `ruff check aegis tests` | — |
| Frontend unit | `cd frontend && npm run test` | 42 |
| Frontend build | `npm run build` | — |
| End-to-end (browser) | `npm run test:e2e` | 5 |

The end-to-end suite drives a real Chromium against the real backend and covers
the full demo path: healthy platform → inject failure → detection → evidence and
retrieval → hypotheses → proposed action → **assert nothing executed before
approval** → approve → sandbox execution → verified recovery → resolved, plus a
rejection path that asserts the platform is left untouched.

Backend coverage includes the parts worth breaking: detection must not fire on a
healthy platform, must not fire on a single-sample spike, must never name the
gateway as origin when a dependency is breaching; the action allowlist must
reject unknown actions, shell-shaped payloads, path traversal in a service name,
extra parameters, out-of-range integers and booleans-as-integers; the Anthropic
request must carry a strict, self-contained JSON schema and adaptive thinking,
and must surface refusals and schema violations as errors.

The Prometheus adapter is covered end to end against the shipped test double:
all three failure fingerprints are detected through the real HTTP path, a
partially-scraped service is dropped rather than back-filled, changes are read
from labelled series, and remediation reports itself as a dry run. Config
validation rejects a missing SLO, a missing baseline, an absent signal query and
a dangling dependency.

---

## Evaluation

`python -m aegis.evaluation` runs all three scenarios end to end — inject,
detect, investigate, approve, verify — and scores them against ground truth the
workflow never sees.

Latest run (`backend/eval_reports/latest.json`, offline provider):

| Metric | Result |
| --- | --- |
| Detection rate | 1.00 |
| Origin service accuracy | 1.00 |
| Root cause top-1 accuracy | 1.00 |
| Citation validity | 1.00 |
| Unsupported claims per hypothesis | 0.50 |
| Retrieval hit rate | 0.67 |
| Remediation accuracy | 1.00 |
| Recovery success rate | 1.00 |
| Mean detection latency | 3.0 sample windows |
| Mean case wall time | 0.36 s |
| Cost | $0.00 (no model calls) |

**Read these numbers carefully.** They were produced by the offline heuristic
provider, which encodes the same signal fingerprints the runbooks describe. Its
reasoning scores are near-ceiling *by construction* and say nothing about how
well Claude performs on this task. The metrics that are genuinely informative
under this provider are the deterministic ones — detection rate, origin
accuracy, recovery success — and **retrieval hit rate (0.67)**, which measures
the real RAG pipeline: of the three documents a competent investigation should
surface per scenario, hybrid retrieval finds two.

Getting comparable numbers for the model path requires an API key; the harness
records provider, model, token counts and cost per run so the two are directly
comparable. See [Limitations](#limitations).

CI enforces floors on detection, origin accuracy, remediation accuracy, recovery
and citation validity at 1.0, and retrieval hit rate at 0.6, so a regression
fails the build rather than quietly degrading.

---

## Deployment

**Not currently deployed to a public URL.** The build environment for this
project had no Docker daemon and no cloud credentials, so container images were
never built and nothing was pushed to a host. Claiming a live deployment would
be untrue.

What exists and is committed:

- `backend/Dockerfile` — Python 3.12 slim, non-root user, health check, runs
  `alembic upgrade head` before serving.
- `frontend/Dockerfile` — multi-stage Node build served by nginx with SPA
  fallback.
- `docker-compose.yml` — PostgreSQL 16 + API + console, wired together.
- `render.yaml` — a Render blueprint: managed PostgreSQL, the API as a Docker
  web service, the console as a static site.
- `.github/workflows/ci.yml` — lint, tests, migrations up and down, evaluation
  with enforced thresholds, frontend build and tests, and the browser suite.

These are written but unverified against a live host. Treat them as a starting
point, not a proven deploy.

---

## Limitations

1. **It has never been pointed at a production Prometheus.** The adapter is
   real and exercised over real HTTP, but only against a test double backed by
   the simulator. Production telemetry is noisier, has gaps and far higher
   cardinality, and incidents overlap — the detector handles one origin at a
   time. Nothing here demonstrates the approach survives contact with a real
   fleet.
2. **The Claude reasoning path is implemented but was never executed against the
   live API in this build.** No API key was available in the build environment.
   The request shape, structured-output schema, refusal handling, usage
   accounting and error mapping are covered by tests against a stubbed client,
   and the workflow, evaluation and demo all run on the deterministic offline
   provider. Every number in this README comes from that offline provider — none
   of them is evidence about model quality.
3. **Remediation against a real backend is a dry run, and there is no RBAC.**
   Approving a plan under the Prometheus source records the decision without
   acting. Auth is a single shared API token; there is no per-user identity,
   no paging integration and no multi-tenancy.

---

## Roadmap

- Run the evaluation against `claude-opus-5` and publish the comparison against
  the offline baseline, including cost per incident and an effort sweep.
- Replace the local embedder with Voyage embeddings and re-measure retrieval hit
  rate, which is the weakest measured component at 0.67.
- Feed resolved incidents back into the knowledge base so the corpus grows from
  the system's own postmortems.
- A real remediation executor behind the existing allowlist — the boundary is
  already there; it needs one method implemented against a deploy or config API.
- Point it at a real Prometheus with real services and re-run the evaluation.
- Multiple concurrent incidents with correlation between them, which the
  detector currently does not attempt.
- Build and deploy the containers, then replace the deployment section with a
  verified live URL.

---

## Repository layout

```
backend/
  aegis/
    agent/        reasoning nodes, prompts, schemas, workflow state machine
    api/          FastAPI routers, response models, auth
    detect/       SLO breach rules and the monitoring loop
    evaluation/   scored end-to-end harness
    obs/          OpenTelemetry, Prometheus, structlog
    rag/          chunking, embeddings, hybrid store, ingest
    remediation/  action allowlist, sandbox executor, recovery verifier
    sim/          topology, failure scenarios, metric engine
    sources/      telemetry sources: simulator and Prometheus adapter
  alembic/        migrations
  tools/          fake_prometheus.py - Prometheus-shaped test double
  tests/          98 tests
frontend/
  src/            React console: command center, investigation, map, KB, lab
  e2e/            Playwright browser suite
  capture/        screenshot capture tool
knowledge/        the indexed corpus (13 markdown documents)
docs/screenshots/ captured from the running application
```
