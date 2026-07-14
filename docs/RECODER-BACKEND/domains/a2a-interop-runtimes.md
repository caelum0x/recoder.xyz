# Domain: A2A & Interop Runtimes

Folder prefix: `backend/src/domains/interop/`
Domain key: `interop`
Owner boundary: **Agent-to-agent wire + runtime adapters.** The A2A envelope
ingress/egress, agent-cards, orchestration/patterns, the
`authorize → risk → policy → audit` edge chain, and the `ConductorRuntime`
adapters (claude / codex / cursor / opencode / pi / windsurf / replit / openfang)
that dispatch coding agents and emit `RunEvent`s back to the control plane.

---

## 1. Overview

`interop` is the backend's **hostile-by-default edge and its runtime fan-out**.
It is the ONE domain every other edge and every MCP tool call passes through
(the `InteropChain`), and it is the ONE domain that turns a control-plane
`Task`/`Run` into a live coding-agent process and streams the result back as
`RunEvent`s.

It has two faces:

1. **Wire face (A2A in/out).** Untrusted inbound A2A envelopes (from other
   Recoder instances, external agents, connectors, webhooks) are verified
   (HMAC / ed25519), identity-bound, risk-scored, policy-checked, and audited
   *before* any handler runs. Outbound, it seals and signs envelopes and
   publishes agent-cards describing what this instance can do.
2. **Runtime face (dispatch out).** It owns the `ConductorRuntime` adapter
   registry. Given a `Task` + `InstructionBundle`, it selects a runtime
   (claude/codex/opencode/pi/openfang/…), spawns/attaches the connector
   process, streams stdout→`RunEvent`, tracks heartbeat/SLO, and lands results
   through governance. Multi-dispatch fans a single task to N runtimes
   (squad pattern, ported from the Go multica idea into TS).

**Non-goals** (owned elsewhere): task/run/approval *state of record* lives in
`agent-os`; tmux/worktree substrate + reconciler live in `conductor`; the
governance kernel (Merkle audit) lives in `governance`; MCP host registry lives
in `engines`. `interop` *consumes* those ports; it does not own their state.

Every WRITE routes through `GovernanceGate.decide()`. Every edge + MCP call
routes through the local `InteropChain`. Secrets fail SAFE (missing connector
key → that runtime reports `down`, never a faked success).

---

## 2. File tree (40 files, ~38 impl + 5 tests)

