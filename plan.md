# Recoder Platform Status and A2A Control-Plane Plan

Last updated: 2026-05-08

## Goal

Recoder's near-term platform goal is a durable agent control plane spanning `recoder-pm`, `recoder-agents`, `recoder-agency`, `packages/a2a-sdk`, and `tools/a2a-interop`.

The immediate wedge is no longer browser-coding proof through `recoder-web` and `docker-backend`. That lane is operationally expensive and still not reliable enough on Daytona to be the platform's current launch gate. The active plan is now shared A2A contracts, durable agent identity, PM approvals and handoffs, shared workspace ownership, and cross-surface run history that Agency can consume next.

## Sequencing Decision

- `recoder-web` and `docker-backend` are not the active execution lane for this plan.
- Their unresolved runtime issues remain documented below in full as deferred Phase 1 backlog.
- Those runtime issues should not block Phase 2 or later control-plane work unless a hard dependency appears.
- The active execution lane starts with shared A2A control-plane primitives and PM-mediated approvals, not fresh browser-preview proof.

## Production Snapshot

| Surface | URL or scope | Current truth |
| --- | --- | --- |
| Hub | `recoder.xyz` | Core auth and main-site flows are live. |
| Agents | `agents.recoder.xyz` | Authenticated core flow is verified live, including `/v1/agent/start` and follow-up chat rendering. This is the operator and agent-control surface for workspace membership, session visibility, approvals, handoffs, and run activity. |
| PM | `pm.recoder.xyz` | Feature-route `Invalid URL` crash is fixed live. `View in portal` still needs positive UI verification. This is the human approval, reject, decision, and handoff surface, not just a downstream viewer. |
| Agency | `agency.recoder.xyz` | Previously verified on key authenticated routes. It is the Phase 3 consumer of shared control-plane primitives for delivery packaging, client approval loops, and artifact-backed handoff. |
| Shared A2A control plane | `packages/a2a-sdk`, `tools/a2a-interop` | Active implementation lane. Canonical envelope, validation, error taxonomy, state mapping, signed ingress expectations, bridge contracts, orchestration history, and session visibility live here. |
| API Backend | `api.recoder.xyz` | No new public API blocker beyond control-plane and runtime coordination. |
| Web IDE | `web.recoder.xyz` | Deferred runtime-backlog surface. First-turn authenticated build requests reach the coding runtime, but preview proof is still not reliable enough to trust the lane end to end. |
| Docker Backend | `docker.recoder.xyz` | Deferred runtime-backlog surface. Daytona preview routing is explicit and signed preview flow is live, but build-mode runtime and preview responsiveness remain the main backend risk. |
| Docs | `docs.recoder.xyz` | Live. |

## Active Product Proof

Near-term platform work is only complete when the evidence shows:

- reconnecting agents keep identity and session state without duplicate registration
- A2A messages validate, route, and persist history under one shared contract
- PM can pause, approve, reject, or hand off a run with preserved ownership and artifacts
- Agents can show workspace membership, run status, approvals, handoffs, and activity from the same underlying history
- Agency can later consume the same run, artifact, approval, and handoff primitives for delivery workflows without inventing a separate execution model

## Canonical Control-Plane Interfaces

### Shared contract owned by `packages/a2a-sdk`

- Treat the `TaskEnvelope` shape as the canonical cross-surface unit of work: `workspace_id`, `thread_id`, `trace_id`, `requester`, `assignee`, `connector`, `payload`, `result`, `error`, `policy`, and `history`.
- Treat `validateTaskEnvelope`, `validateAuditEvent`, and related ingress validation as the required entry boundary for cross-surface A2A traffic.
- Treat the canonical error taxonomy in `packages/a2a-sdk` as the shared failure language for control-plane work, especially envelope, connector, policy, task, registry, transport, and auth failures.
- Treat connector-native state mapping in `packages/a2a-sdk` as the canonical state bridge. Native states such as `waiting_for_approval` should map into the shared run lifecycle instead of becoming PM-only one-offs.
- Treat audit helpers and structured result or artifact linkage as first-class shared evidence, not UI-local detail.

