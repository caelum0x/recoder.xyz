# Recoder — Architecture: Apps · Modules · Engines (VSCode→Cursor)

> **Status (2026-07-31) — the mandate is FULLY REALIZED and HARDENED.** The engines are deepened IN their
> own dirs and USED by the built 15-domain backend (`backend/src/domains/*`): boots with 15 truthful
> health sources, tsc 0, 3,076 backend tests. Multi-tenant IDOR sweep complete (A2A ed25519 signer binding,
> `/internal/persistence` self-gates). The supervisor spawns the OSS engines on boot and the
> conductor run flow consumes them (memory recall/harvest, tensorzero inference, governance, recodergit
> + beads, diff review routing). Live status is tracked in `bd`.

> **Owner mandate (2026-07-14):** stop shipping thin wrapper layers. Each OSS directory IS a
> first-class **module** of Recoder, used deeply and directly FROM ITS OWN DIR (never copied into
> `packages/`). Recoder is composed of modules the way Cursor is VSCode + its own layers.
>
> **See [RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md)** for the canonical layer stack
> (substrate → engines → modules → edges → apps), the engine→module map, and the per-layer laws.
> This file holds the per-module specs.

## The three layers (do not confuse them)

```
  apps/          SURFACES / products. desktop (the Wave-fork shell — the recoder-* views).
    │            They consume the backend over its edges. No capability logic lives here.
    ▼ consume
  MODULES        The capabilities. Each is a DIRECTORY, used in place:
    │              backend  → the HOST module (conductor + agent-os; composes the rest)
    │              packages/*                   → shared first-party contracts (agent-os, a2a-sdk, pal, …)
    │              apps/desktop/engines/*       → recodergit (github) · dmux (terminal-mux) · openclaw (social) · tmux (the session substrate)
    │              backend/engines/py/*         → mem0 · colbert (memory) · browser-use · ops-recorder · pal-mcp
    │              backend/engines/rust/*       → openfang (agent-engine) · tensorzero (inference) · recoder-governance
    │              apps/desktop/server/engines/* → beads (memory/issue-graph) · multica (squads/teammates) · ziti + recoder-xds (networking)
    ▼ drive/consume in place (import dist · read the running server · boot the .node · spawn the sidecar)
  Each module is edited IN ITS OWN DIR where fusion needs it (clean exports, killed side-effects).
```

**Rules:**
- A **module = an OSS directory used directly.** backend imports/spawns/reads it in place. We do
  NOT copy an engine into `packages/`. `packages/*` is only for genuinely-shared first-party contracts.
- A **capability that composes several modules** (e.g. MEMORY = mem0 + beads + colbert) gets a thin
  cohesive **composer** inside the host module (`backend/src/domains/<domain>/`). The DEPTH lives
  in the engine dirs; the composer only fuses + exposes one interface + truthful health. It must MOVE the
  scattered consumer code behind it (not add a 4th copy).
- **Edit the OSS source in its own dir** when the fusion needs it — that dir is ours (e.g. the dmux
  clean-exports edit). Deepen the engine there, don't wrap it shallowly elsewhere.
- `apps/*` never holds capability logic — it calls the modules.

## The rule of a good module composer

When backend composes engine-modules into a domain capability, the composer is real when:
1. **One domain, one owner** — `backend/src/domains/<domain>/` is the single place that fuses the
   engine dirs for that domain (it does not re-implement them).
2. **Cohesive interface** — full verb set of the domain; callers depend on it, never on a raw dist.
3. **Consumes engines from their dirs** — mem0/beads/colbert/openfang/tensorzero are read/imported/spawned
   in place; nothing duplicated.
4. **Truthful health** — reports each engine up|down; never fakes readiness.
5. **Governed + audited** — writes through the policy gate; state-of-record stays Recoder-owned; the
   scattered old consumer code is MOVED behind it (no 4th copy).

Current state (2026-07-31): **15 domains ship under `backend/src/domains/*`** and boot (tsc 0, 3,076
tests, 15 truthful health sources, multi-tenant IDOR hardened). The engines are deepened in their own dirs and the legacy flat dirs
(`src/conductor`, `src/agent-os`, `src/a2a`, `src/connectors`, `src/gateway`, `src/network`, …) have been
absorbed into their domains — `src/` is now `bootstrap/ domains/ http/ shared/`. Suite health: backend + website + desktop all green.

