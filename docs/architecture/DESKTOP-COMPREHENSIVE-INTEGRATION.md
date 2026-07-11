# Comprehensive Recoder Desktop — Integration Architecture

Author: Chief Architect pass · Repo: `/Users/arhansubasi/recoder.xyz` · Target: `apps/desktop`
Status: architecture proposal for owner review → implementation plans

Verified against real code: `apps/desktop/{package.json,main.js (3356 lines),preload.js (326 lines),backend-supervisor.js (872 lines)}`, `apps/desktop/cockpit/src/components/*`, `docker-backend/src/server.ts` route mounts, `crates/{README.md,openfang.toml,recoder-governance/,tensorzero/,lance/}`, `ts/{recodergit,dmux}`, `packages/{brain,continuum,conductor-ui}`, `py/{pal-mcp-server,browser-use,mem0}`, `go/{beads,multica}`. One inventory citation (`packages/recoder-analytics`) did not resolve on disk and is flagged as unverified below.

---

## 1. Executive Summary

### What "comprehensive desktop" means
Today the desktop is a thin Electron shell (`main.js` + `backend-supervisor.js`) that boots one embedded `docker-backend` on a free loopback port, mints a local `sk_` key, and renders a Preact **cockpit** that drives the conductor (tmux worktrees). That is real and working (`backend-supervisor.js` `resolveTmuxBin`, `pickFreePortWithRetry`, health-gated `getAuth()`). But of the ~30 subsystems across `c/ crates/ go/ py/ ts/ packages/`, only **tmux, node-pty, docker-backend, A2A bridge, and the cockpit** are surfaced. "Comprehensive" means the desktop becomes the **operator console for the whole Agent OS** — surfacing code intelligence, memory, retrieval, an LLM gateway, browser automation, zero-trust networking, issue graph, autonomous agents, governance/audit, and MCP tools — as first-class cockpit surfaces with truthful health.

### The philosophy: thin shell + rich cockpit over ONE aggregation hub
Two candidate models:

- **(A) Desktop-spawns-everything** — `backend-supervisor.js` directly launches openfang, TensorZero, PAL, browser-use, mem0, colbert, governance daemon, Multica, etc., and the cockpit talks to each.
- **(B) Single aggregation hub (RECOMMENDED)** — the embedded `docker-backend` remains the **only** thing the desktop shell boots and the **only** endpoint the cockpit talks to. Every other capability is an **adapter reached through the backend**: MCP servers via `mcp-manager.ts`, native Rust/Go daemons as backend-managed sidecars, CLIs via backend subprocess, HTTP services proxied through `/api/*`.

**Recommend (B).** Rationale, grounded in this repo's own rules and code:
- **One integration seam.** The cockpit already speaks exactly one protocol: `Authorization: Bearer <token>` to `backendUrl` (`preload.js` `__RECODER_COCKPIT__`). Model (A) would force the cockpit to learn N auth schemes and N health contracts and would multiply CORS/secret surface. Model (B) reuses the single seam that already works.
- **Boundary rules demand it.** `AGENTS.md` + `.claude/rules/monorepo.md`: "docker-backend is the embedded control-plane spine; runtimes/sandboxes/engines are adapters." The backend already **owns** task/approval/memory/policy state via `createAgentOsRouter()` mounted at `/api/agent-os` (`server.ts:12366`) and MCP via `createAgentMcpRouter()` at `/api/mcp` (`server.ts:8062`). Putting adapters behind it preserves that ownership; spawning them from Electron would leak control-plane state into the shell.
- **Truthful health + degrade-safe.** The backend already health-gates the conductor and the cockpit already renders `HealthStrip.tsx`, `GovernancePanel.tsx`, `SubstratesPanel.tsx`. Extending backend `/health` to aggregate adapter readiness gives one honest health surface instead of N.
- **Bundle/signing.** Electron ships per-arch, notarized (`entitlements.mac.plist`, `notarize.js`). Every native binary added to `main.js`/`extraResources` inflates the signed bundle and per-arch build matrix. Keeping heavy Rust/Go binaries as **optional backend-managed sidecars** (built via their own `docker compose`, discovered at runtime) keeps the signed shell small.

**The one deliberate exception:** the desktop shell keeps direct ownership of things that are inherently OS-privileged and cannot live behind the backend: **node-pty / tmux PTY** (already in `main.js` `terminal:*`), **native dialogs/clipboard/window/updater**, **auth/device-flow** (`cockpit:deviceLogin`), and **`@recoder/continuum`** desktop capture (needs macOS Screen Recording entitlement — must run in the Electron main process, not a container backend). Everything else routes through the hub.

