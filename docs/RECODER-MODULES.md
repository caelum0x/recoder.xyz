# Recoder — Backend Modules (each OSS stack is a real domain module)

> **Owner mandate (2026-07-14):** stop shipping thin wrapper layers over vendored dists.
> Each OSS stack becomes ONE cohesive **backend module** that *owns* a domain and exposes a
> real interface — the way Cursor didn't "wrap" VSCode, it *became* an editor built on it.
> The conductor + agents consume MODULES, not scattered helpers. This file is the canonical
> module map; each module is planned and built separately.

## The rule of a module

A module is real when it satisfies all of:
1. **One domain, one owner** — a single directory `docker-backend/src/modules/<domain>/` (or a
   `packages/<domain>` when it must be shared with the shell) that is THE place that capability lives.
2. **A cohesive interface** — a `Module` object with the full verb set of the domain, not one function.
   Callers depend on the interface, never on the vendored dist directly.
3. **The OSS stack is the implementation, fully absorbed** — composed/linked/ported in, degrade-safe,
   with the vendored source edited where it serves the fusion (clean exports, removed side-effects).
4. **Truthful health** — `module.health()` reports what's live vs degraded; never fakes readiness.
5. **Governed + audited** — writes go through the policy gate; state-of-record stays Recoder-owned.

Current state across the board: **capabilities exist but are SCATTERED** (a service here, an engine
there, a loader elsewhere). The work is consolidation into modules, then deepening each.

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
**Today:** `@recoder/connectors` package (the real pipeline: registry, gate, dispatch, pi-runner) +
`apps/social` (composition) + `docker-backend/src/connectors/` (ingress). The pieces exist; the backend
doesn't yet own a Social *module* — connectors is a package, apps/social is a separate process.
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
**Today:** `recodergit-service.ts` (in-process lib — done) + `github-engine.ts` (gh CLI) +
`github-engine/pr-review.ts` + the `recoder.github` + `recoder.repo` MCP servers. TWO engines, split.
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
**Today:** `packages/pal` (decision logic ported — done) + A2A scattered across `a2a/*` + the conductor's
runtime dispatch. pal decisions aren't yet the conductor's actual planner on the launch path.
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
**Today:** `tensorzero-client.ts` (embedded gateway native-first `postInference` — done) +
`tensorzero-config.ts` (registry→config — done) but the conductor run loop still calls providers directly.
**Deep target:** THE module every inference routes through; run loop uses `infer()` by default with BYOK
keys as TZ credentials; streaming; feedback wired to delivery outcomes.
**Build:** (a) module wraps the embedded gateway + config-gen; (b) run-loop reroute (G2 step 2);
(c) streaming binding; (d) feedback loop.

---

## 7. AGENT-ENGINE module — `modules/agent-engine/`
**Domain:** autonomous agents + the openfang kernel. **Absorbs:** `crates/openfang` (kernel: agents,
Hands, triggers, workflows, events, KV memory — 45 native methods).

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
**Today:** `openfang-native.ts` (45 methods) + `openfang-runtime.ts` (driver — done) + `/api/agents/openfang/*`
+ cockpit blocks + wsh. The runtime driver isn't dispatchable yet (closed `ConductorRuntimeId` union).
**Deep target:** openfang as a first-class conductor runtime; its Hands as supervised autonomous
background capabilities; its event bus bridged to RunEvents.
**Build:** (a) widen ConductorRuntimeId → dispatch the driver; (b) Hands lifecycle in the conductor;
(c) event-bus bridge.

---

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