> **Path reconciliation (read before the specs below).** The 12 capability specs are grouped by
> *capability*, and several do NOT live in their own top-level domain dir — they were folded into the 15
> shipped domains. Each section header now carries its real shipped path. Summary: **GITHUB / BROWSING /
> SIGNALS / AGENT-ENGINE** live inside `domains/engines/`; **TERMINAL** inside `domains/conductor/`;
> **COMMUNICATION** across `domains/interop/` + `domains/interop-wire/` (with `pal` in `domains/engines/`);
> **NETWORKING** (mesh) inside `domains/cloud/`; **SQUADS** (autopilots) inside `domains/agent-os/`.
> MEMORY, SOCIAL, INFERENCE, GOVERNANCE are their own domains. The other shipped domains not called out as
> a numbered spec here: `identity`, `persistence`, `billing`, `edge`, `observability`.

---

## 1. MEMORY module — `backend/src/domains/memory/` (shipped)
**Domain:** everything the agents remember. **Absorbs:** `backend/engines/py/mem0` (semantic vectors) + `apps/desktop/server/engines/beads`
(issue-graph shared memory, the dolt store) + `backend/engines/py/colbert` (rerank) + agent-os memory candidates.

**Interface**
```ts
interface MemoryModule {
  recall(query: string, scope?: MemoryScope, opts?: { limit?: number; agentId?: string }): Promise<RecalledMemory[]>
  // fuses mem0 + beads (bd CLI via the engines BeadsAdapter) + agent-os candidates → colbert-reranked → deduped → provenance-tagged
  remember(fact: MemoryDraft): Promise<{ id: string; store: 'beads' | 'mem0' }>   // candidate, evidence-required
  promote(id: string, review: ReviewRef): Promise<void>                            // the durable gate
  forget(id: string): Promise<void>
  relate(fromId: string, toId: string, kind: RelationKind): Promise<void>          // beads dep edges
  issueGraph(): IssueGraphService  // the cohesive beads facet (work reads/writes + memory verbs + durability)
  health(): MemoryHealth   // {mem0: up|down, beads: up|down, colbert: up|down}
}
```
**Superseded (was scattered pre-build):** the recall logic that lived in `bundle.ts`, `beads-memory.ts`,
`beads-sql.ts`, `memory-store-adapter.ts`, `mem0-client.ts`, `colbert-rerank.ts` (five files, no single
owner; recall duplicated in enrichPrompt) is now folded behind the shipped `MemoryModule` — one owner for
recall/remember/forget/harvest.
**Ground-truth (shipped):**
- The live semantic path is the **owned `@recoder/mem0` TS package** (OSS Memory, **google/Gemini
  embeddings by default**) behind the module's `VectorStorePort` — shipped with an **embedded LanceDB
  adapter** (`memory/adapters/lance.adapter.ts`) and a **real Qdrant liveness probe**
  (`memory/adapters/qdrant.adapter.ts`, `MEM0_COLLECTION=recoder_mem0`), NOT the Python
  `backend/engines/py/mem0` lib. `backend/engines/py/mem0`'s FastAPI server stays an optional
  `MEM0_BASE_URL` target (owner decision 1).
- `backend/engines/py/colbert`: the `rerank_server.py` sidecar (supervised via the engines domain's
  `colbert-daemon.ts`) now runs **LIVE ColBERT MaxSim rerank** — recall reports which reranker actually
  ran (`colbert` when up, else `identity`), degrading truthfully to identity order when the sidecar/torch
  is absent. `server.py` (ANN-index search) + the indexing/training pipeline remain unused (rerank-only,
  per owner decision 2).
**Shipped behavior:** one `MemoryModule` OWNS recall fusion (mem0∪beads∪candidates → colbert rank →
dedupe → provenance), routes `remember` to the right store by scope, and is the memory entry point
(enrichPrompt, completion-watcher, the MCP memory tools call it). beads reads AND writes go through
`memory.issueGraph()` — the module facet over the engines `BeadsAdapter` (`bd` CLI, the single
spawner/argv owner in `backend/src`). There is NO SQL-direct beads path in `backend/src`
(`beads-sql.ts` lives only under `apps/desktop/server/engines/beads` and is not consumed by the
backend). colbert reranks when up; `forget`/`harvest` wired.

