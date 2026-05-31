# Recoder Spaces Platform Status and Agent Control-Plane Plan

Last updated: 2026-05-14

## Goal

Recoder Spaces is the workspace where humans and AI agents build, coordinate, review, and deploy software together.

- MCP gives agents tools.
- A2A lets agents talk.
- Recoder Spaces gives agents a workplace.

The product thesis is: one workspace, many agents, controlled delivery. The core product is a shared task room where humans, coding agents, PM agents, review agents, deployment agents, browser agents, and later desktop agents work together through tasks, artifacts, approvals, logs, and audit trails.

Recoder should compete on orchestration, governance, and delivery reliability rather than model quality. The control plane owns agent identity, workflow state, approval state, and orchestration history. Daytona sandboxes and other runners stay execution substrates.

## Current Shipped Baseline

The current implementation has moved the app away from session/token-era commercial logic and toward the paid Spaces model.

- `Create your first Space` is now the primary signed-in conversion path.
- `Connect an agent` is now the first activation milestone.
- The dashboard and Spaces surfaces expose the task -> artifact -> PR -> preview -> approval path as the main product loop.
- Auth, billing, CLI quota/proxy, user quota, usage tracking, analytics, plan config, and docs examples now derive legacy quota fields from shared commercial entitlements.
- Commercial entitlements now center on Spaces, connected agents, approval workflows, artifact retention, and preview deploy capacity.
- Preview deploy artifacts and private preview access attach to the control-plane model as run/task evidence.
- `recoder-edge` exists as an in-repo scaffold for preview routing, private preview access, and public-route security policy.

## Current Paid-User Launch Gate

The remaining near-term goal is not more roadmap breadth. It is a complete paid-user loop:

`signup -> choose plan -> create Space -> connect agent -> connect repo -> task -> artifact -> PR -> preview -> approval -> upgrade/retain`

Use [remaining.md](/Users/arhansubasi/recoder.xyz/docs/remaining.md:1) as the current checklist for what still blocks paid subscribed users.

## Strategy

- Many agents, one control plane.
- Recoder Spaces is the center of the product; the CLI, agent surfaces, PM, Agency, deploys, and later modules plug into Spaces instead of behaving like separate products.
- Compete at orchestration and governance, not raw model quality.
- Wedge: a task room for coding agents with human-controlled assignment, approval, and handoff.
- Product model: artifact-first runs, not generic chat as the system of record.
- BYOK/BYOA is an advantage because Recoder governs work and outcomes without forcing one model vendor or runtime.

## Target Users

- AI agencies coordinating operators, specialists, and client approval loops.
- Freelancers and small dev teams running multiple coding and review agents against the same workspace.
- Solo technical founders using several agents but still needing one place to control delivery, approvals, and history.

## Platform Layers

- Protocol layer: shared A2A contracts, validation, routing, state mapping, and policy semantics.
- Workspace layer: `Recoder Spaces`, the shared task room for agent identity, membership, approvals, handoffs, artifacts, and audit history.
- Runner layer: coding, browser, and later computer-use execution lanes attached to the workspace rather than owning it.
- Outcome layer: previews, pull requests, exports, delivery packages, and client-safe handoff built from the same run history.

## Product Stack

- `Recoder Spaces` -> workspace and control room
- `Recoder Code` -> first-party coding CLI and reference agent
- `Recoder A2A Gateway` -> agent communication layer
- `Recoder Runner` -> local, self-hosted, and later hosted runtime
- `Recoder Deploy` -> preview and production deployment
- `Recoder Agency` -> client delivery layer
- `Recoder Edge` -> later routing and security layer
- `Recoder Marketplace` -> later agents, workflows, and templates

These are surfaces and layers around one workspace, not separate flagship products.

## Moat

- Agent identity graph across people, agents, workspaces, sessions, and assignees.
- Artifact history that ties prompts, logs, approvals, previews, and outputs to one durable run record.
- Permission and approval system that makes multi-agent work governable instead of opaque.
- Client-safe delivery layer that turns internal runs into reviewable packages, revisions, and handoffs.
- Workflow templates for recurring coding, review, governance, browser, and delivery flows.

## MVP / Killer Demo