```
backend/src/domains/interop/
  index.ts                              # factory createInteropModule(deps) + public InteropModule interface
  interop-module.ts                     # composer: fuses wire + gate + runtimes behind one interface
  types.ts                              # domain-internal types (registry rows, dispatch plan, connector spec)
  config.ts                             # InteropConfig slice (runtime enable flags, timeouts, signing mode)
  health.ts                             # aggregate per-engine up|down (a2a-sdk, each runtime, governance link)

  ports/
    interop-chain.port.ts               # EXPOSED: InteropChain (authorize→risk→policy→audit) — consumed by ALL edges/MCP
    a2a-transport.port.ts               # EXPOSED: A2ATransport (ingressEnvelope / egressEnvelope / agentCard)
    runtime-adapter.port.ts             # CONSUMED: re-exports ConductorRuntime contract from @recoder/agent-runtimes (widened id union)
    connector-runtime.port.ts           # ConnectorRuntime process port (spawn/attach/stream/stop) for CLI coding agents
    agent-registry.repo.ts              # Repository PORT for registered agents + heartbeat (persistence provides impl)
    task-store.repo.ts                  # Repository PORT for A2A tasks/messages/scratchpad

  wire/
    a2a-envelope.service.ts             # build/parse/validate A2A envelopes (ingress + egress) — wraps @recoder/a2a-sdk
    agent-card.service.ts               # build + serve this instance's agent-card; cache remote cards
    signed-ingress.gate.ts              # verify signature (HMAC/ed25519) → admit against MCP tool policy
    a2a-jsonrpc-server.ts               # A2A standard JSON-RPC method surface (message/send, tasks/get, …)

  gate/
    interop-chain.service.ts            # concrete InteropChain: authorize→risk→policy→audit orchestration
    governance-gate.adapter.ts          # degrade-safe adapter over @recoder/governance decide()/record_audit()
    approval-gate.service.ts            # blocking approval wait for risky actions (bridges agent-os approvals)

  runtimes/
    runtime-registry.ts                 # registry + selector for ConductorRuntime adapters; dispatch entrypoint
    claude-runtime.adapter.ts           # Claude Code adapter (spawn/attach → RunEvent)
    codex-runtime.adapter.ts            # Codex adapter
    opencode-runtime.adapter.ts         # opencode adapter (uses @recoder/opencode-sdk)
    pi-runtime.adapter.ts               # pi adapter (uses pi-* packages)
    openfang-runtime.adapter.ts         # openfang adapter (in-proc napi) — REQUIRES widened ConductorRuntimeId
    connector-process.supervisor.ts     # generic CLI connector process supervisor (cursor/windsurf/replit)
    run-event.emitter.ts                # normalize adapter output → RunEvent, push to outbox bus

  registry/
    agent-registry.service.ts           # register/list/heartbeat agents; capability match for routing
    heartbeat-slo.service.ts            # heartbeat tracker + SLO metrics (liveness, p50/p95 dispatch latency)

  dispatch/
    multi-dispatch.service.ts           # fan a task to N runtimes (squad), aggregate/first-wins/quorum
    task-lifecycle.service.ts           # A2A task state machine (submitted→working→input-required→completed/failed)

  bridge/
    context-bridge.service.ts           # pass ContextPack/handoff context between agents across a delegation chain
    scratchpad.service.ts               # shared per-task scratchpad (append/read, TTL-bound)

  repositories/
    agent-registry.repository.ts        # concrete AgentRegistryRepo over injected QueryExecutor (:param SQL)
    task-store.repository.ts            # concrete TaskStoreRepo (tasks/messages/scratchpad)

  routes/
    interop.routes.ts                   # /api/a2a/* wire ingress + agent-card + registry edges
    connectors.routes.ts                # /api/a2a/connectors/* coding-agent connector edges (per-runtime)
    runtimes.routes.ts                  # task-lifecycle, multi-dispatch, heartbeat/slo, scratchpad, context-bridge edges

  mcp/
    interop-engine.ts                   # MCP tools: send_task, task_respond, list_agents, inbox, dispatch

  migrations/
    0001_interop_agents.sql             # interop_agents + interop_heartbeats tables
    0002_interop_tasks_scratchpad.sql   # interop_tasks + interop_task_messages + interop_scratchpad tables

  __tests__/
    interop-chain.test.ts               # chain admits valid, rejects on each stage (authz/risk/policy)
    a2a-envelope.contract.test.ts       # golden envelope round-trip vs @recoder/a2a-sdk canonical vectors
    signed-ingress.gate.test.ts         # ed25519 + HMAC verify; tampered/expired/replay rejection
    runtime-registry.test.ts            # selection + degrade-safe down path when a runtime key absent
    task-lifecycle.test.ts              # state-machine legal/illegal transitions + RunEvent emission
```

---

## 3. Per-file responsibilities