### Shared bridge and admin contract owned by `tools/a2a-interop`

- Treat signed-envelope ingress expectations in `tools/a2a-interop` as the control-plane baseline for external agent communication.
- Treat these bridge APIs as the canonical bridge execution contract:
  - `GET /api/a2a/bridge/jobs/next`
  - `POST /api/a2a/bridge/jobs/:jobId/result`
  - `POST /api/a2a/bridge/heartbeat`
- Treat these admin and orchestration APIs as the canonical control-plane visibility contract:
  - `GET /api/a2a/policy`
  - `PUT /api/a2a/policy`
  - `GET /api/a2a/orchestrate/:threadId/:traceId/history`
  - `GET /api/a2a/orchestrate/:threadId/:traceId/history/stream`
  - `POST /api/a2a/orchestrate/:threadId/:traceId/override`
  - `POST /api/a2a/orchestrate/:threadId/:traceId/recompute`
  - `POST /api/a2a/bridge/pair`
  - `GET /api/a2a/bridge/sessions`
  - `POST /api/a2a/bridge/jobs`
  - `GET /api/a2a/bridge/jobs/:jobId/result`
  - `GET /api/a2a/bridge/heartbeats`
  - `GET /api/a2a/bridge/heartbeats/:bridgeId`

### Canonical PM, workspace, and handoff semantics

- Treat PM approval, reject, pause, and handoff checkpoints as first-class run states in the plan, aligned with the existing canonical state and intent model instead of being bolted on after execution.
- Treat `input-required` style pauses as the canonical state bridge for approval waits, and preserve explicit handoff intent and audit history across PM, Agents, and downstream consumers.
- Treat workspace identity, agent membership, assignee ownership, session health, and shared activity history as control-plane primitives owned by the shared platform, not UI-specific concepts.
- Route tasks by agent capability, workspace policy, assignee identity, and protocol intent first. Runtime-specific routing remains secondary metadata or a future integration point.

## Desired Architecture

- `packages/a2a-sdk` defines the shared contract for envelope structure, validation, error mapping, state mapping, and audit semantics.
- `tools/a2a-interop` defines the shared bridge and admin API surface for job polling, result submission, heartbeats, policy, history, overrides, recompute, pairing, and session visibility.
- `recoder-pm` owns human approval, reject, decision, and handoff transitions inside the run lifecycle.
- `recoder-agents` owns the operator-facing control surface for workspace membership, agent/session status, approvals, handoffs, and run visibility.
- `recoder-agency` consumes the same run, artifact, approval, and handoff primitives in Phase 3 for delivery packaging and client-facing workflows.
- `recoder-web` and `docker-backend` remain runtime integrations, not the organizing center of the near-term platform plan.
- Sandboxes and previews remain runtime details that can attach evidence to the control plane later; they are not the current sequencing wedge.

## Upstream Intake Rules

When this plan pulls in external repos, the default rule is:

- only use upstream repos that Recoder can directly clone into a Daytona workspace and exercise through normal file, process, log, test, or preview flows

Reference shortlist:

- [daytona-projects/can-be-fork-repos.md](/Users/arhansubasi/recoder.xyz/daytona-projects/can-be-fork-repos.md:1)

Working standard:

- no new external dependency should enter the near-term backlog unless it passes the direct-clone criteria in that file
- reference-only repos can inform design, but they should not become implicit implementation dependencies
- infra-heavy or desktop-first repos should not displace the current control-plane sequence

Preferred upstream order for this plan:

1. `packages/a2a-sdk`
2. `tools/a2a-interop`
3. `a2aproject/a2a-js`
4. `daytonaio/daytona`
5. `anomalyco/opencode`
6. `badlogic/pi-mono`
7. `browserbase/stagehand`
8. `lightpanda-io/browser`
9. `vercel-labs/agent-browser`
10. `e2b-dev/E2B` only for execution-substrate comparison

Phase mapping:

- Phase 2 should lean first on `packages/a2a-sdk`, `tools/a2a-interop`, and `a2aproject/a2a-js` for protocol, routing, session, and history work
- deferred Phase 1 runtime backlog should lean on `daytonaio/daytona`, `anomalyco/opencode`, and `badlogic/pi-mono` for runtime, file, process, and preview validation
- Phase 3 may borrow from `browserbase/stagehand`, `lightpanda-io/browser`, and `vercel-labs/agent-browser` only after the shared control plane is stable
- no phase should assume a fork-first strategy unless upstream use has already failed for product-specific reasons

## Implementation Backlog

Detailed ticket tracking stays in `bd`. This file defines the coding sequence, ownership split, and proof requirements.

## Phase 2: Shared A2A Control Plane

Outcome:

- External agents can connect to the same Recoder workspace with durable identity, stable reconnect behavior, shared history, PM-mediated approvals and handoffs, and one canonical contract for routing, artifacts, and auditability.

Status:

- Active phase.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Stabilize agent registry and session lifecycle | agent registry, bridge session tracking, and workspace membership surfaces | Give external agents durable identity, capability metadata, workspace membership, and reconnect-safe session health without duplicate registration. | A reconnecting external agent keeps the expected identity, workspace membership, and live session state without creating duplicate registry entries. | Depends on the current A2A and registry surfaces staying the canonical path. |
| Canonicalize A2A envelope validation, signing, routing, and error handling | `packages/a2a-sdk` plus A2A ingress and routing surfaces | Make the shared envelope, validation, state mapping, and error taxonomy the required contract for all cross-surface control-plane traffic. | A2A messages validate at ingress, route under one contract, preserve `workspace_id` / `thread_id` / `trace_id`, and fail with canonical error codes instead of surface-local error shapes. | Depends on `packages/a2a-sdk` remaining the single contract package rather than duplicating schema logic across apps. |
| Build Phase 2 around bridge and admin contracts | `tools/a2a-interop` bridge and backend orchestration surfaces | Use the documented bridge polling, result, heartbeat, policy, history, override, recompute, pairing, and session APIs as the shared control-plane API surface. | Bridge job polling, result submission, heartbeat, pairing, and orchestration history can drive the same run from PM and Agents without a separate private contract per surface. | Depends on the current interop contract remaining stable enough to become the Phase 2 control-plane baseline. |
| Integrate PM approval, reject, pause, and handoff into the run lifecycle | `recoder-pm` plus shared orchestration state | Make PM decisions first-class lifecycle transitions instead of downstream annotations. | A run can pause for approval, resume after approval, terminate on reject, or hand off to a new assignee with preserved ownership, artifacts, and audit history. | Depends on shared run history, state mapping, and artifact linkage. |
| Unify run history, artifacts, and auditability across PM and Agents | orchestration history, artifact linkage, and audit-event surfaces | Share prompt, assignee, connector, approval history, logs, artifacts, and decision trail under one history model. | A run exposes its activity, artifacts, policy checks, approvals, and handoffs through one shared history stream rather than per-surface copies. | Depends on stable envelope IDs, trace IDs, artifact capture, and history persistence. |
| Expose shared workspace and run state in Agents | `recoder-agents` operator UI and backend data hooks | Make Agents the operator surface for workspace membership, agent status, session health, approvals, handoffs, and run visibility. | The Agents surface can show workspace membership, run status, approvals, handoffs, and recent activity from the same underlying control-plane history used by PM. | Depends on the shared history and session contract being exposed consistently. |
| Route by capability, workspace policy, assignee identity, and protocol intent | orchestration and assignment logic across control-plane surfaces | Stop assuming `recoder-web` runtime selection is the primary routing dimension. | The same workspace can assign work based on agent capability, policy, assignee identity, and A2A intent, with runtime lane choice preserved only as secondary execution metadata when relevant. | Depends on accurate registry metadata and stable control-plane ownership semantics. |

## Deferred Runtime Context

The runtime issues below are still real. They stay documented because they may matter later, but they are not the active gate for Phase 2 or Phase 3 control-plane execution.

### Verified Working Paths

- `web.recoder.xyz/api/create-sandbox` can return `200`.
- `docker.recoder.xyz/api/container` can create or recover a Daytona-backed project mapping.
- first-turn browser build requests now emit `/api/chat`.
- Daytona preview health can return signed preview URLs for the candidate ports.
- `agents.recoder.xyz` authenticated start flow and follow-up chat rendering are verified live.