---

## 2. Capability Map

Grouped into desktop-facing domains. "Exposure today" is verified against real code. "Target surface" = cockpit panel / command / background service.

| Domain | Subsystems (real paths) | What it is | Exposure today | Target desktop surface |
|---|---|---|---|---|
| **Execution / Conductor** | `c/tmux`, `node-pty`, `docker-backend` `/api/conductor/*`, `ts/dmux`, `packages/conductor-ui` | tmux-worktree parallel agent execution; PTY; typed workspace client | **Live.** `backend-supervisor.js` boots backend + resolves tmux; `preload.js` `terminal:*`; cockpit `WorkspaceCenter/Board/DmuxPanel` | Keep. Harden by adopting `@recoder/conductor-ui` `ConductorClient` types as SoT (replace hand-rolled fetches in cockpit `lib/`) |
| **Code Intelligence** | `ts/recodergit` (`@recoder/recodergit`), `packages/brain` (`@recoder/brain`) | code graph / impact analysis; fused BrainContext (git-nexus+mem0+context7+beads+continuum) | Backend-wired (`docker-backend/src/agent-os/recodergit-service.ts`); cockpit `BrainStatsPanel.tsx` exists | **"Code Intelligence" panel** — impact/exec-flow via `/api/agent-os/recodergit/*`; extend `BrainStatsPanel` with `brain.recall()` query box |
| **Memory** | `py/mem0`, `packages/agent-memory`, `packages/continuum` | durable agent memory; reviewed memory-candidate lifecycle; desktop activity capture | Candidates panel `MemoryCandidatesPanel.tsx` exists; `/api/agent-os/memory/lifecycle/candidates` mounted | **"Memory" panel** — candidate review (accept/reject) + vector search; **continuum = background service in Electron main** (entitlement-gated), fed to brain |
| **Retrieval** | `py/colbert`, `crates/lance` (Rust) | late-interaction semantic search; columnar/vector store | None | **Backend HTTP service** (`colbert server.py` sidecar → `/api/search`); Lance via `py/` bindings first. Cockpit **search box** in file browser. Low priority |
| **LLM Gateway / Observability** | `crates/tensorzero` (Rust) | unified gateway 20+ providers + inference logging/eval/A-B | None (present, unbuilt) | **Backend-managed sidecar** → `/api/gateway/*`; cockpit **"Inference" panel** (cost/latency/A-B) |
| **Browser Automation** | `py/browser-use` | LLM-driven web automation (CDP), MCP mode | None | **MCP server via `mcp-manager.ts`**; cockpit **"Browser" panel** (task input + live screenshots + action log) |
| **Multi-Model Orchestration** | `py/pal-mcp-server` | 50+ models, chat/planner/consensus/codereview MCP tools | None (designed for it) | **MCP server via `mcp-manager.ts`**; cockpit **"Consult" actions** (codereview/consensus buttons) |
| **Networking (zero-trust)** | `go/ziti`, `docker-backend/src/ziti-client.ts`, `routes/ziti.routes.ts` | OpenZiti identities/enrollment for runners | Backend-wired (routes exist) | **"Networking" panel** over `/api/ziti/health|identities|runners` |
| **Service Mesh** | `go/recoder-xds` | Envoy xDS control plane | None | **Diagnostics-only** panel (listeners/clusters) if/when needed. Defer |
| **Issues / Task Graph** | `go/beads` (`bd`), `docker-backend/src/conductor/beads-sync.ts` | Dolt-backed dependency issue graph | Backend uses `bd` CLI (fail-safe) | **"Issues" panel** over a backend `/api/beads/*` edge (reuse `beads-sync` pattern) |
| **Autonomous Agents** | `crates/openfang` (Rust), `crates/openfang.toml` | 24/7 scheduled agents, `/api/agents`, budget, A2A | Config-only (`crates/openfang.toml`, `crates/README.md`); no binary | **Backend-managed sidecar** (`docker compose` build) → A2A boundary; cockpit **"Agents" panel** (list/message/budget) |
| **Managed Agents / Squads** | `go/multica` | task assignment, skills, squads | None | **Later.** Daemon client via backend; cockpit squad/assignment view |
| **Governance / Audit** | `crates/recoder-governance` (Rust), `packages/governance` (TS facade) | Merkle hash-chain audit, range proofs | TS facade; cockpit `GovernancePanel.tsx` exists | **Backend-managed daemon** → audit ops; extend `GovernancePanel` (chain head, integrity, risk tiers) |
| **Billing / Entitlement** | `py/recoder-billing`, `@recoder/distribution` | license/entitlement, signed-envelope IPC | `@recoder/distribution` is a desktop dep (device flow in `main.js`) | **Read-only** tier/credits via backend `/distribution/me`; **no direct desktop→billing** |
| **Agent Runtimes** | `ts/opencode`, `ts/oh-my-codex`, `ts/oh-my-openagent`, `packages/agent-runtimes` | opencode/codex adapters | opencode referenced; codex backend-wired | **"Runtimes" panel** (adapter health/capabilities via `/api/agent-os`); model-selection settings via omx |
| **MCP Tools** | `docker-backend/src/mcp-manager.ts`, `packages/agent-mcp` (`createAgentMcpRouter` @ `/api/mcp`) | MCP registry, tool authorize+call, audit | **Backend-live**, mounted `server.ts:8062`; not in cockpit | **"MCP Tools" panel** — list servers/tools/audit; invoke with policy gate |
| **Agent OS Control Plane** | `packages/{agent-os,agent-events,agent-policy,agent-workflows,agent-observability,agent-sandbox,a2a-sdk}` | contracts, CloudEvents, policy, workflows, health | **Backend-live** (`/api/agent-os`, `server.ts:12366`); partial cockpit panels | **Panels**: Policy simulator, Workflow designer, live EventLog (WS), A2A monitor, Substrates |
| **Connectors** | `ts/extracted-from-openclaw` (`@recoder/connectors`) | Telegram/Slack/Discord/… adapters | Backend imports it; cockpit `ConnectorsPanel.tsx` exists | **"Channels" panel** — connector auth/gating status |