| Path | lang | kind | Responsibility | Key exports |
|------|------|------|----------------|-------------|
| `index.ts` | ts | service | Public entry; pure factory, no singletons | `createInteropModule(deps)`, `interface InteropModule` |
| `interop-module.ts` | ts | service | Composer fusing wire+gate+runtimes behind `InteropModule`; wires health | `class InteropModuleImpl` |
| `types.ts` | ts | type | Domain-internal shapes | `AgentRow`, `DispatchPlan`, `ConnectorSpec`, `RuntimeSelection`, `SloWindow` |
| `config.ts` | ts | config | Typed slice of `AppConfig` for this domain | `InteropConfig`, `parseInteropConfig(slice)` |
| `health.ts` | ts | service | Per-engine up/down + degraded flag | `interopHealth(state): HealthReport` |
| `ports/interop-chain.port.ts` | ts | port | The `authorize→risk→policy→audit` contract every edge/MCP call passes | `InteropChain`, `ChainDecision`, `ChainContext` |
| `ports/a2a-transport.port.ts` | ts | port | Wire ingress/egress + agent-card contract | `A2ATransport`, `IngressResult`, `EgressEnvelope` |
| `ports/runtime-adapter.port.ts` | ts | port | Re-export/narrow `ConductorRuntime` from `@recoder/agent-runtimes` (WIDENED id union) | `ConductorRuntime`, `ConductorRuntimeId`, `RuntimeDispatchInput` |
| `ports/connector-runtime.port.ts` | ts | port | CLI connector process lifecycle | `ConnectorRuntime`, `ConnectorHandle`, `ConnectorStream` |
| `ports/agent-registry.repo.ts` | ts | port | Repository interface for agents + heartbeat | `AgentRegistryRepo` |
| `ports/task-store.repo.ts` | ts | port | Repository interface for tasks/messages/scratchpad | `TaskStoreRepo` |
| `wire/a2a-envelope.service.ts` | ts | service | Build/parse/validate envelopes; zod-validate at boundary | `buildEnvelope`, `parseEnvelope`, `validateInbound` |
| `wire/agent-card.service.ts` | ts | service | Serve local agent-card; fetch+cache remote cards | `getLocalAgentCard`, `resolveRemoteCard` |
| `wire/signed-ingress.gate.ts` | ts | middleware | Verify sig → admit against MCP tool policy (wraps `admitSignedMcpCall`) | `signedIngress(deps)`, `admitEnvelope` |
| `wire/a2a-jsonrpc-server.ts` | ts | service | A2A JSON-RPC methods (`message/send`,`tasks/get`,`tasks/cancel`) → task-lifecycle | `handleA2ARpc`, `A2A_METHODS` |
| `gate/interop-chain.service.ts` | ts | service | Concrete `InteropChain` orchestration; fail-closed | `createInteropChain(deps)` |
| `gate/governance-gate.adapter.ts` | ts | client | Degrade-safe adapter over `@recoder/governance`; on gate down → deny writes | `governanceGateAdapter`, `GateDownError` |
| `gate/approval-gate.service.ts` | ts | service | Await agent-os approval record for risky actions | `requireApproval`, `waitForApproval` |
| `runtimes/runtime-registry.ts` | ts | service | Register adapters; select by capability/policy; dispatch | `RuntimeRegistry`, `selectRuntime`, `dispatch` |
| `runtimes/claude-runtime.adapter.ts` | ts | client | Claude Code adapter → RunEvent | `claudeRuntimeAdapter` |
| `runtimes/codex-runtime.adapter.ts` | ts | client | Codex adapter | `codexRuntimeAdapter` |
| `runtimes/opencode-runtime.adapter.ts` | ts | client | opencode adapter (`@recoder/opencode-sdk`) | `opencodeRuntimeAdapter` |
| `runtimes/pi-runtime.adapter.ts` | ts | client | pi adapter (`pi-agent-core`/`pi-coding-agent`) | `piRuntimeAdapter` |
| `runtimes/openfang-runtime.adapter.ts` | ts | client | openfang in-proc napi adapter | `openfangRuntimeAdapter` |
| `runtimes/connector-process.supervisor.ts` | ts | service | Spawn/attach/stream/stop CLI connectors (cursor/windsurf/replit); auth-preflight | `ConnectorSupervisor`, `spawnConnector` |
| `runtimes/run-event.emitter.ts` | ts | service | Normalize adapter output → `RunEvent`; push to outbox | `emitRunEvent`, `toRunEvent` |
| `registry/agent-registry.service.ts` | ts | service | register/list/deregister; capability matcher | `AgentRegistryService`, `matchCapabilities` |
| `registry/heartbeat-slo.service.ts` | ts | service | Track heartbeats; compute SLO windows; mark stale `down` | `HeartbeatSlo`, `recordHeartbeat`, `sloSnapshot` |
| `dispatch/multi-dispatch.service.ts` | ts | service | Fan-out to N runtimes; aggregate (first/quorum/all) | `multiDispatch`, `DispatchStrategy` |
| `dispatch/task-lifecycle.service.ts` | ts | service | A2A task state machine; legal transitions; emits RunEvents | `TaskLifecycle`, `transition`, `TASK_STATES` |
| `bridge/context-bridge.service.ts` | ts | service | Carry ContextPack/handoff across delegation chain | `ContextBridge`, `handoff` |
| `bridge/scratchpad.service.ts` | ts | service | Shared per-task scratchpad (append/read, TTL) | `Scratchpad`, `append`, `read` |
| `repositories/agent-registry.repository.ts` | ts | repository | Concrete `AgentRegistryRepo` over `QueryExecutor` | `createAgentRegistryRepo(qx)` |
| `repositories/task-store.repository.ts` | ts | repository | Concrete `TaskStoreRepo` | `createTaskStoreRepo(qx)` |
| `routes/interop.routes.ts` | ts | route | `/api/a2a/*` wire ingress + agent-card + registry | `interopRoutes(module)` |
| `routes/connectors.routes.ts` | ts | route | `/api/a2a/connectors/*` per-runtime connector control | `connectorRoutes(module)` |
| `routes/runtimes.routes.ts` | ts | route | task-lifecycle/multi-dispatch/heartbeat/slo/scratchpad/context-bridge | `runtimeRoutes(module)` |
| `mcp/interop-engine.ts` | ts | client | MCP tools conforming to `@recoder/agent-mcp` ToolRouter | `registerInteropMcpTools(router)` |
| `migrations/0001_interop_agents.sql` | sql | migration | agents + heartbeats tables | — |
| `migrations/0002_interop_tasks_scratchpad.sql` | sql | migration | tasks + messages + scratchpad tables | — |
| `__tests__/interop-chain.test.ts` | ts | test | Chain admit/reject per stage | — |
| `__tests__/a2a-envelope.contract.test.ts` | ts | test | Golden envelope round-trip | — |
| `__tests__/signed-ingress.gate.test.ts` | ts | test | Sig verify + tamper/replay/expiry | — |
| `__tests__/runtime-registry.test.ts` | ts | test | Selection + degrade-safe down | — |
| `__tests__/task-lifecycle.test.ts` | ts | test | State transitions + RunEvent | — |