- User creates a Recoder Space.
- User starts `Recoder Code` locally and connects it to that Space.
- The CLI appears as an online agent with capabilities and durable identity.
- The user creates a task and the agent claims it.
- Logs stream, artifacts appear, and runtime evidence attaches to the same run.
- The task moves to `Done`, with approvals and later PRs or previews attaching to the same record.

## Positioning / Messaging

- Headline: The workspace where AI agents ship software with your team.
- Subheadline: Connect Recoder Code, Claude Code, Codex, local agents, and MCP tools into one shared workspace with tasks, artifacts, approvals, logs, and deployments.
- Core promise: Bring your own agents. Bring your own keys. Keep control.
- Landing-page bullet: Give agents a workspace, not just a model endpoint.
- Landing-page bullet: Coordinate coding, review, PM, browser, and delivery agents in one task room.
- Landing-page bullet: Keep humans in control with approvals, policy, and handoffs.
- Landing-page bullet: Turn agent work into artifacts, PRs, previews, and client-safe delivery.

## Scope Discipline

- Do not treat full hosted compute, a Cloudflare-like edge stack, a Vercel-like deployment stack, a marketplace, and an agency OS as first-cycle launch goals.
- The near-term product proof is narrower: external or first-party agents enter a Space, claim tasks, create artifacts, and ship work under approval.
- Edge, Marketplace, and broader infrastructure layers should expand only after Spaces, PR artifacts, and preview deploys work end to end.

## Near-Term Proof Order

1. Local agent -> Recoder Space -> task -> logs -> artifact -> done.
2. Agent -> GitHub PR artifact -> human approval.
3. Agent -> preview deploy -> client approval.

## Sequencing Decision

- The active launch wedge is not broad chat or generic IDE usage. It is the shared task room for coding agents.
- `recoder-web` and `docker-backend` remain important runtime integrations, but they are not the current category-defining gate for the roadmap.
- Their unresolved runtime issues remain documented below as deferred Phase 1 backlog.
- Those runtime issues should not block Phase 2 or later control-plane work unless a hard dependency appears.
- The active execution lane starts with shared A2A contracts, durable agent identity, PM approvals and handoffs, shared workspace ownership, and cross-surface run history inside Recoder Spaces that Agency can consume next.

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

## Planning Inputs For This Revision

### Local Recoder and Daytona notes

- [plan.md](/Users/arhansubasi/recoder.xyz/plan.md:1) remains the active platform sequencing document.
- [preview.md](/Users/arhansubasi/recoder.xyz/preview.md:1) reinforces that signed Daytona preview URLs are the preferred browser-facing preview primitive and that preview auth behavior is distinct from standard token-header preview access.
- [computer-use.md](/Users/arhansubasi/recoder.xyz/daytona-projects/computer-use.md:1) defines the lifecycle and health model for Daytona computer-use processes. This is relevant to a later optional runtime lane, not the current Phase 2 wedge.
- [file.md](/Users/arhansubasi/recoder.xyz/daytona-projects/file.md:1) clarifies that sandbox file operations are first-class APIs with explicit relative-vs-absolute path semantics. This matters for mutation proof and later artifact capture.
- [coding.md](/Users/arhansubasi/recoder.xyz/daytona-projects/coding.md:1) clarifies the split between stateless code execution, stateful interpreter contexts, and process sessions. This matters for linking runtime evidence to the control plane without turning code execution into the control plane itself.
- [git-ops.md](/Users/arhansubasi/recoder.xyz/daytona-projects/git-ops.md:1) clarifies that repo clone and status are first-class sandbox capabilities with explicit workspace-root semantics. This is useful for run artifact provenance and later workspace handoff proof.
- [log.md](/Users/arhansubasi/recoder.xyz/daytona-projects/log.md:1) clarifies stdout and stderr streaming for long-running sandbox sessions. This is directly relevant to Phase 2 run-history evidence and auditability.
- [vnc.md](/Users/arhansubasi/recoder.xyz/daytona-projects/vnc.md:1) clarifies that VNC is the human-observation layer paired with Computer Use. This belongs to a later optional desktop lane, not the Phase 2 center of gravity.

### Phase 2 reference sources