---

## 3. Integration Architecture

### 3.1 Layers (text diagram)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 1 — DESKTOP SHELL (Electron main, CommonJS)                          │
│   apps/desktop/main.js · backend-supervisor.js                             │
│   Owns ONLY OS-privileged concerns:                                        │
│     • PTY (node-pty) + tmux resolution   • native dialogs/clipboard/window │
│     • auto-updater (electron-updater)    • auth/device-flow (@recoder/     │
│       distribution)                       • continuum capture (entitlement)│
│   Boots exactly ONE child: docker-backend. Health-gates it. Injects        │
│   { backendUrl, token } into the cockpit.                                  │
└───────────────┬───────────────────────────────────┬──────────────────────┘
                │ preload.js contextBridge          │ --recoder-cockpit-config
                │ (typed IPC allowlist)             │ = base64 { backendUrl, token }
                ▼                                   ▼
┌──────────────────────────────┐      ┌────────────────────────────────────┐
│ LAYER 2 — IPC CONTRACT       │      │ LAYER 4 — COCKPIT (Preact renderer) │
│  recoderDesktop.* (fs/term/  │◄────►│  cockpit/src/App.tsx + components/  │
│   clipboard/window/updater)  │      │  Talks to backendUrl over HTTP/WS   │
│  recoderTerminal.* (PTY)     │      │  with Bearer token. ONE seam.       │
│  cockpit:* (auth)            │      │  Panels lazy-loaded per capability. │
│  a2a:* / agent:* (delegation)│      └────────────────────────────────────┘
└──────────────────────────────┘                     │ HTTP + WebSocket
                                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LAYER 3 — EMBEDDED CONTROL-PLANE HUB (docker-backend, the aggregation pt) │
