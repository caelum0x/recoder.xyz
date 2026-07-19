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
| **beads** (issue-graph / cross-agent memory) | deeply-fused | recall/remember/promote (`memory/recall/recall-fusion.ts:127`, `memory/lifecycle/candidate-service.ts:119`, `memory-lifecycle.ts:193`); track/close (`conductor/adapters/issue-graph.adapter.ts:52/56/73/79`); ready→dispatch (`agent-os/services/squad-autopilot.service.ts:245`) | Dep-graph **read** (`show`/`sync`) has **no service consumer**. Autopilot dispatch (`squad-autopilot.service.ts:274`) builds the prompt from the flat `ready` title only — never pulls the issue's accumulated `note` evidence + discovered-from/blocked-by lineage. `sync`/`bd vc` is a health probe only; no lifecycle hook commits the Dolt graph after mutations. |
| **openfang** (native Rust NAPI agentic runtime) | deeply-fused | single-shot run substrate (`conductor/conductor-module.ts:514/516/524-526/528`; substrate `bootstrap/index.ts:456/591`) | ~3/4 of the 45-method kernel is dark. (1) Real token counts from the kernel (`openfang-runtime.ts:277-289`) dropped by the buffer-only sink (`openfang-runtime.adapter.ts:224-263`) → billed flat `agent_run`, not tokens. (2) No `continueRun` → `steerWorkspace`/`sendWorkspaceMessage` refuse for path b (native = one blocking turn). (3) Workflow/trigger/event engine + `verifySignedManifest` unmerged. |
| **mem0** (LLM fact-extract + consolidation) | partially-fused | `mem0.search` **read only** (`memory/recall/recall-fusion.ts:96`, reached via `conductor/adapters/brain-memory.adapter.ts:150`) | `mem0.add` has **no product-flow consumer** — read on every launch, never written. Harvest writes only the ephemeral candidate + beads; governed promotion (`memory-lifecycle.ts:157`) writes Postgres + beads.promote but **never mem0.add**. Consolidation/relations/decay never run on tenant data. Loop is not closed. |
| **colbert** (late-interaction rerank + PLAID) | deeply-fused | MaxSim **rerank** of fused pool (`recall-fusion.ts:218`, `rank.ts:78`) and Qdrant top-K (`retrieval-service.ts:75`) — live on every launch/continue | Consumed only as a **post-hoc reranker**. First-stage retriever (`colbert.collections.create` + `colbert.search`) has **no service consumer** — ColBERT never *generates* candidates, so passages single-vector search misses can never be reranked in. |
| **tensorzero** (in-proc embedded gateway) | partially-fused | backend calls only: social reply (`bootstrap/index.ts:874`), memory embed fallback (`bootstrap/index.ts:396`), openfang in-proc (`openfang-runtime.adapter.ts:13-14`) | Flagship **conductor CLI run path does NOT route agent tokens through TensorZero** — `createCliRuntimeSubstrate` built without `resolveInferenceEnv` (`bootstrap/index.ts:452-455`). CLI agents (bulk of spend) bypass gateway → no ledger, no quota, no BYOK routing. `feedback()` (RLHF on merge/approve) has **no caller**. |
| **recoder-governance** (Rust kernel) | deeply-fused | `decide→risk→audit` on every stateful write: conductor (`conductor-module.ts:480…1273`), memory (`memory-lifecycle.ts:128/225`, `forget.ts:86`), agent-os (`governance-gate.adapter.ts:75`), identity (`org.service.ts:67`), inference BYOK (`inference.routes.ts:222`), interop (`interop-chain.service.ts:77/91`), observability (`audit-xdr.adapter.ts:54`) | `enforceTool` (per-tool-invocation teeth) has **no product consumer** — conductor gates only at coarse workspace-op granularity; the live agent tool stream never runs the kernel's forbidden-path/secret/risk block. NAPI `ApprovalManager` store is dead (TS `ApprovalRepository` used instead). `reloadPolicies` never invoked. |
| **pal** (decision layer + agentcomms) | adapter-only | **none** — `computePalPlanDecision` imported only by its MCP file (`pal-mcp.adapter.ts:33`); agentcomms only by `pal-comms.binder.ts:157…189` | No routing/consensus/debate reaches inference-routing, conductor, a2a, or governance. Pure MCP exposure (`recoder.pal-plan`, `recoder.pal-comms`). |
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

