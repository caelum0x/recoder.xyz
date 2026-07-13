# Recoder — Architecture: Apps · Modules · Engines (VSCode→Cursor)

> **Owner mandate (2026-07-14):** stop shipping thin wrapper layers. Each OSS directory IS a
> first-class **module** of Recoder, used deeply and directly FROM ITS OWN DIR (never copied into
> `packages/`). Recoder is composed of modules the way Cursor is VSCode + its own layers.
>
> **See [RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md)** for the canonical layer stack
> (substrate → engines → modules → edges → apps), the engine→module map, and the per-layer laws.
> This file holds the per-module specs.

## The three layers (do not confuse them)

```
  apps/          SURFACES / products. agent-gateway · agent-worker · desktop · wave · social.
    │            They consume the backend over its edges. No capability logic lives here.
    ▼ consume
  MODULES        The capabilities. Each is a DIRECTORY, used in place:
    │              docker-backend  → the HOST module (conductor + agent-os; composes the rest)
    │              packages/*      → shared first-party contracts (agent-os, a2a-sdk, pal, …)
    │              ts/*            → recodergit (github) · dmux (terminal-mux) · extracted-from-openclaw (social)
    │              py/*            → mem0 · colbert (memory) · browser-use · ops-recorder · pal-mcp
    │              crates/*        → openfang (agent-engine) · tensorzero (inference) · recoder-governance
    │              go/*            → beads (memory/issue-graph) · multica (squads/teammates) · ziti + recoder-xds (networking)
    │              c/tmux          → the session substrate
    ▼ drive/consume in place (import dist · read the running server · boot the .node · spawn the sidecar)
  Each module is edited IN ITS OWN DIR where fusion needs it (clean exports, killed side-effects).
```

**Rules:**
- A **module = an OSS directory used directly.** docker-backend imports/spawns/reads it in place. We do
  NOT copy an engine into `packages/`. `packages/*` is only for genuinely-shared first-party contracts.
- A **capability that composes several modules** (e.g. MEMORY = mem0 + beads + colbert) gets a thin
  cohesive **composer** inside the host module (`docker-backend/src/modules/<domain>/`). The DEPTH lives
  in the engine dirs; the composer only fuses + exposes one interface + truthful health. It must MOVE the
  scattered consumer code behind it (not add a 4th copy).
- **Edit the OSS source in its own dir** when the fusion needs it — that dir is ours (e.g. the dmux
  clean-exports edit). Deepen the engine there, don't wrap it shallowly elsewhere.
- `apps/*` never holds capability logic — it calls the modules.

## The rule of a good module composer

When docker-backend composes engine-modules into a domain capability, the composer is real when:
1. **One domain, one owner** — `docker-backend/src/modules/<domain>/` is the single place that fuses the
   engine dirs for that domain (it does not re-implement them).
2. **Cohesive interface** — full verb set of the domain; callers depend on it, never on a raw dist.
3. **Consumes engines from their dirs** — mem0/beads/colbert/openfang/tensorzero are read/imported/spawned
   in place; nothing duplicated.
4. **Truthful health** — reports each engine up|down; never fakes readiness.
5. **Governed + audited** — writes through the policy gate; state-of-record stays Recoder-owned; the
   scattered old consumer code is MOVED behind it (no 4th copy).

Current state: **capabilities exist but are SCATTERED** across the host module. The work is consolidation
behind one composer per domain, then deepening each engine in its own dir.

---

## 1. MEMORY module — `modules/memory/`
**Domain:** everything the agents remember. **Absorbs:** `py/mem0` (semantic vectors) + `go/beads`
(issue-graph shared memory, the dolt store) + `py/colbert` (rerank) + agent-os memory candidates.

