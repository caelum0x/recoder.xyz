# Agent OS Architecture

The Agent OS architecture is layered:

- UI surfaces show agents, tasks, provenance, approvals, verification, and artifacts.
- API routes expose Agent OS resources and A2A/MCP compatibility.
- Core packages define stable domain, policy, event, memory, runtime, workflow, and MCP contracts.
- Runtime adapters translate Recoder task specs and instruction bundles into Claude Code, Codex, Recoder Code, and other execution surfaces.
- OSS infrastructure provides databases, queues, sandboxes, traces, and deployment substrates.

## Package Boundary

`packages/agent-os` is dependency-light domain core. It must not import runtime SDKs, model clients, MCP servers, sandbox clients, or UI code.

Adapter packages may be messy because runtimes change. Core packages should stay boring, explicit, and auditable.

## State Ownership

Recoder-owned state includes task status, approvals, work locks, memory review, verification output, artifact metadata, and instruction bundle provenance. External tools may mirror or execute against that state, but they should not become canonical state owners.

Runtime evidence is first-class Agent OS state. `RuntimeEvidence` records capture git status, clone provenance, stdout, stderr, file mutation, preview links, browser checks, verification, desktop, and custom runtime observations. They reference tasks/runs and optional artifacts, but they are not blobs themselves. Use `/api/agent-os/runtime-evidence` to attach evidence from sandboxes, runtime adapters, browser checks, or desktop lanes.

The backend Agent OS API exposes raw lock visibility at `/api/agent-os/work-locks`, but lock lifecycle should use `/api/agent-os/work-locks/acquire` and `DELETE /api/agent-os/work-locks/:lockId`. These routes call `WorkLockService` so conflict detection, expiration filtering, and ownership checks stay shared with hooks and policy routers.

The standalone `apps/agent-gateway` HTTP app also mounts `/api/agent-os/*` through `createAgentOsResourceRouter`. This keeps the gateway useful as the local-agent control-plane ingress instead of only exposing A2A transport.

The gateway shares one `AgentOsGatewayState` between the A2A router and `/api/agent-os/*`. `createA2AAgentOsProjection` maps inbound A2A messages into `TaskSpec` and `TaskRun` records, maps A2A task state changes into legal Agent OS lifecycle transitions, and maps A2A artifacts into Agent OS artifacts plus run events. This prevents A2A from becoming a parallel hidden task store.

Instruction compilation is exposed through `POST /api/agent-os/instructions/compile` on both the backend Agent OS router and the standalone agent gateway. The route accepts inline `task`/`agent` objects or registered `taskId`/`agentId` references, persists the runtime `InstructionBundle`, and returns the A2A audit bundle so operators can inspect loaded sources, memory refs, approval gates, and verification commands.

Agent reconnects should use `POST /api/agent-os/agents/reconcile` instead of blind upsert. Reconciliation preserves the existing durable agent ID and policy, merges runtime capabilities and health, and uses connector/runtime plus optional workspace/project binding when the incoming profile is not already known by `agentId`.

Task routing should use `POST /api/agent-os/tasks/route`. The route ranks agents by capability, task intent, health, explicit assignee, and workspace policy before considering runtime metadata. With `routeRun: true`, it moves an eligible compiled run to `routed` and records the selected agent on the run.

Run claiming should use `POST /api/agent-os/runs/:runId/claim`. Claims are validated against agent identity, health, assignment, supported task intent, and legal lifecycle transitions before the run moves to `claimed`.

Runtime state updates should use `POST /api/agent-os/runs/:runId/transition` instead of raw run upserts. The transition route applies the canonical state machine and records transition metadata for history/audit visibility.

Runtime event ingestion should use `POST /api/agent-os/events` when adapters or workflow nodes already emit `RunEvent` objects. The route stores the event and applies it to the referenced run through `RunService` when `runId` is present. Events such as `started`, `needs_input`, `approval_requested`, `verified`, `completed`, and `failed` can advance run state only through legal transitions; illegal event-to-state jumps are preserved as events without mutating the run.

Outbox visibility should use `GET /api/agent-os/outbox`. The gateway and backend append CloudEvent-backed `OutboxRecord`s when task, run, artifact, approval, memory, and run-event records are created or changed. `docker-backend` selects memory, JSON-file, or Postgres persistence at startup; Postgres uses the `event_outbox` table from the Agent OS migration.

Run visibility should use `GET /api/agent-os/runs/:runId/history` or `GET /api/agent-os/tasks/:taskId/history`. The history response merges run state, events, artifacts, approvals, policy decisions, memory review, instruction bundles, and work locks so PM, Agents, and Agency share one audit trail for PRs, previews, approvals, and handoffs.

A2A-created runs use deterministic run IDs derived from the A2A task ID and carry thread, trace, connector, requester, and assignee metadata. Stream starts, cancellation, and artifact submission through `/api/a2a/*` therefore appear in the same history endpoints as native Agent OS routes.

PR and preview evidence should use first-class artifact routes: `POST /api/agent-os/artifacts/pull-request` and `POST /api/agent-os/artifacts/preview`. Generic artifact upsert remains available for imported evidence, but product delivery should use the typed routes so history, metadata, and optional `delivered` transitions stay consistent.

Artifact content should be hash-addressable when Recoder creates it. `ArtifactService` computes `sha256:*` content hashes for service-created artifacts when content is present, and A2A-projected artifacts do the same. Imported artifacts may still provide an existing `contentHash`.

PM approval decisions should use `POST /api/agent-os/approvals/:approvalId/approve` and `POST /api/agent-os/approvals/:approvalId/reject`. These routes keep approval records and run lifecycle state together instead of letting PM decisions become downstream annotations.

GitHub delivery linkage should use the typed GitHub routes. `POST /api/agent-os/spaces/:spaceId/repositories/github` connects a GitHub repository to a Space. `POST /api/agent-os/github/delivery-links` maps a task/run to a branch and optional GitHub issue. The delivery link can then attach PR artifacts, preview artifacts, check summaries, review summaries, and issue metadata through `/github/delivery-links/:linkId/*`. Run history includes these links so the paid-user loop can show task -> branch -> PR -> preview -> checks/reviews -> approval from one control-plane record.

Memory writes should use `POST /api/agent-os/memory/candidates/:candidateId/review`. The route updates candidate review state and materializes accepted memory through the domain service, keeping evidence and reviewer provenance attached.

MCP tool calls should pass through `RecoderMcpHost` and `checkMcpToolPermission`. The permission check first validates server/tool registration, then calls the shared `@recoder/agent-policy` engine for canonical `PolicyDecision` output. High-risk tools return `needs_approval` as a distinct audit status instead of being flattened into a generic denial.

Policy decisions with `effect: "needs_approval"` should be posted to `POST /api/agent-os/policies/decisions`. Both the standalone gateway and backend routes persist the decision and, unless `createApproval: false` is set, materialize a pending `Approval` record through `ApprovalService.requestFromPolicyDecision`. This is the bridge from deterministic policy to PM-visible approval queues.
