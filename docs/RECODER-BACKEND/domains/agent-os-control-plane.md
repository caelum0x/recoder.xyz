# Domain: Agent OS Control Plane

**Folder prefix:** `backend/src/domains/agent-os/`
**Boundary:** State-of-record owner — tasks, runs, approvals, artifacts, instructions, policies, spaces, events/outbox, workflows, memory candidates, and **squads** (leader-routing + autopilots ported from multica). Persists and serves the `@recoder/agent-os` contracts over `/api/agent-os/*` (+ `/internal/agent-os/*`).
**Target size:** ~52 files (shipped).

> **Reconciled to shipped reality (2026-07-18).** This domain COMPOSED the frozen
> `@recoder/agent-os` package fresh (Phase 5a, commit `702f9d0d`) rather than
> *moving* the legacy `backend/src/agent-os/` dir behind a composer — the granular
> per-aggregate services this doc originally sketched (`task.service.ts`,
> `run.service.ts`, `approval.service.ts`, …) live INSIDE the package
> (`TaskService`, `transitionTaskRun`, `isAllowedTaskRunTransition`) and are wired
> directly in the CRUD routes, so they do NOT exist as domain files. The legacy
> flat `src/agent-os/` dir was later absorbed + removed (`84c3d41f3`). Sections
> below are updated to the as-built tree; the design rationale is preserved.

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

This domain COMPOSES the frozen `@recoder/agent-os` package fresh behind a single `AgentOsModule` interface rather than moving/copying the legacy `backend/src/agent-os/` dir (that flat dir was later absorbed + removed). The heavy domain logic already lives in the `@recoder/agent-os` package (`TaskService`, `transitionTaskRun`, `isAllowedTaskRunTransition`, run/approval/artifact contracts, …) — this domain WIRES those contracts to persistence, governance, and edges.

### Design principles honored

- **Config only from bootstrap.** No `process.env` in domain code (the legacy `service-container.ts` reads env directly — this is REPLACED by a typed `AgentOsConfig` slice injected at construction).
- **Pure factory.** `createAgentOsModule(deps)` — no top-level singletons (legacy `agentOsContainer` mutable singleton is removed).
- **Repository is a port.** Business logic depends on `AgentOsRepositoryPort`; persistence provides the pg impl. Two drivers (postgres/in-memory) ship as degrade-safe adapters — an injected repository wins, else the durable pg adapter binds to the injected executor, else in-memory degrade (all behind the same frozen port).
- **Truthful health.** `health()` reports `up|down|degraded` per engine (repository driver, outbox/NATS, instruction compiler, squad autopilot seams).

---

## 2. File Tree

