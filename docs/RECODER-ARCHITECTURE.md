# Recoder — Canonical Layered Architecture

> **Private-beta precedence (2026-08-15):** this file remains the canonical layered
> engine/module map. Product scope and claim-level status now come from
> [RECODER-FULL-PRODUCT-SPEC.md](./RECODER-FULL-PRODUCT-SPEC.md); process, transport,
> state, and trust boundaries come from
> [RECODER-CONNECTION-ARCHITECTURE.md](./RECODER-CONNECTION-ARCHITECTURE.md); active
> sequencing comes from [RECODER-PRIVATE-BETA-PLAN.md](./RECODER-PRIVATE-BETA-PLAN.md).
> Where historical prose below says "fully realized" or "verified," apply the status
> vocabulary and acceptance evidence in those documents instead of treating it as a
> release-readiness claim.

> **The analogy:** Recoder is to VSCode what Cursor is to VSCode — a base substrate wrapped in
> owned layers. Here the base is **tmux + git worktrees + a versioned store**, and the owned layers
> are **engines → modules → edges → apps**. Every OSS directory is a first-class **engine used in
> place** (never copied into `packages/`); the host module fuses engines into domain **modules**;
> apps only consume edges. See **[RECODER-MODULES.md](./RECODER-MODULES.md)** for the per-module specs.

This doc is the canonical picture of the layers and the laws between them. It is deliberately
truthful about current depth — where a layer is shallow, it says so.

> **Doc hierarchy (2026-07-15):** this file = the SYSTEM-level layer view. The **backend is now
> BUILT** — the canonical design + file plan + live status live under
> **[RECODER-BACKEND/](./RECODER-BACKEND/)** (start at `ARCHITECTURE.md`). The **product + frontend
> design** (clean conductor.build UX, zero-config onboarding, engines-invisible) is
> **[RECODER-PRODUCT-DESIGN.md](./RECODER-PRODUCT-DESIGN.md)**.
> `RECODER-MODULES.md` + `docs/modules/*` = the per-engine specs.

