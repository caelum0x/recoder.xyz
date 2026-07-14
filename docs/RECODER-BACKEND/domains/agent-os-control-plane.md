# Domain: Agent OS Control Plane

**Folder prefix:** `backend/src/domains/agent-os/`
**Boundary:** State-of-record owner — tasks, runs, approvals, artifacts, instructions, policies, spaces, events/outbox, workflows, memory candidates, and **squads** (leader-routing + autopilots ported from multica). Persists and serves the `@recoder/agent-os` contracts over `/api/agent-os/*` (+ `/internal/agent-os/*`).
**Target size:** ~46 files.

---

## 1. Overview

This domain is the **source of record** for the Recoder control plane. Every other domain speaks its contracts (`Task`, `Run`, `Approval`, `Artifact`, `MemoryCandidate`, `InstructionBundle`, `Space`, `RunEvent`, `Workflow`) but does NOT own their state — they mutate through this domain's repository port and receive change notifications via the `RunEvent` bus + CloudEvents outbox.

Core responsibilities:

1. **Legal state transitions.** Runs move through a state machine (`queued → claimed → running → verifying → succeeded|failed|handoff`) that is enforced in one pure module (`run-transition.ts`) — no ad-hoc status writes anywhere.
2. **RunEvent ingestion.** Runtimes/engines POST `RunEvent`s to `/internal/agent-os/*` (INTERNAL_SERVICE_KEY-gated). Each event is validated, applied to state-of-record (run step, evidence, artifact), appended to the immutable event log, and mapped to a CloudEvents outbox record.
3. **Outbox drain.** A degrade-safe loop publishes outbox records to NATS (or logs when NATS is absent) and marks them delivered — the at-least-once delivery spine.
4. **Governance-gated writes.** Every WRITE (task upsert, run transition, approval decision, memory candidate, squad dispatch) routes through `GovernanceGate.decide()` before persistence and appends to the SHA-256 Merkle audit chain.
5. **Squads.** Named teams (agents + humans) with a leader, per-member roles, capability routing, and autopilots — ported from multica into the TS conductor spine. Work can target a team, not just one agent.
6. **Instructions / policies / memory candidates.** Compile instruction bundles (provenance-tracked), evaluate policy decisions, and manage the reviewable memory-candidate lifecycle (`remember → review → promote`, never a direct durable write).

This domain is the **default composer target**: it MOVES the existing `backend/src/agent-os/` (71 files) behind a single `AgentOsModule` interface rather than creating a 4th copy. The heavy domain logic already lives in the `@recoder/agent-os` package (`RunService`, `ApprovalService`, `ArtifactService`, `TaskRoutingService`, `transitionTaskRun`, …) — this domain WIRES those services to persistence, governance, and edges.

### Design principles honored

- **Config only from bootstrap.** No `process.env` in domain code (the legacy `service-container.ts` reads env directly — this is REPLACED by a typed `AgentOsConfig` slice injected at construction).
- **Pure factory.** `createAgentOsModule(deps)` — no top-level singletons (legacy `agentOsContainer` mutable singleton is removed).
- **Repository is a port.** Business logic depends on `AgentOsRepositoryPort`; persistence provides the pg impl. Three drivers (pg/json/memory) exist as degrade-safe adapters.
- **Truthful health.** `health()` reports `up|down` per engine (repository driver, outbox/NATS, governance gate, instruction compiler).

---

## 2. File Tree