---

## 2. SOCIAL module — `backend/src/domains/social/` (shipped — mounts at `/api/social`)
**Domain:** the agents' presence on human channels. **Absorbs:** `apps/desktop/engines/openclaw`
(gateway-core, social-gateways channel drivers, agents, skills-reference) + the `apps/social` runtime.

**Interface**
```ts
interface SocialModule {
  channels(): ChannelStatus[]                          // telegram/slack/discord/… configured? live?
  connect(channel: ChannelId): Promise<void>           // supervised driver spawn
  onInbound(handler: (msg: InboundMessage) => void)    // AFTER the allowlist/mention gate
  send(channel: ChannelId, to: string, body: OutboundBody): Promise<DeliveryReceipt>
  dispatchToConductor(msg: InboundMessage): Promise<WorkspaceRef>   // message → gated → agent run
  health(): SocialHealth
}
```
**Shipped:** the `SOCIAL` domain (`backend/src/domains/social/`) is live and **mounts at `/api/social`**
(NOT `/api/connectors`) — it owns the connectors pipeline (registry, hostile-by-default gate, dispatch)
built on `@recoder/connectors` (at `apps/desktop/engines/openclaw`), and the separate `apps/social`
process has been **folded into the one embedded backend**. SEVEN per-channel `ConnectorPort` adapters are
live and dispatch-tested (telegram/slack/signal/imessage/whatsapp/line/feishu); the **discord** adapter
was **dropped from the exported channel set** (never truly extracted, OpenClaw-coupled — owner decision 5).
**Deep target:** a backend `SocialModule` that supervises the channel drivers in-process (or owns the
apps/social sidecar), exposes `onInbound → dispatchToConductor` so a Telegram message becomes a
conductor workspace end-to-end, and surfaces channel health in the desktop UI. openclaw's agents +
skills-reference fold into the reply loop.
**Build:** (a) module wraps connectors + supervises the drivers; (b) wire inbound→conductor; (c)
one channel (telegram) live end-to-end; (d) desktop social panel.

---

## 3. GITHUB module — `backend/src/domains/engines/github/` (shipped, inside the ENGINES domain)
**Domain:** the agents' complete GitHub capability. **Absorbs:** `apps/desktop/engines/recodergit` (recodergit-engine
code-graph + github ops, pr-swarm-review, claude-plugin) + the `gh` CLI operations.

**Interface**
```ts
interface GitHubModule {
  analyzeRepo(path: string): Promise<CodeGraph>              // recodergit runFullAnalysis (in-process)
  domainMap(path: string): Promise<RouteMap>                 // recodergit LocalBackend
  reviewPR(target: PrTarget, mode?: 'swarm'|'solo'): Promise<ReviewResult>  // pr-swarm-review
  openPR(input: OpenPrInput): Promise<PrRef>                 // gh
  comment(pr: PrRef, body: string): Promise<void>            // gh
  search(query: string, where: RepoOrGithub): Promise<Match[]>
  health(): GitHubHealth   // {recodergitLib: up, gh: authed|not}
}
```
**Grounded correction:** functionally `apps/desktop/engines/recodergit` (the `@recoder/recodergit-engine`) is a
**code-knowledge-graph / code-intelligence** engine — it indexes a repo into a graph (symbols, imports,
call chains, impact/blast-radius, hybrid BM25+semantic search) via Tree-sitter + LadybugDB. It is NOT
GitHub-API git plumbing (the analyzer never calls an LLM). The canonical map deliberately files it under
GITHUB as the agents' **repo-comprehension** capability, paired with `gh` ops. Note also: the wrapper pkg
`@recoder/recodergit` (`packages/recodergit`) is **distinct** from the engine (`apps/desktop/engines/recodergit/recodergit`)
— the wrapper depends on `@recoder/agent-os`, not the engine — and `apps/desktop/engines/recodergit` is NOT a root
workspace member (consumed by dist path + spawn).
**Shipped:** the GitHub capability lives in `backend/src/domains/engines/github/` (`github-module.ts` +
the `github-mcp` binder) — unifying the recodergit code-intel lib + `gh` CLI ops + the `recoder.github` /
`recoder.repo` MCP servers behind one module, bound to the host-authorized `McpToolCaller`.
**Deep target:** one `GitHubModule` unifying recodergit code-intel + gh ops + swarm review behind a
single interface; the MCP tools + the conductor's git-context all call it. The claude-plugin ships into
conductor-provisioned Claude Code workspaces so agents get the recodergit slash-commands natively.
**Build:** (a) module unifies recodergit-service + github-engine; (b) reviewPR wired into the post-run
delivery gate (auto-review merged PRs); (c) claude-plugin distribution into workspaces (needs Node 22
image). **License gate:** recodergit-engine is PolyForm-Noncommercial — resolve before shipping.