---

## 4. Database schema (owned tables)

All access via `domains/persistence` `QueryExecutor` with `:param` SQL and
app-layer `WHERE user_id = :user_id`. No RLS.

### `0001_interop_agents.sql`
```sql
-- Registered A2A agents / runtime endpoints known to this instance.
CREATE TABLE IF NOT EXISTS interop_agents (
  id            TEXT PRIMARY KEY,               -- agent id / card id
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,                  -- 'runtime' | 'remote_a2a' | 'connector'
  runtime_id    TEXT,                           -- ConductorRuntimeId when kind='runtime'
  card          JSONB NOT NULL,                 -- agent-card (capabilities, endpoints)
  public_key    TEXT,                           -- ed25519 pubkey for envelope verify
  status        TEXT NOT NULL DEFAULT 'unknown',-- up|down|degraded|unknown
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interop_agents_user ON interop_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_interop_agents_kind ON interop_agents(kind);

CREATE TABLE IF NOT EXISTS interop_heartbeats (
  agent_id      TEXT NOT NULL REFERENCES interop_agents(id) ON DELETE CASCADE,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms    INTEGER,
  ok            BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (agent_id, seen_at)
);
CREATE INDEX IF NOT EXISTS idx_interop_hb_seen ON interop_heartbeats(seen_at);
```

### `0002_interop_tasks_scratchpad.sql`
```sql
-- A2A task lifecycle rows (projection; state-of-record stays in agent-os).
CREATE TABLE IF NOT EXISTS interop_tasks (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  run_id        TEXT,                           -- agent-os Run id link
  runtime_id    TEXT,
  state         TEXT NOT NULL,                  -- submitted|working|input-required|completed|failed|canceled
  context_id    TEXT,                           -- A2A context/session id
  correlation   TEXT,                           -- egress correlation for A2A replies
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interop_tasks_user  ON interop_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_interop_tasks_state ON interop_tasks(state);

CREATE TABLE IF NOT EXISTS interop_task_messages (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES interop_tasks(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,                  -- user|agent|system
  parts         JSONB NOT NULL,                 -- A2A message parts
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interop_msgs_task ON interop_task_messages(task_id);

CREATE TABLE IF NOT EXISTS interop_scratchpad (
  task_id       TEXT NOT NULL,
  seq           BIGINT NOT NULL,
  author        TEXT NOT NULL,
  note          TEXT NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, seq)
);
```

