# Recoder — Canonical Layered Architecture

> **The analogy:** Recoder is to VSCode what Cursor is to VSCode — a base substrate wrapped in
> owned layers. Here the base is **tmux + git worktrees + a versioned store**, and the owned layers
> are **engines → modules → edges → apps**. Every OSS directory is a first-class **engine used in
> place** (never copied into `packages/`); the host module fuses engines into domain **modules**;
> apps only consume edges. See **[RECODER-MODULES.md](./RECODER-MODULES.md)** for the per-module specs.

This doc is the canonical picture of the layers and the laws between them. It is deliberately
truthful about current depth — where a layer is shallow, it says so.

---

## The layer stack

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ APPS (surfaces / products — no capability logic)                                        │
│   apps/desktop (cockpit, embeds the backend) · apps/wave (durable shell)                │
│   apps/social (connectors runtime) · apps/agent-gateway · apps/agent-worker · mobile    │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ consume ONLY over edges (HTTP/WS/MCP/A2A) — never reach into a module directly
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ EDGES (the backend's public seams — untrusted until proven)                             │
│   /api/agent-os/*  /api/a2a/*  /api/mcp/*  /internal/agent-os/*  conductor.routes        │
│   MCP host (~30 in-proc engines) · A2A wire · connectors ingress · WS /terminal /sync    │
│   Contract packages (packages/*) are the typed shapes these edges speak.                 │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ expose  │  every write passes the governance gate first
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ MODULES (12 domain composers — backend/src/modules/<domain>/)                    │
│   memory · social · github · terminal · communication · inference                       │
│   agent-engine · governance · browsing · signals · networking · squads                  │
│   Each fuses its engine dirs behind ONE governed, health-truthful interface.            │
│   (Today only memory/ + github/ composers are started; the rest are still scattered.)   │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ fuse  │  in-process import (default) · subprocess (native/restart) · http (true edge)
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ENGINES (OSS dirs, used IN PLACE — per language)                                        │
│   crates/*  openfang · tensorzero · recoder-governance                                  │
│   py/*      mem0 · colbert · browser-use · ops-recorder · pal-mcp-server                 │
│   ts/*      dmux · recodergit · extracted-from-openclaw (connectors)                     │
│   go/*      beads · multica · ziti · recoder-xds                                         │
│   Imported (.node / dist), spawned (loopback sidecar), or driven by CLI — never copied.  │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ run on
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ L0 SUBSTRATE (the ground every agent session stands on)                                 │
│   modules/terminal/tmux (owned, pinned binary) + git worktrees (isolation) + PostgreSQL 17 / Dolt       │
│   (versioned state-of-record). Restart-survivable: sessions outlive a backend restart.  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**Dependency direction is strictly downward:** apps → edges → modules → engines → substrate.
A lower layer NEVER imports an upper layer. An engine never knows about a module; a module never
knows about an app. The state-of-record lives at L0/substrate and is owned by Recoder — runtimes,
sandboxes, and OSS engines are replaceable adapters around it, never owners of it.

---

## Engine → module map (ground truth)

Every capability engine dir, its owning module, its backend layer, the app(s) that surface it, how
the backend integrates it today, and the honest depth gap.

| Engine dir | Module | Layer | Surfaced by | Current integration (real, today) | Depth gap (honest) |
|---|---|---|---|---|---|
| `modules/terminal/tmux` | TERMINAL | substrate | desktop cockpit, wave | `conductor/tmux-path.ts` pins the vendored binary; `substrate-tmux.ts` + `tmux-orchestrator.ts` implement the default `tmux_worktree` substrate; `tmux-control-mode.ts` streams. Owned by vendoring + CLI-driving (never reimplemented). | Substrate half is real & deep; the dmux multiplexing half is shallow. Fold wave's separate Go durable-shell onto these same sessions. |
| `ts/dmux` | TERMINAL | engine | wave, desktop cockpit | `conductor/dmux-adapter.ts` spawns the vendored TUI bin over the SHARED tmux server; `conductor/dmux/{operator-grid,attention}.ts` lazy-load two subpath dists (`LayoutCalculator`, `paneAttentionHeuristics`). | Backend borrows only TWO pure functions + spawns the TUI; dmux's pane/streaming/worker engines are unused. |
| `modules/memory/beads` | MEMORY | engine | cockpit board, all agents (`recoder.beads` MCP) | `beads-bin.ts` resolves the owned `bd` (never builds); `beads-sql.ts` read fast-path via the Dolt sql-server `ready_issues` VIEW; `beads-engine.ts` is the MCP executor. Writes via CLI. | CLI + SQL-read only; the Dolt sql-server is not owned/supervised; recall logic duplicated across `beads-memory.ts`/`beads-sql.ts`/`bundle.ts`. |
| `modules/memory/mem0` | MEMORY | engine | cockpit (brain-stats) indirectly | **Live path is the OWNED `@recoder/mem0` TS package** (OSS Memory + platform client) over the platform Qdrant, via `mem0-client.ts`. `modules/memory/mem0`'s FastAPI server is only an optional `MEM0_BASE_URL` target that **nothing spawns**. | Two parallel mem0 impls (py lib + `@recoder/mem0`) = drift risk; the Python server is unsupervised and effectively unused. |
| `modules/memory/colbert` | MEMORY | engine | none directly (recall ranking) | `conductor/colbert-daemon.ts` supervises `rerank_server.py` as a loopback sidecar (`/health`, auto-restart, degrade-safe); `conductor/colbert-rerank.ts` is the per-call consumer. | Only the on-the-fly `rerank_server.py` is wired; `server.py` (real ANN index) + indexing/training are unused; torch usually absent → rerank is a no-op fallback. |
| `modules/inference/tensorzero` | INFERENCE | engine | desktop cockpit (`GatewayPanel`) | `tensorzero-client.ts` is native-first: loads `tensorzero_gateway_napi.node` → `EmbeddedGateway.boot().postInference` in-process; else supervises the loopback `gateway` binary (127.0.0.1:3778); else direct provider calls (never faked). `tensorzero-config.ts` = registry→TZ config. | No `stream()` binding yet; `feedback()` not wired to delivery outcomes; the conductor run loop still calls providers directly in places. |
| `modules/agent-engine/openfang` | AGENT-ENGINE | engine | desktop cockpit (`AgentsPanel`) | `conductor/openfang-native.ts` degrade-safe `.node` loader (~51 napi exports, in-process); `openfang-runtime.ts` is a `ConductorRuntime` driver; `/api/agents/openfang/*`. Crate is gitignored (upstream clone), not built by default. | Runtime driver is **not dispatchable** (`ConductorRuntimeId` is a closed union); Hands lifecycle + event-bus↔RunEvents bridge unwired; degrades to undefined when unbuilt. |
| `modules/governance/recoder-governance` | GOVERNANCE | engine | desktop cockpit (governance/audit nav) | Consumed via the `@recoder/governance` facade → napi kernel. Three-tier degrade ladder: napi in-process → UDS daemon (`governance-daemon.ts`) → pure-TS deny-biased fallback. `conductor/governance-gate.ts` `decideDelivery()` drives it on the delivery path. | `decide()` + Merkle audit on the delivery path are done; not yet the single gate EVERY module write flows through; richer policy crates (permission/approval/routing) unexercised via napi. |
| `modules/browsing/browser-use` | BROWSING | engine | cockpit (browser run evidence) | **NOT a py sidecar.** Live path is the owned `@recoder/agent-browser` over puppeteer (dynamic import) OR an HTTP `BROWSER_USE_URL` service; `browser-use-engine.ts` registers `browser.*` MCP tools behind the interop gate. | The real Python agent (Rust core, CDP, watchdogs, LLM loop) is unused; no supervised browser-use service; domain-allowlist + artifact capture unwired. |
| `modules/signals/ops-recorder` | SIGNALS | composer | cockpit (work-signals coordination) | `conductor/ops-recorder-daemon.ts` supervises `uvicorn main:app` (loopback :8073) with an auth preflight (won't spawn keyless); `ops-recorder-adapter.ts` forwards ingest/query. | Only ingest+query used; the service's own GH/Linear detectors are bypassed; local JSON store; **missing a LICENSE** (Recoder-authored). |
| `modules/communication/pal-mcp-server` | COMMUNICATION | composer | cockpit indirectly (MCP registry, LLM router) | **NOT a sidecar.** Live path is the owned `@recoder/pal`; `pal-plan-engine.ts` registers `recoder.pal-plan` in-proc behind the interop gate (additive, does not disturb the Python server). | Only the `pal.plan` slice is ported; multi-model orchestration, conversation threading, and the `clink` subagent bridge are stranded in the vendored Python. |
| `modules/github/recodergit` | GITHUB | engine | backend engine + MCP tools (agents in workspaces) | `agent-os/recodergit-service.ts` resolves the vendored engine dist (`.../recodergit/dist/cli/index.js`) + supervises `recodergit mcp --http`. Separate wrapper pkg `@recoder/recodergit` (packages/recodergit, **distinct** from the engine) via `git-context.ts`. | GitHub capability split across TWO engines (recodergit code-graph + `github-engine.ts` gh ops); PolyForm-Noncommercial **license gate**; `modules/github/recodergit` is NOT a root workspace member. |
| `modules/social/openclaw` | SOCIAL | engine | apps/social; `/api/connectors` edge | `@recoder/connectors` (registry + hostile-by-default gate + dispatch + pi-runner); `backend/src/connectors/` is the real ingress + gateway; 7 live per-channel `ConnectorPort` adapters (telegram/slack/signal/imessage/whatsapp/line/feishu). Root workspace member. | Backend owns no Social **module** yet (connectors is a lib, apps/social is a separate process); the discord adapter is not truly extracted (still bot-core-coupled, 172 type errors). |
| `modules/squads/multica` | SQUADS | engine | desktop cockpit board (target) | `multica-client.ts` supervises a degrade-safe loopback subprocess (127.0.0.1:38080, never builds); `routes/multica.routes.ts` (503 when absent); `a2a/squad.service.ts` is the LOCAL authoritative squad state (multica is optional enrichment). | Deep target is a PORT of its distinctive ideas (squads = leader-routing; autopilots = cron→beads→run) into the conductor — NOT deeper subprocess wiring. |
| `modules/networking/ziti` | NETWORKING | engine | none (cloud tier; diagnostics) | `ziti-client.ts` is a degrade-safe REST client to an **external** Ziti controller (identity provisioning + OTT enrollment JWTs); `routes/ziti.routes.ts`. Vendored Go source not built/supervised. | Only the controller REST identity surface is used; no mesh / dark-service data plane; deferred to the cloud/teams tier. |
| `modules/networking/recoder-xds` | NETWORKING | engine | none (cloud tier; diagnostics) | First-party Go xDS control plane (gRPC ADS on :18000). **NOT wired as a live client yet** — only `fleet/manifest.ts` registers it as a supervisable sidecar. The TS side generates the STATIC Envoy bootstrap (`/api/network/envoy-config`). | Nothing pushes the live `NetworkConfig` into its snapshot cache (no live LDS/CDS/RDS in prod); deferred to the cloud/teams tier. |

**Contract & host layers (for completeness):**

| Dir | Role | Layer |
|---|---|---|
| `backend` | **HOST** — the Express + express-ws control plane that composes every module (conductor + agent-os + MCP host). Owns `src/modules/memory` + `src/modules/github` today. | composer |
| `packages/*` (agent-os, a2a-sdk, agent-mcp, agent-policy, governance, pal, coordination, network, substrate, brain, retrieval, interop, runtime, conductor-ui, agent-events/instructions/memory/runtimes/workflows) | First-party **contract** packages — domain types + pure decision helpers + engine ports. Thin by design; depth lives in the host composers. | edge |
| `apps/*` (desktop, wave, social, agent-gateway, agent-worker, mobile) | **Surfaces.** Consume the backend over its edges. No capability logic. | surface |

---

## Per-layer contracts (what each layer may and may not do)

### L0 — Substrate
- **May:** hold sessions (tmux), isolation (git worktrees), and versioned state-of-record (PostgreSQL 17 / Dolt).
- **Must:** survive a backend restart. The conductor persists the record-of-record BEFORE launch; the reconciler re-attaches sessions on boot.
- **Must not:** contain domain logic. It is inert ground the engines run on.
- Owned by vendoring + pinning + CLI-driving (tmux), never by reimplementation. (The node-pty session-mux attempt was reverted for exactly this reason.)

### Engines
- **May:** be imported (`.node`/dist), spawned as a supervised loopback sidecar, or driven by CLI — **used in place, from their own dir.**
- **Must:** degrade safely and truthfully — when an engine's binary/venv/`.node` is absent, the caller reports it down and falls back; it never fakes success.
- **Must not:** be copied into `packages/`. Deepen the engine in its own dir when fusion needs it (that dir is ours; e.g. the dmux clean-exports edit).
- Each engine is a single capability; it does not know which module composes it.

### Modules
- **May:** fuse several engine dirs into ONE domain capability under `backend/src/modules/<domain>/`.
- **Must:** expose the full verb set of the domain, report per-engine health honestly, route writes through the governance gate, and **move** the scattered consumer code behind the interface (not add a 4th copy).
- **Must not:** re-implement an engine, or leak a raw engine dist to callers. Callers depend on the module, never on `mem0-client`/`beads-sql`/etc. directly.
- Today only `memory/` and `github/` composers are started; the other ten capabilities exist but are SCATTERED across `src/` — consolidation behind one composer per domain is the open work.

### Edges
- **May:** expose modules over HTTP (`/api/*`, `/internal/agent-os/*`), the MCP host (~30 in-proc engines), the A2A wire, WS (`/terminal`, `/sync`), and connector ingress.
- **Must:** treat everything inbound as untrusted until proven — signature/identity/ownership/policy at the edge (the `authorize→risk→policy→audit` chain in `@recoder/interop`). `/internal/*` is `INTERNAL_SERVICE_KEY`-gated.
- **Must not:** be the source of truth for task/approval/memory/artifact state — that stays in the Agent OS domain core (`@recoder/agent-os`) at the substrate.

### Apps
- **May:** render control-plane state (agents, tasks, runs, approvals, artifacts, memory candidates, policy waits, verification, PRs) and drive user intent.
- **Must:** consume the backend only over its edges; keep the cockpit **plain as a terminal** (no infra dashboards, per AGENTS.md).
- **Must not:** hold capability logic or own state. `apps/agent-gateway` + `apps/agent-worker` are extracted edges of the backend, not independent owners.

---

## The fusion law (how a module talks to its engines)

Choose the cheapest binding that preserves truth and survivability, in this order:

1. **In-process import (default).** If the engine ships a dist/`.node` and runs safely in-process, import it (e.g. `@recoder/mem0`, `EmbeddedGateway.postInference`, the governance napi kernel, dmux's two pure functions). No network hop, no extra process to supervise.
2. **Supervised subprocess (for native/restart-survival/isolation).** If the engine is a long-running server, a foreign runtime, or must outlive a request, spawn it as an **app-owned loopback sidecar** with a health probe + capped-backoff restart + degrade-safe fallback (tmux sessions, colbert `rerank_server.py`, ops-recorder uvicorn, tensorzero loopback gateway, multica).
3. **HTTP only at true edges.** Cross-trust-boundary or genuinely-remote traffic uses HTTP with the full untrusted-until-proven gate (A2A envelopes, connector webhooks, an external Ziti controller, an optional external `MEM0_BASE_URL`/`BROWSER_USE_URL`).

Native-first, subprocess-second, http-last. Every path degrades to a truthful `down` — never a faked `200`.

---

## Cross-cutting invariants (hold at every layer)

- **Governance gate on every write.** Every conductor mutation (create/merge/archive/memory-promote) and every MCP tool call flows through `decide() → risk → audit`. The Merkle audit chain (`modules/governance/recoder-governance` napi, byte-interoperable with `packages/governance/src/audit/merkle-verifier.ts`) seals it; fails safe to DENY/needs-approval when the native kernel is down.
- **Truthful health.** Every engine reports `up | down`; every module reports per-engine status; degraded paths are labelled `degraded: true`. Never imply readiness without evidence (`CLAUDE.md`, `.claude/rules/production.md`).
- **Recoder owns the state-of-record.** Tasks, runs, approvals, artifacts, memory candidates, instructions, and provenance live in Recoder-owned contracts (`@recoder/agent-os`). Runtimes (Claude Code, Codex, opencode, pi), sandboxes (Daytona, E2B), and OSS engines emit `RunEvent` records back to Recoder — they never become the owner of that state.
- **Durable memory is reviewable.** Nothing writes durable memory silently; `remember()` produces an evidence-backed candidate, `promote()` is the gated durable transition (`packages/agent-memory`).
- **Hostile-by-default edges.** Empty allowlists authorize nobody; ext_authz is fail-closed; MCP tool descriptions and connector messages are untrusted until identity + policy prove otherwise.

---

## Where this is honestly shallow today

- **Modules are mostly not built yet.** Only `memory/` + `github/` composers are started; the other ten domains are scattered across `backend/src/`. The build order (MEMORY → GITHUB → TERMINAL → INFERENCE → COMMUNICATION → AGENT-ENGINE → SOCIAL) is in RECODER-MODULES.md.
- **Several "engines" are only reachable as optional env-contract HTTP seams** that nothing spawns: `modules/memory/mem0` (`MEM0_BASE_URL`), `modules/browsing/browser-use` (`BROWSER_USE_URL`). Their real depth is unused; the live paths are the owned TS packages.
- **AGENT-ENGINE + NETWORKING are registered but not dispatchable/live:** openfang's runtime driver can't be resolved (closed union); recoder-xds gets no live config push. Both are wired as future capabilities.
- **Two GitHub engines, two terminal restart mechanisms, five memory recall copies** — the consolidation work is exactly moving these behind one composer per domain.

Keep this doc and RECODER-MODULES.md truthful. When a layer deepens, update the depth-gap column and the "honestly shallow" section — do not claim done without evidence.
