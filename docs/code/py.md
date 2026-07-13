# py — Python services & vendored ML substrates

> Verified by reading the tree under `/Users/arhansubasi/recoder.xyz/py` on the
> `fix/agent-blockers-...` branch. Where a directory is third-party/vendored,
> that is called out explicitly rather than guessed.
>
> **Update (2026-07-13, `feat/enterprise-s0-p0`).** **`py/recoder-billing/` was deleted** — the Polar
> merchant-of-record billing slice was dropped in the engine-program cleanup (billing capability is
> deferred, filed; see [RECODER-CAPABILITIES](../architecture/RECODER-CAPABILITIES.md)). The on-disk
> tree is now `ops-recorder`, `colbert`, `mem0`, `browser-use`, `pal-mcp-server`. Sections describing
> `recoder-billing` / `BILLING_BASE_URL` below are **obsolete**; the remaining first-party service is
> `ops-recorder/work-signals` (Phase 5 work-signals, seam not yet fully wired). `colbert`'s rerank
> server is the wired reranker behind the `retrieval` engine.

## 1. Purpose

`py/` is the Python side-car layer of the Recoder monorepo. The canonical
control plane and most runtime logic live in the TypeScript/Node `docker-backend`;
the Python services here are **degrade-safe substrates** the Node backend
optionally talks to over HTTP/stdio. Each one is wired so the Node side reports
truthful "unavailable" health when the Python engine is not running, and never
fakes success — the seams are gated by env vars (`BILLING_BASE_URL`,
`COLBERT_RERANK_URL`, `MEM0_BASE_URL`/`MEM0_API_KEY`, pal MCP root path).

Two kinds of code live here:
- **Recoder-owned, first-party** services: `recoder-billing` (the fused Polar
  monetization spine) and `ops-recorder/work-signals` (stuck-work detector).
- **Vendored upstream projects** adapted/pointed-at by Recoder: `mem0` (mem0ai),
  `colbert` (ColBERT IR), `browser-use`, and `pal-mcp-server` (a fork of the
  BeehiveInnovations / zen-style MCP server). The context hint's "backend
  (FastAPI/gunicorn)" does **not** correspond to a `py/backend` directory — there
  is no such directory; the main app backend is the Node `docker-backend`.

## 2. Layout

Top-level directories actually present (`ls py/`):

| Dir | Tracked files | Owner | What it holds |
|-----|---------------|-------|---------------|
| ~~`recoder-billing/`~~ | **DELETED** (2026-07-13) | — | Removed with Polar. The `recoder-billing` / `BILLING_BASE_URL` entries throughout this doc are obsolete. |
| `ops-recorder/` | 28 | **Recoder first-party** | Single service `work-signals/`: a small FastAPI app that detects stuck GitHub/Linear work, normalizes to `WorkSignal`, and generates handoff prompts. Source is selectively git-tracked (see Gotchas). |
| `colbert/` | 184 | **Vendored** (ColBERT IR, `colbert/colbert` package) | Late-interaction retrieval/IR library. Two Flask HTTP servers added on top: `server.py` (ANN index search) and `rerank_server.py` (Recoder-added thin rerank endpoint). |
| `mem0/` | 1686 | **Vendored** (mem0ai, `name = "mem0ai"` v2.0.9) | Memory layer for AI agents. Includes `mem0/` core package, `server/` (FastAPI + alembic), `mem0-ts/`, `openmemory/`, CLI, docs. Node talks to it via `docker-backend/src/mem0-client.ts`. |
| `browser-use/` | 500 | **Vendored** (`browser-use` v0.13.2) | Browser-automation agent library (`browser_use/` package, Dockerfiles, examples). |
| `pal-mcp-server/` | **0 (gitignored)** | **Vendored fork** | AI-powered MCP server (`name = "pal-mcp-server"` v9.8.2) exposing code-analysis/review/think tools over stdio MCP. Whole dir is gitignored — see Gotchas. |

## 3. Entry points

Start reading from the runnable servers:

- **Billing engine (Recoder):**
  `recoder-billing/recoder_billing/app.py` — ASGI entrypoint. Exposes
  `GET /internal/agent-os/billing/health` (always available, fail-safe) and
  `POST /internal/agent-os/billing/invoke` (signed ops). Auth/health core is
  `recoder-billing/recoder_billing/ipc/internal_api.py:1` (`InternalApiGuard`,
  `build_internal_router`). Default run port **8896**; Node points at it with
  `BILLING_BASE_URL`. Signed-envelope logic: `ipc/envelope.py`; crypto/JWT in
  `kit/` (`crypto.py`, `jwt.py`, `jwk.py`).
- **Work Signals (Recoder):**
  `ops-recorder/work-signals/main.py:1` — FastAPI app, `uvicorn main:app`.
  Routes in `api/workSignalsRoutes.py:31` (`APIRouter`, all guarded by
  `Depends(require_api_key)`); mounted under `/work-signals`. Storage backends in
  `storage/` (in-memory + Postgres + repository), integrations in
  `integrations/githubClient.py` / `linearClient.py`, detectors in `detectors/`.
- **ColBERT rerank (Recoder-added on vendored lib):**
  `colbert/rerank_server.py:90` — Flask `POST /rerank` (+ `GET /health`),
  default **PORT 8893** (`rerank_server.py:131`). Scores caller-supplied passages,
  no prebuilt index needed; heavy `torch`/`colbert` imports are guarded so the
  module imports even without them. Node seam: `docker-backend/src/conductor/colbert-rerank.ts`
  gated by `COLBERT_RERANK_URL`.
- **ColBERT ANN search (vendored):** `colbert/server.py:1` — Flask
  `GET /api/search`, requires a prebuilt index via `Searcher` (`INDEX_NAME`,
  `INDEX_ROOT` env).
- **mem0 server (vendored):** `mem0/server/` (FastAPI + `db.py` + alembic). Node
  client: `docker-backend/src/mem0-client.ts` (BYOK self-host or managed via
  `MEM0_API_KEY`/`MEM0_BASE_URL`).
- **pal MCP server (vendored fork):** `pal-mcp-server/server.py:1` — stdio
  MCP server. Tools in `pal-mcp-server/tools/` (analyze, codereview, debug,
  thinkdeep, planner, consensus, refactor, secaudit, …). `config.py:17`
  (`__version__ = "9.8.2"`, `DEFAULT_MODEL = "auto"`). Launched by Node as a
  supervised EXTERNAL MCP server — see `docker-backend/src/agent-os/mcp/interop-host.ts:179`
  (resolves repo `py/pal-mcp-server` by default).

## 4. Build / run / test

Each subtree is an independent Python project; there is **no top-level `py/`
build file**. Per project (real, verified commands/files):

- **recoder-billing** — `recoder-billing/pyproject.toml` (hatchling). Lightweight
  spine needs only `pyjwt`; web surface is the optional `api` extra
  (`fastapi`, `asyncpg`, `sqlalchemy`, `pydantic`). Run (from its docstring):
  `uvicorn recoder_billing.app:app --host 127.0.0.1 --port 8896`. Tests:
  `pytest` (config in `[tool.pytest.ini_options]`, `asyncio_mode = "auto"`,
  `unit`/`integration` markers). Lint: `ruff` (py311, line-length 88).
- **ops-recorder/work-signals** — `requirements.txt` / `requirements-dev.txt`.
  Run: `uvicorn main:app --reload --host 127.0.0.1 --port 8000` (README).
  Auth: `OPS_RECORDER_API_KEY` required unless `OPS_RECORDER_AUTH_DISABLED=true`.
  Tests under `tests/` via `pytest` (a `.pytest_cache/` is present).
- **colbert** — vendored: `setup.py`, `MANIFEST.in`, `conda_env.yml` /
  `conda_env_cpu.yml` (conda env). Rerank server: `python rerank_server.py`
  (binds `PORT`, default 8893); search server: `python server.py` (needs
  `INDEX_NAME`/`INDEX_ROOT`).
- **mem0** — vendored: `pyproject.toml` (`mem0ai`), `Makefile`, `poetry.lock`.
  Use upstream `make`/poetry targets; server has its own `docker-compose.yaml`.
- **browser-use** — vendored: `pyproject.toml`, `Dockerfile` / `Dockerfile.fast`.
- **pal-mcp-server** — vendored fork: `run-server.sh` / `run-server.ps1`
  (env setup + deps install + launch), `pyproject.toml`, `requirements.txt`,
  `requirements-dev.txt`, `pytest.ini`, `run_integration_tests.sh`,
  `code_quality_checks.sh`, `Dockerfile` / `docker-compose.yml`.