**Interface**
```ts
interface MemoryModule {
  recall(query: string, scope?: MemoryScope, opts?: { limit?: number; agentId?: string }): Promise<RecalledMemory[]>
  // fuses mem0 + beads(SQL) + agent-os candidates → colbert-reranked → deduped → provenance-tagged
  remember(fact: MemoryDraft): Promise<{ id: string; store: 'beads' | 'mem0' }>   // candidate, evidence-required
  promote(id: string, review: ReviewRef): Promise<void>                            // the durable gate
  forget(id: string): Promise<void>
  relate(fromId: string, toId: string, kind: RelationKind): Promise<void>          // beads dep edges
  health(): MemoryHealth   // {mem0: up|down, beadsSql: up|down, colbert: up|down}
}
```
**Today (scattered):** `bundle.ts` recall (mem0+beads inline), `beads-memory.ts`, `beads-sql.ts`,
`memory-store-adapter.ts`, `mem0-client.ts`, `colbert-rerank.ts`. Five files, no single owner; recall
logic is duplicated in enrichPrompt.
**Ground-truth corrections:**
- The live semantic path is the **owned `@recoder/mem0` TS package** (OSS Memory over the platform
  Qdrant, `MEM0_COLLECTION=recoder_mem0`), NOT the Python `py/mem0` lib. `py/mem0`'s FastAPI server is
  only an optional `MEM0_BASE_URL` target that **nothing spawns/supervises** — two parallel mem0 impls
  = drift risk to resolve (one owned store contract, or a decisive drop of the Python server).
- `py/colbert`: only the on-the-fly `rerank_server.py` (supervised loopback sidecar via
  `conductor/colbert-daemon.ts`) is wired. `server.py` (real ANN-index search) + the indexing/training
  pipeline are **unused**, and torch/colbert deps are typically absent → rerank degrades to a no-op
  (identity order). A real retriever needs a built index (or a decision to only ever rerank).
**Deep target:** one `MemoryModule` that OWNS recall fusion (mem0∪beads∪candidates → colbert rank →
dedupe → provenance), routes `remember` to the right store by scope, and is the ONLY memory entry point
(enrichPrompt, completion-watcher, the MCP memory tools all call it). mem0 self-activates as an owned
sidecar; beads reads go SQL-direct (done), writes via bd; colbert reranks when up.
**Build:** (a) create the module + move the 5 files behind it; (b) unify the recall path; (c) mem0
owned-sidecar bootstrap; (d) point all callers at the module.

---

## 2. SOCIAL module — `modules/social/`
**Domain:** the agents' presence on human channels. **Absorbs:** `ts/extracted-from-openclaw`
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
**Today:** `@recoder/connectors` package (the real pipeline: registry, hostile-by-default gate, dispatch,
pi-runner) at `ts/extracted-from-openclaw` + `apps/social` (composition) + `docker-backend/src/connectors/`
(ingress + gateway). SEVEN per-channel `ConnectorPort` adapters are live and dispatch-tested
(telegram/slack/signal/imessage/whatsapp/line/feishu); the **discord** adapter is exported but **not
truly extracted** (still OpenClaw bot-core-coupled, ~172 type errors from un-ported clusters). The pieces
exist; the backend doesn't yet own a Social *module* — connectors is a package, apps/social is a
separate process.
**Deep target:** a backend `SocialModule` that supervises the channel drivers in-process (or owns the
apps/social sidecar), exposes `onInbound → dispatchToConductor` so a Telegram message becomes a
conductor workspace end-to-end, and surfaces channel health in the cockpit. openclaw's agents +
skills-reference fold into the reply loop.
**Build:** (a) module wraps connectors + supervises the drivers; (b) wire inbound→conductor; (c)
one channel (telegram) live end-to-end; (d) cockpit social panel.

---

## 3. GITHUB module — `modules/github/`
**Domain:** the agents' complete GitHub capability. **Absorbs:** `ts/recodergit` (recodergit-engine
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
**Grounded correction:** functionally `ts/recodergit` (the `@recoder/recodergit-engine`) is a
**code-knowledge-graph / code-intelligence** engine — it indexes a repo into a graph (symbols, imports,
call chains, impact/blast-radius, hybrid BM25+semantic search) via Tree-sitter + LadybugDB. It is NOT
GitHub-API git plumbing (the analyzer never calls an LLM). The canonical map deliberately files it under
GITHUB as the agents' **repo-comprehension** capability, paired with `gh` ops. Note also: the wrapper pkg
`@recoder/recodergit` (`packages/recodergit`) is **distinct** from the engine (`ts/recodergit/recodergit`)
— the wrapper depends on `@recoder/agent-os`, not the engine — and `ts/recodergit` is NOT a root
workspace member (consumed by dist path + spawn).
**Today:** `recodergit-service.ts` (in-process lib + supervised `recodergit mcp --http` — done) +
`github-engine.ts` (gh CLI) + `github-engine/pr-review.ts` + the `recoder.github` + `recoder.repo` MCP
servers. TWO engines, split.
**Deep target:** one `GitHubModule` unifying recodergit code-intel + gh ops + swarm review behind a
single interface; the MCP tools + the conductor's git-context all call it. The claude-plugin ships into
conductor-provisioned Claude Code workspaces so agents get the recodergit slash-commands natively.
**Build:** (a) module unifies recodergit-service + github-engine; (b) reviewPR wired into the post-run
delivery gate (auto-review merged PRs); (c) claude-plugin distribution into workspaces (needs Node 22
image). **License gate:** recodergit-engine is PolyForm-Noncommercial — resolve before shipping.