### Active Runtime Blockers

#### 1. Build-mode runtime can still end without responding preview proof

Symptoms:

- build-mode chat can return `200`
- starter entry files may mutate, but preview health still reports no responding port
- dev-server logs can remain empty even after the coding backend reports completion

Current implementation areas:

- `recoder-web` build and deep-coding routing
- `docker-backend` sandbox-local coding runtime and dev-server bootstrap
- Daytona preview health and port-probing path

Required outcome:

- build-mode success requires both observable file mutation and a responding preview port
- dev-server startup failures surface clearly instead of leaving a non-responding preview state

#### 2. Runtime can still report success without real file mutation

Symptoms:

- chat returns `200`
- leaked backend output can still describe edits that never land on disk
- browser-created sandboxes can start in the wrong workspace shape if starter bootstrap is not guaranteed

Current implementation areas:

- `recoder-web` build-mode backend routing
- `recoder-web` coding-runtime executor
- `docker-backend` Pi and sandbox-local Opencode runtime adapters

Required outcome:

- no run is marked successful unless sandbox file mutation is observed
- build-mode uses real coding backends (`Pi`, sandbox-local `Opencode`) instead of XML-style output generation

#### 3. Sandbox-local coding backends can still stall under browser load

Symptoms:

- `Pi` or sandbox-local `Opencode` can stall during session start or prompt execution
- the route must fail over quickly instead of hanging the browser request

Current implementation areas:

- `docker-backend` Pi runtime adapter
- `docker-backend` sandbox-local OpenCode bootstrap path
- `recoder-web` build-mode backend routing

Required outcome:

- `Pi` and sandbox-local `Opencode` both fail fast enough to preserve browser responsiveness
- fallback behavior is explicit and deterministic

#### 4. Legacy XML/action output can still leak from runtime-adjacent paths

Symptoms:

- some build-mode responses still arrive in `recoderAction` or `recoderArtifact` form
- malformed `str_replace` output shapes can still appear even after prompt sanitization

Current implementation areas:

- `recoder-web` build-mode backend routing
- `recoder-web` coding-runtime compatibility handling
- `docker-backend` Pi and Opencode adapters

Required outcome:

- build and deep-coding stay on the Daytona-backed runtime lane end to end
- XML-style output is treated as invalid or translated only as a temporary safety net, never as the intended success path

#### 5. Host disk pressure still raises deploy and verifier risk

Symptoms:

- host storage pressure can distort deploy and verifier results

Required outcome:

- runtime verification failures reflect app bugs, not host exhaustion

### Deferred Runtime Architecture

- Browser-facing auth starts at `app`.
- `recoder-web` remains the only browser-facing coding surface.
- `recoder-web` owns the user-facing chat and runtime entry path.
- `docker-backend` provides the coding runtime, preview, and file-operation control path for Daytona-backed execution.
- Sandboxes are disposable execution state, not persistence.
- Browser preview uses direct signed Daytona preview URLs for iframe-safe access.
- Build and deep-coding use real coding backends (`Pi`, sandbox-local `Opencode`) instead of the legacy XML-oriented action lane.

### Runtime Proof Standards

Deferred runtime work is only complete when the evidence shows:

- a successful two-turn verifier run
- real mutation in sandbox files
- preview render matching expected content after the follow-up edit
- no hidden fallback path counted as the success condition
- transport failures surfaced as recoverable runtime behavior instead of opaque success text

### Daytona Capability Mapping

#### Coding / process execution

- Daytona process execution is the main coding runtime substrate for `recoder-web` to `docker-backend` coding runs.
- Recoder implementation work:
  - standardize command execution and runtime session ownership in the existing coding-runtime path
  - standardize long-running session handling for coding loops, dev servers, and verifier flows
  - treat process-session logs as first-class execution evidence for stuck-run debugging
  - prefer direct coding backends (`Pi`, sandbox-local `Opencode`) over the legacy XML action lane for build and deep-coding

#### File operations