---

## 5. HTTP / WS edges

Mounted by the `edge` domain route table. Every call passes the `InteropChain`
(`authorize→risk→policy→audit`); `/internal/*` is `INTERNAL_SERVICE_KEY`-gated.
Responses use `sendSuccess` / `sendError(createError(code,msg))`.

### `routes/interop.routes.ts` — `/api/a2a`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/a2a/rpc` | A2A JSON-RPC ingress (signed-envelope gated) → `handleA2ARpc` |
| POST | `/api/a2a/message` | Send an A2A message/task inbound (sealed → admitted) |
| GET  | `/.well-known/agent.json` | Serve this instance's agent-card |
| GET  | `/api/a2a/agents` | List registered agents (capability filter) |
| POST | `/api/a2a/agents` | Register an agent/runtime endpoint |
| DELETE | `/api/a2a/agents/:id` | Deregister |
| GET  | `/api/a2a/agents/:id/card` | Resolve remote card (cached) |

### `routes/connectors.routes.ts` — `/api/a2a/connectors`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/a2a/connectors/:runtime/start` | Start a coding-agent connector process |
| POST | `/api/a2a/connectors/:runtime/stop` | Stop it |
| GET  | `/api/a2a/connectors/:runtime/health` | Connector runtime up/down |
| WS   | `/api/a2a/connectors/:runtime/stream` | Stream connector stdout→RunEvent (express-ws) |
| POST | `/api/a2a/connectors/:runtime/input` | Feed input-required response |

`:runtime` ∈ `claude|codex|cursor|opencode|pi|windsurf|replit|openfang`.