- `daytona-projects/a2a-js-upstream` is the main upstream protocol reference for A2A server and client behavior, transport compatibility, and agent-card conventions.
- `daytona-projects/open-agents-upstream` is the clearest architectural reference for keeping the agent runtime outside the sandbox and treating the sandbox as an execution environment rather than the orchestration plane.
- `daytona-projects/beads-upstream` remains relevant to execution tracking discipline and long-horizon agent workflow hygiene, but `bd` stays a tracking tool rather than part of the Recoder control-plane product surface.
- `daytona-projects/context7-upstream` is a useful documentation-ingress pattern for agents, but it is a tooling adjunct, not a control-plane primitive.

### Deferred runtime reference sources

- `daytona-projects/daytona` is the authoritative upstream for sandbox, snapshot, filesystem, process, preview, VNC, and computer-use capabilities.
- `daytona-projects/pi-mono-upstream`, `daytona-projects/opencode-upstream-2`, and `daytona-projects/inngest-agentkit-coding-agent` remain useful coding-runtime references for runtime behavior, agent loops, and sandbox-driven execution patterns.
- `daytona-projects/e2b-upstream` remains a comparison substrate for isolated code execution, not the primary implementation direction.
- `daytona-projects/lightpanda-browser-upstream` is a lightweight browser-runtime reference for later experimentation, but it is still a future browser-task lane input rather than an active control-plane dependency.

### Later browser and desktop lane references

- `daytona-projects/agent-browser-upstream`, `daytona-projects/stagehand-upstream`, and `daytona-projects/wbac-upstream` are later browser-automation references. They belong in a future browser-task lane after the shared control plane is stable.
- `daytona-projects/agent-computer-use-upstream` and [computer-use.md](/Users/arhansubasi/recoder.xyz/daytona-projects/computer-use.md:1) are later desktop or accessibility-driven automation references. They belong after the core workspace, approval, and history primitives are stable.
- `daytona-projects/sitegeist-upstream` is a useful example of human-guided browser collaboration and BYOK posture, but it is not the Phase 2 center of gravity.

### Adjacent product and workflow references

- `daytona-projects/suna-upstream`, `daytona-projects/workflow-builder-template-upstream`, `daytona-projects/opencode-channels-upstream`, and `daytona-projects/kortix-ocx-registry-upstream` are adjacent product or channel references. They can inform future packaging, workflow composition, or channel delivery, but they should not distort the current control-plane sequence.
- `daytona-projects/mem0-upstream` is an adjacent memory-system reference. It may inform future retrieval or personalization layers, but it should not replace the control plane's canonical ownership of workspace identity, run history, approvals, or artifacts.

## Control-Plane Architecture

The stack should read from inside out: protocol, workspace, runner, outcome.

- `packages/a2a-sdk` owns the protocol layer for envelope structure, validation, error mapping, state mapping, and audit semantics.
- `tools/a2a-interop` owns the shared bridge and admin API surface for job polling, result submission, heartbeats, policy, history, overrides, recompute, pairing, and session visibility.
- `recoder-pm` owns human approval, reject, decision, and handoff transitions inside the shared workspace lifecycle.
- `recoder-agents` owns the operator-facing control surface for workspace membership, agent and session status, approvals, handoffs, and run visibility.
- `recoder-agency` is the outcome-layer consumer in Phase 3, packaging the same run, artifact, approval, and handoff primitives for client-facing delivery workflows.
- Agent execution and workflow orchestration stay outside the sandbox. The sandbox exposes capabilities and evidence, but it does not own platform identity, approval state, or run history.
- Sandbox git status, filesystem mutation checks, process-session logs, and preview linkage should feed the shared history model as evidence attachments rather than creating separate hidden runtime truth stores.
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

## Phase 2: Recoder Spaces Kernel and Control-Plane Foundation

Outcome:

- External agents can connect to the same Recoder Space with durable identity, stable reconnect behavior, shared history, PM-mediated approvals and handoffs, and one canonical control-plane contract for routing, artifacts, and auditability.

Status:

- Active phase. This is the foundation layer for the rest of the product.

### Current Implementation Progress

- `docker-backend/src/a2a-gateway.ts` now binds paired bridge sessions to optional control-plane ownership metadata: `agentId`, `workspaceId`, `projectId`, `capabilities`, and arbitrary session metadata.
- Bridge session pairing now reuses an existing token on reconnect when the same bridge, scope, agent, workspace, and project binding reconnects. This moves the bridge lane away from duplicate session registration and toward durable session identity.
- Bridge heartbeats now inherit paired session ownership and reject mismatched `agentId`, `workspaceId`, or `projectId` claims instead of silently accepting conflicting identity.
- Bridge session pairing now validates control-plane ownership against the workspace registry: bound workspaces must exist, `projectId` must match the workspace when provided, and the bound agent must already be a member of that workspace.
- Session visibility now exposes the paired ownership metadata and the latest heartbeat together, which gives Agents and PM a stronger base for shared session visibility.