1. **beads · `show` (dep-graph neighborhood) → autopilot dispatch.**
   Hook: `agent-os/services/squad-autopilot.service.ts:266` `dispatch()` — before composing `prompt`, add degrade-safe `this.beads.invoke({op:'show', input:{id: issue.id}})` and fold full description + accumulated `note` evidence + discovered-from/blocked-by lineage into the conductor prompt (mirror `brain-memory.adapter.ts` recall enrichment). Turns beads from write-only tracker into read+write agent context. **Effort: M.**
2. **beads · `sync` durability flush → memory/conductor lifecycle.**
   Hook: small interval `bd vc/commit` driver next to `OutboxDrainService` in `memory-module`/`conductor-module`, fired after issue-graph mutations. Control plane commits the Dolt graph instead of external cron. **Effort: S.**
3. **openfang · real token accounting → billing meter.**
   Hook: extend `TurnResult` in `conductor/adapters/openfang-runtime.adapter.ts` to carry `outcome.inputTokens/outputTokens/iterations`; thread onto the terminal `RunEvent.data` so `completion-hook.adapter.ts:101-113` meters `kind:'tokens'` (quantity = in+out) with fallback to `agent_run`. **Effort: M.**
4. **openfang · `continueRun` (multi-turn / steer) → path b.**
   Hook: implement `ConductorSubstrate.continueRun` on `createOpenfangRuntimeSubstrate` — re-invoke `runOpenfang` with the same sanitized `agentName` (reuse-by-name already at `openfang-runtime.ts:254`) so `continueWorkspaceOp`/`sendWorkspaceMessage`/`steerWorkspace` (`conductor-module.ts:589-603`) drive native agents. **Effort: M.**
5. **openfang · `verifySignedManifest` provenance gate + workflow engine.**
   Hook: call `engine.verifySignedManifest` behind `governance.gate.decide` inside `launchOpenfangRun` before `spawnAgent`; expose `registerWorkflow/runWorkflow` through the `agent-workflows` domain driver. **Effort: L.**

### P1 — agent-comms-brain & all-inference

6. **pal · model-router / consensus / debate → inference + conductor + governance.**
   Hooks: (a) `inference/services/inference-routing.service.ts` — call `@recoder/pal` `selectModel`/task-intent-classifier before the napi→loopback tier ladder, record on delivery-outcome audit; (b) `conductor-module.ts` `enrichOpenfangCommand`/launch — `computePalPlanDecision` picks runtime/skill/tool-grant/sandbox + risk-model; (c) high-risk `guardConductorWrite` — route `pal.consensus`/`pal.debate` cross-model check into `governance-gate.service` before approval. **Effort: L.**
7. **tensorzero · CLI-run inference routing → conductor CLI substrate.**
   Hook: wire `resolveInferenceEnv` into `createCliRuntimeSubstrate` at `bootstrap/index.ts:452` — resolver mints a Recoder inference key + points the CLI agent's provider base-URL at the backend OpenAI-compat gateway (`inference/routes/openai-compat.routes.ts`), keyed by run principal + BYOK ref. CLI completions then hit the already-wired entitlement gate (`bootstrap:724`) + usage meter (`bootstrap:733`). **Effort: M. (SERIAL — bootstrap)**
8. **tensorzero · `feedback()` RLHF → merge/approve.**
   Hook: `InferenceRoutingService.feedback()` from the conductor complete lifecycle / agent-os approval path — emit positive feedback on the run's `inference_id` on merge/approve. **Effort: S.**

