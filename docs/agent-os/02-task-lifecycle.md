# Task Lifecycle

Recoder task state is canonical.

The normal run lifecycle is:

```text
created
  -> compiled
  -> routed
  -> claimed
  -> running
  -> needs_input
  -> verifying
  -> waiting_for_approval
  -> approved
  -> delivered
  -> completed
```

Terminal side paths are `failed`, `cancelled`, and `rejected`.

Every transition should emit an auditable run event. Runtime adapters can request transitions, but Recoder validates legal state movement, records the final state, and appends a `state_transition` event for compile, route, claim, generic transition, delivery, and approval decision paths.

## Worker Execution

`apps/agent-worker` runs workflow definitions through `AgentOsWorkflowRunner`. Agent nodes dispatch to registered runtime adapters, approval nodes create pending approvals and pause, and tool or verification nodes require explicit handlers before completion. When a handler is not wired yet, the worker returns `waiting` with an artifact describing the missing external handler rather than claiming success.

Instruction compilation is a lifecycle transition. When `POST /api/agent-os/instructions/compile` receives a `runId`, or finds a `created` run for the task, it stores the bundle, creates an `instruction_bundle` artifact, and moves the run to `compiled` with the bundle ID attached. Direct `POST /api/agent-os/instructions` upserts also create the same artifact unless `createArtifact: false` is supplied.

Routing is also a lifecycle transition. `POST /api/agent-os/tasks/route` ranks healthy agents by task intent, explicit assignee, required capability IDs, agent permissions, and workspace policy. If the request includes `routeRun: true` or `transitionToRouted: true`, an eligible `compiled` run is moved to `routed` and receives the selected agent as `assigneeAgentId`.

Claiming is explicit. `POST /api/agent-os/runs/:runId/claim` requires `agentId`, verifies the agent exists, is healthy or degraded, matches any existing assignee, supports the task intent, and then moves an eligible `routed` run to `claimed`.

Runtime state updates should use `POST /api/agent-os/runs/:runId/transition` with a target `state`, optional `metadata`, and optional `agentId` or `requestedBy`. The route rejects illegal transitions and applies the canonical state machine, so generic run upsert does not become the normal lifecycle path.

Runtime adapters and workflow nodes may also emit `RunEvent` objects through `POST /api/agent-os/events`. The event is always stored. If it has a known `runId`, `RunService` applies the event to the run when the derived target state is legal: `started` -> `running`, `needs_input` -> `needs_input`, `approval_requested` -> `waiting_for_approval`, `verified` -> `verifying`, `completed` -> `completed`, and `failed` -> `failed` or the event-provided terminal state. Illegal jumps remain audit evidence and do not mutate the run.

A2A ingress is projected into the same lifecycle. `POST /api/a2a/message` creates a `TaskSpec` and `created` run in the shared Agent OS state. `POST /api/a2a/message/stream` moves the projected run through the legal path to `running`. `POST /api/a2a/tasks/:taskId/cancel` moves it to `cancelled`. The A2A handler still returns canonical `TaskEnvelope` responses, but Agent OS remains the visible state owner.

Verification output should use `POST /api/agent-os/runs/:runId/verification-results`. The route creates a `verification` artifact, appends an artifact event, and can optionally apply a legal transition through `transitionState` or `state` so verification evidence and lifecycle state stay linked.

Runtime evidence should use `POST /api/agent-os/runtime-evidence`. Evidence records cover git status, clone provenance, stdout, stderr, file mutation, preview links, browser checks, verification, desktop, and custom observations. They can reference artifact IDs when a log file, screenshot, trace, or verification output exists separately. Run history includes runtime evidence as `runtime_evidence` items and exposes `latest.runtimeEvidenceIds`.

Agent hooks should emit runtime evidence alongside artifacts. `evaluatePostToolUse` reports file mutation/stdout/stderr evidence, `evaluateBeforeCompact` reports compaction-state evidence, and `evaluateSubagentStop` reports subagent-summary evidence. Hook adapters can post these records to `/api/agent-os/runtime-evidence` after uploading any referenced artifacts.

## Shared Run History

PM, Agents, and Agency should read one canonical run timeline instead of rebuilding history from separate resource lists. `GET /api/agent-os/runs/:runId/history` returns the run state plus related events, artifacts, runtime evidence, approvals, policy decisions, memory candidates, accepted memory, instruction bundles, and work locks in chronological order. `GET /api/agent-os/tasks/:taskId/history` returns the same history grouped for each run on the task.

This timeline is the control-plane record for the paid-user loop:

```text
task -> instruction bundle artifact -> runtime events -> PR/preview artifacts -> approval -> memory candidate
```

`POST /api/agent-os/artifacts/pull-request` creates a `pull_request` artifact with URL, branch, repository, PR number, and title metadata. `POST /api/agent-os/artifacts/preview` creates a `preview` artifact with URL, provider, and environment metadata. Both routes attach the artifact to `taskId` and optional `runId`; if the request includes `deliver: true` or `transitionToDelivered: true`, an eligible run is moved to `delivered` and records the delivery artifact IDs in run metadata.

`POST /api/a2a/artifacts` also projects A2A artifacts into Agent OS artifacts and appends an `artifact` run event. A2A artifact types map to Recoder artifact kinds where possible (`log`, `pull_request`, `preview`, `screenshot`, `verification`) and fall back to `custom` for patches, files, and unknown external payloads.

A2A artifacts that are runtime observations also create runtime evidence. `log` becomes `stdout`, `preview` becomes `preview_link`, `screenshot` becomes `browser_check`, and `verification` becomes `verification`. The resulting run event includes `runtimeEvidenceId` so history can connect the A2A artifact to evidence counts.

PM approval decisions should use `POST /api/agent-os/approvals/:approvalId/approve` and `POST /api/agent-os/approvals/:approvalId/reject`. These routes call the shared approval service, persist the decision metadata, and move an eligible `waiting_for_approval` run to `approved` or `rejected`.

MCP tool calls should produce policy evidence before execution. `checkMcpToolPermission` attaches a canonical `PolicyDecision` for allow, deny, and approval-required outcomes. `RecoderMcpHost` records `needs_approval` separately from `denied` so PM can distinguish a blocked tool from a tool waiting for human approval.

Policy decisions are approval ingress. `POST /api/agent-os/policies/decisions` stores the decision and materializes a pending approval for `needs_approval` decisions with a `taskId` unless the caller explicitly sends `createApproval: false`. The response includes both `decision` and optional `approval`.

GitHub delivery links are the bridge between task state and repository delivery state. Connect repositories with `POST /api/agent-os/spaces/:spaceId/repositories/github`, create task-to-branch links with `POST /api/agent-os/github/delivery-links`, and sync PR, preview, check, review, and issue evidence through the delivery-link subroutes. These links appear in run history as `github_delivery_link` items.

Memory writes should use review. `POST /api/agent-os/memory/candidates/:candidateId/review` accepts or rejects an evidence-linked candidate. Accepted candidates materialize a durable `MemoryItem`; rejected candidates stay as review evidence. Agents should propose candidates, not silently write durable memory.

## Required Evidence

Completion requires:

- delivery summary
- changed file list when files changed
- verification output or explicit not-run reason
- artifact references
- approval decisions when gates were crossed
- memory candidate references when new durable knowledge was proposed