### What Is Still Missing In Phase 2

- Bridge session identity is stronger, but it is not yet fully unified with the broader agent registry service, registry-backed health model, or durable registry reconciliation.
- Session ownership is now validated against workspaces, but PM approval state, handoff state, and orchestration history are not yet fully attached to the same shared run record.
- Runtime evidence has not yet been normalized into the same history model for git state, file mutation, stdout, stderr, preview linkage, and later desktop artifacts.
- Agents does not yet expose the full shared workspace and run state backed by the improved bridge-session contract.

### Next Concrete Coding Sequence

- Reconcile paired bridge sessions with the broader agent registry so a reconnecting bridge agent is validated not just against workspace membership but against the same durable agent identity and health model used elsewhere in the control plane.
- Attach PM approval and handoff objects to the same shared run or session record that currently exposes bridge-session visibility, instead of keeping approvals and handoffs parallel to bridge state.
- Normalize runtime evidence into shared history records, starting with git status, clone provenance, stdout, stderr, and preview linkage.
- Expose the resulting session, approval, handoff, and evidence shape through Agents-facing workspace and mission-control surfaces.

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
| Keep the control plane outside the sandbox | orchestration runtime boundaries across PM, Agents, and backend services | Preserve a clean separation between control-plane orchestration and sandbox execution capabilities. | A run can survive sandbox restarts or execution-lane swaps without losing identity, approval state, assignee ownership, or history because those primitives are not stored only inside the sandbox. | Depends on treating sandboxes as capability providers rather than as the source of truth for workflow state. |
| Integrate PM approval, reject, pause, and handoff into the run lifecycle | `recoder-pm` plus shared orchestration state | Make PM decisions first-class lifecycle transitions instead of downstream annotations. | A run can pause for approval, resume after approval, terminate on reject, or hand off to a new assignee with preserved ownership, artifacts, and audit history. | Depends on shared run history, state mapping, and artifact linkage. |
| Unify run history, artifacts, and auditability across PM and Agents | orchestration history, artifact linkage, and audit-event surfaces | Share prompt, assignee, connector, approval history, logs, artifacts, and decision trail under one history model. | A run exposes its activity, artifacts, policy checks, approvals, and handoffs through one shared history stream rather than per-surface copies. | Depends on stable envelope IDs, trace IDs, artifact capture, and history persistence. |
| Attach runtime evidence without making runtime proof the sequencing gate | shared run history plus runtime evidence adapters | Link Daytona process sessions, file mutations, preview URLs, and later screenshots into the same run history as optional evidence objects instead of separate parallel histories. | A run can reference process logs, mutation evidence, preview linkage, or desktop artifacts in one history model, while Phase 2 still proceeds without requiring fresh end-to-end browser preview proof. | Depends on stable artifact linkage and deferred runtime adapters. |
| Normalize git and log evidence into run history | runtime evidence adapters plus orchestration history | Treat sandbox git status, branch state, clone provenance, stdout, and stderr streams as standard evidence types for run auditing and handoff. | A run history can explain not just who approved or handed off a task, but also which repo state, branch state, and streamed execution logs were attached to that decision. | Depends on stable artifact schemas and consistent evidence ingestion. |
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

