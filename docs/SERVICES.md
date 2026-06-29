# Recoder py/ Sidecar Services — Runbook

The `docker-backend` connects to several optional Python sidecar services through
**env-var seams**. When a seam's env var is set, the backend talks to the service;
when it is unset or the service is down, the backend **degrades safely** (it never
fakes success). This runbook covers how to start each service so its seam lights up.

One launcher drives them all: [`scripts/recoder-services.sh`](../scripts/recoder-services.sh).

```bash
scripts/recoder-services.sh up   [colbert|billing|ops|mem0]   # start one or all
scripts/recoder-services.sh down [colbert|billing|ops|mem0]   # stop one or all
scripts/recoder-services.sh health [colbert|billing|ops|mem0] # truthful per-service status
```

The launcher auto-creates a **per-service virtualenv** under `.recoder-services/venvs/`
containing **only the lightweight deps** for that service. It NEVER installs the heavy
ML stack (`torch` / `faiss`) — those stay manual. Pidfiles and logs live under
`.recoder-services/` (override with `RECODER_SERVICES_RUN_DIR`). That directory is a
runtime artifact and should not be committed.

`health` is honest: it reports `running`/`stopped`, the live HTTP status, and exactly
which Python modules are missing. A service whose heavy deps are absent is reported as
degraded — never as healthy.

---

## colbert — late-interaction rerank

- **What it is:** A thin Flask endpoint (`py/colbert/rerank_server.py`) that scores
  caller-supplied passages against a query with ColBERT late interaction and returns
  them reranked. No prebuilt index required.
- **Backend seam:** `COLBERT_RERANK_URL` (read in
  `docker-backend/src/conductor/colbert-rerank.ts`). Set it to
  `http://127.0.0.1:8893`. The backend POSTs `/rerank`; on any non-2xx it falls back
  to the original retrieval order.
- **Start:** `scripts/recoder-services.sh up colbert` (default port `8893`).
- **Deps:**
  - Lightweight (auto-installed): `flask` — lets the server **start and serve**.
  - Heavy (manual, NOT auto-installed): `torch` + the `colbert` package. Until these
    are present the server runs in **degrade-safe mode**: `GET /health` →
    `{"rerank_available": false}` (200); `POST /rerank` → `503 {"error":"rerank
    unavailable: No module named 'torch'"}`, which triggers the backend fallback.
  - To enable real reranking: `pip install torch colbert-ai` into
    `.recoder-services/venvs/colbert` (large download; do not do this on a near-full
    disk), then restart.
- **Env:** `COLBERT_CHECKPOINT` (default `colbert-ir/colbertv2.0`), `PORT`.

## billing — distribution billing & entitlement engine

- **What it is:** The fused Polar monetization spine (`py/recoder-billing`). The
  runnable ASGI app is `recoder_billing.app:app`; it exposes the internal IPC surface
  `/internal/agent-os/billing/*`. **Fail-safe:** when a required secret/URL is absent
  the engine reports `unhealthy` and denies every operation — it never fakes an allow.
- **Backend seam:** `BILLING_BASE_URL` (read in
  `docker-backend/src/distribution/billing-ipc.ts`). Set it to
  `http://127.0.0.1:8896`. The backend probes
  `GET /internal/agent-os/billing/health` and posts signed envelopes to
  `POST /internal/agent-os/billing/invoke`.
- **Start:** `scripts/recoder-services.sh up billing` (default port `8896`).
- **Deps:** Lightweight (auto-installed): `fastapi`, `uvicorn`, `pyjwt`. That is all
  that is needed to serve the health-only / signed-invoke surface.
