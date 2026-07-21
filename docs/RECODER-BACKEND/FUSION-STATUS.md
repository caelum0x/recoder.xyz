# Recoder Engine Fusion Status

> Architecture-fusion map for the backend engine fleet. "Fusion" = an engine capability
> is consumed by a **product-flow service** (conductor / agent-os / memory / inference /
> governance / cloud / observability), reached on a real lifecycle seam. MCP-tool
> definitions, engine adapters, and tests are **not** fusion — they are surface, not wiring.
>
> Thesis order (why each engine exists in the "total product"):
> beads = memory-for-all-agents · openfang = agentic-backend · pal = agent-comms-brain ·
> tensorzero = all-inference · governance = all-writes · mem0/colbert = full-recall ·
> recodergit = code-aware · ops-recorder = signals-feed · multica = squad-coordination ·
> browser-use = verify/research · ziti/xds = networking · dmux = multi-agent-layout.
>
> Fusion levels: **deeply-fused** (write+read on real lifecycle seams) ·
> **partially-fused** (one half of the loop, or read-only) ·
> **adapter-only** (registered + MCP-exposed, zero product-flow consumer).

---

## 1. Engine → Fusion Level → Capability Used → Gap

| Engine | Level | Capability actually consumed (service call site) | The gap |
|---|---|---|---|
| **beads** (issue-graph / cross-agent memory) | **fully-fused** | ONE module facet — `memory.issueGraph()` (`memory/issue-graph/issue-graph.service.ts`) over the single `bd` spawner/argv owner (`engines/adapters/cli/beads.adapter.ts`). Consumers: recall/remember/promote (`memory/recall/recall-fusion.ts`, `memory/lifecycle/candidate-service.ts`, `memory-lifecycle.ts`); track/close with `--actor` audit stamps (`conductor/adapters/issue-graph.adapter.ts` — `conductor:<workspaceId>`); ready→lineage(`show --long`)→dispatch (`agent-os/services/squad-autopilot.service.ts` via `SquadIssuePort`); `stale` board read (`squads/board` route); `vc commit` durability flush + config-gated `bd gc` wisp-decay sweep, both stamped `memory-maintenance` (`memory/lifecycle/memory-maintenance.service.ts`) | — (items 1–2 below **shipped in Wave 3**, `52079d0e8`). The 2026-07 beads refactor (`refactor(beads)` series on `feat/enterprise-s0-p0`) collapsed the three independent `bd` spawners in `backend/src` onto the one `BeadsAdapter`, moved the cohesive facet into MEMORY, and **removed** the agent-exposed `beads.memory_promote` MCP tool (promotion is governed-lifecycle-only). |
| **openfang** (native Rust NAPI agentic runtime) | deeply-fused | ONE cohesive facet — `engines.agentEngine()` (`engines/agent-engine/agent-engine.service.ts`) over the whole 51-method kernel: pure verbs over the napi transport, streaming `run`/`continueRun` over the `launchOpenfangRun` function seam (per-call RunEvent sink). Consumed as the conductor `in_process` substrate's `AgentTurnPort` (`bootstrap/index.ts:532-537`); native workflow subsystem consumed by the agent-workflows `WorkflowEnginePort` native-workflow `tool` handler backed by `createOpenfangWorkflowDriver` (`agent-os-module.ts` default driver). | **Items 1–3 SHIPPED (Wave 3–4).** (1) **Real token accounting** — the per-turn `bufferSink` forwards the kernel's real `input/outputTokens` to the completion-hook meter (`conductor-module.ts:298`, `completion-hook.adapter.ts:186`), surviving the facet indirection. (2) **`continueRun`** multi-turn reuse-by-name drives `continueWorkspace`/`sendWorkspaceMessage`. (3) **Provenance gate** — `createOpenfangProvenanceGate(kernel)` is wired on BOTH surfaces (ONE shared instance): the napi `launch_run` adapter option AND the facet's direct `run()` path; plus the **event-bus publish hook** — the terminal completion path (`completion-hook.adapter.ts`) publishes `workspace.completed` onto the kernel bus via the new `AgentEventPort` (backed by the facet's `publishEvent`) so kernel triggers can fire Hands; the port + additive hook + tests are wired, with live injection riding the next single-writer `conductor-module.ts` dep-passthrough (the completion sink is constructed there, frozen this commit). **Still kernel-export-blocked (honestly dark, not faked):** the autonomous Hands scheduler / cron (`openfang-kernel/src/cron.rs`, `auto_reply`, `supervisor`) and the ~40 channel adapters have NO napi export — they cannot be bridged from TS until the kernel exports them; a poller/scheduler here would fabricate a capability the `.node` does not expose. |
| **mem0** (LLM fact-extract + consolidation) | partially-fused | `mem0.search` **read only** (`memory/recall/recall-fusion.ts:96`, reached via `conductor/adapters/brain-memory.adapter.ts:150`) | `mem0.add` has **no product-flow consumer** — read on every launch, never written. Harvest writes only the ephemeral candidate + beads; governed promotion (`memory-lifecycle.ts:157`) writes Postgres + beads.promote but **never mem0.add**. Consolidation/relations/decay never run on tenant data. Loop is not closed. |
| **colbert** (late-interaction rerank + PLAID) | deeply-fused | MaxSim **rerank** of fused pool (`recall-fusion.ts:218`, `rank.ts:78`) and Qdrant top-K (`retrieval-service.ts:75`) — live on every launch/continue | Consumed only as a **post-hoc reranker**. First-stage retriever (`colbert.collections.create` + `colbert.search`) has **no service consumer** — ColBERT never *generates* candidates, so passages single-vector search misses can never be reranked in. |
| **tensorzero** (in-proc embedded gateway) | partially-fused | backend calls only: social reply (`bootstrap/index.ts:874`), memory embed fallback (`bootstrap/index.ts:396`), openfang in-proc (`openfang-runtime.adapter.ts:13-14`) | Flagship **conductor CLI run path does NOT route agent tokens through TensorZero** — `createCliRuntimeSubstrate` built without `resolveInferenceEnv` (`bootstrap/index.ts:452-455`). CLI agents (bulk of spend) bypass gateway → no ledger, no quota, no BYOK routing. `feedback()` (RLHF on merge/approve) has **no caller**. |
| **recoder-governance** (Rust kernel) | **fully-fused** | `decide→risk→audit` on every stateful write: conductor (`conductor-module.ts:480…1273`), memory (`memory-lifecycle.ts:128/225`, `forget.ts:86`), agent-os (`governance-gate.adapter.ts:75`), identity (`org.service.ts:67`), inference BYOK (`inference.routes.ts:222`), interop (`interop-chain.service.ts:77/91`), observability (`audit-xdr.adapter.ts:54`). **PLUS** all three dark residuals now active (Wave, C1–C4): (a) **`enforceTool` per-tool teeth** on the live recoder-MCP-tool stream via the narrow `governance.toolExecGate()` port injected into the interop `createInteropExecutor` chokepoint (`engines/mcp/mcp-host.ts`); (b) durable Postgres `ApprovalRepository` is the **sole** clearance store (dead napi `ApprovalManager` retired); (c) `reloadPolicies` is a first-class `GovernanceKernelPort` verb driven from an agent-os `policy.updated` hook (`bootstrap/index.ts` Phase-5a). | — items 9–10 below **shipped (C1–C4)**. **TRUTHFUL BOUNDARY:** the `enforceTool` teeth gate the **recoder-MCP-server tool stream only** — incl. the high-side-effect `sandbox_exec` / `workspace_merge` tools — because that stream is the one funnel through the executor. They do **NOT** see a launched agent's own in-worktree `bash`/file/secret ops, which never cross the executor and stay under conductor's coarse `guardConductorWrite→decide`. A strict improvement over the previously-ungated MCP surface, **not** full per-tool coverage of the agent's native side effects. |
| **pal** (agent-comms-brain) | **deeply-fused** | ONE cohesive facet — `engines.pal()` (`engines/pal-brain/pal-brain.service.ts`) over two seams: pure owned-TS verbs compose `@recoder/pal` in-proc (`plan`/`routeModel`/`planLaunch`/`escalate`), sidecar verbs compose the frozen pal-mcp `EngineClientPort` (`consensus`/`debate`/`health`, `invoke(op=agentcomms)`). Three product-flow consumers, each over its own port (no domain imports `@recoder/pal`): **(a)** inference model routing — `inference-routing.service.ts` via `PalRoutePlannerPort`←`createInferenceRoutePalAdapter` (`routeModel`); **(b)** conductor launch — `createWorkspace` via optional `ConductorPlanPort`←`createConductorPlanAdapter` (`planLaunch`, caller choices always win, absent-port = no-op); **(c)** governance high-risk gate — `governance-gate.service.ts decide()` via the folded `pal-consensus.adapter.ts`←`consensus()`, consulted only on `allow`+`risk>=high`+`!clearedByApprovalId`. | `debate` on the facet has no backend consumer yet (governance uses `consensus`); `escalate` reserved for a conductor run-loop completion gate that doesn't exist today. `pal.route`/`pal.models`/`clink`/`thinkdeep`/… stay deliberately-dark MCP affordances on `pal-comms.binder` (no backend decision seam). |
| **recodergit** (code-intelligence) | partially-fused | `index` **only**, on create (`conductor-module.ts:380` → `code-intel.adapter.ts:64` → `RecoderGitService.indexRepo`) | Code-**aware** payload never merged. Launch prompt (`enrichOpenfangCommand`) is memory-aware but never queries `domainMap`/`definition`/`symbol_search`. PR review (`github-module.reviewPR`) is raw `gh` diff, MCP-only, no blast-radius. `reindexOnPush` has **no consumer** → index goes stale on first commit. |
| **browser-use** (browsing + verification) | adapter-only | **none** — `executeBrowserVerification` only behind `browser.verify` MCP (`browser-session.binder.ts:57`) | No run-lifecycle flow verifies a preview: `workspace.preview_url` (`conductor-module.ts:1158-1174`) and the terminal complete hook (`:272-274`) store the URL but never open/assert/screenshot it. `browser-check` workflow step + `browserChecks[]` are inert labels. `.ext().run_task` autonomous browsing unused. |
| **ops-recorder** (stuck-work signals) | partially-fused | signal→RunEvent bridge (`observability.routes.ts:184` → `work-signals.service.ts:121-137`, wired `bootstrap/index.ts:954/960`) | **Pull-only** — fires only when a human opens `GET /signals`; no autonomous poller (the `observability-module.ts:308` timer drives alerts, not signals). Reverse push (`forwardToOpsRecorder`, `ops-recorder-adapter.ts:168`; `sync.github`/`sync.linear`) has **no service consumer** — conductor never pushes run-level stuck signals. |
| **multica** (squad routing + coordination) | partially-fused | `SquadService.route` referenced (`squad-autopilot.service.ts:262`) but **DEAD** — gated by `if (!this.squads || !this.squadId)` (`:260`) and `squadId` never wired at bootstrap; Go engine has **no service consumer** | Coordination capability not live. `route` never runs (no `squadId` threaded at `agent-os-module.ts:149`). `conflictStatus`/`coordinationStatus`/`requestReroute` are MCP-only. Conductor admission never consults multica → nothing prevents double-assigning a contended issue. |
| **ziti** (zero-trust mesh) | partially-fused | read-only diagnostics (`cloud.routes.ts:494` GET /mesh; `cloud-module.ts:224` health rollup) | `enroll()` (per-endpoint identity) has **no service consumer** (MCP-only). Sandboxes never enrolled, previews dial public URLs, conductor has zero mesh refs, `repo.upsertMeshEndpoint` (`cloud.repository.ts:569`) orphaned. No per-tenant scoping / dial-over-overlay. |
| **recoder-xds** (Envoy xDS control plane) | adapter-only | read-only **status** (`mesh-diagnostics.service.ts:85/128`, cloud health) | Real capability — **programming a live data plane** — entirely unmerged. Adapter is read-only (no SetSnapshot). Engine seeds from static config file/env only. Preview edges bypass it (`preview-target.adapter.ts` uses DNS subdomains). `cloud_mesh_endpoints.xds_cluster` dormant. ext_authz seam unwired. |
| **tmux** (local session substrate) | deeply-fused | launch/capture/steer/diff (`conductor-module.ts:517/958-994/658/1115/609/295`; injected `bootstrap/index.ts:591`) | Box-wide introspection (`list-sessions/windows/panes`) is MCP-only. Reconciler probe seam unwired: `createSubstrateScan()` called with no deps (`conductor-module.ts:318`) → `sessions` defaults to 'none visible' → `reconcile()` (`:763`) can't detect orphaned/leaked sessions or record-vs-session drift. |
| **dmux** (pane/layout multiplexer) | partially-fused | pane-**attention** heuristics ported (`conductor/attention/attention-classifier.ts`, consumed `conductor-module.ts:1060`) | Pane/**layout** capability (`createPanes`/`applyLayout('agent-grid')`/`launchDmuxConsole`) has **no product consumer** — MCP-only. Parallel agents in `recoder-*` sessions are never arranged into the operator grid; no attach hint surfaced. |

---

## 2. Prioritized Fusion Backlog (under-fused engines)

Ordered by the total-product thesis. Each item: **engine → capability to merge → exact
product-flow hook (file/function) → effort**. Fully deeply-fused engines (governance's
core seam, colbert rerank, tmux run-substrate) still carry *residual* items; those are
included at their real (lower) priority.

### P0 — memory-for-all-agents & agentic-backend (thesis core)

1. **beads · `show` (dep-graph neighborhood) → autopilot dispatch.** ✅ **SHIPPED (Wave 3, `52079d0e8`).**
   Landed as `pullLineage` (`bd show --long`) + `composeLaunchPrompt` in `agent-os/services/squad-autopilot.service.ts` — the dispatched prompt weaves the issue's accumulated NOTE evidence + dependency lineage; degrade-truthful (a failed `show` never blocks the dispatch). Now typed through `SquadIssuePort` over `memory.issueGraph()`.
2. **beads · `sync` durability flush → memory/conductor lifecycle.** ✅ **SHIPPED (Wave 3, `52079d0e8`).**
   Landed as the `MemoryMaintenanceService` interval sweep (`memory/lifecycle/memory-maintenance.service.ts`, started from `memory-module.start()`): `bd vc commit` seals the working set, truthful "nothing to commit" preserved. The beads refactor added the config-gated `bd gc` step (`memory.gcEverySweeps`, 0=off) and `memory-maintenance` actor attribution.
3. **openfang · real token accounting → billing meter.** ✅ **SHIPPED (Wave 3–4).**
   The per-turn `bufferSink` (built in `createOpenfangRuntimeSubstrate`) keeps `log` for `capture()` and forwards the terminal token-bearing event to the late-bound completion-hook sink (`conductor-module.ts:298`); `completion-hook.adapter.ts:186` meters real `kind:'token'` (quantity = in+out) on top of the flat `agent_run`. Re-homed behind the `AgentEngineService` facet whose `run`/`continueRun` carry a PER-CALL sink over the `launchOpenfangRun` FUNCTION seam, so the buffer sink survives the facet indirection.
4. **openfang · `continueRun` (multi-turn / steer) → path b.** ✅ **SHIPPED (Wave 3–4).**
   `createOpenfangRuntimeSubstrate` consumes the facet's `continueRun` (reuse-by-name) via the narrow `AgentTurnPort`, so `continueWorkspaceOp`/`sendWorkspaceMessage` drive native agents; `steerWorkspace` (send-keys) still refuses truthfully (`supportsInteractiveKeys=false`).
5. **openfang · `verifySignedManifest` provenance gate + workflow engine.** ✅ **SHIPPED (Wave 3–4).**
   `createOpenfangProvenanceGate(deps.kernel)` is constructed ONCE in `engines-module.ts` and shared into BOTH the napi adapter's `launch_run` option (`createNapiEngineClients({openfang:{governance}})`) AND the facet's `run()`→`launchOpenfangRun(deps.governance)` path, so every fresh spawn is gated on both surfaces (deny-biased on fault, skipped-truthfully only when the kernel port is absent). The native workflow engine gained its FIRST consumer: a consumer-owned `WorkflowEnginePort` native-workflow `tool` handler in `packages/agent-workflows`, backed by `createOpenfangWorkflowDriver` and registered on the agent-os default `AgentOsWorkflowRunnerDriver`.

### P1 — agent-comms-brain & all-inference

6. **pal · model-router / consensus / planLaunch → inference + conductor + governance.** ✅ **CONSUMED (facet fusion, 5 commits).**
   Landed as the `engines.pal()` `PalBrainService` facet + three consumer ports (no domain imports `@recoder/pal`):
   (a) **routeModel in inference behind the facet** — `inference-routing.service.ts` resolves the model through `PalRoutePlannerPort` (`inference/ports/pal-route.port.ts`) backed by `createInferenceRoutePalAdapter(engines.pal())`; the route-brain internals moved into the facet, inference re-declares pal's string unions locally (parity-guarded) and takes zero `@recoder/pal` imports; a facet decline degrades to the caller's requested model.
   (b) **planLaunch in the conductor launch** — `createWorkspace` consults the optional `ConductorPlanPort`←`createConductorPlanAdapter` after the governance write-allow and before substrate/skill selection; pure in-proc (zero launch latency); explicit caller `runtimeId`/substrate is never overridden, absent-port ⇒ byte-identical launch, throwing-port never fails the launch; `plan.risk`/`approvalRequired` land on the launch audit metadata.
   (c) **consensus in the governance high-risk gate** — the Wave-4 `pal-consensus.adapter.ts` is folded onto the facet's `consensus()` and wired via `governance.setConsensusReview`; `decide()` consults it only on `effect==='allow'` AND `riskTier>=high` AND `!clearedByApprovalId`; a `block` downgrades to `needs_approval` sealed into the Merkle audit chain, while abstain/unavailable/timeout/throw leave the kernel allow standing. Latency trade: one bounded `await` (governance-owned `DEFAULT_CONSENSUS_TIMEOUT_MS`=20 s) on the rarest, highest-risk decisions only — never compounded, degrade keeps the gate responsive.
   **Still dark (truthfully, no faked consumer):** `debate` is on the facet but unconsumed by any backend service (a later optional escalation of `consensus`); `escalate` activates the `@recoder/pal` expert-escalation ladder but is reserved for a conductor run-loop completion gate that does not exist today; `pal.route`/`pal.models` remain agent-callable MCP affordances on `pal-comms.binder` (parallel thin surface over the same transport, left as-is), and `clink`/`thinkdeep`/`codereview`/`secaudit`/`refactor`/`conversation_memory` stay sidecar tools behind the interop gate.
7. **tensorzero · CLI-run inference routing → conductor CLI substrate.**
   Hook: wire `resolveInferenceEnv` into `createCliRuntimeSubstrate` at `bootstrap/index.ts:452` — resolver mints a Recoder inference key + points the CLI agent's provider base-URL at the backend OpenAI-compat gateway (`inference/routes/openai-compat.routes.ts`), keyed by run principal + BYOK ref. CLI completions then hit the already-wired entitlement gate (`bootstrap:724`) + usage meter (`bootstrap:733`). **Effort: M. (SERIAL — bootstrap)**
8. **tensorzero · `feedback()` RLHF → merge/approve.**
   Hook: `InferenceRoutingService.feedback()` from the conductor complete lifecycle / agent-os approval path — emit positive feedback on the run's `inference_id` on merge/approve. **Effort: S.**

### P2 — all-writes (governance teeth)

9. **governance · `enforceTool` per-tool seam → live MCP-tool stream.** ✅ **SHIPPED (C1–C3).**
   Landed as the narrow `ToolExecEnforcementPort` (`governance/ports/tool-exec-gate.port.ts`) + `createToolExecGate` (`governance/services/tool-exec-gate.ts`) bound to the gate's deny-biased + Merkle-sealing `gate.enforceTool` (`governance-gate.service.ts:238`), exposed as `governance.toolExecGate()` and injected at bootstrap into the engines host → interop `InteropHostBundle.toolEnforcer` → the `createInteropExecutor` chokepoint (`engines/mcp/mcp-host.ts`). Every **authorized recoder-MCP tool call** runs the kernel forbidden-path/secret/risk block **after** interop `authorize→risk` and **before** dispatch; a denied verdict throws `GovernanceDeniedError` (fail-closed, inner engine never touched) which interop maps to a non-`completed` (`'failed'`) wire outcome. **Dual-audit on denial:** the gate has already Merkle-sealed the authoritative deny (secret-free: tool name + `inputLength`), and interop emits a second `'failed'` wire-audit row. Principal derives from the **edge-bound caller**, never the caller-controlled `actor.agentId`; absent enforcer ⇒ truthful pass-through (no fake-allow). **BOUNDARY (truthful):** MCP-tool-stream only (incl. `sandbox_exec` / `workspace_merge`) — NOT the agent's native in-worktree `bash`/file/secret ops (those stay under conductor's coarse `guardConductorWrite→decide`). Strict improvement over the previously-ungated MCP surface, not total coverage. The superseded test-only `governed-sidecar.adapter.ts` (which decorated a low-level seam the live stream never traverses) was deleted + its barrel re-exports pruned. **Effort: M.**
10. **governance · retire dead NAPI ApprovalManager + activate `reloadPolicies`.** ✅ **SHIPPED (C1, C4).**
    Retired: the in-proc non-durable napi `ApprovalManager` clearance store is gone; the durable Postgres `ApprovalRepository` (already the fallback, and what the approvals routes + `ApprovalService` seal into the same Merkle chain) is now the **sole** clearance path. Removed the `approvalStore` field + `submit/resolve/list/count` passthrough, dropped the never-passed `napiApprovalHandle` knob, deleted `napi-approval-store.adapter.ts` + `approval-store.port.ts`. Activated: `reloadPolicies` is a first-class `GovernanceKernelPort` verb (`ReloadPoliciesResult` relocated to `kernel.port.ts`); the napi rung drives a live bundle swap via the addon handle while daemon/ts rungs report `{ reloaded:false }` truthfully. An agent-os `PolicyUpdateEmitter` fires `policy.updated` after a durable space-policy write, and a bootstrap Phase-5a hook calls `governance.reloadPolicies(configJson)` — fail-closed inside the kernel (a rejected config leaves the OLD policy live), logging the truthful `{reloaded, reason}`. **Effort: M.**

### P3 — full-recall (mem0/colbert write & first-stage)

11. **mem0 · `mem0.add` (close write half) → governed promotion.**
    Hook: inject `Mem0Port` into `MemoryLifecycleDeps` (built at `memory-module.ts:88`); immediately after `repository.upsertItem` in `memory-lifecycle.ts:157` (allow verdict) fire best-effort `mem0.add([...], {userId, metadata:{scope, memoryId}})`; mirror the supersedes edge (`:171`) into mem0's graph. Fire-and-forget. **Effort: M.**
12. **mem0 · decay/consolidation sweep.**
    Hook: periodic `MemoryModule` maintenance job (not a launch hook) to exercise decay. **Effort: S.**
13. **colbert · first-stage retriever (`collections.create` + `search`).**
    Hooks: (a) `conductor-module.ts:375` `startCodeIntel` — add per-repo `colbert.collections.create` over repo chunks keyed by repoId; (b) `memory/retrieval/retrieval-service.ts:72` — issue `colbert.search` as a parallel candidate generator alongside Qdrant, union, then existing MaxSim rerank; (c) add `gatherColbert` source to `recall-fusion.ts:193` Promise.all pool. Degrade-safe. **Effort: L.**

### P4 — code-aware (recodergit)

14. **recodergit · query (`domainMap`/`definition`/`symbol_search`) → launch enrichment.**
    Hook: `conductor-module.ts` `enrichOpenfangCommand` (+ CLI brain path) — after building prompt, call `domainMap(repoId)` + task-seeded `definition` and fold a compact code-map/entrypoints/symbols block via a new `CodeIntelPort.queryContext(repoId, seedTerms)`. **Effort: M.**
15. **recodergit · `find_references`/`call_graph` → PR/review flow.**
    Hook: promote `github-module.reviewPR` into a product-flow caller — after `gh pr diff`, extract changed symbols, call `find_references('upstream')` + `call_graph('downstream')`, attach blast-radius section to the merge/review payload. **Effort: M.**
16. **recodergit · `reindexOnPush` freshness.**
    Hook: `conductor/adapters/completion-hook.adapter.ts` — call `RecoderGitService.reindexOnPush` alongside beads `completeWork` so the graph refreshes on commit. **Effort: S.**

### P5 — signals-feed & squad-coordination

17. **ops-recorder · autonomous poller.**
    Hook: scheduled poller in `ObservabilityModule.start()` (mirror alert timer at `observability-module.ts:308`) calling `workSignals.refresh()` on interval. **Effort: S.**
18. **ops-recorder · `forwardToOpsRecorder` push + `sync.github`.**
    Hooks: (a) conductor complete/fail/stuck hook → `forwardToOpsRecorder(WorkSignalIngest)`; (b) `conductor-module.ts:927` githubStatus/githubRepos path or a scheduled tick → `sync.github` detector op. **Effort: M.**
19. **multica · `SquadService.route` (wire `squadId`).**
    Hook: add `squadId` config field (`agent-os/config.ts`), pass at `agent-os-module.ts:149` so ready issues route through `SquadService.route`; thread `routedAgentId` into `SquadConductorPort.dispatch` → `conductor.createWorkspace` (`bootstrap/index.ts:627`). **Effort: M. (SERIAL — bootstrap)**
20. **multica · Go engine conflict/work-lock admission gate.**
    Hook: `conductor-module.ts` `createWorkspace` (alongside `WorkLockPort.acquire`) — call `CoordinationEnginePort.conflictStatus()`/`coordinationStatus()` to skip/defer a contended issue; on conflict call `requestReroute()` (governance-gated). **Effort: L.**

### P6 — verify/research & networking & layout

21. **browser-use · `executeBrowserVerification` → preview verification.**
    Hook: resolve `browser-use` EngineClientPort into conductor (like recodergit/beads); at `setPreviewUrl` (`conductor-module.ts:~1158-1174`) and/or terminal hook (`:272-274`), fire-and-forget `executeBrowserVerification(client, {url, taskId, assertions})`, attach summary + screenshot artifact, route write through governance audit. **Effort: M.**
22. **browser-use · `browser-check` workflow driver + `.ext().run_task`.**
    Hooks: agent-os workflow — make `browser-check` step live (run per `browserChecks[]` entry, emit verification artifact); expose `.ext().run_task` as an agent-os research/verification step. **Effort: M.**
23. **ziti · `enroll()` → sandbox/preview connectivity.**
    Hook: `cloud/services/provisioner.service.ts` — on provision-success call `enroll({tenantId, service: sandboxId})`, persist via `repo.upsertMeshEndpoint`, scope per tenant; `preview.service` resolves to the Ziti registration instead of a public host. **Effort: L.**
24. **recoder-xds · control-plane WRITE (SetSnapshot) → preview/conductor.**
    Hooks: add mesh-port WRITE + `/internal/cloud/network-config` emitting a live NetworkConfig (CDS cluster + RDS route per active preview + workspace, ext_authz → interop guard); `PreviewDeployService.deploy()` + conductor launch upsert into `cloud_mesh_endpoints` and bump config; boot recoder-xds with `XDS_CONFIG_URL`; capture snapshot version as governed evidence. **Effort: L.**
25. **tmux · introspect → reconciler scan seam.**
    Hook: composition root — `createSubstrateScan({ sessions: () => tmuxIntrospect.listSessions(), worktrees: () => gitWorktreeList() })` so `reconcile()` (`conductor-module.ts:763`) GCs orphaned `recoder-*` sessions and corrects record-vs-session drift. **Effort: S.**
26. **dmux · layout port → F3 parallel-run group.**
    Hook: `conductor-module.ts` compare/parallel-run path — when a group forms, `dmuxCreateWorkspacePanes({target: groupSessionName, count: liveWorkspaces, layout:'agent-grid'})` via `DmuxAdapter.layout()`; expose `dmuxVisibleSessions()`/`dmuxAttachCommand()` through the WorkspaceView/compare read model. Degrade-safe. **Effort: M.**

---

## 3. Fusion Waves (disjoint file surfaces → parallel-safe)

**Serialization points:** `conductor-module.ts` and `bootstrap/index.ts` are single-writer.
Any two items that both edit the *same* one of these files must run in **different** waves
(serial). Items are grouped so that within a wave, file surfaces are disjoint.

### Wave 1 — no conductor-module.ts, no bootstrap (fully parallel)
- **beads sync flush** (`memory-module`/outbox lifecycle) — item 2 — ✅ shipped (Wave 3)
- **mem0 write half** (`memory-lifecycle.ts`, `memory-module.ts`) — items 11, 12
- **pal inference routing** (`inference-routing.service.ts`) — item 6a
- **tensorzero feedback** (`inference-routing.service.ts` complete/approve path) — item 8
- **governance enforceTool** (`governance/tool-exec-gate`, interop `createInteropExecutor`, bootstrap inject) — item 9 — ✅ shipped (C1–C3)
- **governance approval/reload** (`governance-gate.service.ts`, `kernel.port.ts`, agent-os `policy.updated` hook) — item 10 — ✅ shipped (C1/C4)
- **ops-recorder poller** (`observability-module.ts`) — item 17
- **recodergit reindexOnPush** (`completion-hook.adapter.ts`) — item 16
- **browser-use workflow driver** (agent-os workflow) — item 22
- **ziti enroll** (`provisioner.service.ts`, `preview.service`) — item 23
- **recoder-xds write** (cloud mesh port, `preview-deploy.service.ts`, internal route) — item 24

### Wave 2 — bootstrap/index.ts writers (SERIAL among themselves via bootstrap)
- **tensorzero CLI routing** — `bootstrap/index.ts:452` (createCliRuntimeSubstrate) — item 7
- **multica squadId wire** — `bootstrap/index.ts:627` + `agent-os-module.ts:149` — item 19
> Both touch bootstrap → run **one at a time**. Pair each with a Wave-1-style disjoint
> partner only if that partner does not also touch bootstrap.

### Wave 3 — conductor-module.ts writers, batch A (SERIAL via conductor-module.ts)
- **beads show → dispatch** (`squad-autopilot.service.ts`, no conductor edit) can co-run —
  it is agent-os surface; but its dispatch feeds conductor, so schedule adjacent — item 1 — ✅ shipped (Wave 3)
- **openfang tokens + continueRun** (`openfang-runtime.adapter.ts` + `conductor-module.ts` steer path) — items 3, 4 — ✅ shipped (Wave 3–4)
- **colbert first-stage** (`conductor-module.ts:375` startCodeIntel + `retrieval-service.ts` + `recall-fusion.ts`) — item 13

### Wave 4 — conductor-module.ts writers, batch B (SERIAL via conductor-module.ts)
- **recodergit query enrichment** (`conductor-module.ts` enrichOpenfangCommand + new port method) — item 14
- **recodergit PR review** (`github-module.reviewPR` — separate file, can parallel) — item 15
- **ops-recorder push** (`conductor-module.ts` complete hook + `:927` github path) — item 18
- **multica admission gate** (`conductor-module.ts` createWorkspace) — item 20
- **browser-use preview verify** (`conductor-module.ts` setPreviewUrl / terminal hook) — item 21
- **openfang manifest gate + workflow driver** (`launchOpenfangRun` + agent-workflows) — item 5 — ✅ shipped (Wave 3–4: gate on both surfaces + `WorkflowEnginePort` native-workflow `tool` handler)
- **tmux reconciler scan** (`conductor-module.ts:318` composition + engines client) — item 25
- **dmux layout** (`conductor-module.ts` compare path + read model) — item 26
- **pal conductor decision + governance consensus** (`conductor-module.ts` launch + `governance-gate.service.ts`) — items 6b, 6c — ✅ shipped (facet fusion: `engines.pal()` + conductor `ConductorPlanPort` + governance high-risk `consensus()` hook; inference `routeModel` 6a shipped alongside)

> Waves 3 and 4 both serialize on `conductor-module.ts`: within each wave, only **one**
> conductor-module.ts edit lands at a time; the non-conductor files in the wave
> (`openfang-runtime.adapter.ts`, `github-module`, `retrieval-service.ts`, `recall-fusion.ts`,
> agent-workflows, read model) proceed in parallel around it.

---

## Deeply-fused engines (loop closed — residual items only)

- **recoder-governance** — decide→risk→audit is THE universal write seam, and all three dark residuals are now live: the `enforceTool` per-tool teeth gate the recoder-MCP-tool stream at the interop executor chokepoint (item 9, shipped C1–C3), the durable `ApprovalRepository` is the sole clearance store and `reloadPolicies` hot-swaps kernel policy from an agent-os hook (item 10, shipped C1/C4). Truthful boundary: the teeth gate MCP-server tool calls (incl. `sandbox_exec`/`workspace_merge`), not the agent's native in-worktree shell/file ops — those stay under conductor's coarse gate. No open governance backlog item.
- **beads** — FULLY fused: recall + remember + governed promote + track/close (actor-stamped) + ready→lineage→dispatch + stale board read + durability flush + config-gated gc all live behind the ONE memory-owned facet (`memory.issueGraph()`) over the single `BeadsAdapter` spawner. Residuals (items 1, 2) shipped in Wave 3; no open beads backlog item.
- **openfang** — native run substrate selected by runtimeId (not fallback). Residual: token accounting (3), multi-turn (4), manifest/workflow (5).
- **colbert** — MaxSim rerank live on every launch/continue + RAG. Residual: first-stage retriever (item 13).
- **tmux** — full run substrate (launch/steer/diff/control-mode). Residual: reconciler introspect (item 25).
- **pal** — the agent-comms-brain behind the ONE `engines.pal()` facet: `routeModel` on the inference dispatch path, `planLaunch` advising the conductor launch (caller choices win), `consensus` gating high-risk governance allows. Residual: `debate`/`escalate` on the facet but unconsumed by design (no faked consumer); `pal.route`/`pal.models`/`clink`/sidecar tools stay agent-facing MCP affordances.