- Daytona file APIs should be the source of truth for sandbox mutation, sync, and verification.
- Recoder implementation work:
  - route file read, write, and list verification through the existing `docker-backend` file-operation path
  - record mutation evidence for runtime success checks
  - prevent "success" responses when file-state verification fails
  - use on-disk snapshot checks to confirm `Pi` or sandbox-local `Opencode` actually changed starter entry files

#### Preview

- For browser-facing flows, prefer signed Daytona preview URLs over header-token preview paths.
- Recoder implementation work:
  - make preview URL issuance an explicit responsibility of the existing preview path
  - treat preview readiness and port health as explicit checks, not inferred success
  - detect preview drift when preview stays healthy but rendered content does not match the last verified mutation
  - probe preview URLs the way Daytona documents them, using signed URLs directly when signed

#### Computer use

- Daytona computer-use support is a later runtime lane for GUI automation, testing, screenshots, and desktop workflows.
- Recoder implementation work:
  - keep this as post-runtime-reliability work
  - treat VNC and computer-use as an optional runtime class, not a dependency for fixing the main coding lane

## Phase 1: Deferred Runtime Backlog

Outcome:

- `web.recoder.xyz` build and deep-coding stay on the Daytona-backed runtime lane and can complete a real two-turn coding task with verified mutation and preview proof.

Status:

- Deferred for now. Keep these tasks available as runtime backlog, but do not treat final `recoder-web` preview proof as the current sequencing gate.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Eliminate transport dead ends | `recoder-web` chat/runtime path and `docker-backend` coding-runtime transport | Remove opaque success-looking responses and replace them with recoverable runtime errors or working fallback behavior. | Live verifier shows no opaque `"fetch failed"` response or hidden session-start hang. | Depends on stable runtime error propagation across existing chat and coding-runtime surfaces. |
| Enforce runtime-lane-only build mode | `recoder-web` chat routing and backend runtime selection | Keep build and deep-coding on the Daytona-backed runtime lane for successful production runs. | Two-turn verifier shows `Pi` first or sandbox-local `Opencode` fallback; no hidden legacy action-runner path appears in logs or artifacts for success cases. | May require bypassing generic runtime routing and legacy XML-oriented prompt paths. |
| Require real file mutation for success | `recoder-web` coding-runtime executor and `docker-backend` file-operation verification paths | Mark runs successful only when sandbox file changes are observable. | Sandbox file diff or file-state check proves mutation on both initial and follow-up edit turns. | Depends on trustworthy file read and list verification. |
| Prefer Pi before Opencode in build mode | `recoder-web` build-mode backend routing | Use `Pi` as the first coding backend for build and deep-coding, with sandbox-local `Opencode` only as fallback. | The first browser build request reaches `Pi`, and fallback to sandbox-local `Opencode` happens only on explicit failure or no mutation proof. | Depends on stable provider-key wiring and direct sandbox mutation checks. |
| Make browser-created sandboxes non-empty | Web IDE container bootstrap and starter seeding | Ensure browser-created Daytona workspaces contain the starter files before runtime edits begin. | Fresh browser-created projects expose starter entry files through the file API before the first build prompt. | Depends on removing `skipInit` from the Web IDE container bootstrap path. |
| Turn preview health into a required proof gate | Daytona preview probing and dev-server bootstrap | Do not accept build-mode success until preview health reports a responding port. | Direct probe shows file mutation plus at least one responding preview port, or the run fails explicitly. | Depends on signed-preview probing and dev-server start/recovery reliability. |
| Stabilize sandbox-local fallback lane | `docker-backend` sandbox-local OpenCode bootstrap path | Make sandbox-local execution reliable enough to use when `Pi` fails or times out. | Fallback path starts within the expected timeout window and completes a real mutation-backed run. | Blocked by current sandbox-local bootstrap speed, startup errors, and preview bring-up failures. |
| Reduce host-level false negatives | deploy and verifier environment on the Daytona host | Prevent disk pressure from masquerading as runtime regressions. | Verifier failures correlate to app/runtime bugs rather than host exhaustion during repeated runs. | Depends on host cleanup and capacity discipline outside the chat/runtime code path. |
| Keep upstream runtime references cloneable | runtime research and implementation intake | Ensure any external runtime reference used during Phase 1 can be cloned and exercised directly in a Daytona workspace before it influences product code. | Every adopted external runtime reference is on the direct-clone shortlist or is filed as an exception in `bd`. | Depends on the direct-clone criteria in `daytona-projects/can-be-fork-repos.md`. |