│   Express + express-ws on 127.0.0.1:PORT                                    │
│   Owns task/approval/memory/policy/artifact/audit state (NON-negotiable).  │
│   /api/conductor/*  /api/agent-os/*  /api/mcp/*  /api/a2a/*  + NEW edges:   │
│   /api/gateway/* /api/search/* /api/ziti/* /api/beads/* /api/agents/*      │
│   Aggregates adapter health into ONE /health.                              │
└───────────┬───────────────┬───────────────┬───────────────┬──────────────┘
            ▼               ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌─────────────┐ ┌──────────────────────┐
│ LAYER 5a MCP  │ │ 5b NATIVE     │ │ 5c CLI      │ │ 5d HTTP SERVICE      │
│ mcp-manager.ts│ │ SIDECARS      │ │ subprocess  │ │ proxy                │
│ pal-mcp-server│ │ (backend-     │ │ bd (beads)  │ │ tensorzero :3000     │
│ browser-use   │ │  managed)     │ │ omx (codex) │ │ colbert :8893        │
│ (--mcp)       │ │ openfang :4200│ │ recodergit  │ │ mem0 self-hosted     │
│               │ │ governance    │ │             │ │ ziti controller      │
│               │ │  daemon       │ │             │ │                      │
└───────────────┘ └───────────────┘ └─────────────┘ └──────────────────────┘
```

### 3.2 The repeatable pattern (how ANY new capability gets surfaced)

This is the scalability mechanism — six deterministic steps, no new IPC channel per capability:

1. **Classify the adapter** into one of four types → 5a MCP / 5b native sidecar / 5c CLI subprocess / 5d HTTP proxy. (Decides where lifecycle lives.)
2. **Backend adapter module** in `docker-backend/src/<capability>/` implementing a small contract: `health() → {status, detail}`, `start()/stop()` (for managed sidecars), and typed operations. Reuse existing patterns: `beads-sync.ts` (fail-safe CLI), `ziti-client.ts` (HTTP client), `mcp-manager.ts` (MCP lifecycle).
3. **Backend route edge** `/api/<capability>/*` behind `authenticateRequest`, returning the standard envelope (`sendSuccess`/`sendError`). Register health in the aggregated `/health`.
4. **Cockpit panel** `cockpit/src/components/<Capability>Panel.tsx` — a self-contained Preact component, **lazy-loaded** and registered in a panel registry (§3b). Binds to `/api/<capability>/*` via the existing Bearer-token fetch client. No new preload channel.
5. **Degrade-safe**: panel renders "unavailable — <reason>" from `health()` when the adapter is missing (matches the repo's truthful-health rule; never fake ready).
6. **Optional sidecar spawn**: if 5b/5d, add a declarative entry to a **backend sidecar manifest** (not `main.js`) — `{ name, buildCmd, healthUrl, env }` — so the backend supervises it and the desktop shell stays untouched.

**Key property:** adding capability N+1 touches only `docker-backend/src/<cap>/` + one cockpit panel file + one manifest line. It never grows `main.js`, `preload.js`, or `backend-supervisor.js`. This is what makes it scale past "a couple files."

---

## 3b. Key Decisions

**D1 — Does the desktop talk ONLY to the embedded backend? → YES (with the OS-privileged exception set).**
The cockpit renderer talks **only** to `backendUrl`. The Electron main process keeps direct ownership of PTY, dialogs, clipboard, window, updater, auth/device-flow, and continuum capture — because those are OS-privileged or entitlement-gated and cannot sit behind an HTTP backend. Everything capability-shaped (gateway, memory, retrieval, agents, governance, MCP, issues, networking) goes through the hub. This preserves the single-seam invariant and the `AGENTS.md` control-plane-ownership rule.

**D2 — How are Rust crates surfaced? → Sidecar process behind the backend, NOT NAPI in the Electron shell.**
Options considered: (a) NAPI native addon compiled into the desktop, (b) sidecar process, (c) via backend proxy.
- **openfang** (`crates/openfang`) and **TensorZero** (`crates/tensorzero`) are already HTTP services (`127.0.0.1:4200`, `:3000`) → **5d HTTP proxy** behind the backend; built via their own `docker compose` (keeps the heavy Rust build off the dev box and out of the signed bundle — consistent with the disk-constraint memory).
- **recoder-governance** (`crates/recoder-governance`) — build `recoder-governance-daemon`, run as **5b native sidecar** managed by the backend, socket on `127.0.0.1:GOVERNANCE_PORT`. The TS facade `packages/governance` stays the in-process fast path; the daemon backs deep audit ops.
- **Lance** (`crates/lance`) — surface via **`py/` bindings** through the retrieval HTTP edge, not a desktop addon.
- **Reject NAPI-in-shell** for all four: it forces per-arch native compilation into the notarized Electron build (mac x64/arm64, win, linux), massively inflating the signing matrix and bundle. tmux is the one C binary we accept in `extraResources` because it's already load-bearing and tiny.

**D3 — How is the cockpit extended into a multi-panel UI without bloating one file? → Lazy-loaded panel registry.**
Today `App.tsx` composes fixed components. Introduce `cockpit/src/panels/registry.ts` — a declarative list `{ id, title, icon, capability, load: () => import('./XxxPanel'), healthKey }`. `App.tsx` renders a nav from the registry and lazy-imports the active panel (Preact `lazy`/dynamic import). Each panel is a focused <400-line file (matches the coding-style rule) that:
- fetches only its `/api/<cap>/*` endpoints,
- reads its readiness from the aggregated `/health` via `healthKey`,
- renders a truthful "unavailable" state when degraded.
This keeps `App.tsx` a thin router, bundles panels as separate chunks (bundle-size win), and makes "add a panel" a one-file change. Existing panels (`PolicyPanel`, `MemoryCandidatesPanel`, `GovernancePanel`, `SubstratesPanel`, `ConnectorsPanel`, `BrainStatsPanel`, `EventLog`, `DmuxPanel`) migrate into the registry as-is.

**D4 — Where does sidecar lifecycle live? → Backend, not `backend-supervisor.js`.**
`backend-supervisor.js` supervises exactly one child (docker-backend). Sidecars (openfang, TensorZero, governance daemon, colbert, mem0) are supervised **by the backend** via a manifest + a small supervisor module in `docker-backend/src/sidecars/`. Reason: the backend already owns health aggregation and is the thing that consumes them; the desktop shell should not learn the health contract of 6 services. This also means sidecars work identically when the backend runs outside the desktop (server deploys).

---

## 4. Phased Roadmap

Sequenced by leverage: **already-backend-wired + high-value first**, native-build-gated last. Each phase is a shippable desktop increment.

### Phase 0 — Panel platform (enabler, ~couple files)
Introduce the lazy panel registry (D3) and a shared Bearer-token fetch client in `cockpit/src/lib/`. Migrate existing panels into the registry. Add aggregated `/health` in the backend with a per-capability `healthKey` map. **Ships:** same features, new extensibility spine. No new adapters.

### Phase 1 — Surface what the backend already owns (zero new sidecars)
Highest ROI: these are live in `docker-backend` but invisible in the cockpit.
- **MCP Tools panel** → `/api/mcp` (`createAgentMcpRouter`, `server.ts:8062`): list servers/tools/audit, policy-gated invoke.
- **Policy simulator** → `POST /api/agent-os/policy/evaluate` (extend `PolicyPanel.tsx`).
- **Live EventLog** → WebSocket over `/api/agent-os/events` (CloudEvents from `agent-events`).
- **A2A monitor** → `/api/a2a/*` audit/state (extend existing `a2a:*` IPC + `agent-registry` routes).
- **Memory candidate review** → wire `MemoryCandidatesPanel.tsx` accept/reject to `/api/agent-os/memory/lifecycle/candidates`.
**Ships:** the cockpit becomes a real control-plane console with no new processes.

### Phase 2 — Code intelligence + issue graph (backend-wired adapters)
- **Code Intelligence panel** → recodergit impact/exec-flow via `docker-backend/src/agent-os/recodergit-service.ts` edges; extend `BrainStatsPanel` with `brain.recall()`.
- **Issues panel** → new `/api/beads/*` edge reusing `conductor/beads-sync.ts` (fail-safe `bd` CLI, 5c).
- **Networking panel** → `/api/ziti/*` (`ziti-client.ts` already exists).
**Ships:** developer-facing intelligence + task graph + zero-trust visibility.

### Phase 3 — MCP tool sidecars (5a, no Rust build)
Register **PAL** (`py/pal-mcp-server`, `uvx`) and **browser-use** (`py/browser-use --mcp`) via `mcp-manager.ts`. Cockpit **Consult actions** (codereview/consensus/planner) and **Browser panel** (task + live screenshots + action log). Gated on provider keys with honest "keys missing → disabled" states.
**Ships:** multi-model second opinions + autonomous browser work.

### Phase 4 — Native sidecars behind the hub (5b/5d, build-gated)
- **TensorZero** (`crates/tensorzero`) → `/api/gateway/*` + Inference panel (cost/latency/A-B).
- **recoder-governance daemon** (`crates/recoder-governance`) → deep audit ops; extend `GovernancePanel` (chain head, integrity, range proofs).
- **openfang** (`crates/openfang`) → build via `docker compose`, `/api/agents/*` proxy + Agents panel (list/message/budget), respecting the A2A boundary (Recoder owns task/approval/memory).
All supervised by the backend sidecar manifest (D4); optional and degrade-safe when unbuilt.
**Ships:** LLMOps observability, tamper-evident audit, 24/7 autonomous agents.

### Phase 5 — Retrieval, continuum capture, and the long tail
- **continuum** background capture in Electron main (Screen Recording entitlement) → feeds brain; Memory panel shows episodes/recall.
- **colbert/Lance retrieval** → `/api/search` sidecar + cockpit search box.
- **Multica**, **recoder-xds** diagnostics, **connectors** management panel — surface only as demand appears.
**Ships:** desktop activity memory + semantic retrieval; remaining domains behind flags.

---

## 5. Top Risks + Open Questions

### Risks
1. **Bundle size / signing matrix (highest).** Every native binary in `extraResources`/`asarUnpack` inflates the notarized per-arch build (`notarize.js`, `entitlements.mac.plist`, mac x64+arm64, win, linux). **Mitigation:** D2 — Rust/Go stay backend-managed sidecars built out-of-band and discovered at runtime; only tmux stays bundled. Ship them optional, not in the DMG.
2. **Native build/signing per-arch.** openfang/governance/TensorZero Rust builds are heavy and (per repo memory) the dev box is disk/RAM constrained. **Mitigation:** `docker compose` builds off the signed path; desktop degrades honestly when the sidecar binary is absent.
3. **Process sprawl.** N sidecars = N crash domains, N ports, N zombie risks. **Mitigation:** D4 — a single backend sidecar supervisor with health/restart/backoff (mirror `backend-supervisor.js`'s existing backoff), and a hard concurrency cap. Desktop shell still supervises only one child.
4. **Security surface.** Each new loopback service + provider key (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `TENSORZERO_API_KEY`, openfang key) widens the attack surface — and `.claude/rules/security.md` forbids trusting MCP tool descriptions / runtime-reported success. **Mitigation:** all adapter traffic behind `authenticateRequest` + `INTERNAL_SERVICE_KEY` for backend↔sidecar; MCP invokes pass through `agent-mcp` policy authorize; keys never in the cockpit/renderer; bind everything to `127.0.0.1`. (Note the recurring-miner memory: keep sidecars non-root, no public listeners.)
5. **Cockpit chunk bloat.** More panels = larger renderer bundle. **Mitigation:** D3 lazy `import()` per panel → separate chunks, loaded on demand.
6. **Boundary erosion.** Temptation to let openfang/Multica own task/approval state. **Mitigation:** enforce `AGENTS.md` A2A boundary — adapters emit `RunEvent`s; Recoder state stays in `packages/agent-os`.

### Open Questions for the owner
1. **Provider keys in desktop:** BYOK entered in-app (stored in Electron `safeStorage`) vs pulled from `recoder.xyz` entitlement? This gates Phase 3/4 UX. (Memory distinguishes platform keys vs BYOK — which applies here?)
2. **Ship openfang/TensorZero in the installer or fetch-on-first-use?** Bundling bloats the DMG; fetch-on-use needs a trusted release channel + signature check. Recommend fetch-on-use.
3. **continuum capture default:** on-by-default (privacy/entitlement friction) or opt-in from a Memory panel toggle? Recommend opt-in.
4. **`packages/recoder-analytics` did not resolve on disk** (inventory cited it; `packages/analytics` may be the real name). Confirm the package path before wiring a telemetry dashboard card.
5. **Multi-user local accounts** (`@recoder/auth`) — needed for desktop, or is device-flow to `recoder.xyz` (already in `main.js`) sufficient? Recommend deferring local auth.
6. **Sidecar manifest ownership:** should the manifest live in `docker-backend` (works for server deploys too) or be desktop-only? Recommend backend, per D4.

---

Verified real paths cited: `apps/desktop/{main.js,preload.js,backend-supervisor.js,package.json,entitlements.mac.plist,notarize.js}`, `apps/desktop/cockpit/src/components/{HealthStrip,PolicyPanel,MemoryCandidatesPanel,GovernancePanel,SubstratesPanel,ConnectorsPanel,BrainStatsPanel,EventLog,DmuxPanel,Board,WorkspaceCenter}.tsx`, `docker-backend/src/server.ts` (mounts: `/api/mcp` @8062, `/api/agent-os` @12366, `/api/a2a` @12454), `docker-backend/src/{mcp-manager.ts,ziti-client.ts,routes/ziti.routes.ts,conductor/beads-sync.ts,agent-os/recodergit-service.ts}`, `crates/{README.md,openfang.toml,openfang/,tensorzero/,recoder-governance/README.md,lance/}`, `ts/{recodergit,dmux}`, `packages/{brain,continuum,conductor-ui}`, `py/{pal-mcp-server,browser-use,mem0,colbert}`, `go/{beads,ziti,multica,recoder-xds}`. Unverified: `packages/recoder-analytics` (not found on disk — see open question 4).