---

## 4. TERMINAL module — `backend/src/domains/conductor/terminal/` (shipped, inside the CONDUCTOR domain)
**Domain:** multiplexed, restart-survivable terminal sessions — the substrate agents run on.
**Absorbs:** `apps/desktop/engines/tmux` (owned binary, sessions) + `apps/desktop/engines/dmux` (multiplexing: panes, layout/grid, attention,
streaming, workers).

**Interface**
```ts
interface TerminalModule {
  createSession(spec: SessionSpec): Promise<Session>          // tmux, worktree-bound
  attach(sessionId): SessionStream                            // control-mode stream
  panes(sessionId): PaneState[]                               // dmux pane model
  layout(sessions: Session[], opts): OperatorGrid             // dmux LayoutCalculator
  attention(paneText: string): AttentionClass                 // dmux heuristics (needs-you/working/idle)
  send(sessionId, keys): Promise<void>
  health(): TerminalHealth
}
```
**Shipped:** the terminal substrate lives in `backend/src/domains/conductor/terminal/` — a
package-compatible tmux `ConductorSubstrate` with a **tmux control-mode observer** and real-time terminal
streaming (`terminal-stream`), driving conductor `steer` (send-keys) and the run-screen plane. **Still
partial:** dmux's richer pane/layout brain — the attention classifier is wired, but dmux's full
pane/streaming/worker engines remain the deepening target.
**Deep target:** ONE `TerminalModule` where tmux is the session substrate and dmux is the multiplexing
brain over it — pane lifecycle, real-time streaming (control-mode), operator grid, attention — a single
coherent terminal layer the conductor AND the shell's operator view both consume. Unify apps/desktop's
separate Go durable-shell onto these same sessions (two restart mechanisms → one).
**Build:** (a) module owns session lifecycle + the dmux pane/layout/attention engines together; (b)
control-mode default-on feeding dmux's pane model; (c) wave shell on the same tmux sessions.

---

## 5. COMMUNICATION module — `backend/src/domains/interop/` + `backend/src/domains/interop-wire/` (shipped, split across the two INTEROP domains + `pal` in ENGINES)
**Domain:** how agents decide, route, reach consensus, and talk to each other. **Absorbs:** `packages/pal`
(planning/decision/consensus/model-routing, ported from pal-mcp) + the A2A stack (agent-to-agent
messaging, task handoff).