## Phase 3: Agency Delivery Consumer

Outcome:

- `recoder-agency` consumes the shared control-plane primitives for delivery packaging, client approval or revision loops, project and workspace handoff, and artifact-backed delivery state without becoming a separate execution model.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Package delivery on shared run artifacts | `recoder-agency` delivery and packaging surfaces | Reuse shared run history, artifacts, and approvals to assemble delivery packages instead of creating a separate artifact store. | Delivery flow can attach verified artifacts, run history, and PM decisions to a client-facing package. | Depends on mature Phase 2 history and artifact primitives. |
| Add client approval and revision loops on top of PM-controlled runs | `recoder-agency` plus `recoder-pm` decision surfaces | Let client-facing approval or revision requests consume the same approval and handoff primitives already used internally. | A delivery can request revision, request approval, or hand off follow-up work without forking the run model. | Depends on PM approval and handoff lifecycle integration from Phase 2. |
| Reuse shared workspace and project handoff primitives | agency project/workspace handoff surfaces | Make Agency consume control-plane ownership and workspace membership instead of inventing separate assignment semantics. | Project and workspace handoff preserve assignee identity, artifact links, and run history across Agency workflows. | Depends on stable workspace identity and agent membership primitives. |
| Keep Agency downstream from the shared execution model | agency orchestration and delivery workflow design | Prevent Agency from becoming a parallel execution system with incompatible state or audit semantics. | Agency delivery workflows are backed by the same A2A history, artifacts, approvals, and handoffs used by PM and Agents. | Depends on Phase 2 remaining the canonical platform contract. |

## Phase 4: Expansion Lanes

Outcome:

- The same control-plane primitives support broader planning, governance, and optional runtime classes without breaking the shared contract.

Coding task format:

- Task name
- Target subsystem
- Intended outcome
- Proof of completion
- Blocker or dependency

| Task name | Target subsystem | Intended outcome | Proof of completion | Blocker or dependency |
| --- | --- | --- | --- | --- |
| Add planning and product-agent workflows | planning, task graph, and handoff surfaces | Extend the control plane to non-coding planning and product loops. | Planning-agent outputs can be routed, approved, and handed off through the same run lifecycle. | Depends on mature Phase 2 approval and artifact primitives. |
| Add governance and enterprise controls | account, workspace policy, audit, and retention surfaces | Support stricter governance without inventing a separate execution model. | Workspace-level governance rules affect runtime access, approvals, and retention in auditable ways. | Depends on Phase 2 policy and observability foundations. |
| Promote optional runtime classes after control-plane maturity | coding, browser, desktop, and computer-use integrations | Attach additional runtime classes to the same control plane once identity, history, policy, and approval semantics are stable. | A later browser or computer-use run can execute end to end without bypassing the shared control plane. | Depends on Phase 2 stability and deferred runtime backlog results when those integrations matter. |

## Immediate Next Step

1. Stabilize agent registry and session lifecycle.
2. Unify A2A routing, history, artifact, validation, and error-taxonomy primitives.
3. Integrate PM approvals and handoffs into the run lifecycle.
4. Expose shared workspace and run state in Agents.
5. Bring Agency onto those primitives in the next phase.

## Notes

- This is an operational status document plus an implementation backlog, not a ticket tracker.
- Use `bd` for detailed issue tracking and discovered follow-up work.
- Production evidence wins over stale notes.
- `recoder-web` and `docker-backend` are deferred backlog surfaces here, not silently removed.
- Fresh browser-preview proof is not the current prerequisite for control-plane execution unless a concrete dependency appears later.
- Runtime-specific routing is secondary to capability, workspace policy, assignee identity, and protocol intent.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not treated as a product bug.