> 2026-05-31 root cause (recoder-g69j / gm8z): The Daytona control plane (`/root/daytona/docker/docker-compose.yaml`, project `daytona`) is down at the core, for TWO compounding reasons:
> 1. **Partial deployment** — only 5 of ~14 services were up (api, proxy, redis, registry-ui, ssh-gateway). `db` (Postgres), `runner` (the privileged sandbox executor), `dex`, and `registry` were never started. `daytona-api-1` crash-looped 44,917× on `getaddrinfo EAI_AGAIN db`. FIXED PARTIALLY 2026-05-31: brought up the `db` service (`docker compose up -d db`, fresh `daytona_db_data` volume) — this stopped the crash-loop (api restarts 44,917 → 0).
> 2. **Broken bridge networking** — the remaining blocker. From inside `daytona-api-1`, TCP connects to BOTH `db:5432` and `redis:6379` time out even though docker DNS resolves the names and the services answer locally (redis PONG). Recreating api/redis did not help. This is inter-container connectivity failure on `daytona_daytona-network` (iptables/bridge corruption), which also explains the proxy's `dial tcp …:3000 i/o timeout`. So `:3900/api/config` stays unreachable and no sandboxes can be created → build-mode 200s with "Container not found".
>
> RESOLVED 2026-05-31 (control plane): recreated the daytona stack network (`docker compose down` removed the corrupted `daytona_daytona-network`; `up -d` rebuilt it) with a temp swapfile + prod OOM-shielding. Inter-container TCP now works (api→db:5432 and api→redis:6379 both CONNECT OK, were TIMEOUT). Brought up the missing services in dependency order — db, redis, dex, registry, **minio** (api had a fatal `EAI_AGAIN minio` S3 error), api, proxy. **daytona-api is now healthy and `:3900/api/config` returns 200**; proxy is healthy too. Production (recoder-app/agents/pm/agency) stayed up throughout; temp swap removed and OOM shields reset afterward.
>
> REMAINING (runner — sandbox executor): the `runner` service uses a custom image `daytona-runner-custom:latest` that is gone (pull denied) and must be rebuilt from `/root/daytona/apps/runner/Dockerfile`. That build is heavy (multi-stage: full monorepo `yarn install` + Go/nx `build runner` + docker-dind base) AND blocked on a missing prebuilt artifact `dist/libs/computer-use-amd64`. api runs stably but logs `No available runners` — so the control plane is healthy but **sandbox CREATION still fails until the runner image is built and started** (this is the final piece for recoder-g69j end-to-end). Checkpointed: building computer-use + the runner image is a separate multi-step effort pending owner approval. Blockers #1–#4 below can now be re-tested against a live control plane once the runner is up.

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

## Phase 3: Delivery and Client Consumption Layer

Outcome:

- `recoder-agency` consumes the shared control-plane primitives as the delivery and client-consumption layer for packaging, client approval or revision loops, project and workspace handoff, and artifact-backed delivery state without becoming a separate execution model.

Status:

- Largely implemented. The remaining work is hardening, integration depth, and delivery polish rather than first-time surface creation.

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

### Current Implementation Progress

- Agency now consumes shared control-plane summaries from workspace snapshots when available and falls back to task contexts when not.
- Admin and client project surfaces now show richer shared run state, including approvals, handoffs, evidence, artifacts, logs, previews, and session visibility.
- Admin and client delivery-package exports now assemble project packages from shared run artifacts instead of a separate artifact store.
- Client review decisions now write back into shared task metadata so approval/rejection lives on the shared run model, not only on Agency-side rows.
- Rejected deliverables now create real follow-up shared runs across client portal, conversational review, and channel-gateway entrypoints.
- Admin project handoff runs now create shared A2A tasks in the linked workspace instead of local-only assignment notes.

## Phase 4: Planning, Governance, and Runtime-Class Expansion

Outcome:

- The same control-plane primitives support planning, governance, and optional runtime classes such as browser and computer-use lanes without breaking the shared contract.

Status:

- Active. Planning, governance, browser, and computer-use entrypoints already exist; the remaining work is mostly breadth, integration depth, and hardening.

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
| Add browser-task execution lane on shared control-plane primitives | browser automation integrations and orchestration surfaces | Attach web navigation, extraction, and browser action capabilities to the shared run model without turning browser automation into a parallel product stack. | A browser-task run can use a later `agent-browser` / `Stagehand` / `wbac` style capability while still preserving the same workspace, assignee, artifact, approval, and audit model. | Depends on stable Phase 2 ownership, history, and policy semantics. |
| Add desktop or computer-use execution lane on shared control-plane primitives | desktop automation and computer-use integrations | Attach Daytona computer use or accessibility-driven desktop automation as an optional execution class after the control plane is stable. | A desktop-task run can start, monitor, and stop computer-use sessions while preserving the same run identity, ownership, artifact model, and approval state as coding or browser runs. | Depends on later Daytona computer-use viability and Phase 2 control-plane maturity. |
| Keep human observation separate from automation semantics | VNC, operator tooling, and desktop-lane surfaces | Treat VNC as an observation and intervention surface, not as the source of truth for run state. | A desktop or browser run can be watched or inspected through VNC or similar tooling without making the observation surface the canonical run-history or approval system. | Depends on the control plane remaining the source of truth for state and audit history. |
| Promote optional runtime classes after control-plane maturity | coding, browser, desktop, and computer-use integrations | Attach additional runtime classes to the same control plane once identity, history, policy, and approval semantics are stable. | A later browser or computer-use run can execute end to end without bypassing the shared control plane. | Depends on Phase 2 stability and deferred runtime backlog results when those integrations matter. |