## 5. Key patterns & contracts

- **Degrade-safe seams (the dominant pattern).** Every Python engine is optional.
  The Node side decides availability purely from env (`BILLING_BASE_URL`,
  `COLBERT_RERANK_URL`, `MEM0_*`, pal root path) and probes `/health`; absence
  yields `{ available:false }` / fallback behavior, never a faked OK. The Python
  side mirrors this: heavy ML imports are guarded so the module imports and
  `python -m py_compile` succeeds even without torch/colbert/fastapi installed
  (`colbert/rerank_server.py`, `recoder_billing/app.py`).
- **Truthful, fail-safe health.** `recoder_billing` computes health from
  `Settings`: `healthy:true` only when every required secret/URL is present; a
  missing secret yields `503` + explicit issue list (`ipc/internal_api.py`,
  `app.py`). Matches `docker-backend/src/distribution/billing-ipc.ts`.
- **Signed internal IPC.** Billing's only external surface is
  `/internal/agent-os/billing/*`. `InternalApiGuard` enforces, in order:
  engine health → `x-internal-service-key` header (constant-time compare via
  `kit/crypto.constant_time_compare`) → verified signed `Envelope`
  (`ipc/envelope.py`) with single-use nonce. Unknown ops return `404
  unknown_operation`. This is the same `INTERNAL_SERVICE_KEY` contract used across
  the repo's `/internal/agent-os/*` routes.
- **pal as an EXTERNAL MCP runtime.** pal is not embedded; Node supervises it over
  stdio MCP (`interop-host.ts`) and surfaces on-disk availability + truthful
  health. `DEFAULT_MODEL=auto` lets the calling model pick.
- **Rerank contract.** `/rerank` takes `{query, passages[]}` and returns
  `{results:[{index, score}]}` where `index` is the original passage position,
  sorted desc by late-interaction score; the Node `RerankerPort` falls back to
  original retrieval order when the endpoint is missing/erroring.
- **Naming.** Recoder-owned services use `camelCase` Python file names in
  ops-recorder (`workSignalStore.py`, `githubNormalizer.py`) — atypical for
  Python but intentional and consistent within that service.

## 6. Gotchas

- **`pal-mcp-server/` is fully gitignored** (`.gitignore:668 py/pal-mcp-server/`,
  confirmed via `git check-ignore`; 0 tracked files). It is a **vendored fork
  that lives on disk only** — edits here run locally but do **not** commit to the
  root repo. This matches the known monorepo landmine of whole-dir-ignored
  vendored subtrees. Treat it as external/third-party.
- **`mem0`, `colbert`, `browser-use` are vendored upstream projects** (mem0ai,
  ColBERT IR, browser-use), tracked in-repo but largely third-party. Do not treat
  their internals as Recoder conventions. The Recoder-authored additions are
  narrow: `colbert/rerank_server.py` (the `/rerank` seam) and the Node clients
  in `docker-backend`. There is also a **root-level** `/mem0/` ignore rule
  (`.gitignore:638`) that is anchored to repo root and does **not** affect
  `py/mem0/` — don't confuse the two.
- **No `py/backend` FastAPI/gunicorn service exists.** The context hint is wrong
  on this point; the main backend is the Node `docker-backend`. The FastAPI apps
  in `py/` are the small side-cars listed above (billing, work-signals), plus
  mem0's vendored server.
- **ops-recorder has selective gitignore rules** (`.gitignore:673-702`): source
  (`*.py`, `requirements*.txt`, `*.md`, `*.sql`, `.env.example`) is committable,
  but `__pycache__/`, `.venv/`, `.env`, `data/`, `*.key`, `*.pem`, `.DS_Store`
  are excluded. Don't add secrets or build artifacts there expecting them to commit.
- **Stray `.DS_Store` files** are present in several dirs (`py/.DS_Store`,
  `pal-mcp-server/.DS_Store`, etc.) — noise, ignore.
- **Heavy optional deps are guarded, not required at import time.** A clean
  `import`/`py_compile` does **not** prove the runtime path works; the engines
  report "unavailable" until torch/colbert/fastapi/uvicorn are actually installed.
  Verify against a running engine, not just an import.