**Interface**
```ts
interface CommunicationModule {
  plan(goal: string, ctx: PlanContext): Plan                 // pal: runtime/risk/approval decision
  routeModel(task: TaskKind, prefs: ModelPrefs): ModelChoice // pal model-router + fallback ladder
  consensus(question: string, models: ModelChoice[]): Promise<ConsensusResult>  // pal consensus
  escalate(confidence: Confidence): EscalationDecision       // pal expert-escalation
  handoff(from: AgentId, to: AgentId, task: TaskSpec): Promise<RunRef>   // A2A
  message(to: AgentId, msg: A2AMessage): Promise<void>
  health(): CommunicationHealth
}
```
**Shipped:** the A2A spine is now the two **INTEROP domains** — `backend/src/domains/interop-wire/`
(wire: **ed25519 ingress verification + signer-key binding to task ownership** (interop-wire/dispatch/a2a-methods.ts, IngressResult.signer),
external ingress refuses HMAC-only untrusted requests (401), trusted/loopback keep HMAC; first/quorum/handoff dispatch, `localRun` via conductor +
`remoteSender`) and `backend/src/domains/interop/` (the gate + rate-limiter). `@recoder/pal` provides the
`recoder.pal-plan` decision slice (registered in-proc behind the interop gate); the vendored Python
`backend/engines/py/pal-mcp-server` (multi-model orchestration, conversation threading, `clink` subagent
bridge, 18 real tools via a live MCP handshake) is a **supervised sidecar** (`PalMcpAdapter` in the
ENGINES domain, health `up` only when the uv venv answers). **Wired (2026-07-31):** pal's heavy orchestration now routed through conductor launch-path;
diff review comments now state-route back into the agent loop. **Consult capability shipped:** agents reach pal's
multi-model deliberation as MCP tools — the RAW answers-for-synthesis surface `recoder.pal-comms`
(`pal.route`/`pal.consensus`/`pal.debate`/`pal.models`) AND the deny-biased VERDICT surface `recoder.pal-brain`
(`pal.consensus_verdict`/`pal.debate_verdict`), which returns the facet's truthful `{recommendation:'allow'|'block'|'abstain', reason, models, degraded, engine}` (abstain-on-fault) parallel to the raw tools.
**Deep target:** a `CommunicationModule` that IS the conductor's decision layer (every workspace launch
calls `plan()` for runtime/risk/approval) and the A2A spine (agent handoff/messaging).
**Build:** (a) module unifies pal + a2a; (b) launch path calls plan(); (c) ~~consult capability~~ (shipped, backend tools) + desktop UI.

---

## 6. INFERENCE module — `backend/src/domains/inference/` (shipped)
**Domain:** every LLM call. **Absorbs:** `backend/engines/rust/tensorzero` (embedded gateway) + the model registry + BYOK.

**Interface**
```ts
interface InferenceModule {
  infer(req: InferenceRequest): Promise<InferenceResult>     // routing/variants/fallback, in-process
  stream(req: InferenceRequest): AsyncIterable<Chunk>        // shipped: REAL in-proc SSE via inferenceStream
  feedback(inferenceId: string, signal: FeedbackSignal): Promise<void>   // merge/approve = positive
  models(): ModelCatalogEntry[]
  health(): InferenceHealth
}
```
**Shipped:** a three-rung TensorZero ladder — the **release napi `.node`** giving **REAL in-process SSE**
(`inferenceStream`) → a backend-supervised loopback `gateway` binary (127.0.0.1:3778 / `TENSORZERO_URL`)
→ a **direct BYOK rung-3 multi-provider router** (never faked). **BYOK keys are resolved from the
governance secrets vault** into the delivery path. Also live: an OpenAI-compatible
**`/api/gateway/inference/v1/embeddings`** edge + the `inference.embed` MCP tool. `tensorzero-config.ts`
generates the registry→TZ config; all calls route through the policy gate.
**Deep target:** THE module every inference routes through; run loop uses `infer()` by default with BYOK
keys as TZ credentials; streaming; feedback wired to delivery outcomes.
**Build:** (a) module wraps the embedded gateway + config-gen; (b) run-loop reroute (G2 step 2);
(c) streaming binding; (d) feedback loop.

---

## 7. AGENT-ENGINE module — `backend/src/domains/engines/` (openfang) (shipped, inside the ENGINES domain)
**Domain:** autonomous agents + the openfang kernel. **Absorbs:** `backend/engines/rust/openfang` (upstream RightNow-AI
OpenFang, MIT — a full Rust "Agent OS": kernel of agents, Hands/background workers, triggers, workflows,
event bus, KV memory + a wasmtime runtime, sqlite, ~40 channel adapters). Two surfaces: an HTTP sidecar
binary (`openfang start`, 127.0.0.1:4200, bearer `OPENFANG_API_KEY`) and a NAPI addon
(`openfang_napi.node`, ~51 `#[napi]` exports).