```
backend/src/domains/agent-os/
├── index.ts                              # factory + the ONE public interface (AgentOsModule)
├── agent-os-module.ts                    # AgentOsComposer: fuses repo + gate + ingest + squads + workflows
├── config.ts                             # AgentOsConfig slice (zod) + defaults + sliceAgentOsConfig()
├── types.ts                              # domain-internal types (AgentOsDeps, ...)
├── health.ts                             # buildAgentOsHealth() aggregation for this module
├── ports/
│   ├── index.ts                          # barrel
│   ├── agent-os-repository.port.ts       # Repository PORT (state-of-record CRUD) — EXPOSED to persistence
│   ├── run-event.port.ts                 # RunEvent ingest + subscribe PORT — EXPOSED to conductor/runtimes
│   ├── outbox-publisher.port.ts          # CloudEvents publisher PORT (consumed: interop/edge)
│   ├── governance-gate.port.ts           # decide()/recordAudit() PORT — CONSUMED from governance
│   ├── instruction-compiler.port.ts      # compile bundle PORT — CONSUMED from agent-instructions
│   └── squad-autopilot.port.ts           # SquadConductorPort dispatch seam (autopilot → conductor)
├── adapters/
│   ├── postgres-agent-os.repository.ts   # pg impl of repository port (:param SQL, WHERE user_id)
│   ├── in-memory-agent-os.repository.ts  # in-memory impl (tests / no-DB degrade)
│   ├── postgres-workflow-definition.store.ts # durable pg workflow-definition store
│   ├── agent-os-workflow-runner.driver.ts # default WorkflowDriver skinning @recoder/agent-workflows
│   ├── governance-gate.adapter.ts        # wraps @recoder/governance gate seam
│   ├── instruction-compiler.adapter.ts   # wraps @recoder/agent-instructions compiler
│   └── nats-outbox-publisher.adapter.ts  # publishes to NATS; degrades to log-only sink
├── services/
│   ├── run-transition.ts                 # PURE legal state machine (guards + transitionTaskRun wrap)
│   ├── run-event-ingest.service.ts       # RunEvent → validate → apply → append → outbox
│   ├── outbox-drain.service.ts           # at-least-once drain loop (degrade-safe)
│   ├── squad.service.ts                  # squads: leader-routing + in-memory store (ported multica)
│   ├── squad-autopilot.service.ts        # autopilot loop (cron→beads→conductor); truthful degrade
│   └── workflow.service.ts               # workflow definition CRUD + dispatch (driver contract)
├── routes/
│   ├── agent-os.routes.ts                # /api/agent-os/* base table (summary/tasks/runs) + mounts CRUD
│   ├── agent-os-crud.routes.ts           # full CRUD edge (spaces/agents/tasks/runs/artifacts/memory/...)
│   ├── agent-os-crud.schemas.ts          # zod boundary schemas for the CRUD edge
│   ├── internal-agent-os.routes.ts       # /internal/agent-os/* (INTERNAL_SERVICE_KEY) RunEvent ingest
│   ├── squad-board.routes.ts             # GET /squads/board (autopilot roll-up)
│   ├── squad-read.routes.ts              # /squads read-only introspection (list/detail/members/activity)
│   ├── workflow.routes.ts                # /api/agent-os/workflows/* CRUD + dispatch
│   └── workflow.schemas.ts               # zod schemas for the workflow edge
├── mcp/
│   └── agent-os-engine.ts                # READ-ONLY MCP tools: agent_os_summary/list_tasks/list_runs
├── migrations/                           # canonical SQL (mirrored to backend/migrations; runner in persistence)
│   ├── 0001-agent-os-schema.sql          # tasks/runs/approvals/artifacts/instructions/policies/spaces/events/outbox
│   ├── 0003-squads.sql                   # squads + squad_members + squad_activity
│   ├── 0004-state-of-record.sql          # durable jsonb document store for PostgresAgentOsRepository
│   └── 0005-workflow-definitions.sql     # durable jsonb store for PostgresWorkflowDefinitionStore
└── __tests__/
    ├── run-transition.test.ts            # legal/illegal state machine transitions
    ├── run-event-ingest.test.ts          # ingest → state + event + outbox, idempotency
    ├── agent-os-crud.routes.test.ts      # /api/agent-os/* CRUD happy + 401/403/validation paths
    ├── agent-os-repository.contract.test.ts # repository port contract (pg + in-memory parity)
    ├── agent-os-engine.mcp.test.ts       # read-only MCP tool surface
    ├── internal-agent-os.routes.test.ts  # INTERNAL_SERVICE_KEY-gated ingest edges
    ├── postgres-workflow-definition.store.test.ts # durable workflow store
    ├── agent-os-workflow-runner.driver.test.ts # workflow runner driver
    ├── workflow.routes.test.ts / workflow.service.test.ts # workflow CRUD + dispatch
    ├── squad.test.ts / squad-autopilot.test.ts # leader-routing + autopilot dispatch
    └── squad-read.routes.test.ts / squad-board.routes.test.ts # squad read + board edges
```

---

## 3. Per-file Responsibilities