### P2 — all-writes (governance teeth)

9. **governance · `enforceTool` per-tool seam → live agent tool stream.**
   Hook: `conductor/adapters/mcp-inject.adapter.ts` (+ sidecar tool-exec path in `domains/engines`) — every tool a launched agent invokes traverses `gate.enforceTool(toolName, input, principal, ctx)` (forbidden-path/secret/risk) before execution, deny-biased, sealing denials into the Merkle chain via `recordConductorAudit`. **Effort: M.**
10. **governance · NAPI ApprovalManager + `reloadPolicies`.**
    Hook: either retire the dead NAPI approval surface or back `GovernanceGateService.resolveApprovalClearance` with the kernel approval store; invoke `reloadPolicies` from an agent-os policy-update hook. **Effort: M.**

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
- **beads sync flush** (`memory-module`/outbox lifecycle) — item 2
- **mem0 write half** (`memory-lifecycle.ts`, `memory-module.ts`) — items 11, 12
- **pal inference routing** (`inference-routing.service.ts`) — item 6a
- **tensorzero feedback** (`inference-routing.service.ts` complete/approve path) — item 8
- **governance enforceTool** (`mcp-inject.adapter.ts`, `domains/engines` tool-exec) — item 9
- **governance approval/reload** (`governance-gate.service.ts`) — item 10
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
  it is agent-os surface; but its dispatch feeds conductor, so schedule adjacent — item 1
- **openfang tokens + continueRun** (`openfang-runtime.adapter.ts` + `conductor-module.ts` steer path) — items 3, 4
- **colbert first-stage** (`conductor-module.ts:375` startCodeIntel + `retrieval-service.ts` + `recall-fusion.ts`) — item 13

### Wave 4 — conductor-module.ts writers, batch B (SERIAL via conductor-module.ts)
- **recodergit query enrichment** (`conductor-module.ts` enrichOpenfangCommand + new port method) — item 14
- **recodergit PR review** (`github-module.reviewPR` — separate file, can parallel) — item 15
- **ops-recorder push** (`conductor-module.ts` complete hook + `:927` github path) — item 18
- **multica admission gate** (`conductor-module.ts` createWorkspace) — item 20
- **browser-use preview verify** (`conductor-module.ts` setPreviewUrl / terminal hook) — item 21
- **openfang manifest gate + workflow driver** (`launchOpenfangRun` + agent-workflows) — item 5
- **tmux reconciler scan** (`conductor-module.ts:318` composition + engines client) — item 25
- **dmux layout** (`conductor-module.ts` compare path + read model) — item 26
- **pal conductor decision + governance consensus** (`conductor-module.ts` launch + `governance-gate.service.ts`) — items 6b, 6c

> Waves 3 and 4 both serialize on `conductor-module.ts`: within each wave, only **one**
> conductor-module.ts edit lands at a time; the non-conductor files in the wave
> (`openfang-runtime.adapter.ts`, `github-module`, `retrieval-service.ts`, `recall-fusion.ts`,
> agent-workflows, read model) proceed in parallel around it.

---

## Deeply-fused engines (loop closed — residual items only)

- **recoder-governance** — decide→risk→audit is THE universal write seam. Residual: enforceTool teeth (item 9), dead approval store (item 10).
- **beads** — recall + remember + promote + track + close + ready-dispatch all live. Residual: `show` read (item 1), `sync` flush (item 2).
- **openfang** — native run substrate selected by runtimeId (not fallback). Residual: token accounting (3), multi-turn (4), manifest/workflow (5).
- **colbert** — MaxSim rerank live on every launch/continue + RAG. Residual: first-stage retriever (item 13).
- **tmux** — full run substrate (launch/steer/diff/control-mode). Residual: reconciler introspect (item 25).
