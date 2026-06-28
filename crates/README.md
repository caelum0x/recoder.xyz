# `crates/` — Vendored Rust crates + the openfang sidecar seam

This directory holds Rust crates used by the Recoder platform. Two kinds live
here:

| Subtree              | Tracked? | What it is                                              |
| -------------------- | -------- | ------------------------------------------------------ |
| `lance/`             | tracked  | Vendored Lance (columnar / vector storage) crate.      |
| `tensorzero/`        | tracked  | Vendored TensorZero gateway crate.                     |
| `openfang/`          | **ignored** | Upstream clone of the openfang Agent OS (199K LOC). |
| `claw-code-parity/`  | **ignored** | Upstream clone, parity reference.                   |

`openfang/` and `claw-code-parity/` are **gitignored upstream clones**
(see the repo-root `.gitignore`: `crates/openfang/`, `crates/claw-code-parity/`).
Recoder-authored seam files therefore live *here* at the tracked `crates/`
root — not inside the ignored clone — so they are versioned and auditable.

Recoder-authored seam files:

- **`crates/openfang.toml`** — production openfang config (see below).
- **`crates/README.md`** — this file: the integration contract.

---

## openfang sidecar — integration seam

openfang is consumed as a **sidecar process**: a separate Rust binary that
exposes an HTTP API on `127.0.0.1:4200`. Recoder's TypeScript backend
(`docker-backend/`) is a **client** of that API. openfang is an *execution
substrate*; it does not own Recoder task/approval/memory/artifact state (per
`.claude/rules/agent-os.md` and `AGENTS.md`).

### Build / runtime status — HONEST

> **No openfang binary is built or running as part of this change.**
> This round is config + seam + docs only. The openfang workspace is ~199K LOC;
> a `cargo build --release` (or even a cold `cargo check`) of it risks filling
> the local disk (ENOSPC) and is explicitly out of scope. Treat the
> "spawn / HTTP call" contract below as the *intended* wiring, verified against
> the openfang source — **not** as a live, smoke-tested integration. Before
> relying on it in production, build the binary (Docker is the supported path,
> below) and run the live checks in `crates/openfang/CLAUDE.md`.

### How openfang is built (when you do build it)

Use the upstream Docker path — it is self-contained and keeps the heavy Rust
build off the dev box's root disk:

```bash
# from the openfang clone
cd crates/openfang
docker compose up --build          # builds `cargo build --release --bin openfang`
# image EXPOSEs 4200, sets OPENFANG_HOME=/data, ENTRYPOINT ["openfang"], CMD ["start"]
```

The single binary is `openfang`; the daemon subcommand is `start` (NOT
`daemon`). Config is read from `$OPENFANG_HOME/config.toml`
(`OPENFANG_HOME=/data` in the image).

### How Recoder TS would spawn / reach it

There are two supported shapes. Recoder uses openfang as a long-lived service,
so **(A) is the intended production shape**; (B) is for local/dev only.

**(A) Run as a managed service, call over HTTP (recommended).**
Run the openfang container (docker-compose above) or a host process, then have
the Node backend call it as an internal HTTP dependency:

```ts
// Recoder-side client sketch (illustrative — not a live integration yet).
const OPENFANG_URL = process.env.OPENFANG_URL ?? "http://127.0.0.1:4200";
const OPENFANG_API_KEY = process.env.OPENFANG_API_KEY; // bearer, if configured

async function openfangFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (OPENFANG_API_KEY) headers.set("authorization", `Bearer ${OPENFANG_API_KEY}`);
  headers.set("content-type", "application/json");
  return fetch(`${OPENFANG_URL}${path}`, { ...init, headers });
}

// liveness gate before use — honest health, never assumed:
const h = await (await openfangFetch("/api/health")).json();
// h.status is "ok" or "degraded"; do not treat "degraded" as ready.
```

**(B) Spawn the binary directly (dev / single-host).**
If a binary is on PATH, spawn it and wait for `/api/health` to go green before
issuing requests:

```ts
import { spawn } from "node:child_process";

const child = spawn("openfang", ["start"], {
  env: {
    ...process.env,
    OPENFANG_HOME: "/data",
    OPENFANG_LISTEN: "127.0.0.1:4200",
    // secrets injected from Recoder's env / secret manager — never hardcoded:
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    OPENFANG_API_KEY: process.env.OPENFANG_API_KEY ?? "",
  },
  stdio: "inherit",
});
// then poll GET /api/health until {"status":"ok"} (or fail fast on timeout).
```

`OPENFANG_LISTEN` and `OPENFANG_API_KEY` are honored at `start` time and
override the equivalents in `config.toml`.