- **Env (truthful health):** the engine is `healthy` only when ALL of these are set:
  `SECRET`, `INTERNAL_SERVICE_KEY`, `BILLING_ENVELOPE_SIGNING_KEY`,
  `POLAR_ACCESS_TOKEN`, `BILLING_TOKEN_HASH_SECRET`, `AUTH_SOURCE_OF_TRUTH_URL`.
  Missing any → `GET .../health` returns `503 {"healthy": false, "issues": [...]}`
  listing exactly what is absent. With all set → `200 {"healthy": true}`. Also reads
  `BILLING_BASE_URL` and `RECODER_BILLING_ENV` (`development`|`testing`|`sandbox`|`production`).

## ops — ops-recorder work-signals detector

- **What it is:** A FastAPI service (`py/ops-recorder/work-signals`) that detects
  stuck/blocked work across GitHub and Linear and packages each into a structured
  WorkSignal with an AI-ready handoff prompt.
- **Backend seam:** This service is a **producer**: it pushes detected signals to the
  backend's ingress `POST /api/conductor/work-signals` (the backend does not poll it).
  Its own `GET /health` is the liveness probe; `GET /work-signals` lists detections.
- **Start:** `scripts/recoder-services.sh up ops` (default port `8897`).
- **Deps:**
  - Lightweight (auto-installed): `fastapi`, `uvicorn[standard]`, `pydantic`,
    `pydantic-settings`, `httpx`, `python-dotenv` — enough to **start and serve**.
  - Optional: `asyncpg` is **guarded** — without it the store falls back to in-memory
    (logged at startup). Install `asyncpg` + set `WORK_SIGNALS_DATABASE_URL` (or
    `RECODER_BACKEND_DATABASE_URL` / `DATABASE_URL`) for Postgres persistence.
- **Env:** `OPS_RECORDER_API_KEY` (sync/ingest endpoints return `503` until set, unless
  auth is disabled), `GITHUB_TOKEN` + `GITHUB_REPO`, `LINEAR_API_KEY` + `LINEAR_TEAM_ID`,
  `CORS_ORIGINS`, `PORT`.

## mem0 — self-hosted memory server

- **What it is:** The full upstream mem0 FastAPI server (`py/mem0/server`) — a memory
  layer backed by pgvector (and optionally Neo4j). This is a heavyweight, DB-coupled
  service, not a degrade-only stub.
- **Backend seam:** `MEM0_BASE_URL` (read in `docker-backend/src/mem0-client.ts`).
  Set it to `http://127.0.0.1:8888` to point the platform client at the self-hosted
  server (`/memories`, `/search`, …).
- **Start:** `scripts/recoder-services.sh up mem0` (default port `8888`). The launcher
  does **not** auto-provision mem0 (it needs its own requirements + a running database):
  install first, then `up mem0` launches `uvicorn main:app`.
- **Deps (manual):** `pip install -r py/mem0/server/requirements.txt`
  (`fastapi`, `uvicorn`, `mem0ai`, `psycopg`, `sqlalchemy`, `slowapi`,
  `python-dotenv`, …). The server **imports Postgres/pgvector at startup**, so a
  reachable database is required to run at all (no torch/faiss).
- **Env:** `POSTGRES_HOST/PORT/DB/USER/PASSWORD`, `OPENAI_API_KEY` (or the bundled
  Anthropic/Gemini provider keys), `MEM0_API_KEY`/`AUTH_DISABLED` for auth, `PORT`.

---

## Quick start (the seams the backend reads)

```bash
# Start the lightweight, degrade-safe services (colbert, billing, ops):
scripts/recoder-services.sh up colbert
scripts/recoder-services.sh up billing
scripts/recoder-services.sh up ops
scripts/recoder-services.sh health

# Point the backend at them:
export COLBERT_RERANK_URL=http://127.0.0.1:8893
export BILLING_BASE_URL=http://127.0.0.1:8896
# (ops-recorder pushes to the backend; no URL var to set on the backend side)
# mem0 requires its own install + Postgres before:
export MEM0_BASE_URL=http://127.0.0.1:8888
```

Every service is independent: one missing dependency degrades only that service, and
the backend seams fall back safely on their own.