| Path | Lang | Kind | Responsibility | Key exports |
|------|------|------|----------------|-------------|
| `index.ts` | ts | service | Public factory + interface; the ONLY thing other domains import | `createAgentOsModule(deps): Promise<AgentOsModule>`, `interface AgentOsModule` |
| `agent-os-module.ts` | ts | service | `AgentOsComposer`: selects repo driver, wires gate/outbox/ingest/drain/squads/workflows, exposes seams + `health()` | `class AgentOsComposer` (async `AgentOsComposer.create(deps)`) |
| `config.ts` | ts | config | Zod `AgentOsConfig` slice (repo driver, NATS url, outbox/autopilot intervals, feature flags); fail-safe defaults | `type AgentOsConfig`, `type AgentOsRepositoryDriver`, `sliceAgentOsConfig(config, overrides)` |
| `types.ts` | ts | type | Domain-internal DTOs not in packages/* (module deps, injected seams) | `type AgentOsDeps` |
| `health.ts` | ts | service | Aggregate per-engine `up\|down\|degraded` (repository, outbox/NATS, compiler, squad autopilot) into `ComponentHealth` | `buildAgentOsHealth(engines): Promise<ComponentHealth>` |
| `ports/agent-os-repository.port.ts` | ts | port | The state-of-record CRUD interface every stateful op depends on (list/upsert per aggregate + snapshot) | `interface AgentOsRepositoryPort`, `type AgentOsRepositorySnapshot`, `type RepositoryResult` |
| `ports/run-event.port.ts` | ts | port | Ingest + subscribe seam for RunEvents (conductor/runtimes emit; drain consumes) | `interface RunEventBusPort`, `type RunEventEnvelope`, `type RunEventIngestResult` |
| `ports/outbox-publisher.port.ts` | ts | port | Publish CloudEvents outbox records; ack/mark-delivered | `interface OutboxPublisherPort` |
| `ports/governance-gate.port.ts` | ts | port | `decide()` + `recordAudit()` seam consumed from governance domain | `interface GovernanceGatePort`, `type GateVerdict`, `type AuditRecord` |
| `ports/instruction-compiler.port.ts` | ts | port | Compile an `InstructionBundle` from sources with provenance | `interface InstructionCompilerPort` |
| `ports/squad-autopilot.port.ts` | ts | port | Conductor dispatch seam for the autopilot loop (late-bound by bootstrap) | `interface SquadConductorPort`, `type SquadDispatchRequest`, `type SquadDispatchResult` |
| `ports/index.ts` | ts | port | Barrel re-export of all ports | (re-exports) |
| `adapters/postgres-agent-os.repository.ts` | ts | repository | pg impl: parameterized `:param` SQL over a lossless jsonb document store | `PostgresAgentOsRepository` |
| `adapters/in-memory-agent-os.repository.ts` | ts | repository | In-memory impl; tests + no-DB degrade path | `InMemoryAgentOsRepository` |
| `adapters/postgres-workflow-definition.store.ts` | ts | repository | Durable pg jsonb store for workflow definitions (survives restart) | `PostgresWorkflowDefinitionStore` |
| `adapters/agent-os-workflow-runner.driver.ts` | ts | client | Default `WorkflowDriver` skinning the frozen `@recoder/agent-workflows` runner (truthful dispatch, not `not_configured`) | `AgentOsWorkflowRunnerDriver` |
| `adapters/governance-gate.adapter.ts` | ts | client | Wraps the injected `@recoder/governance` gate seam; degrade-safe | `createGovernanceGateAdapter(deps)` |
| `adapters/instruction-compiler.adapter.ts` | ts | client | Wraps `@recoder/agent-instructions/agent-os-compiler`; degrades when sources unreadable | `createInstructionCompilerAdapter(logger)` |
| `adapters/nats-outbox-publisher.adapter.ts` | ts | client | Publishes CloudEvents to NATS subject; degrades to log-only sink when NATS absent | `createNatsOutboxPublisher(config)` |
| `services/run-transition.ts` | ts | service | PURE guards over `isAllowedTaskRunTransition`/`transitionTaskRun` from `@recoder/agent-os`; rejects illegal moves | (pure transition helpers) |
| `services/run-event-ingest.service.ts` | ts | service | Validate RunEvent → apply to state-of-record → append event log → enqueue outbox; idempotent by event id | `RunEventIngestService` |
| `services/outbox-drain.service.ts` | ts | service | At-least-once drain loop; claims pending outbox, publishes, marks delivered; degrade-safe | `OutboxDrainService` |
| `services/squad.service.ts` | ts | service | Squads: create/roster/leader-routing over an in-memory store; ported multica | `SquadService`, `InMemorySquadStore` |
| `services/squad-autopilot.service.ts` | ts | service | Autopilot loop (cron→beads→conductor); ticks report truthful `degraded` when a seam is absent | `SquadAutopilotService` |
| `services/workflow.service.ts` | ts | service | Workflow definition CRUD + dispatch via a `WorkflowDriver`; durable pg or in-memory store | `WorkflowService`, `InMemoryWorkflowDefinitionStore`, `type WorkflowDefinitionStore` |
| `routes/agent-os.routes.ts` | ts | route | `/api/agent-os/*` base table (`/summary`, `/tasks`, `/runs`) + mounts the CRUD sub-router | `buildAgentOsRouter(deps)` |
| `routes/agent-os-crud.routes.ts` | ts | route | Full CRUD edge: spaces/agents/tasks/runs (create + transition, composing the frozen contracts)/artifacts/memory/instructions/policies/events; zod-validated | `buildAgentOsCrudRouter(deps)` |
| `routes/agent-os-crud.schemas.ts` | ts | schema | Zod boundary schemas for the CRUD edge | (schema exports) |
| `routes/internal-agent-os.routes.ts` | ts | route | `/internal/agent-os/*` RunEvent ingest (`/events`, `/runs/:runId/steps`, `/runtime-evidence`, `/outbox/drain`); `INTERNAL_SERVICE_KEY`-gated | `buildInternalAgentOsRouter(deps)` |
| `routes/squad-board.routes.ts` | ts | route | `GET /squads/board` — autopilot roll-up (mounted first so it wins over `/squads/:squadId`) | `buildSquadBoardRouter(deps)` |
| `routes/squad-read.routes.ts` | ts | route | `/squads` READ-ONLY introspection (list/detail/members/activity); squads are never mutated over HTTP/MCP | `buildSquadReadRouter(deps)` |
| `routes/workflow.routes.ts` | ts | route | `/api/agent-os/workflows/*` definitions CRUD + `POST /workflows/:workflowId/dispatch` | `buildWorkflowRouter(deps)` |
| `routes/workflow.schemas.ts` | ts | schema | Zod schemas for the workflow edge | (schema exports) |
| `mcp/agent-os-engine.ts` | ts | client | READ-ONLY MCP introspection tools (`agent_os_summary`, `agent_os_list_tasks`, `agent_os_list_runs`) | `buildAgentOsMcpTools(repository)` |
| `migrations/0001-agent-os-schema.sql` | sql | migration | Core tables (see §4); vector ext | (DDL) |
| `migrations/0003-squads.sql` | sql | migration | `squads`, `squad_members`, `squad_activity` | (DDL) |
| `migrations/0004-state-of-record.sql` | sql | migration | Lossless jsonb document store the `PostgresAgentOsRepository` binds to | (DDL) |
| `migrations/0005-workflow-definitions.sql` | sql | migration | Durable jsonb store the `PostgresWorkflowDefinitionStore` binds to | (DDL) |
| `__tests__/*` | ts | test | run-transition (legal/illegal), run-event-ingest (idempotent ingest→state+event+outbox), agent-os-crud routes (happy + 401/403/validation), repository contract (pg∥in-memory parity), MCP engine, internal ingest edges, workflow store/driver/routes/service, squad + squad-autopilot + squad read/board | — |

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

> **Conductor workspaces** (`conductor_workspaces`, `runtime_credentials`) ship in the **conductor** domain's own migrations, not here. There is no `0002` in this domain — the migration numbering jumps `0001 → 0003`.

**Squads (0003):**
- `squads(squad_id pk, space_id fk, display_name, leader_id, leader_kind, autopilot jsonb, owner_id, created_at, updated_at)`
- `squad_members(squad_id fk, member_id, member_kind, role, project_id, added_at, primary key(squad_id, member_id))`
- `squad_activity(activity_id pk, squad_id fk, actor, action, detail, at)` — capped log (pruned on insert)

**State-of-record (0004):** a lossless jsonb document store the `PostgresAgentOsRepository` binds to (durable, survives restart).

**Workflow definitions (0005):** a lossless jsonb store the `PostgresWorkflowDefinitionStore` binds to (durable workflow definitions).

---

## 5. HTTP / WS Edges

Mounted by the `edge` domain's route table; every call passes the interop chain `authorize → risk → policy → audit`.

Reads sit behind `middleware.authenticate`; writes behind `middleware.authenticateMutating` (never an anonymous principal). Squads + instructions + policies + approvals are **read-only mirrors** on this surface — their authoritative lifecycle lives in the governance domain / the compiler / the gate; they are never mutated over `/api/agent-os` or MCP.

**`/api/agent-os/*`** (session-authenticated):
- `GET /summary`
- `GET /agents`, `GET /agents/:agentId`, `POST /agents`
- `GET /spaces`, `GET /spaces/:spaceId`, `POST /spaces`, `PUT /spaces/:spaceId/policy`
- `GET /tasks`, `GET /tasks/:taskId`, `POST /tasks`
- `GET /runs`, `GET /runs/:runId`, `POST /runs` (creation composes `TaskService.createRun`), `POST /runs/:runId/transition` (legality via `isAllowedTaskRunTransition`/`transitionTaskRun`)
- `GET /approvals`, `GET /approvals/:approvalId` (READ-ONLY mirror)
- `GET /artifacts`, `GET /artifacts/:artifactId`, `POST /artifacts`
- `GET /runtime-evidence` (read model; ingest is the internal edge's)
- `GET /memory/items`, `GET /memory/candidates`, `POST /memory/candidates` (evidence-backed proposal; promotion stays a reviewed action, never this edge)
- `GET /instructions`, `GET /instructions/:bundleId` (READ-ONLY: compiler-produced)
- `GET /policies`, `GET /policies/:decisionId` (READ-ONLY: gate-produced)
- `GET /events` (filter by `taskId`/`runId`; append-only log)
- `GET /workflows`, `GET /workflows/:workflowId`, `POST /workflows`, `DELETE /workflows/:workflowId`, `POST /workflows/:workflowId/dispatch`
- `GET /squads/board`, `GET /squads`, `GET /squads/:squadId`, `GET /squads/:squadId/members`, `GET /squads/:squadId/activity` (all READ-ONLY)

> **Not shipped as HTTP edges** (design sketch that reality did not build): `POST /agents/reconcile`, `POST /tasks/route`, task history/context-pack, run `claim`/`handoff`/`verification-results`, approval `approve`/`reject`, `POST /artifacts/pull-request`/`preview`, `POST /instructions/compile`, `POST /policy/evaluate`, and all squad mutations (`POST /squads`, `/members`, `/dispatch`). These operations live inside the composed services / other domains, not on this router.

**`/internal/agent-os/*`** (`INTERNAL_SERVICE_KEY` header, worker-to-backend only):
- `POST /events` — RunEvent ingest (batch)
- `POST /runs/:runId/steps` — step append
- `POST /runtime-evidence` — evidence attach
- `POST /outbox/drain` — manual drain trigger

(The same internal router is also reachable under the module's own `<mountBase>/internal/*` for back-compat.)

**WS:** run/event stream is exposed via the `edge` domain's `/stream` channel; this domain publishes `RunEvent`s onto the bus, edge fans out.

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
- Policy engine ← `@recoder/agent-policy`; workflow runner/driver ← `@recoder/agent-workflows`; squad autopilot dispatch ← the injected `SquadConductorPort` + beads seams.

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
- `@recoder/agent-workflows` — workflow runner + driver contract (the shipped `AgentOsWorkflowRunnerDriver` skins it).
- squad leader-routing is ported from multica into `services/squad.service.ts` (an in-memory store); the autopilot's dispatch flows through the injected `SquadConductorPort` + beads seams, not a package.
- `@recoder/logger` and the shared http/error helpers.

**As-built (COMPOSED fresh, NOT moved):** Phase 5a composed the frozen `@recoder/agent-os` package directly (commit `702f9d0d`) rather than moving the legacy `backend/src/agent-os/` dir behind a composer. The granular controllers/repositories/routes this doc originally planned to MOVE were **not** carried over file-for-file:
- The CRUD edge is written fresh in `routes/agent-os-crud.routes.ts` (composing `TaskService`/`transitionTaskRun`), not a moved `agent-os.controller.ts` — there is no `controllers/` dir.
- Repositories are `postgres` + `in-memory` only (no `json-file` driver).
- Boundary validation uses the shared `http/middleware/validate.js` + co-located `*.schemas.ts` — there is no `middleware/schema-guard.middleware.ts`.
- The legacy flat `src/agent-os/` dir was later absorbed + removed (`84c3d41f3`); nothing in this domain still points at it.

**REPLACE (do not carry forward):**
- Legacy `service-container.ts` mutable singleton + direct `process.env` reads → replaced by `createAgentOsModule(deps)` pure factory + injected `AgentOsConfig`.
- `agentOsContainer` top-level export → removed.

**NEW (write):**
- `agent-os-module.ts` composer + `index.ts` factory + `config.ts` + `types.ts` + `health.ts`.
- `ports/*` explicit port interfaces (formalize the seams).
- `adapters/governance-gate.adapter.ts`, `adapters/instruction-compiler.adapter.ts`.
- `services/run-transition.ts` (extract the state-machine guard), `services/run-event-ingest.service.ts`, `services/workflow.service.ts`, `services/squad.service.ts` (ported) + `services/squad-autopilot.service.ts`.
- `adapters/agent-os-workflow-runner.driver.ts` + `adapters/postgres-workflow-definition.store.ts`.
- `routes/agent-os-crud.routes.ts` (+ schemas), `routes/workflow.routes.ts` (+ schemas), `routes/squad-read.routes.ts`, `routes/squad-board.routes.ts`.
- `mcp/agent-os-engine.ts` (READ-ONLY MCP introspection tools — summary/list-tasks/list-runs).
- `migrations/0003-squads.sql`, `0004-state-of-record.sql`, `0005-workflow-definitions.sql`.
- tests in `__tests__/`.

**REUSE, don't split:** the code-graph / recodergit / brain services currently living in `backend/src/agent-os/` are NOT state-of-record — they move to the **memory**/**conductor** domains respectively, not here. This keeps this domain's boundary clean (state-of-record only).