```
backend/src/domains/agent-os/
├── index.ts                              # factory + the ONE public interface (AgentOsModule)
├── agent-os-module.ts                    # composer: fuses services + repo + gate behind the interface
├── config.ts                             # AgentOsConfig slice (zod) + defaults
├── types.ts                              # domain-internal types (not published)
├── health.ts                             # health() aggregation for this module
├── middleware/
│   └── schema-guard.middleware.ts        # validateBody(zodSchema) boundary validation
├── ports/
│   ├── index.ts                          # barrel
│   ├── agent-os-repository.port.ts       # Repository PORT (state-of-record CRUD) — EXPOSED to persistence
│   ├── run-event-bus.port.ts             # RunEvent ingest + subscribe PORT — EXPOSED to conductor/runtimes
│   ├── outbox-publisher.port.ts          # CloudEvents publisher PORT (consumed: interop/edge)
│   ├── governance-gate.port.ts           # decide()/record_audit() PORT — CONSUMED from governance
│   └── instruction-compiler.port.ts      # compile bundle PORT — CONSUMED from agent-instructions
├── adapters/
│   ├── postgres-agent-os.repository.ts   # pg impl of repository port (:param SQL, WHERE user_id)
│   ├── json-file-agent-os.repository.ts  # json-file impl (degrade / dev)
│   ├── in-memory-agent-os.repository.ts  # in-memory impl (tests / no-DB degrade)
│   ├── governance-gate.adapter.ts        # wraps @recoder/governance; degrades to allow+log when down
│   ├── instruction-compiler.adapter.ts   # wraps @recoder/agent-instructions compiler
│   └── nats-outbox-publisher.adapter.ts  # publishes to NATS; degrades to log-only sink
├── services/
│   ├── run-transition.ts                 # PURE legal state machine (guards + transitionTaskRun wrap)
│   ├── task.service.ts                   # task create/route/context-pack orchestration
│   ├── run.service.ts                    # run lifecycle: claim/transition/handoff/verification
│   ├── approval.service.ts               # approval request + approve/reject (gate-checked)
│   ├── artifact.service.ts               # artifact + PR/preview artifact creation
│   ├── instruction.service.ts            # compile + persist instruction bundles w/ provenance
│   ├── policy.service.ts                 # policy decision evaluate + persist
│   ├── space.service.ts                  # spaces + space policies + repo connect
│   ├── memory-candidate.service.ts       # remember → review lifecycle (no direct durable write)
│   ├── workflow.service.ts               # workflow definition CRUD + run dispatch (driver contract)
│   ├── squad.service.ts                  # squads: leader-routing + autopilots (ported multica)
│   ├── run-event-ingest.service.ts       # RunEvent → validate → apply → append → outbox
│   └── outbox-drain.service.ts           # at-least-once drain loop (degrade-safe)
├── controllers/
│   └── agent-os.controller.ts            # HTTP handlers over the services (moved from legacy)
├── routes/
│   ├── agent-os.routes.ts                # /api/agent-os/* main table
│   ├── internal.routes.ts                # /internal/agent-os/* (INTERNAL_SERVICE_KEY) RunEvent ingest
│   ├── memory-candidate.routes.ts        # /api/agent-os/memory/lifecycle/*
│   ├── policy-evaluate.routes.ts         # /api/agent-os/policy/evaluate
│   ├── workflow.routes.ts                # /api/agent-os/workflows/*
│   └── squad.routes.ts                   # /api/agent-os/squads/*
├── mcp/
│   └── agent-os-engine.ts                # MCP tools: task.create/run.claim/approval.request/...
├── migrations/                           # canonical SQL (mirrored to backend/migrations; runner in persistence)
│   ├── 0001-agent-os-schema.sql          # tasks/runs/approvals/artifacts/instructions/policies/spaces/events/outbox
│   ├── 0002-conductor-workspaces.sql     # conductor_workspaces + runtime_credentials
│   └── 0003-squads.sql                   # squads + squad_members + squad_activity (NEW)
└── __tests__/
    ├── run-transition.test.ts            # legal/illegal state machine transitions
    ├── run-event-ingest.test.ts          # ingest → state + event + outbox, idempotency
    ├── approval-service.test.ts          # gate-checked approve/reject + audit append
    ├── outbox-drain.test.ts              # at-least-once, NATS-down degrade
    ├── squad.service.test.ts             # leader-routing + autopilot dispatch
    └── agent-os-routes.integration.test.ts # /api/agent-os/* happy + 401/403/validation paths
```

---

## 3. Per-file Responsibilities