**Interface**
```ts
interface AgentEngineModule {
  asRuntime(): ConductorRuntime           // runtimeId:"openfang" — a workspace agent IS an openfang agent
  hands(): Hand[]; activateHand(id): Promise<HandInstance>   // the 7 autonomous background agents
  run(agentId, message): Promise<AgentTurn>
  onEvent(handler)                         // openfang event bus ↔ RunEvents (both ways)
  health(): AgentEngineHealth
}
```
**Shipped:** openfang lives in `backend/src/domains/engines/` — `openfang-native.ts` (degrade-safe
`.node` loader, ~51 methods, native-first in-process) + `openfang-runtime.ts` (the conductor runtime
driver). The **`ConductorRuntimeId` union was widened** (`conductor/types.ts` now includes `'openfang'`),
so a workspace can dispatch `runtimeId:'openfang'` → the in-process substrate (proven in
`conductor-run-flow` / `runtime-listing` tests). The crate is vendored in-tree
(`backend/engines/rust/openfang/`, no longer gitignored) and **not built by default** (ENOSPC-avoidance),
so it degrades truthfully when the `.node` is absent. **Still planned:** Hands lifecycle + the event-bus
↔ RunEvents bridge.
**Deep target:** openfang as a first-class conductor runtime; its Hands as supervised autonomous
background capabilities; its event bus bridged to RunEvents.
**Build:** (a) widen ConductorRuntimeId → dispatch the driver; (b) Hands lifecycle in the conductor;
(c) event-bus bridge.

---

## 8. GOVERNANCE module — `backend/src/domains/governance/` (shipped)
**Domain:** the moat — policy decisions + tamper-evident audit. **Engine dir:** `backend/engines/rust/recoder-governance`
— **first-party (MIT), Recoder-OWNED** Rust governance kernel (a 9-crate workspace: types/audit/permission/
approval/routing/kernel/ipc/daemon/napi), deliberately kept OUTSIDE the vendored upstream clones. The
napi addon exposes `NapiGovernanceKernel` (`decide`/`enforce_tool`/`route`/`record_audit`/`verify_audit`/
`audit_tip`/`audit_len`) + `NapiApprovalManager`, backed by a SHA-256 Merkle hash-chain byte-interoperable
with `packages/governance/src/audit/merkle-verifier.ts` (golden vector pinned in `tests/ts_interop.rs`).
**Today:** consumed via the `@recoder/governance` TS facade → napi loader, with a **three-tier degrade
ladder**: (1) napi in-process native kernel → (2) UDS daemon (`conductor/governance-daemon.ts`,
`recoder-governance-daemon`) → (3) pure-TS deny-biased fallback (no behavior change when the `.node` is
absent). `domains/governance/services/governance-gate.service.ts` `decide()` drives the real facade on the delivery path
(covered by `governance-gate.test.ts`); also `pal-plan.ts`, `solo-mode.ts`, `coordination-integration.ts`.
**Shipped:** the `GOVERNANCE` domain seals conductor mutations (create/merge/archive/memory-promote, plus
cloud/billing/memory write surfaces) into the Merkle log via `decide+recordAudit`, and the governed **MCP
HTTP edge `POST /api/mcp/tools/:server/:tool/call`** is **LIVE** (was 404) — every subject-bearing MCP
tool binds identity to the host-authorized `McpToolCaller` (cross-tenant class closed: non-privileged
caller → own subject, foreign → 403, admin/internal → arbitrary, absent → `AUTH_REQUIRED`). **Still
partial:** the richer policy crates — permission/approval/routing, persistence, checkpoints, replay —
exist as slices; only audit+kernel are exercised via napi today.

## 9. BROWSING module — `backend/src/domains/engines/` (browser-use) (shipped, inside the ENGINES domain)
**Domain:** web automation for agents. **Engine dirs:** `backend/engines/py/browser-use` (async LLM browser-agent — Rust
core, CDP, watchdogs) + `@recoder/agent-browser` (in-proc puppeteer) + `@recoder/browser-tools`.
**Shipped:** `backend/engines/py/browser-use` is a **supervised sidecar** (`BrowserUseAdapter` in the
ENGINES domain, health `up` only when the uv venv answers, reached via `BROWSER_USE_URL`) driving **LIVE
Chrome via CDP**. The default functional path is TS-first: `engines/browser-use-engine.ts` composes the
owned `@recoder/agent-browser` over a degrade-safe driver — puppeteer (dynamic import) OR the HTTP
`browser-use` sidecar — registering `browser.navigate/extract/screenshot` behind the interop gate (with
neither present, tools return `not_configured`). The Python agent's deep loop is reached over the sidecar seam.
**Deep target:** one `BrowsingModule`
(open/snapshot/extract/verify/navigate) with a **supervised** browser-use service (or its MCP server) actually
running as the owned-venv sidecar and puppeteer as the light fallback; session/profile management,
domain-allowlist wired to governance, artifact capture; the conductor's post-run browser-check calls it.
**Build:** module unifies the two drivers; browser-use owned-venv bootstrap (uv + playwright install).