### The real HTTP contract (verified against openfang source)

Routes are registered in `crates/openfang/crates/openfang-api/src/server.rs`;
handlers in `routes.rs`. The endpoints Recoder would use:

| Method | Path                                | Auth        | Purpose                                  |
| ------ | ----------------------------------- | ----------- | ---------------------------------------- |
| GET    | `/api/health`                       | public      | Liveness. `{"status":"ok"\|"degraded","version"}` |
| GET    | `/api/health/detail`                | bearer      | Full diagnostics incl. `config_warnings` |
| GET    | `/api/agents`                       | bearer      | List agents.                             |
| POST   | `/api/agents/{id}/message`          | bearer      | Send a message → triggers an LLM call.   |
| POST   | `/api/agents/{id}/message/stream`   | bearer      | Streaming variant (SSE/WS).              |
| GET    | `/api/agents/{id}/ws`               | bearer      | Per-agent WebSocket.                     |
| GET    | `/api/budget`                       | bearer      | Global spend status.                     |
| GET    | `/api/budget/agents`                | bearer      | Per-agent spend ranking.                 |
| GET    | `/api/a2a/agents`                   | bearer      | External A2A agents.                     |
| POST   | `/api/a2a/discover`                 | bearer      | Discover an A2A agent at a URL.          |
| POST   | `/api/a2a/send`                     | bearer      | Send a task to an external A2A agent.    |
| GET    | `/api/a2a/tasks/{id}/status`        | bearer      | Poll external A2A task status.           |

**Auth.** When `api_key` (or `OPENFANG_API_KEY`) is set, every route *except*
`/api/health` requires `Authorization: Bearer <key>`
(`openfang-api/src/middleware.rs`). If unset, the API is unauthenticated —
acceptable only on a strictly-loopback box.

**A2A boundary.** openfang's `/api/a2a/*` is openfang's *own* A2A surface and is
distinct from Recoder's canonical `/api/a2a/*` control-plane routes
(`.claude/rules/api.md`). When bridging the two, Recoder remains the source of
truth for task/approval/memory/artifact state; openfang A2A is just another
connector.

### Fail-safe contract (why this degrades instead of crashing)

Verified in openfang source — Recoder's config does not weaken any of it:

1. **Missing provider key →** the driver returns a typed
   `LlmError::MissingApiKey("Set ANTHROPIC_API_KEY environment variable")`
   (`openfang-runtime/src/drivers/mod.rs`). The daemon does **not** panic; the
   individual request fails with an explicit, actionable message.
2. **Missing channel token →** `KernelConfig::validate()`
   (`openfang-types/src/config.rs`) returns warnings like
   `"Telegram configured but TELEGRAM_BOT_TOKEN is not set"` rather than
   aborting boot. These appear under `config_warnings` at
   `GET /api/health/detail`.
3. **Unhealthy dependency (e.g. local DB) →** `GET /api/health` reports
   `"status": "degraded"`. Recoder must gate on this and **not** treat
   `degraded` as ready (truthful health, no faked success — per `AGENTS.md`).
4. **Unknown / forward-compat top-level keys →** tolerated (top-level
   `KernelConfig` is `#[serde(default)]` without `deny_unknown_fields`). The
   deliberate exception is `[[bindings]]`, which uses `deny_unknown_fields` so
   a routing typo fails loudly instead of silently matching everything.

### Production config

`crates/openfang.toml` is the Recoder-authored production config. It contains
**no secrets** — every key/token is referenced by environment-variable name
only (`*_env` fields) or injected via `OPENFANG_API_KEY` / `OPENFANG_LISTEN`.
Deploy it as `$OPENFANG_HOME/config.toml`:

```bash
cp crates/openfang.toml /data/config.toml     # OPENFANG_HOME=/data in the image
# or bind-mount read-only to /data/config.toml
```

Secret env vars are enumerated in `crates/openfang/.env.example`. Inject them
via docker-compose `environment:`, PM2 `env`, or the host shell — never commit
real values.

### Verify the config parses

```bash
python3 -c "import tomllib; tomllib.load(open('crates/openfang.toml','rb')); print('OK')"
```

A full `cargo check`/schema round-trip requires building openfang and is
intentionally deferred (disk/scope). The config keys were cross-checked by hand
against the `KernelConfig` struct in
`crates/openfang/crates/openfang-types/src/config.rs`
(`api_listen` ← `#[serde(alias = "listen_addr")]`, `default_model`, `memory`,
`network`, `exec_policy.mode = "allowlist"`, `budget`).