---

## 4. TERMINAL module — `modules/terminal/`
**Domain:** multiplexed, restart-survivable terminal sessions — the substrate agents run on.
**Absorbs:** `c/tmux` (owned binary, sessions) + `ts/dmux` (multiplexing: panes, layout/grid, attention,
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
**Today (shallow — the critique):** `substrate-tmux.ts` + `tmux-orchestrator.ts` + `tmux-control-mode.ts`
(the substrate) and `conductor/dmux/{operator-grid,attention}.ts` (TWO functions). tmux and dmux are two
unrelated things; dmux's pane/streaming/worker engines are unused.
**Deep target:** ONE `TerminalModule` where tmux is the session substrate and dmux is the multiplexing
brain over it — pane lifecycle, real-time streaming (control-mode), operator grid, attention — a single
coherent terminal layer the conductor AND the shell's operator view both consume. Unify apps/wave's
separate Go durable-shell onto these same sessions (two restart mechanisms → one).
**Build:** (a) module owns session lifecycle + the dmux pane/layout/attention engines together; (b)
control-mode default-on feeding dmux's pane model; (c) wave shell on the same tmux sessions.

---

## 5. COMMUNICATION module — `modules/communication/`
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
**Today:** `packages/pal` (decision logic ported — done; `agent-os/mcp/pal-plan-engine.ts` registers
`recoder.pal-plan` in-proc behind the interop gate) + A2A scattered across `a2a/*` + the conductor's
runtime dispatch. Only the `pal.plan` slice is ported to `@recoder/pal`; the vendored Python
`py/pal-mcp-server` (multi-model orchestration, conversation threading, `clink` subagent bridge,
codereview/consensus/planner workflows) is **NOT run/supervised** by docker-backend and its heavy
orchestration is stranded. pal decisions aren't yet the conductor's actual planner on the launch path.
**Deep target:** a `CommunicationModule` that IS the conductor's decision layer (every workspace launch
calls `plan()` for runtime/risk/approval) and the A2A spine (agent handoff/messaging). pal's consensus +
escalation available to agents as a "consult" capability.
**Build:** (a) module unifies pal + a2a; (b) launch path calls plan(); (c) consult capability + cockpit.

---

## 6. INFERENCE module — `modules/inference/`
**Domain:** every LLM call. **Absorbs:** `crates/tensorzero` (embedded gateway) + the model registry + BYOK.

**Interface**
```ts
interface InferenceModule {
  infer(req: InferenceRequest): Promise<InferenceResult>     // routing/variants/fallback, in-process
  stream(req: InferenceRequest): AsyncIterable<Chunk>        // (binding: add inference_stream)
  feedback(inferenceId: string, signal: FeedbackSignal): Promise<void>   // merge/approve = positive
  models(): ModelCatalogEntry[]
  health(): InferenceHealth
}
```
**Today:** `tensorzero-client.ts` is a dual-path degrade-safe adapter — native-first
`EmbeddedGateway.boot().postInference` (in-process `tensorzero_gateway_napi.node`) → else a
backend-supervised loopback `gateway` binary (127.0.0.1:3778 / `TENSORZERO_URL`) → else direct provider
calls (never faked). `tensorzero-config.ts` (registry→TZ config — done). All calls route through the
policy gate first, but the conductor run loop still calls providers directly in places.
**Deep target:** THE module every inference routes through; run loop uses `infer()` by default with BYOK
keys as TZ credentials; streaming; feedback wired to delivery outcomes.
**Build:** (a) module wraps the embedded gateway + config-gen; (b) run-loop reroute (G2 step 2);
(c) streaming binding; (d) feedback loop.