## 10. SIGNALS module — `backend/src/domains/engines/` (ops-recorder) (shipped, inside the ENGINES domain)
**Domain:** work-signals + activity observability. **Engine dir:** `backend/engines/py/ops-recorder` (Recoder-authored
FastAPI service, real code in `backend/engines/py/ops-recorder/work-signals/`; detects STUCK GitHub/Linear work → normalized
`WorkSignal` → auto-generated handoff prompt; supervised loopback sidecar :8073, `X-API-Key` auth).
**Shipped:** `engines/ops-recorder-daemon.ts` supervises `uvicorn main:app` with an auth preflight
(refuses to spawn keyless) + `engines/ops-recorder-adapter.ts` (`forwardToOpsRecorder`) + work-signals
ingress; the sidecar now runs a **full ingest roundtrip + real GH/Linear detectors**. Storage is still a
local JSON store. **Deep target:** a `SignalsModule` owning the signal ingress→conductor path
(stuck/blocked/needs-you signals drive the board) with durable shared storage and the detection loop running
against real GH/Linear tokens, default-on. **Build:** module wraps the sidecar; API key minted at boot;
signals feed the board module. **Housekeeping:** `backend/engines/py/ops-recorder` LICENSE added
(MIT, Recoder-authored — owner decision 6).

## 11. NETWORKING module — `backend/src/domains/cloud/` (mesh) (shipped as diagnostics, inside the CLOUD domain — cloud tier, mesh at cloud launch)
**Domain:** zero-trust mesh + service control plane. **Engine dirs:** `apps/desktop/server/engines/ziti` (OpenZiti — zero-trust
networking, cryptographic identity per connection, dark services) + `apps/desktop/server/engines/recoder-xds` (real Envoy xDS
control plane — dynamic LDS/CDS/RDS over ADS, the live equivalent of `backend/src/network`'s static
bootstrap). **Shipped:** the mesh capability is folded into the **CLOUD domain** —
`cloud/adapters/ziti-mesh.adapter.ts` (OpenZiti identity/mesh) + `cloud/adapters/xds-envoy.adapter.ts`
(Envoy xDS), plus the degrade-safe `engines/ziti-client.ts`. Exposed as **diagnostics only** (mesh
identity + peer status + xDS), behind the `GovernanceGate` that guards every cloud write. **Still
deferred:** no live data plane until the cloud/teams launch (owner decision 7).

## 12. SQUADS module — `backend/src/domains/agent-os/` (autopilots) (shipped, inside the AGENT-OS domain — agents as teammates)
**Domain:** managed agents as first-class teammates — assignment, squads, autopilots, the team board.
**Engine dir:** `apps/desktop/server/engines/multica` ("Multiplexed Information and Computing Agent" — assign issues to an agent
like a colleague; agents claim work, report blockers, update status; **Squads** = a group under a leader
agent that delegates; **Autopilots** = cron/webhook-triggered recurring agent work; WebSocket progress
streaming). This is the human+agent TEAMWORK layer — a direct sibling of Recoder's own conductor/board,
so it FUSES into them rather than running beside them.
**Shipped:** the **AGENT-OS domain** now owns **squad autopilots** (cron → beads → conductor) on top of
the existing task lifecycle + beads assignment — multica's autopilot/squad ideas ported into the Recoder
conductor rather than supervising the Go binary. `engines/multica-client.ts` remains a degrade-safe
loopback client (binary unbuilt). Recoder already owns the conductor (enqueue/claim/start/complete), the
board (`packages/herd` + the desktop board view), and beads (issue graph). **Deep target (partly shipped):** the
`SquadsModule` folds multica's distinctive primitives into
the Recoder conductor: **squads** (assign work to `@FrontendTeam`; a leader agent routes to a member) and
**autopilots** (scheduled recurring agent runs that self-create the issue + route it), on top of the
existing task lifecycle + beads assignment. Not a separate managed-agents server — its IDEAS become
Recoder conductor features. **Build:** (a) squad = a named group of runtimes + a leader-routing policy
over the existing launch path; (b) autopilot = a cron trigger that creates a beads issue + dispatches a
conductor run; (c) surface squads/autopilots in the desktop board. Port the logic (Go → TS conductor)
rather than supervise the Go binary, since it overlaps our own control plane.