---

## 8. Degrade-safe behavior

| Dependency absent | Behavior |
|---|---|
| Postgres executor absent / driver ≠ `postgres` | Repository falls back to the in-memory driver; health reports the effective driver truthfully (`memory`); infra faults on the pg path surface as truthful 503s, never faked 200 |
| NATS | Outbox publisher becomes log-only sink; records stay `pending` in `event_outbox` (no loss); `health.outbox = down` |
| Governance gate | Writes route through the injected gate seam; a denied verdict refuses the write, never a faked 200 |
| Instruction compiler sources unreadable | Compiler is a consumed seam (not an HTTP edge here); it degrades truthfully in health when sources are unreadable |
| Squad autopilot seams (beads/conductor) absent | Autopilot ticks report a truthful `degraded`, never a faked launch |
| INTERNAL_SERVICE_KEY unset | `/internal/*` returns 401 for all callers (fail-closed) |

---

## 9. Implementation Order

> **Historical build plan.** This ordering reflects the original design; the
> as-built (Phase 5a, `702f9d0d`) deviated where noted above — it COMPOSED
> `@recoder/agent-os` fresh (no legacy MOVE), shipped only `postgres` + `in-memory`
> repositories, wrote the CRUD edge fresh (no `controllers/`, no
> `middleware/schema-guard`), and exposed READ-ONLY MCP tools. The MCP engine
> registers via `buildAgentOsMcpTools(repository)` in the composer, not
> `registerAgentOsMcpTools`.

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