---

## 7. AGENT-ENGINE module — `modules/agent-engine/`
**Domain:** autonomous agents + the openfang kernel. **Absorbs:** `crates/openfang` (upstream RightNow-AI
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
**Today:** `conductor/openfang-native.ts` (degrade-safe `.node` loader, ~51 methods, native-first
in-process) + `openfang-runtime.ts` (driver — done) + `openfang-daemon.ts`/`oss-dispatch.ts` +
`/api/agents/openfang/*` + cockpit blocks + wsh. The crate is **gitignored** (upstream clone; only
`Cargo.toml/lock` + `crates/openfang-napi/` un-ignored) and **not built by default** (ENOSPC-avoidance),
so it degrades to undefined/loopback when the `.node` is absent. The runtime driver isn't dispatchable
yet (closed `ConductorRuntimeId` union at `openfang-runtime.ts:35`).
**Deep target:** openfang as a first-class conductor runtime; its Hands as supervised autonomous
background capabilities; its event bus bridged to RunEvents.
**Build:** (a) widen ConductorRuntimeId → dispatch the driver; (b) Hands lifecycle in the conductor;
(c) event-bus bridge.

---

## 8. GOVERNANCE module — `modules/governance/`
**Domain:** the moat — policy decisions + tamper-evident audit. **Engine dir:** `crates/recoder-governance`
— **first-party (MIT), Recoder-OWNED** Rust governance kernel (a 9-crate workspace: types/audit/permission/
approval/routing/kernel/ipc/daemon/napi), deliberately OUTSIDE the gitignored openfang/claw clones. The
napi addon exposes `NapiGovernanceKernel` (`decide`/`enforce_tool`/`route`/`record_audit`/`verify_audit`/
`audit_tip`/`audit_len`) + `NapiApprovalManager`, backed by a SHA-256 Merkle hash-chain byte-interoperable
with `packages/governance/src/audit/merkle-verifier.ts` (golden vector pinned in `tests/ts_interop.rs`).
**Today:** consumed via the `@recoder/governance` TS facade → napi loader, with a **three-tier degrade
ladder**: (1) napi in-process native kernel → (2) UDS daemon (`conductor/governance-daemon.ts`,
`recoder-governance-daemon`) → (3) pure-TS deny-biased fallback (no behavior change when the `.node` is
absent). `conductor/governance-gate.ts` `decideDelivery()` drives the real facade on the delivery path
(covered by `governance-gate.test.ts`); also `pal-plan.ts`, `solo-mode.ts`, `coordination-integration.ts`.
**Deep target:** a `GovernanceModule` that seals EVERY conductor mutation (create/merge/archive/
memory-promote) into the Merkle log and is the single `authorize→risk→audit` gate every module write flows
through. **Build:** module wraps the native kernel; extend the seal to all mutations; audit-verify a full
workspace lifecycle. (Richer policy crates — permission/approval/routing, persistence, checkpoints,
replay — exist as slices; only audit+kernel are exercised via napi today.)

## 9. BROWSING module — `modules/browsing/`
**Domain:** web automation for agents. **Engine dirs:** `py/browser-use` (async LLM browser-agent — Rust
core, CDP, watchdogs) + `@recoder/agent-browser` (in-proc puppeteer) + `@recoder/browser-tools`.
**Today (ground-truth correction):** `py/browser-use` is **NOT run as a sidecar**. The live path is TS-first:
`agent-os/mcp/browser-use-engine.ts` composes the owned `@recoder/agent-browser` over a degrade-safe driver
— puppeteer (dynamic import) OR an HTTP `browser-use` service only when `BROWSER_USE_URL` is set — registering
`browser.navigate/extract/screenshot` behind the interop gate (with neither present, tools return
`not_configured`). The real Python agent is essentially unused. **Deep target:** one `BrowsingModule`
(open/snapshot/extract/verify/navigate) with a **supervised** browser-use service (or its MCP server) actually
running as the owned-venv sidecar and puppeteer as the light fallback; session/profile management,
domain-allowlist wired to governance, artifact capture; the conductor's post-run browser-check calls it.
**Build:** module unifies the two drivers; browser-use owned-venv bootstrap (uv + playwright install).

## 10. SIGNALS module — `modules/signals/`
**Domain:** work-signals + activity observability. **Engine dir:** `py/ops-recorder` (Recoder-authored
FastAPI service, real code in `py/ops-recorder/work-signals/`; detects STUCK GitHub/Linear work → normalized
`WorkSignal` → auto-generated handoff prompt; supervised loopback sidecar :8073, `X-API-Key` auth).
**Today:** `conductor/ops-recorder-daemon.ts` supervises `uvicorn main:app` with an auth preflight (refuses
to spawn keyless) + `conductor/ops-recorder-adapter.ts` (`forwardToOpsRecorder`) + work-signals ingress.
Backend only uses ingest+query; the service's own GH/Linear detectors/sync are bypassed and storage is a
local JSON store. **Deep target:** a `SignalsModule` owning the signal ingress→conductor path
(stuck/blocked/needs-you signals drive the board) with durable shared storage and the detection loop running
against real GH/Linear tokens, default-on. **Build:** module wraps the sidecar; API key minted at boot;
signals feed the board module. **Housekeeping:** `py/ops-recorder` is missing a LICENSE (Recoder-authored,
needs one).

## 11. NETWORKING module — `modules/networking/` (cloud tier — build now, mesh at cloud launch)
**Domain:** zero-trust mesh + service control plane. **Engine dirs:** `go/ziti` (OpenZiti — zero-trust
networking, cryptographic identity per connection, dark services) + `go/recoder-xds` (real Envoy xDS
control plane — dynamic LDS/CDS/RDS over ADS, the live equivalent of `docker-backend/src/network`'s static
bootstrap). **Today:** degrade-safe `ziti-client.ts`; `docker-backend/src/network` generates the static
Envoy bootstrap. **Deep target:** a `NetworkingModule` exposing mesh identity + peer status + LIVE xDS
push as diagnostics now, activated at cloud/teams launch. **Build:** owned-binary builds out-of-band;
health/diagnostics surface; mesh deferred to cloud.

## 12. SQUADS module — `modules/squads/` (agents as teammates)
**Domain:** managed agents as first-class teammates — assignment, squads, autopilots, the team board.
**Engine dir:** `go/multica` ("Multiplexed Information and Computing Agent" — assign issues to an agent
like a colleague; agents claim work, report blockers, update status; **Squads** = a group under a leader
agent that delegates; **Autopilots** = cron/webhook-triggered recurring agent work; WebSocket progress
streaming). This is the human+agent TEAMWORK layer — a direct sibling of Recoder's own conductor/board,
so it FUSES into them rather than running beside them.
**Today:** `multica-client.ts` (degrade-safe loopback client, binary unbuilt). Recoder already owns the
conductor (task lifecycle: enqueue/claim/start/complete), the board (`packages/herd` + cockpit), and
beads (issue graph). **Deep target:** a `SquadsModule` that folds multica's distinctive primitives into
the Recoder conductor: **squads** (assign work to `@FrontendTeam`; a leader agent routes to a member) and
**autopilots** (scheduled recurring agent runs that self-create the issue + route it), on top of the
existing task lifecycle + beads assignment. Not a separate managed-agents server — its IDEAS become
Recoder conductor features. **Build:** (a) squad = a named group of runtimes + a leader-routing policy
over the existing launch path; (b) autopilot = a cron trigger that creates a beads issue + dispatches a
conductor run; (c) surface squads/autopilots in the cockpit board. Port the logic (Go → TS conductor)
rather than supervise the Go binary, since it overlaps our own control plane.

## Module build order

Consolidation-first (each is "gather scattered code behind the interface", then deepen):
1. **MEMORY** — highest leverage (5 scattered files, used every launch), no new deps.
2. **GITHUB** — unify the two engines; the user's headline "GitHub engine for Claude Code".
3. **TERMINAL** — the substrate; deepen dmux from 2 functions to the real pane/stream/layout brain.
4. **INFERENCE** — run-loop reroute (G2 step 2).
5. **COMMUNICATION** — pal becomes the launch-path planner; A2A spine.
6. **AGENT-ENGINE** — ConductorRuntimeId widening → openfang runtime dispatch.
7. **SOCIAL** — inbound→conductor end-to-end + one live channel.

Each module ships as: create `modules/<domain>/` + the interface + move scattered code behind it +
one integration test proving a caller uses the module end-to-end + degrade-safe health. Then deepen.