## Module build order

> **All 12 are now shipped** (see each section's status). The order below is **historical** — the
> consolidation-first sequence that was executed.

Consolidation-first (each was "gather scattered code behind the interface", then deepen):
1. **MEMORY** — highest leverage (5 scattered files, used every launch), no new deps.
2. **GITHUB** — unify the two engines; the user's headline "GitHub engine for Claude Code".
3. **TERMINAL** — the substrate; deepen dmux from 2 functions to the real pane/stream/layout brain.
4. **INFERENCE** — run-loop reroute (G2 step 2).
5. **COMMUNICATION** — pal becomes the launch-path planner; A2A spine.
6. **AGENT-ENGINE** — ConductorRuntimeId widening → openfang runtime dispatch.
7. **SOCIAL** — inbound→conductor end-to-end + one live channel.

Each module ships as: create `backend/src/domains/<domain>/` + the interface + move scattered code behind it +
one integration test proving a caller uses the module end-to-end + degrade-safe health. Then deepen.

---

## Owner decisions (2026-07-14 — "you choose all", architect's calls)

1. **mem0 canonical store** → the owned `@recoder/mem0` (TS + platform Qdrant) is the ONE semantic
   memory path. `backend/engines/py/mem0`'s FastAPI server stays an optional, unspawned `MEM0_BASE_URL` target — not
   supervised, not deleted (no-pruning rule). The MEMORY module's `recall` uses `@recoder/mem0`.
2. **colbert** → **rerank-only** (no ANN index build). The `rerank_server.py` sidecar now runs **LIVE
   ColBERT MaxSim rerank** when up; when the sidecar/torch is absent the reranker degrades to an identity
   pass and recall still fuses+dedupes without it (`rerankerUsed: colbert|identity` is reported).
3. **recodergit license (PolyForm-Noncommercial)** → keep **dev / self-host only**, behind the
   degrade-safe CLI/lib path. NOT shipped commercially-embedded until relicensed. The GitHub module
   flags this; the capability degrades to `not_configured` cleanly when disabled.
4. **openfang** → the closed `ConductorRuntimeId` union was **widened (done)** — `runtimeId:"openfang"`
   dispatches to the in-process substrate, completing the AGENT-ENGINE module's runtime seam. Owning a
   built `.node` stays disk-gated, so it degrades truthfully when absent.
5. **discord connector** → **dropped from the exported channel set (done)** (never truly extracted,
   still OpenClaw-coupled). The 7 working adapters ship; the broken channel does not.
6. **ops-recorder LICENSE** → **added** (MIT, Recoder-authored — matches root `package.json` license).
7. **networking (ziti/xds)** → **stays cloud-tier-deferred**. Registered + diagnostics only; no live data
   plane until the cloud/teams launch.
8. **Harness² (google-research/harness2) evaluated, NOT wired as a `ConductorRuntime`** (2026-10-19) —
   its released API only runs 3 fixed benchmarks (`--bench jb|lab|wb`); `Substrate.execute()` requires a
   benchmark-supplied launcher + task_ref, not an arbitrary Recoder repo/prompt. Registering it in the
   COMMUNICATION module's runtime registry (`backend/src/domains/interop-wire/runtimes/`) or
   `packages/runtime`'s driver registry would be a permanently-nonfunctional entry, so it isn't there.
   What ships instead: a read-only, additive capability probe (`mcp/recoder-harness2-adapter.js`,
   never registered as a selectable engine). Full evidence: `docs/engines/HARNESS2.md`.