### Current Implementation Progress

- Planning runs now exist as explicit shared A2A tasks from Agency admin project pages.
- Governance runs now exist as explicit shared A2A tasks from Agency admin project pages and can also be triggered from cost-guardrail policy changes.
- Project handoff runs now exist as explicit shared A2A tasks from Agency admin project pages.
- Browser-task runs now exist as explicit shared A2A tasks with browser-oriented routing hints and upstream-informed runtime parameters from `agent-browser-upstream`.
- Desktop/computer-use runs now exist as explicit shared A2A tasks with desktop-oriented routing hints and upstream-informed runtime parameters from `agent-computer-use-upstream`.
- Delivery Ops can now launch project-set planning, governance, browser, and computer-use runs for the currently filtered risk set, not just single-project runs.
- Agency transition history now surfaces control-plane governance metadata directly, including approval/handoff counts, evidence counts, cost guardrail state, and follow-up task IDs.
- Project pages now expose project-scoped routing policy management directly, turning policy visibility into a real governance control surface.
- Shared run launchers are now centralized through one Agency helper so planning, governance, handoff, browser, and desktop runs use a consistent task-creation path.

## Strategic Next Steps

1. Deepen the browser-task lane so shared browser runs produce richer verified artifacts, not just routed tasks.
2. Deepen the desktop/computer-use lane so shared desktop runs capture structured evidence and explicit execution-state semantics, not only launch metadata.
3. Extend project and program governance controls beyond routing policy and cost guardrails into stronger operator policy workflows and retention/compliance exports.
4. Keep removing duplicated run-launch and follow-up logic across Agency, PM, Agents, and gateway paths until all runtime classes use one shared control-plane creation path.
5. Only define a true "Phase 5" after the optional runtime classes are proven end to end on the same control-plane model.

## Notes

- This is an operational status document plus an implementation backlog, not a ticket tracker.
- Use `bd` for detailed issue tracking and discovered follow-up work.
- Production evidence wins over stale notes.
- `recoder-web` and `docker-backend` are deferred backlog surfaces here, not silently removed.
- Fresh browser-preview proof is not the current prerequisite for control-plane execution unless a concrete dependency appears later.
- Runtime-specific routing is secondary to capability, workspace policy, assignee identity, and protocol intent.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not treated as a product bug.
- The strategic category should stay narrow: Recoder is the control plane for AI software agents, not a generic AI IDE or AI OS.
- The strongest wedge remains: one workspace, many agents, controlled delivery.
- BYOK/BYOA continues to be a strategic advantage because Recoder governs agents instead of reselling inference.
- A future Phase 5 should only be declared once the current Phase 4 runtime classes are proven end to end and the next product boundary is explicit.

## Roadmap-To-Code Status

The previous roadmap-to-code handoff is now incorporated into this document and [remaining.md](/Users/arhansubasi/recoder.xyz/docs/remaining.md:1).

Completed from that handoff:

- shared bridge identity reconciliation and registry-first session visibility
- preview deploy artifacts and protected preview access
- `recoder-edge` scaffold for preview routing and route security policy
- signed-in Space creation as the primary conversion path
- connected agent records as the activation milestone
- commercial entitlement enforcement for Spaces and connected agents
- commercial quota compatibility across auth, billing, CLI, user quota, usage, analytics, and plan config

Still active:

- move PM and Agency ingress onto the shared A2A envelope normalization path
- connect GitHub repos and make PRs first-class artifacts
- make the task -> artifact -> PR -> preview -> approval loop visible from shared run history
- instrument the lead-to-signup-to-activation funnel
- activate live edge/preview routing, DNS/TLS, private preview hosts, and WAF/rate-limit policy
- unblock full Hetzner deploy by resolving missing Daytona backend sources

Use `bd ready --json` for the executable issue list instead of adding markdown TODOs here.