> **Current reality (2026-07-31) — the layer stack is FULLY REALIZED and VERIFIED:**
> - **One project:** `apps/` = **desktop only** (wave shell — the `recoder-*` views — + the embedded backend;
>   `apps/social` folded into the backend's social domain; wave + mobile folded/removed; Preact cockpit SPA deleted).
> - **Backend BUILT + BOOTS + HARDENED:** the old v1 `server.ts` monolith was replaced by a 15-domain
>   composed backend (`backend/src/{shared,bootstrap,http,domains}` — the legacy flat dirs
>   `a2a/agent-os/conductor/…` were absorbed + removed; **0 tsc errors, 3,076 backend tests**).
>   All 15 domains boot with truthful health sources. Multi-tenant IDOR sweep complete across all 8 original domains plus
>   interop + edge (A2A ed25519 signer-key binding, `/internal/persistence` self-gates). Domains: persistence · identity · governance ·
>   interop · edge · agent-os · conductor · engines · inference · billing · memory · cloud ·
>   interop-wire · social · observability.
> - **Engines deepened IN their dirs + USED:** the supervisor spawns the OSS engines on boot
>   (mem0/colbert/browser-use/ops-recorder live sidecars; openfang/tensorzero/governance in-proc
>   napi; beads/multica/recoder-xds go binaries) and the domain services consume them. The
>   conductor run flow uses memory recall/harvest, tensorzero inference, governance, recodergit +
>   beads to power the workspace-for-agents product (external CLI + native openfang runtimes).
> - **Inference ladder is live:** the TensorZero release `.node` streams REAL in-process SSE
>   (`inferenceStream` napi binding) → supervised loopback → direct BYOK rung-3 multi-provider
>   router (keys resolved from the governance secrets vault); OpenAI-compatible
>   `/api/gateway/inference/v1/embeddings` edge + `inference.embed` MCP tool.
> - **The governed MCP HTTP edge is LIVE:** `POST /api/mcp/tools/:server/:tool/call` (was 404).
>   Every subject-bearing MCP tool binds identity to the host-authorized `McpToolCaller` (the
>   cross-tenant class is closed — non-privileged → own subject, foreign → 403, admin/internal →
>   arbitrary, absent → `AUTH_REQUIRED`).
> - **Billing is merchant-of-record (Polar/Creem/Paddle/Dodo ONLY — no Stripe):** metering emitters
>   decrement quotas at the conductor + inference call sites; past-due subscriptions get a 7-day
>   dunning grace period (`withinDunningGrace`, `DUNNING_GRACE_DAYS`); overage UpgradeHint CTA routes users to upgrade.
> - **Identity platform-hardened:** org auto-provisioning + principal.orgId now land (OrgProvisioningService, per-owner default org, idempotent);
>   web-session orgId + user/users reconciliation remain owner-gated.
> - **Desktop onboarding improved:** agent-auth probe + git-init affordance + mid-run needs-input notification + first-run agent-install.
> - **Website signin hardened:** main-site signin is OAuth-only (email/password disabled, matches signup); Creem legal/contact/pricing ready.
> - **SUITE HEALTH (2026-07-31):** backend tsc 0 / 3,076 tests ✓ · website tsc 0 / 436 tests ✓ · desktop tsc 0 / 471 tests ✓

---

## The layer stack

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ APPS (surfaces / products — no capability logic)                                        │
│   apps/desktop = THE product (wave shell — recoder-* views — + embedded backend + desktop engines) │
│   (apps/social folded into the backend social domain; wave + mobile folded/removed)      │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ consume ONLY over edges (HTTP/WS/MCP/A2A) — never reach into a module directly
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ EDGES (the backend's public seams — untrusted until proven, self-gated)                   │
│   /api/agent-os/*  /api/a2a/*  /api/mcp/*  /api/social/*  /internal/*  conductor.routes    │
│   MCP host (14 in-proc servers +agent-os/memory) + governed MCP HTTP tool-call edge ·     │
│   A2A wire (ed25519 signer-key bound, HMAC-only rejected for external ingress) · social    │
│   ingress · WS /terminal + per-workspace /stream. Contract packages (packages/*).           │
│   CRITICAL: PUBLIC_MOUNT default override in bootstrap; routers self-gate (not convention).│
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ expose  │  every write passes the governance gate first
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ DOMAINS (15 composed modules — BUILT + wired: backend/src/domains/<domain>/)             │
│   persistence · identity · governance · interop · edge · agent-os · conductor            │
│   engines · inference · billing · memory · cloud · interop-wire · social · observability │
│   Each fuses its engine dirs behind ONE governed, health-truthful composer.              │
│   (All 15 started + booting; the engine-supervisor spawns the OSS engines on boot.)      │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ fuse  │  in-process import (default) · subprocess (native/restart) · http (true edge)
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ENGINES (OSS dirs, used IN PLACE — grouped under their host)                             │
│   backend/engines/rust/*         openfang · tensorzero · recoder-governance              │
│   backend/engines/py/*           mem0 · colbert · browser-use · ops-recorder · pal-mcp    │
│   apps/desktop/engines/*         dmux · recodergit · openclaw (connectors) · tmux         │
│   apps/desktop/server/engines/*  beads · multica · ziti · recoder-xds                     │
│   Imported (.node / dist), spawned (loopback sidecar), or driven by CLI — never copied.  │
│   (Preact cockpit SPA deleted 2026-07-31 — desktop now ONLY Wave recoder-* views.)       │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ run on
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ L0 SUBSTRATE (the ground every agent session stands on)                                 │
│   apps/desktop/engines/tmux (owned, pinned binary) + git worktrees (isolation) + PostgreSQL 17 / Dolt       │
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
| `apps/desktop/engines/tmux` | TERMINAL | substrate | desktop (wave shell — recoder-* views) | `conductor/tmux-path.ts` pins the vendored binary; `substrate-tmux.ts` + `tmux-orchestrator.ts` implement the default `tmux_worktree` substrate; `tmux-control-mode.ts` streams. Owned by vendoring + CLI-driving (never reimplemented). | Substrate half is real & deep; the dmux multiplexing half is shallow. Fold the desktop's separate Go durable-shell (`apps/desktop/server`) onto these same sessions. |
| `apps/desktop/engines/dmux` | TERMINAL | engine | desktop (wave shell — recoder-* views) | `conductor/dmux-adapter.ts` spawns the vendored TUI bin over the SHARED tmux server; `conductor/dmux/{operator-grid,attention}.ts` lazy-load two subpath dists (`LayoutCalculator`, `paneAttentionHeuristics`). | Backend borrows only TWO pure functions + spawns the TUI; dmux's pane/streaming/worker engines are unused. |
| `apps/desktop/server/engines/beads` | MEMORY | engine | desktop board, all agents (`recoder.beads` MCP) | `beads-bin.ts` resolves the owned `bd` (never builds); `beads-sql.ts` read fast-path via the Dolt sql-server `ready_issues` VIEW; `beads-engine.ts` is the MCP executor. Writes via CLI. | CLI + SQL-read only; the Dolt sql-server is not owned/supervised; recall logic duplicated across `beads-memory.ts`/`beads-sql.ts`/`bundle.ts`. |
| `backend/engines/py/mem0` | MEMORY | engine | desktop (recall provenance) indirectly | **Live path is the OWNED `@recoder/mem0` TS package** (OSS Memory + platform client) over the platform Qdrant. The Python FastAPI server is now a **supervised sidecar** (`Mem0Adapter` in the ENGINES domain, health `up` only when the uv venv answers) reachable via `MEM0_BASE_URL`. | Two parallel mem0 impls (py lib + `@recoder/mem0`) = drift risk; the two paths are not yet consolidated behind one recall interface. |
| `backend/engines/py/colbert` | MEMORY | engine | none directly (recall ranking) | `conductor/colbert-daemon.ts` supervises `rerank_server.py` as a loopback sidecar (`/health`, auto-restart, degrade-safe); `conductor/colbert-rerank.ts` is the per-call consumer. | Only the on-the-fly `rerank_server.py` is wired; `server.py` (real ANN index) + indexing/training are unused; torch usually absent → rerank is a no-op fallback. |
| `backend/engines/rust/tensorzero` | INFERENCE | engine | desktop (recoder-* views, invisible) | Native-first ladder in the INFERENCE domain: loads the release `tensorzero_gateway_napi.node` → `EmbeddedGateway.postInference` in-process **with REAL in-proc SSE via the `inferenceStream` napi binding** → supervised loopback `gateway` (127.0.0.1:3778) → **direct BYOK rung-3 multi-provider router** (keys resolved from the governance secrets vault; never faked). OpenAI-compatible `/api/gateway/inference/v1/embeddings` edge + `inference.embed` MCP tool. | `feedback()` not yet wired to delivery outcomes; parts of the conductor run loop still call providers directly rather than through the ladder. |
| `backend/engines/rust/openfang` | AGENT-ENGINE | engine | desktop (recoder-* views, invisible) | `openfang-native.ts` degrade-safe `.node` loader (~51 napi exports, in-process); `openfang-runtime.ts` is an in-process `ConductorRuntime` driver, now **dispatchable** via `IN_PROCESS_RUNTIME_SPECS` (runtime-commands.ts) so a launcher can route `openfang` to it directly; `/api/agents/openfang/*`. Crate is vendored in-tree (upstream clone), not built by default. | Dispatch is via the in-process spec path, NOT the package's closed `ConductorRuntimeId` CLI union; Hands lifecycle + event-bus↔RunEvents bridge unwired; degrades to undefined when unbuilt. |
| `backend/engines/rust/recoder-governance` | GOVERNANCE | engine | desktop (inline approvals + evidence) | Consumed via the `@recoder/governance` facade → napi kernel. Three-tier degrade ladder: napi in-process → UDS daemon (`governance-daemon.ts`) → pure-TS deny-biased fallback. `domains/governance/services/governance-gate.service.ts` `decide()` drives it on the delivery path. | `decide()` + Merkle audit on the delivery path are done; not yet the single gate EVERY module write flows through; richer policy crates (permission/approval/routing) unexercised via napi. |
| `backend/engines/py/browser-use` | BROWSING | engine | desktop (browser run evidence) | Live path is the owned `@recoder/agent-browser` over puppeteer (dynamic import); the Python agent is now a **supervised sidecar** (`BrowserUseAdapter` in the ENGINES domain, health `up` only when the uv venv answers) reachable via `BROWSER_USE_URL`; `browser-use-engine.ts` registers `browser.*` MCP tools behind the interop gate. | The Python agent's deep loop (Rust core, CDP, watchdogs, LLM loop) is only reached over the sidecar seam; domain-allowlist + artifact capture unwired. |
| `backend/engines/py/ops-recorder` | SIGNALS | composer | desktop (work-signals coordination) | `conductor/ops-recorder-daemon.ts` supervises `uvicorn main:app` (loopback :8073) with an auth preflight (won't spawn keyless); `ops-recorder-adapter.ts` forwards ingest/query. | Only ingest+query used; the service's own GH/Linear detectors are bypassed; local JSON store. (LICENSE added — MIT, Recoder-authored.) |
| `backend/engines/py/pal-mcp-server` | COMMUNICATION | composer | desktop indirectly (MCP registry, LLM router) | **NOT a sidecar.** Live path is the owned `@recoder/pal`; `pal-plan-engine.ts` registers `recoder.pal-plan` in-proc behind the interop gate (additive, does not disturb the Python server). | Only the `pal.plan` slice is ported; multi-model orchestration, conversation threading, and the `clink` subagent bridge are stranded in the vendored Python. |
| `apps/desktop/engines/recodergit` | GITHUB | engine | backend engine + MCP tools (agents in workspaces) | `agent-os/recodergit-service.ts` resolves the vendored engine dist (`.../recodergit/dist/cli/index.js`) + supervises `recodergit mcp --http`. Separate wrapper pkg `@recoder/recodergit` (packages/recodergit, **distinct** from the engine) via `git-context.ts`. | GitHub capability split across TWO engines (recodergit code-graph + `github-engine.ts` gh ops); PolyForm-Noncommercial **license gate**; `apps/desktop/engines/recodergit` is NOT a root workspace member. |
| `apps/desktop/engines/openclaw` | SOCIAL | engine | embedded backend `/api/social` edge (desktop hosts it) | `@recoder/connectors` (registry + hostile-by-default gate + dispatch + pi-runner) = the 8-channel foundation; the SOCIAL domain (`backend/src/domains/social/`) is the real ingress + gateway (webhook + interop signed gate + conductor dispatch), mounted at `/api/social` (`/api/social/webhooks/*`, `/channels`, `/connectors`, `/health`) and spawned INSIDE the desktop. 8 `ConnectorPort` adapters (telegram/slack/discord/signal/imessage/whatsapp/line/feishu). Root workspace member. | `apps/social` (the redundant standalone deploy) is now folded into the embedded backend's social domain. Discord WS source unwired; LINE/Slack webhooks need a public URL from `127.0.0.1`; discord still bot-core-coupled. |
| `apps/desktop/server/engines/multica` | SQUADS | engine | desktop board (target) | `multica-client.ts` supervises a degrade-safe loopback subprocess (127.0.0.1:38080, never builds); `routes/multica.routes.ts` (503 when absent); `a2a/squad.service.ts` is the LOCAL authoritative squad state (multica is optional enrichment). | Deep target is a PORT of its distinctive ideas (squads = leader-routing; autopilots = cron→beads→run) into the conductor — NOT deeper subprocess wiring. |
| `apps/desktop/server/engines/ziti` | NETWORKING | engine | none (cloud tier; diagnostics) | `ziti-client.ts` is a degrade-safe REST client to an **external** Ziti controller (identity provisioning + OTT enrollment JWTs); `routes/ziti.routes.ts`. Vendored Go source not built/supervised. | Only the controller REST identity surface is used; no mesh / dark-service data plane; deferred to the cloud/teams tier. |
| `apps/desktop/server/engines/recoder-xds` | NETWORKING | engine | none (cloud tier; diagnostics) | First-party Go xDS control plane (gRPC ADS on :18000). **NOT wired as a live client yet** — only `fleet/manifest.ts` registers it as a supervisable sidecar. The TS side generates the STATIC Envoy bootstrap (`/api/network/envoy-config`). | Nothing pushes the live `NetworkConfig` into its snapshot cache (no live LDS/CDS/RDS in prod); deferred to the cloud/teams tier. |
| `apps/desktop/engines/cloudroom` | AGENT-ENGINE | engine | none (cloud tier; not yet surfaced) | Vendored upstream Cloudroom core binary (davidondrej/cloudroom-core, Apache-2.0, built from source — see `RECODER-VENDOR.md`). Fills a real gap vs. the existing Daytona/E2B sandbox path (`telos/upstream/resandbox`): those are stateless fresh sandboxes, Cloudroom's distinct capability is moving a running agent session from local to a cloud-hosted instance **mid-task** without losing context. | Binary vendored and builds; **no client/adapter wired at all yet** — no RunEvent bridge, no MCP tool, not registered with any supervisor. The governed cloud-domain write seam (`cloud-module.ts`) was intentionally left untouched pending its own task spec/approval gate. Deferred to the cloud/teams tier. |

**Contract & host layers (for completeness):**

| Dir | Role | Layer |
|---|---|---|
| `backend` | **HOST** — the ONE Node/Express + express-ws control plane (`recoder-backend`) that composes every module (conductor + agent-os + MCP host + connectors + gateway). Desktop embeds and supervises it as a child; the website consumes the same binary's edges. Capabilities are now composed as **15 domain modules under `backend/src/domains/*`** (agent-os, billing, cloud, conductor, edge, engines, governance, identity, inference, interop, interop-wire, memory, observability, persistence, social) wired by `src/bootstrap/`; all 15 boot and `tsc --noEmit` is clean. | composer |
| `packages/*` (agent-os, a2a-sdk, agent-mcp, agent-policy, governance, pal, coordination, network, substrate, brain, retrieval, interop, runtime, conductor-ui, agent-events/instructions/memory/runtimes/workflows) | First-party **contract** packages — domain types + pure decision helpers + engine ports. Thin by design; depth lives in the host composers. | edge |
| `apps/*` (desktop) | **Surfaces.** Consume the backend over its edges. No capability logic. (Wave was folded INTO `apps/desktop`; `apps/social` was folded into the backend social domain; agent-gateway/agent-worker/mobile were deleted.) | surface |

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
- **May:** fuse several engine dirs into ONE domain capability under `backend/src/domains/<domain>/`.
- **Must:** expose the full verb set of the domain, report per-engine health honestly, route writes through the governance gate, and **move** the scattered consumer code behind the interface (not add a 4th copy).
- **Must not:** re-implement an engine, or leak a raw engine dist to callers. Callers depend on the module, never on `mem0-client`/`beads-sql`/etc. directly.
- Composers are now shipped: 15 domain modules under `backend/src/domains/*` boot via `src/bootstrap/` (tsc clean). The remaining work is deepening each domain and folding the last scattered `src/conductor`/`src/agent-os` consumers behind its interface.

### Edges
- **May:** expose modules over HTTP (`/api/*`, `/internal/*`), the MCP host (14 `IN_PROC_SERVERS` + the `agent-os`/`memory` domain-tool servers registered via `registerDomainTools` at bootstrap) **and the governed MCP HTTP tool-call edge `POST /api/mcp/tools/:server/:tool/call`** (was 404; now live, every subject-bearing tool bound to the host-authorized `McpToolCaller`), the A2A wire, WS (`/terminal`, per-workspace `/api/conductor/workspaces/:id/stream`), and social/connector ingress (`/api/social`).
- **Must:** treat everything inbound as untrusted until proven — signature/identity/ownership/policy at the edge (the `authorize→risk→policy→audit` chain in `@recoder/interop`). `/internal/*` is `INTERNAL_SERVICE_KEY`-gated.
- **Must not:** be the source of truth for task/approval/memory/artifact state — that stays in the Agent OS domain core (`@recoder/agent-os`) at the substrate.

### Apps
- **May:** render control-plane state (agents, tasks, runs, approvals, artifacts, memory candidates, policy waits, verification, PRs) and drive user intent.
- **Must:** consume the backend only over its edges; keep the desktop frontend **plain as a terminal** (no infra dashboards, per AGENTS.md).
- **Must not:** hold capability logic or own state. (The old `apps/agent-gateway` + `apps/agent-worker` standalone services were deleted — the backend owns those edges directly.)

---

## The fusion law (how a module talks to its engines)

Choose the cheapest binding that preserves truth and survivability, in this order:

1. **In-process import (default).** If the engine ships a dist/`.node` and runs safely in-process, import it (e.g. `@recoder/mem0`, `EmbeddedGateway.postInference`, the governance napi kernel, dmux's two pure functions). No network hop, no extra process to supervise.
2. **Supervised subprocess (for native/restart-survival/isolation).** If the engine is a long-running server, a foreign runtime, or must outlive a request, spawn it as an **app-owned loopback sidecar** with a health probe + capped-backoff restart + degrade-safe fallback (tmux sessions, colbert `rerank_server.py`, ops-recorder uvicorn, tensorzero loopback gateway, multica).
3. **HTTP only at true edges.** Cross-trust-boundary or genuinely-remote traffic uses HTTP with the full untrusted-until-proven gate (A2A envelopes, connector webhooks, an external Ziti controller, an optional external `MEM0_BASE_URL`/`BROWSER_USE_URL`).

Native-first, subprocess-second, http-last. Every path degrades to a truthful `down` — never a faked `200`.

---

## Cross-cutting invariants (hold at every layer)

- **Governance gate on every write.** Every conductor mutation (create/merge/archive/memory-promote) and every MCP tool call flows through `decide() → risk → audit`. The Merkle audit chain (`backend/engines/rust/recoder-governance` napi, byte-interoperable with `packages/governance/src/audit/merkle-verifier.ts`) seals it; fails safe to DENY/needs-approval when the native kernel is down.
- **Truthful health.** Every engine reports `up | down`; every module reports per-engine status; degraded paths are labelled `degraded: true`. Never imply readiness without evidence (`CLAUDE.md`, `.claude/rules/production.md`).
- **Recoder owns the state-of-record.** Tasks, runs, approvals, artifacts, memory candidates, instructions, and provenance live in Recoder-owned contracts (`@recoder/agent-os`). Runtimes (Claude Code, Codex, opencode, pi), sandboxes (Daytona, E2B), and OSS engines emit `RunEvent` records back to Recoder — they never become the owner of that state.
- **Durable memory is reviewable.** Nothing writes durable memory silently; `remember()` produces an evidence-backed candidate, `promote()` is the gated durable transition (`packages/agent-memory`).
- **Hostile-by-default edges.** Empty allowlists authorize nobody; ext_authz is fail-closed; MCP tool descriptions and connector messages are untrusted until identity + policy prove otherwise.

---

## Where this is honestly shallow today

Post dark-engines sweep (2026-08-04): each shallow engine either got one product verb in the converge loop or is explicitly PARKED with the reason. WIRED vs PARKED below is the current truth.

- **Modules are shipped but shallow.** 15 domain composers under `backend/src/domains/*` boot (tsc clean); the depth per domain and folding the remaining scattered `src/conductor`/`src/agent-os` consumers behind each interface is the open work. The build order is in RECODER-MODULES.md.
- **WIRED — recall rerank is now degrade-truthful (was: silent identity when torch absent).** When the ColBERT sidecar is down, recall fusion ranks with a pure-TS BM25-ish lexical fallback (`reranker: 'lexical'`, `src/domains/memory/recall/rank.ts`) instead of pretending source order was ranked, and the degrade reason flows to the conductor brain's enrichment provenance as a `recall-rerank` / `degraded:<reranker>: <reason>` ref in `BrainEnrichResult.sources` (`brain-memory.adapter.ts`) and out of the `memory_recall` MCP tool as `rerankerReason`. Absent-torch installs get better-than-insertion-order recall AND an auditable marker.
- **PARKED — the Python sidecar deep loops:** `backend/engines/py/mem0` (`MEM0_BASE_URL`) and `backend/engines/py/browser-use` (`BROWSER_USE_URL`) stay health-probed supervision shells because the owned TS packages (`@recoder/mem0` OSS mode over Qdrant, `@recoder/agent-browser` over puppeteer) already serve the live recall/browse paths — no converge-loop verb needs the sidecar loops today, so wiring them would add a process without adding capability.
- **PARKED — openfang Hands lifecycle:** openfang is dispatchable in-process via `IN_PROCESS_RUNTIME_SPECS` (`openfang-runtime.ts`), but the Hands lifecycle stays unwired because the napi `runAgent` call is synchronous/blocking on the Node event loop and `ConductorRuntimeId` is a closed subprocess-CLI union — a converge-loop verb would need an async seam first.
- **PARKED — NETWORKING registered but not live:** recoder-xds gets no live config push; still a partial capability.
- **Two GitHub engines, two terminal restart mechanisms, several memory recall copies** — the consolidation work is exactly moving these behind one composer per domain.

---

## Recent completions & owner-gated work (2026-07-31)

**COMPLETED this epoch:**
- Multi-tenant IDOR sweep across all 10 domains (persistence, identity, governance, interop, edge, agent-os, conductor, engines, inference, billing, memory, cloud, interop-wire, social, observability). Follow-on residual (bd recoder-xiqj) now **fixed**: governance approval-clearance binds to the requesting principal.
- A2A ed25519 cryptographic signer-key binding; external ingress refuses HMAC-only untrusted requests (401 `external_ingress_requires_ed25519`); trusted/loopback keep HMAC.
- Conductor diff review comments now route back into agent loop (state-routed, #35); merge-readiness surface shows worktree open work + PR metadata.
- Billing dunning grace (7-day) + overage UpgradeHint for MoR providers (Polar/Creem/Paddle/Dodo only).
- Desktop onboarding: agent-auth probe, git-init affordance, mid-run needs-input, first-run agent-install.
- Website main-site OAuth-only signin (email/password disabled), Creem legal/pricing/contact.
- Suite health fully green: backend 3,076 tests ✓ · website 436 tests ✓ · desktop 471 tests ✓

**OWNER-GATED (NOT done — never mark complete without owner sign-off):**
- Production deploy, canonical trunk (`origin/main`), CI (workflows disabled — user has no GitHub premium).
- Web-session orgId + user/users model reconciliation (identity Phase A, depends on auth config sync).
- Billing-provider unification (#4, MoR convergence across platforms).
- Secret rotation + free-tier policy (runtime defaults).

Keep this doc and RECODER-MODULES.md truthful. When a layer deepens, update the depth-gap column and the "honestly shallow" section — do not claim done without evidence.