| Path | Lang | Kind | Responsibility | Key exports |
|------|------|------|----------------|-------------|
| `index.ts` | ts | service | Public factory + interface; the ONLY thing other domains import | `createAgentOsModule(deps): AgentOsModule`, `type AgentOsModule` |
| `agent-os-module.ts` | ts | service | Composer: constructs services, wires repo/gate/outbox, exposes ports + `health()` | `AgentOsModuleImpl`, `buildAgentOsModule()` |
| `config.ts` | ts | config | Zod `AgentOsConfig` slice (repo driver, db url, NATS url, outbox interval, feature flags); fail-safe defaults | `agentOsConfigSchema`, `type AgentOsConfig`, `resolveAgentOsConfig(slice)` |
| `types.ts` | ts | type | Domain-internal DTOs not in packages/* (ingest result, drain stats, module deps) | `type AgentOsDeps`, `type IngestResult`, `type DrainStats` |
| `health.ts` | ts | service | Aggregate per-engine `up|down` (repository, outbox/NATS, gate, compiler) into `HealthReport` | `buildAgentOsHealth(engines): HealthReport` |
| `middleware/schema-guard.middleware.ts` | ts | middleware | `validateBody`/`validateQuery` — zod boundary validation → `sendError(VALIDATION_ERROR)` | `validateBody(schema)`, `validateQuery(schema)` |
| `ports/agent-os-repository.port.ts` | ts | port | The state-of-record CRUD interface every stateful op depends on (list/upsert per aggregate + snapshot) | `interface AgentOsRepositoryPort`, `type AgentOsRepositorySnapshot` |
| `ports/run-event-bus.port.ts` | ts | port | Ingest + subscribe seam for RunEvents (conductor/runtimes emit; drain consumes) | `interface RunEventBusPort`, `type RunEventEnvelope` |
| `ports/outbox-publisher.port.ts` | ts | port | Publish CloudEvents outbox records; ack/mark-delivered | `interface OutboxPublisherPort` |
| `ports/governance-gate.port.ts` | ts | port | `decide(write)` + `recordAudit(entry)` seam consumed from governance domain | `interface GovernanceGatePort`, `type GateDecision` |
| `ports/instruction-compiler.port.ts` | ts | port | Compile an `InstructionBundle` from sources with provenance | `interface InstructionCompilerPort` |
| `ports/index.ts` | ts | port | Barrel re-export of all ports | (re-exports) |
| `adapters/postgres-agent-os.repository.ts` | ts | repository | pg impl: parameterized `:param` SQL, `WHERE user_id = :user_id` scoping, jsonb columns; MOVED from legacy | `PostgresAgentOsRepository` |
| `adapters/json-file-agent-os.repository.ts` | ts | repository | JSON-file impl via `loadStore/saveStore`; dev + degrade | `JsonFileAgentOsRepository` |
| `adapters/in-memory-agent-os.repository.ts` | ts | repository | In-memory impl; tests + no-DB degrade path | `InMemoryAgentOsRepository` |
| `adapters/governance-gate.adapter.ts` | ts | client | Wraps `@recoder/governance` facade; on gate `down` degrades to **deny-by-default for risky writes / allow+log for safe** and reports `down` | `createGovernanceGateAdapter(deps)` |
| `adapters/instruction-compiler.adapter.ts` | ts | client | Wraps `@recoder/agent-instructions/agent-os-compiler`; degrades to `down` when sources unreadable | `createInstructionCompilerAdapter()` |
| `adapters/nats-outbox-publisher.adapter.ts` | ts | client | Publishes CloudEvents to NATS subject; degrades to log-only sink when NATS absent; MOVED from legacy | `createNatsOutboxPublisher(config)` |
| `services/run-transition.ts` | ts | service | PURE guards over `isAllowedTaskRunTransition`/`transitionTaskRun` from `@recoder/agent-os`; rejects illegal moves | `applyRunTransition(run, to, ctx)`, `assertLegalTransition(from,to)` |
| `services/task.service.ts` | ts | service | Task upsert/route/history/context-pack; wraps `TaskService`+`TaskRoutingService`; gate-checks writes | `TaskDomainService` |
| `services/run.service.ts` | ts | service | Run claim/transition/handoff/verification-result; emits RunEvents; uses `run-transition` | `RunDomainService` |
| `services/approval.service.ts` | ts | service | Approval request + approve/reject; gate + audit append; emits CloudEvents | `ApprovalDomainService` |
| `services/artifact.service.ts` | ts | service | Artifact + PR/preview artifact creation; hash + provenance | `ArtifactDomainService` |
| `services/instruction.service.ts` | ts | service | Compile + persist instruction bundles; provenance + source hashes | `InstructionDomainService` |
| `services/policy.service.ts` | ts | service | Evaluate + persist `PolicyDecision` via `@recoder/agent-policy` | `PolicyDomainService` |
| `services/space.service.ts` | ts | service | Spaces, space policies, GitHub repo connect; owner-scoped | `SpaceDomainService` |
| `services/memory-candidate.service.ts` | ts | service | `remember → review` lifecycle; never writes durable memory directly; evidence-required | `MemoryCandidateDomainService` |
| `services/workflow.service.ts` | ts | service | Workflow definition CRUD + run dispatch via `@recoder/workflow-engine` driver | `WorkflowDomainService` |
| `services/squad.service.ts` | ts | service | Squads: create/roster/leader-routing + autopilots; ported multica; uses `@recoder/coordination` squad-dispatch | `SquadDomainService` |
| `services/run-event-ingest.service.ts` | ts | service | Validate RunEvent → apply to state-of-record → append event log → enqueue outbox; idempotent by event id | `RunEventIngestService` |
| `services/outbox-drain.service.ts` | ts | service | At-least-once drain loop; claims pending outbox, publishes, marks delivered; degrade-safe; MOVED from legacy | `OutboxDrainService`, `startOutboxDrainLoop(deps)` |
| `controllers/agent-os.controller.ts` | ts | route | HTTP handlers delegating to services; `sendSuccess/sendError`; auth + owner scoping; MOVED from legacy | `AgentOsController` |
| `routes/agent-os.routes.ts` | ts | route | `/api/agent-os/*` route table; mounts sub-routers; `authenticateRequest` + `validateBody` | `createAgentOsRouter(module)` |
| `routes/internal.routes.ts` | ts | route | `/internal/agent-os/*` RunEvent ingest + evidence; `INTERNAL_SERVICE_KEY`-gated | `createInternalAgentOsRouter(module)` |
| `routes/memory-candidate.routes.ts` | ts | route | `/api/agent-os/memory/lifecycle/*` candidate list/create/review | `createMemoryCandidateRouter(module)` |
| `routes/policy-evaluate.routes.ts` | ts | route | `POST /api/agent-os/policy/evaluate` → live `PolicyDecision` | `createPolicyEvaluateRouter(module)` |
| `routes/workflow.routes.ts` | ts | route | `/api/agent-os/workflows/*` definitions + dispatch | `createWorkflowRouter(module)` |
| `routes/squad.routes.ts` | ts | route | `/api/agent-os/squads/*` roster + dispatch + activity | `createSquadRouter(module)` |
| `mcp/agent-os-engine.ts` | ts | client | MCP tools (`task.create`, `run.claim`, `run.transition`, `approval.request`, `memory.remember`, `squad.dispatch`); conforms `@recoder/agent-mcp` ToolRouter; passes interop chain | `registerAgentOsMcpTools(router, module)` |
| `migrations/0001-agent-os-schema.sql` | sql | migration | Core tables (see §4); vector ext; MOVED from legacy | (DDL) |
| `migrations/0002-conductor-workspaces.sql` | sql | migration | `conductor_workspaces`, `runtime_credentials`; MOVED from legacy | (DDL) |
| `migrations/0003-squads.sql` | sql | migration | `squads`, `squad_members`, `squad_activity` (NEW) | (DDL) |
| `__tests__/run-transition.test.ts` | ts | test | All legal transitions pass; every illegal transition rejected with `ErrorCode` | — |
| `__tests__/run-event-ingest.test.ts` | ts | test | Ingest applies state + appends event + enqueues outbox; duplicate event id is idempotent | — |
| `__tests__/approval-service.test.ts` | ts | test | approve/reject gate-checked; audit entry appended; rejected write blocked | — |
| `__tests__/outbox-drain.test.ts` | ts | test | Delivers pending once; NATS-down → records stay pending + health `down`, no data loss | — |
| `__tests__/squad.service.test.ts` | ts | test | Leader-routing picks capability match; autopilot dispatch emits RunEvent | — |
| `__tests__/agent-os-routes.integration.test.ts` | ts | test | happy path + 401 (no session) + 403 (cross-owner) + 400 (bad body) | — |

---

## 4. DB Schema (owned tables)

Canonical SQL lives here and is mirrored to `backend/migrations/`; the runner lives in `domains/persistence`. All access is app-layer scoped (`WHERE user_id = :user_id` / space membership) — **no Supabase RLS**.

**State-of-record (0001):**
- `agent_profiles`, `agent_sessions`, `agent_runtime_connections`, `agent_capabilities`
- `spaces`, `space_members`, `space_repositories`, `space_policies`
- `tasks`, `task_assignments`, `task_runs`, `task_run_steps`
- `approval_requests`, `approval_decisions`
- `artifacts`, `artifact_parts`, `artifact_links`
- `instruction_bundles`, `instruction_sources`, `instruction_source_hashes`
- `policy_decisions`
- `memory_items`, `memory_candidates`, `memory_reviews`, `memory_embeddings`
- `runtime_evidence`, `runtime_credentials`
- `work_locks`, `work_signals`
- `events` (immutable append log), `event_outbox` (CloudEvents, at-least-once)
- `audit_log` (SHA-256 Merkle chain — written through governance)
- `github_delivery_links`, `webhook_deliveries`, `connector_installations`, `oss_components`
- MCP registry mirror: `mcp_servers`, `mcp_tools`, `mcp_sessions`, `mcp_tool_calls`

**Conductor workspaces (0002):** `conductor_workspaces`, `runtime_credentials`.

**Squads (0003, NEW):**
- `squads(squad_id pk, space_id fk, display_name, leader_id, leader_kind, autopilot jsonb, owner_id, created_at, updated_at)`
- `squad_members(squad_id fk, member_id, member_kind, role, project_id, added_at, primary key(squad_id, member_id))`
- `squad_activity(activity_id pk, squad_id fk, actor, action, detail, at)` — capped log (200 rows/squad, pruned on insert)

---

## 5. HTTP / WS Edges

Mounted by the `edge` domain's route table; every call passes the interop chain `authorize → risk → policy → audit`.

**`/api/agent-os/*`** (session-authenticated, owner-scoped):
- `GET /health`, `GET /summary`
- `GET|POST /agents`, `POST /agents/reconcile`
- `GET|POST /spaces`, `POST /spaces/:spaceId/repositories/github`, `GET|POST /spaces/:spaceId/policies`
- `GET|POST /tasks`, `POST /tasks/route`, `GET /tasks/:taskId/history`, `GET /tasks/:taskId/context-pack`
- `GET|POST /runs`, `POST /runs/:runId/claim`, `POST /runs/:runId/transition`, `POST /runs/:runId/handoff`, `POST /runs/:runId/verification-results`, `GET /runs/:runId/history`
- `GET|POST /approvals`, `POST /approvals/:id/approve`, `POST /approvals/:id/reject`
- `GET|POST /artifacts`, `POST /artifacts/pull-request`, `POST /artifacts/preview`
- `GET|POST /runtime-evidence`
- `GET|POST /instructions`, `POST /instructions/compile`
- `POST /policy/evaluate`, `GET|POST /policies`
- `GET|POST /memory/candidates`, `GET|POST /memory/lifecycle/candidates`, `POST /memory/lifecycle/candidates/:id/review`
- `GET|POST /workflows`, `POST /workflows/:id/dispatch`
- `GET|POST /squads`, `POST /squads/:id/members`, `POST /squads/:id/dispatch`, `GET /squads/:id/activity`
- `GET /events` (paginated, immutable log)

**`/internal/agent-os/*`** (`INTERNAL_SERVICE_KEY` header, worker-to-backend only):
- `POST /events` — RunEvent ingest (batch)
- `POST /runs/:runId/steps` — step append
- `POST /runtime-evidence` — evidence attach
- `POST /outbox/drain` — manual drain trigger

**WS:** run/event stream is exposed via the `edge` domain's `/sync` channel; this domain publishes `RunEvent`s onto the bus, edge fans out.

---

## 6. Interfaces

**Exposed to other domains (via `ports/` + `index.ts`):**
- `AgentOsModule` — the one public interface (services + `health()`).
- `AgentOsRepositoryPort` — implemented by `domains/persistence` (or the pg adapter here); consumed by conductor/interop for read models.
- `RunEventBusPort` — conductor + runtimes emit `RunEvent`s here; drain + edge subscribe.
- `OutboxPublisherPort` — interop/edge can drive drain.

**Consumed from other domains:**
- `GovernanceGatePort` ← governance domain (`@recoder/governance` facade) — every write.
- `InteropChain` ← interop domain — every edge + MCP call.
- `InstructionCompilerPort` ← `@recoder/agent-instructions`.
- `QueryExecutor`/pg `Pool` ← persistence domain.
- `Session` ← identity domain — carried on every request.
- `AppConfig` slice ← bootstrap.
- Policy engine ← `@recoder/agent-policy`; workflow driver ← `@recoder/workflow-engine`; squad dispatch ← `@recoder/coordination`.

---

## 7. Reuse vs New

**REUSE (packages/*, do not redefine):**
- `@recoder/agent-os` — domain services (`RunService`, `ApprovalService`, `ArtifactService`, `TaskService`, `TaskRoutingService`, `MemoryService`, `RunHistoryService`, `RuntimeEvidenceService`, `WorkSignalService`, `AgentProfileReconciliationService`, `WorkLockService`) + pure `transitionTaskRun`/`isAllowedTaskRunTransition`/`isTerminalTaskRunState` + all domain types.
- `@recoder/agent-schemas` — zod schemas for boundary validation (`taskSpecSchema`, `approvalSchema`, `artifactSchema`, `runEventSchema`, `memoryCandidateSchema`, …).
- `@recoder/agent-events` — `RunEvent`, CloudEvents mappers (`mapTaskCreatedToCloudEvent`, `mapRunEventToCloudEvent`, …), `createOutboxRecord`, `OutboxRecord`.
- `@recoder/agent-instructions/agent-os-compiler` — `compileAgentOsInstructionBundle`.
- `@recoder/governance` — gate facade + Merkle verifier.
- `@recoder/agent-policy` — deterministic policy decisions.
- `@recoder/agent-memory` — candidate lifecycle helpers.
- `@recoder/agent-mcp` — ToolRouter shape.
- `@recoder/workflow-engine` / `@recoder/agent-workflows` — workflow driver contract.
- `@recoder/coordination` — `squad-dispatch` + `squad-leader-policy` (leader routing).
- `@recoder/oss-registry`, `@recoder/ui-agent-os` (cockpit summary), `@recoder/logger`.

**REUSE existing backend code (MOVE behind composer, do not rewrite):**
- `backend/src/agent-os/controllers/agent-os.controller.ts` → `controllers/agent-os.controller.ts`
- `backend/src/agent-os/repositories/*` → `adapters/*-agent-os.repository.ts`
- `backend/src/agent-os/outbox-drain.service.ts` + `outbox-drain-loop.ts` → `services/outbox-drain.service.ts`
- `backend/src/agent-os/nats-outbox-publisher.ts` → `adapters/nats-outbox-publisher.adapter.ts`
- `backend/src/agent-os/routes/{agent-os,internal,memory-candidate,policy-evaluate}.routes.ts` → `routes/*`
- `backend/src/agent-os/middleware/schema-guard.middleware.ts` → `middleware/`
- `backend/src/agent-os/migrations/000{1,2}-*.sql` → `migrations/`
- `backend/src/a2a/squad.service.ts` + `squad-dispatch.service.ts` → `services/squad.service.ts` (ported to state-of-record instead of JSON store)

**REPLACE (do not carry forward):**
- Legacy `service-container.ts` mutable singleton + direct `process.env` reads → replaced by `createAgentOsModule(deps)` pure factory + injected `AgentOsConfig`.
- `agentOsContainer` top-level export → removed.

**NEW (write):**
- `agent-os-module.ts` composer + `index.ts` factory + `config.ts` + `types.ts` + `health.ts`.
- `ports/*` explicit port interfaces (formalize the seams).
- `adapters/governance-gate.adapter.ts`, `adapters/instruction-compiler.adapter.ts`.
- `services/run-transition.ts` (extract the state-machine guard), `services/run-event-ingest.service.ts`, `services/workflow.service.ts`, `services/squad.service.ts` (ported).
- `routes/workflow.routes.ts`, `routes/squad.routes.ts`.
- `mcp/agent-os-engine.ts` (MCP tool surface for control-plane ops).
- `migrations/0003-squads.sql`.
- tests in `__tests__/`.

**REUSE, don't split:** the code-graph / recodergit / brain services currently living in `backend/src/agent-os/` are NOT state-of-record — they move to the **memory**/**conductor** domains respectively, not here. This keeps this domain's boundary clean (state-of-record only).