### `routes/runtimes.routes.ts`
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/a2a/tasks` | Create task → dispatch to runtime (task-lifecycle) |
| GET  | `/api/a2a/tasks/:id` | Task state + messages |
| POST | `/api/a2a/tasks/:id/cancel` | Cancel |
| POST | `/api/a2a/dispatch` | Multi-dispatch (squad) fan-out |
| GET  | `/api/a2a/slo` | Heartbeat/SLO snapshot |
| POST | `/internal/a2a/heartbeat` | Runtime posts heartbeat (INTERNAL_SERVICE_KEY) |
| GET/POST | `/api/a2a/tasks/:id/scratchpad` | Read/append scratchpad |
| POST | `/api/a2a/tasks/:id/handoff` | Context-bridge handoff to another agent |

---

## 6. Interfaces exposed vs consumed

### Exposed (other domains wire to these)
- **`InteropChain`** (`ports/interop-chain.port.ts`) — THE seam every edge +
  MCP tool call in the whole backend passes: `authorize → risk → policy →
  audit`. Consumed by `edge`, `engines` (MCP host), and every domain's routes.
- **`A2ATransport`** (`ports/a2a-transport.port.ts`) — envelope ingress/egress
  + agent-card. Consumed by `social`/`connectors` ingress, `conductor` egress.
- **`RuntimeRegistry.dispatch`** — the way `agent-os`/`conductor` turn a Task
  into a live runtime `Run` that emits `RunEvent`s.
- **`InteropModule`** (`index.ts`) — the single public composer interface.

### Consumed (this domain depends on)
- `@recoder/interop` — `admitSignedMcpCall`, ed25519 verify, MCP host facade.
- `@recoder/a2a-sdk` (+ `recoder-a2a`, `a2a-js`) — canonical envelope + agent-card.
- `@recoder/governance` — `decide`/`enforce_tool`/`route`/`record_audit` (every write).
- `@recoder/agent-policy` — deterministic policy decisions used by the chain.
- `@recoder/agent-runtimes` — `ConductorRuntime` adapter contract (id union widened).
- `@recoder/agent-events` — `RunEvent` + CloudEvents envelope + outbox record.
- `@recoder/agent-mcp` — ToolRouter shape for `mcp/interop-engine.ts`.
- `@recoder/agent-os` + `@recoder/agent-schemas` — Task/Run/Approval/ContextPack.
- `@recoder/auth` — `Session` on every request.
- `@recoder/substrate` — session/exec ports the connector supervisor stands on.
- **From `domains/persistence`**: `QueryExecutor` (repos), governance gate,
  outbox bus. **From `domains/identity`**: `Session`. **From `domains/agent-os`**:
  approvals + state-of-record. **From `domains/governance`**: `GovernanceGate`.

---

## 7. Reuse notes (build ON, do not reinvent)

**REUSE `packages/*` (do not redefine):** `@recoder/interop` (signed ingress
gate, ed25519, MCP host — the wire/gate core is already here), `@recoder/a2a-sdk`
(canonical envelope + agent-card + conformance vectors), `@recoder/governance`,
`@recoder/agent-policy`, `@recoder/agent-runtimes` (all adapters:
claude-code/codex/opencode/openclaw/gemini-cli/qwen-code/recoder-code/generic +
langgraph/crewai/autogen), `@recoder/agent-events`, `@recoder/agent-mcp`,
`@recoder/agent-os`, `@recoder/auth`, `@recoder/substrate`, `pi-*`,
`@recoder/opencode-sdk`.

**MOVE behind the composer from existing `backend/src/a2a/` (139 files) — do NOT
rewrite, do NOT make a 4th copy:**
- Wire: `a2a-standard-server.ts`, `a2a-gateway.ts`, `a2a-event-bridge.ts`,
  `a2a-event-bus.ts`, `signed-ingress.middleware.ts`, `bridge-auth.ts`,
  `agent-card` builders → `wire/`.
- Gate: `interop-gate.adapter.ts`, `intent-gate.ts`, `approval-gate.service.ts`
  → `gate/`.
- Runtimes: `claude-runtime-adapter.ts`, `codex-runtime-adapter.ts`,
  `pi-runtime-adapter.ts`, `opencode-service-adapter.ts`,
  `cli-agent-runtime.service.ts`, `connector-process.ts`, `connector-retry.ts`,
  `*-connector-runtime.service.ts` (cursor/windsurf/replit/omo) → `runtimes/`.
- Registry/dispatch/bridge: `agent-registry.service.ts`,
  `capability-matcher.service.ts`, `heartbeat-tracker.service.ts`,
  `slo-metrics.ts`, `multi-dispatch.service.ts`, `squad-dispatch.service.ts`,
  `task-lifecycle.service.ts`, `task-queue.service.ts`,
  `context-bridge.service.ts`, `scratchpad.ts` → `registry/`,`dispatch/`,`bridge/`.
- Persistence: `a2a-persistence.ts`, `redis-task-store.ts` → `repositories/`.
- Routes: the ~30 `*.routes.ts`/`*.router.ts` collapse into the 3 route files.

**REUSE engines in place (never copy):** `backend/engines/rust/openfang` (napi
`.node`, openfang runtime), `apps/desktop/engines/{tmux,dmux,openclaw}` (connector
substrate via `@recoder/substrate`).

**CUT (owner-removed — do NOT restore):** `collaboration.*` (moved to `social`
domain), `duckdb.*`/`code-search.*`/`code-graph-bootstrap.ts` (retrieval →
`memory` domain), the stale `nats-event-bus.ts` if NATS not provisioned (use
outbox bus instead). `rbac.*` stays only as a thin bridge to `governance`.

**WIDEN (owner decision 4):** the closed `ConductorRuntimeId` union in
`@recoder/agent-runtimes` MUST gain `openfang` (and `cursor|windsurf|replit`)
so `openfang-runtime.adapter.ts` dispatches. Change is in the package, consumed
here via `ports/runtime-adapter.port.ts`.

**REUSE verification scripts:** `verify-byok-e2e.sh`,
`verify-cli-device-flow-e2e.sh`, `pnpm test:contracts:agent-os`,
`pnpm test:evals:agent-os`, `pnpm {format,check-types,test}`.

---

## 8. Degrade-safe / health

`health()` reports `{status, degraded, engines:[…]}`:
- `a2a-sdk` — `up` always (pure TS).
- each runtime — `up` if its connector binary/key present, else `down`
  (never faked). Missing Claude/Codex/opencode/pi key → that engine `down`,
  domain `degraded:true`.
- `openfang` — `up` iff napi `.node` loads; else `down`, no throw.
- `governance-link` — `up` iff `GovernanceGate.decide()` reachable; if `down`,
  **all writes fail closed** (`SERVICE_UNAVAILABLE`), reads still served.
- `signing` — if signing mode requires a key that's absent → ingress rejects
  unsigned envelopes (fail closed), reported `degraded`.

Error envelope: reuse `SERVICE_UNAVAILABLE` (engine down / gate down) and
`AUTHZ_PROJECT_ACCESS_DENIED` (chain authorize/policy reject). No `FORBIDDEN`,
no `EXTERNAL_SERVICE_ERROR`.

---

## 9. MCP tools (`mcp/interop-engine.ts`)

Conform to `@recoder/agent-mcp` ToolRouter. Register via the wiring checklist:
add to `IN_PROC_SERVERS` (interop-host) + `ENGINE_SERVERS` (inproc-engines),
export `registerInteropMcpTools(router)`, call it in `buildInProcEngineRouter`.
Every tool call passes the InteropChain.

| Tool | Purpose |
|------|---------|
| `interop_send_task` | Send a task to an agent/runtime (dispatch) |
| `interop_task_respond` | Respond to an input-required task |
| `interop_list_agents` | List registered agents + capabilities |
| `interop_inbox` | Pull pending inbound A2A tasks for the actor |
| `interop_dispatch` | Multi-dispatch fan-out (squad) |

---

## 10. Implementation order

1. **Ports + config + types + health** — declare `InteropChain`,
   `A2ATransport`, `ConductorRuntime` (widened), repo ports; `InteropConfig`
   slice; skeleton `health.ts`. (No behavior — the seams the composer needs.)
2. **Repositories + migrations** — `0001`/`0002` SQL; `agent-registry` +
   `task-store` repos over injected `QueryExecutor`. Prove with a repo test.
3. **Gate** — `governance-gate.adapter.ts` (degrade-safe) → `interop-chain.service.ts`
   (`authorize→risk→policy→audit`, fail-closed) → `approval-gate.service.ts`.
   Test: `interop-chain.test.ts`.
4. **Wire** — `a2a-envelope.service.ts` + `agent-card.service.ts` +
   `signed-ingress.gate.ts` (wrap `@recoder/interop`) + `a2a-jsonrpc-server.ts`.
   Tests: `a2a-envelope.contract.test.ts`, `signed-ingress.gate.test.ts`
   (pin golden vectors from `@recoder/a2a-sdk`).
5. **Runtimes** — `runtime-registry.ts` + `run-event.emitter.ts`, then each
   adapter (claude→codex→opencode→pi→openfang) + `connector-process.supervisor.ts`.
   Test: `runtime-registry.test.ts` (degrade-safe down path).
6. **Dispatch + registry + bridge** — `task-lifecycle.service.ts` (state machine,
   emits RunEvents), `multi-dispatch`, `agent-registry`, `heartbeat-slo`,
   `context-bridge`, `scratchpad`. Test: `task-lifecycle.test.ts`.
7. **Composer + edges + MCP** — `interop-module.ts` + `index.ts` fuse everything;
   3 route files; `mcp/interop-engine.ts` + wiring-checklist registration.
8. **Verify** — `pnpm check-types`, `pnpm test` (domain), `pnpm test:contracts:agent-os`,
   `verify-byok-e2e.sh`, `verify-cli-device-flow-e2e.sh`.

---

## 11. Cross-domain contract summary

- **Consumes ports:** `Session` (identity), `QueryExecutor`/`Repository`
  (persistence), `GovernanceGate.decide()` (governance), `RunEvent` bus/outbox
  (agent-os), `ToolRouter` (engines/MCP host), `AppConfig` (bootstrap),
  approvals + Task/Run state-of-record (agent-os).
- **Exposes ports:** `InteropChain` (→ every edge + MCP call, backend-wide),
  `A2ATransport` (→ social/connectors/conductor), `RuntimeRegistry.dispatch`
  (→ agent-os/conductor).
- **Owns tables:** `interop_agents`, `interop_heartbeats`, `interop_tasks`,
  `interop_task_messages`, `interop_scratchpad` (projection only; canonical
  Task/Run/Approval state stays in agent-os).