---

## 8. Degrade-safe behavior

| Dependency absent | Behavior |
|---|---|
| Postgres (`AGENT_OS_DATABASE_URL` missing) | Repository falls back to json/memory driver; `health.repository = down` labelled `degraded`; risky writes denied by gate policy, never faked 200 |
| NATS | Outbox publisher becomes log-only sink; records stay `pending` in `event_outbox` (no loss); `health.outbox = down` |
| Governance gate | Deny-by-default for risky writes (approvals, deploys, memory promote); allow+log for safe reads; `health.gate = down` |
| Instruction compiler sources unreadable | `POST /instructions/compile` returns `SERVICE_UNAVAILABLE`; `health.compiler = down` |
| INTERNAL_SERVICE_KEY unset | `/internal/*` returns 401 for all callers (fail-closed) |

---

## 9. Implementation Order

1. **Ports + config + types + health** (`ports/*`, `config.ts`, `types.ts`, `health.ts`) — the seams first, so the composer and adapters compile against interfaces.
2. **Repository adapters** — MOVE the three legacy repositories behind `AgentOsRepositoryPort`; keep `PostgresAgentOsRepository` as the primary.
3. **`run-transition.ts`** (pure) + `run-transition.test.ts` — TDD the legal state machine (RED → GREEN).
4. **Domain services** — wire `@recoder/agent-os` services to the repository port: task → run → approval → artifact, then instruction/policy/space/memory-candidate/workflow.
5. **RunEvent ingest + outbox drain** (`run-event-ingest.service.ts`, `outbox-drain.service.ts` + `nats-outbox-publisher.adapter.ts`) + tests — the event spine; idempotency + at-least-once.
6. **Governance + instruction adapters** — gate every write; compile bundles.
7. **Squads** — `0003-squads.sql` migration, `squad.service.ts` (port multica leader-routing + autopilots onto state-of-record) + test.
8. **Composer + factory** (`agent-os-module.ts`, `index.ts`) — fuse everything behind `AgentOsModule`; report health.
9. **Controllers + routes + middleware** — MOVE controller, wire sub-routers, `/internal/*` guard, schema validation.
10. **MCP engine** (`mcp/agent-os-engine.ts`) — register tools per the wiring checklist (`IN_PROC_SERVERS` + `ENGINE_SERVERS`, `registerAgentOsMcpTools`, call in `buildInProcEngineRouter`).
11. **Integration test** (`agent-os-routes.integration.test.ts`) + run `pnpm test:contracts:agent-os` / `pnpm test:evals:agent-os` / `pnpm agent:instructions:check`.

**Verification:** `pnpm check-types`, `pnpm test` (vitest, co-located), `pnpm test:contracts:agent-os`, `pnpm test:evals:agent-os`.
