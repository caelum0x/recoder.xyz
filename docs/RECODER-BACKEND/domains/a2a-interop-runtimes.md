# Domain: A2A & Interop Runtimes

Folder prefix: `backend/src/domains/interop/` + `backend/src/domains/interop-wire/`
Domain key: `interop` (gate) + `interop-wire` (wire + runtimes)
Owner boundary: **Agent-to-agent wire + runtime adapters.** The A2A envelope
ingress/egress, agent-cards, orchestration/patterns, the
`authorize → risk → policy → audit` edge chain, and the A2A `ConductorRuntime`
wire adapters (claude / codex / cursor / opencode / windsurf / replit)
that dispatch coding agents and emit `RunEvent`s back to the control plane.

> **SHIPPED SPLIT (this doc predates it).** The single `interop` domain below was
> split into two: **`interop`** now owns only the hostile-by-default gate/chain
> (`authorize→risk→policy→audit`, rate-limit, middleware); **`interop-wire`** owns
> the A2A wire (rpc/agents/tasks/dispatch/registry/bridge) and the runtime
> connectors under `interop-wire/runtimes/`. There is **no `pi` or `openfang`
> wire adapter and no per-runtime connector _process_ control surface** — openfang
> executes in-process via the **conductor/engines** domain, not as an interop
> connector. Read the file tree / routes below as the pre-split plan.

---

## 1. Overview

`interop` is the backend's **hostile-by-default edge and its runtime fan-out**.
It is the ONE domain every other edge and every MCP tool call passes through
(the `InteropChain`), and it is the ONE domain that turns a control-plane
`Task`/`Run` into a live coding-agent process and streams the result back as
`RunEvent`s.

**SHIPPED (2026-07-31):** A2A ed25519 external-ingress enforcement + signer-bound ownership.
External (untrusted) A2A ingress now **refuses HMAC-only** without ed25519 signature (401
`external_ingress_requires_ed25519`); trusted/loopback keep HMAC. Per-actor internal enforcement
still pending. A2A JSON-RPC task-dispatch now binds task ownership to the cryptographically-verified
ed25519 `signer.key_id` via `IngressResult.signer` + `A2ACallContext`, NOT client-supplied `userId`
(IDOR closure: `interop-wire/dispatch/a2a-methods.ts` + test coverage in `ed25519-ingress.gate.test.ts`).

It has two faces:

1. **Wire face (A2A in/out).** Untrusted inbound A2A envelopes (from other
   Recoder instances, external agents, connectors, webhooks) are verified
   (HMAC / ed25519), identity-bound, risk-scored, policy-checked, and audited
   _before_ any handler runs. Outbound, it seals and signs envelopes and
   publishes agent-cards describing what this instance can do.
2. **Runtime face (dispatch out).** `interop-wire` owns the A2A `ConductorRuntime`
   wire-adapter registry. Given a `Task` + `InstructionBundle`, it selects a
   runtime (claude/codex/cursor/opencode/windsurf/replit) and dispatches over the
   A2A wire, streams `RunEvent`s, tracks heartbeat/SLO, and lands results
   through governance. Multi-dispatch fans a single task to N runtimes
   (squad pattern, ported from the Go multica idea into TS). (openfang is NOT a
   wire runtime — it runs in-process via conductor/engines.)

**Non-goals** (owned elsewhere): task/run/approval _state of record_ lives in
`agent-os`; tmux/worktree substrate + reconciler live in `conductor`; the
governance kernel (Merkle audit) lives in `governance`; MCP host registry lives
in `engines`. `interop` _consumes_ those ports; it does not own their state.

Every WRITE routes through `GovernanceGate.decide()`. Every edge + MCP call
routes through the local `InteropChain`. Secrets fail SAFE (missing connector
key → that runtime reports `down`, never a faked success).

---

## 2. File tree (40 files, ~38 impl + 5 tests)

```
backend/src/domains/interop/
  index.ts                              # factory createInteropModule(deps) + public InteropModule interface
  interop-module.ts                     # SHIPPED SPLIT: interop/interop-module.ts (gate only) + interop-wire/interop-wire-module.ts (wire + runtimes)
  types.ts                              # domain-internal types (registry rows, dispatch plan, connector spec)
  config.ts                             # InteropConfig slice (runtime enable flags, timeouts, signing mode)
  health.ts                             # aggregate per-engine up|down (a2a-sdk, each runtime, governance link)

  ports/
    interop-chain.port.ts               # EXPOSED: InteropChain (authorize→risk→policy→audit) — consumed by ALL edges/MCP
    a2a-transport.port.ts               # EXPOSED: A2ATransport (ingressEnvelope / egressEnvelope / agentCard)
    runtime-adapter.port.ts             # CONSUMED: re-exports ConductorRuntime contract from @recoder/agent-runtimes (widened id union)
    connector-runtime.port.ts           # SHIPPED as interop-wire/runtimes/runtime-connector.ts — A2A wire connector (NOT a per-runtime spawn/stop process surface)
    agent-registry.repo.ts              # Repository PORT for registered agents + heartbeat (persistence provides impl)
    task-store.repo.ts                  # Repository PORT for A2A tasks/messages/scratchpad

  wire/
    a2a-envelope.service.ts             # build/parse/validate A2A envelopes (ingress + egress) — wraps @recoder/a2a-sdk
    agent-card.service.ts               # build + serve this instance's agent-card; cache remote cards
    signed-ingress.gate.ts              # verify signature (HMAC/ed25519) → admit against MCP tool policy (legacy)
    ed25519-ingress.gate.ts             # NEW (2026-07-31): external ingress now REQUIRES ed25519; refuses HMAC-only (401 external_ingress_requires_ed25519)
    a2a-jsonrpc-server.ts               # A2A standard JSON-RPC method surface (message/send, tasks/get, …); task ownership bound to signer.key_id

  gate/
    interop-chain.service.ts            # concrete InteropChain: authorize→risk→policy→audit orchestration
    governance-gate.adapter.ts          # degrade-safe adapter over @recoder/governance decide()/record_audit()
    approval-gate.service.ts            # blocking approval wait for risky actions (bridges agent-os approvals)

  runtimes/
    runtime-registry.ts                 # registry + selector for ConductorRuntime adapters; dispatch entrypoint
    claude.adapter.ts                   # Claude Code A2A wire adapter → RunEvent   (shipped names, no "-runtime")
    codex.adapter.ts                    # Codex adapter
    opencode.adapter.ts                 # opencode adapter (uses @recoder/opencode-sdk)
    cursor.adapter.ts                   # cursor adapter
    windsurf.adapter.ts                 # windsurf adapter
    replit.adapter.ts                   # replit adapter
    # (NO pi/openfang wire adapter — openfang runs in-process via conductor/engines)
    runtime-connector.ts                # generic A2A wire connector (shared adapter plumbing)
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
    a2a.routes.ts                       # /api/a2a/* wire (rpc/ingress/agent-card/health) — see §5 for shipped paths
    agents.routes.ts                    # /api/interop/agents* registry edges (heartbeat/liveness)
    tasks.routes.ts                     # /api/interop/tasks/:id* (get/cancel/handoff/context/scratchpad)
    rpc-admission.middleware.ts         # SHIPPED: admits public /api/a2a/rpc + /ingress at the wire boundary
    # (NO connectors.routes.ts / per-runtime /connectors/:runtime/{start,stop,stream,input} process surface — that was cut)

  mcp/
    interop-engine.ts                   # MCP tools: send_task, task_respond, list_agents, inbox, dispatch

  # SHIPPED: migrations live in the repo-shared backend/migrations/ dir, NOT under the domain:
  #   backend/migrations/interop_0001_agents.sql           # owner-scoped interop_agents + interop_heartbeats tables
  #   backend/migrations/interop_0003_owner_scoped_agents.sql # upgrade legacy global ids to (id,user_id)
  #   backend/migrations/interop_0002_tasks_scratchpad.sql # interop_tasks + interop_task_messages + interop_scratchpad tables

  __tests__/
    interop-chain.test.ts               # chain admits valid, rejects on each stage (authz/risk/policy)
    a2a-envelope.contract.test.ts       # golden envelope round-trip vs @recoder/a2a-sdk canonical vectors
    signed-ingress.gate.test.ts         # ed25519 + HMAC verify; tampered/expired/replay rejection
    ed25519-ingress.gate.test.ts        # NEW (2026-07-31): external ingress requires ed25519; HMAC-only → 401; signer-bound ownership
    runtime-registry.test.ts            # selection + degrade-safe down path when a runtime key absent
    task-lifecycle.test.ts              # state-machine legal/illegal transitions + RunEvent emission
```

---

## 3. Per-file responsibilities

| Path                                                      | lang | kind       | Responsibility                                                                                                                                                     | Key exports                                                                  |
| --------------------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `index.ts`                                                | ts   | service    | Public entry; pure factory, no singletons                                                                                                                          | `createInteropModule(deps)`, `interface InteropModule`                       |
| `interop-module.ts`                                       | ts   | service    | Composer fusing wire+gate+runtimes behind `InteropModule`; wires health                                                                                            | `class InteropModuleImpl`                                                    |
| `types.ts`                                                | ts   | type       | Domain-internal shapes                                                                                                                                             | `AgentRow`, `DispatchPlan`, `ConnectorSpec`, `RuntimeSelection`, `SloWindow` |
| `config.ts`                                               | ts   | config     | Typed slice of `AppConfig` for this domain                                                                                                                         | `InteropConfig`, `parseInteropConfig(slice)`                                 |
| `health.ts`                                               | ts   | service    | Per-engine up/down + degraded flag                                                                                                                                 | `interopHealth(state): HealthReport`                                         |
| `ports/interop-chain.port.ts`                             | ts   | port       | The `authorize→risk→policy→audit` contract every edge/MCP call passes                                                                                              | `InteropChain`, `ChainDecision`, `ChainContext`                              |
| `ports/a2a-transport.port.ts`                             | ts   | port       | Wire ingress/egress + agent-card contract                                                                                                                          | `A2ATransport`, `IngressResult`, `EgressEnvelope`                            |
| `ports/runtime-adapter.port.ts`                           | ts   | port       | Re-export/narrow `ConductorRuntime` from `@recoder/agent-runtimes` (WIDENED id union)                                                                              | `ConductorRuntime`, `ConductorRuntimeId`, `RuntimeDispatchInput`             |
| `interop-wire/runtimes/runtime-connector.ts`              | ts   | service    | A2A wire connector plumbing (NOT a CLI connector process lifecycle)                                                                                                | `RuntimeConnector`                                                           |
| `ports/agent-registry.repo.ts`                            | ts   | port       | Repository interface for agents + heartbeat                                                                                                                        | `AgentRegistryRepo`                                                          |
| `ports/task-store.repo.ts`                                | ts   | port       | Repository interface for tasks/messages/scratchpad                                                                                                                 | `TaskStoreRepo`                                                              |
| `wire/a2a-envelope.service.ts`                            | ts   | service    | Build/parse/validate envelopes; zod-validate at boundary                                                                                                           | `buildEnvelope`, `parseEnvelope`, `validateInbound`                          |
| `wire/agent-card.service.ts`                              | ts   | service    | Serve local agent-card; fetch+cache remote cards                                                                                                                   | `getLocalAgentCard`, `resolveRemoteCard`                                     |
| `wire/signed-ingress.gate.ts`                             | ts   | middleware | Verify sig → admit against MCP tool policy (wraps `admitSignedMcpCall`); legacy HMAC path                                                                          | `signedIngress(deps)`, `admitEnvelope`                                       |
| `wire/ed25519-ingress.gate.ts`                            | ts   | middleware | NEW (2026-07-31): external ingress now requires ed25519; refuses HMAC-only untrusted (401 `external_ingress_requires_ed25519`); binds signer.key_id for ownership. | `ed25519IngressGate(deps)`, `verifyEd25519Signature`                         |
| `wire/a2a-jsonrpc-server.ts`                              | ts   | service    | A2A JSON-RPC methods (`message/send`,`tasks/get`,`tasks/cancel`) → task-lifecycle; task ownership bound to signer.key_id via A2ACallContext                        | `handleA2ARpc`, `A2A_METHODS`                                                |
| `gate/interop-chain.service.ts`                           | ts   | service    | Concrete `InteropChain` orchestration; fail-closed                                                                                                                 | `createInteropChain(deps)`                                                   |
| `gate/governance-gate.adapter.ts`                         | ts   | client     | Degrade-safe adapter over `@recoder/governance`; on gate down → deny writes                                                                                        | `governanceGateAdapter`, `GateDownError`                                     |
| `gate/approval-gate.service.ts`                           | ts   | service    | Await agent-os approval record for risky actions                                                                                                                   | `requireApproval`, `waitForApproval`                                         |
| `runtimes/runtime-registry.ts`                            | ts   | service    | Register adapters; select by capability/policy; dispatch                                                                                                           | `RuntimeRegistry`, `selectRuntime`, `dispatch`                               |
| `runtimes/claude.adapter.ts`                              | ts   | client     | Claude Code A2A wire adapter → RunEvent                                                                                                                            | `claudeRuntimeAdapter`                                                       |
| `runtimes/codex.adapter.ts`                               | ts   | client     | Codex adapter                                                                                                                                                      | `codexRuntimeAdapter`                                                        |
| `runtimes/opencode.adapter.ts`                            | ts   | client     | opencode adapter (`@recoder/opencode-sdk`)                                                                                                                         | `opencodeRuntimeAdapter`                                                     |
| `runtimes/cursor.adapter.ts`                              | ts   | client     | cursor A2A wire adapter                                                                                                                                            | `cursorRuntimeAdapter`                                                       |
| `runtimes/windsurf.adapter.ts`                            | ts   | client     | windsurf A2A wire adapter                                                                                                                                          | `windsurfRuntimeAdapter`                                                     |
| `runtimes/replit.adapter.ts`                              | ts   | client     | replit A2A wire adapter                                                                                                                                            | `replitRuntimeAdapter`                                                       |
| `runtimes/runtime-connector.ts`                           | ts   | service    | generic A2A wire connector plumbing (NOT a per-runtime process spawn/stop surface)                                                                                 | `RuntimeConnector`                                                           |
| —                                                         | —    | —          | _(NO pi/openfang wire adapter — openfang runs in-process via conductor/engines)_                                                                                   | —                                                                            |
| `runtimes/run-event.emitter.ts`                           | ts   | service    | Normalize adapter output → `RunEvent`; push to outbox                                                                                                              | `emitRunEvent`, `toRunEvent`                                                 |
| `registry/agent-registry.service.ts`                      | ts   | service    | register/list/deregister; capability matcher                                                                                                                       | `AgentRegistryService`, `matchCapabilities`                                  |
| `registry/heartbeat-slo.service.ts`                       | ts   | service    | Track heartbeats; compute SLO windows; mark stale `down`                                                                                                           | `HeartbeatSlo`, `recordHeartbeat`, `sloSnapshot`                             |
| `dispatch/multi-dispatch.service.ts`                      | ts   | service    | Fan-out to N runtimes; aggregate (first/quorum/all)                                                                                                                | `multiDispatch`, `DispatchStrategy`                                          |
| `dispatch/task-lifecycle.service.ts`                      | ts   | service    | A2A task state machine; legal transitions; emits RunEvents                                                                                                         | `TaskLifecycle`, `transition`, `TASK_STATES`                                 |
| `bridge/context-bridge.service.ts`                        | ts   | service    | Carry ContextPack/handoff across delegation chain                                                                                                                  | `ContextBridge`, `handoff`                                                   |
| `bridge/scratchpad.service.ts`                            | ts   | service    | Shared per-task scratchpad (append/read, TTL)                                                                                                                      | `Scratchpad`, `append`, `read`                                               |
| `repositories/agent-registry.repository.ts`               | ts   | repository | Concrete `AgentRegistryRepo` over `QueryExecutor`                                                                                                                  | `createAgentRegistryRepo(qx)`                                                |
| `repositories/task-store.repository.ts`                   | ts   | repository | Concrete `TaskStoreRepo`                                                                                                                                           | `createTaskStoreRepo(qx)`                                                    |
| `routes/a2a.routes.ts`                                    | ts   | route      | `/api/a2a/*` wire (rpc/ingress/agent-card/health)                                                                                                                  | `buildA2ARoutes(deps)`                                                       |
| `routes/agents.routes.ts`                                 | ts   | route      | `/api/interop/agents*` registry edges (heartbeat/liveness)                                                                                                         | `buildAgentsRoutes(deps)`                                                    |
| `routes/tasks.routes.ts`                                  | ts   | route      | `/api/interop/tasks/:id*` (get/cancel/handoff/context/scratchpad)                                                                                                  | `buildTasksRoutes(deps)`                                                     |
| _(cut)_                                                   | —    | —          | no `connectors.routes.ts` / per-runtime connector _process_ control surface                                                                                        | —                                                                            |
| `mcp/interop-engine.ts`                                   | ts   | client     | MCP tools conforming to `@recoder/agent-mcp` ToolRouter                                                                                                            | `registerInteropMcpTools(router)`                                            |
| `backend/migrations/interop_0001_agents.sql`              | sql  | migration  | owner-scoped agents + heartbeats tables                                                                                                                            | —                                                                            |
| `backend/migrations/interop_0003_owner_scoped_agents.sql` | sql  | migration  | upgrade legacy global agent/heartbeat keys to `(id,user_id)`                                                                                                       | —                                                                            |
| `migrations/0002_interop_tasks_scratchpad.sql`            | sql  | migration  | tasks + messages + scratchpad tables                                                                                                                               | —                                                                            |
| `__tests__/interop-chain.test.ts`                         | ts   | test       | Chain admit/reject per stage                                                                                                                                       | —                                                                            |
| `__tests__/a2a-envelope.contract.test.ts`                 | ts   | test       | Golden envelope round-trip                                                                                                                                         | —                                                                            |
| `__tests__/signed-ingress.gate.test.ts`                   | ts   | test       | Sig verify + tamper/replay/expiry (legacy HMAC)                                                                                                                    | —                                                                            |
| `__tests__/ed25519-ingress.gate.test.ts`                  | ts   | test       | NEW (2026-07-31): external ingress requires ed25519; HMAC-only → 401; trusted/loopback keep HMAC; signer.key_id ownership binding                                  | —                                                                            |
| `__tests__/runtime-registry.test.ts`                      | ts   | test       | Selection + degrade-safe down                                                                                                                                      | —                                                                            |
| `__tests__/task-lifecycle.test.ts`                        | ts   | test       | State transitions + RunEvent                                                                                                                                       | —                                                                            |

---

## 4. Database schema (owned tables)

All access via `domains/persistence` `QueryExecutor` with `:param` SQL and
app-layer `WHERE user_id = :user_id`. No RLS. **SHIPPED filenames:** the three
migrations live in the repo-shared `backend/migrations/` dir as
`interop_0001_agents.sql`, `interop_0002_tasks_scratchpad.sql`, and
`interop_0003_owner_scoped_agents.sql` (not under the domain dir). The third
migration upgrades old globally keyed agent/heartbeat rows to composite tenant
identity. The repos degrade-safe to a bounded in-process store when the
`QueryExecutor` is unavailable (never fabricating a persisted row).

### `interop_0001_agents.sql`

```sql
-- Registered A2A agents / runtime endpoints known to this instance.
CREATE TABLE IF NOT EXISTS interop_agents (
  id            TEXT NOT NULL,                  -- agent id / card id (owner-scoped)
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,                  -- 'runtime' | 'remote_a2a' | 'connector'
  runtime_id    TEXT,                           -- ConductorRuntimeId when kind='runtime'
  card          JSONB NOT NULL,                 -- agent-card (capabilities, endpoints)
  public_key    TEXT,                           -- ed25519 pubkey for envelope verify
  status        TEXT NOT NULL DEFAULT 'unknown',-- up|down|degraded|unknown
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_interop_agents_user ON interop_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_interop_agents_kind ON interop_agents(kind);

CREATE TABLE IF NOT EXISTS interop_heartbeats (
  agent_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms    INTEGER,
  ok            BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (agent_id, user_id, seen_at),
  FOREIGN KEY (agent_id, user_id) REFERENCES interop_agents(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_interop_hb_seen ON interop_heartbeats(seen_at);
```

### `interop_0002_tasks_scratchpad.sql`

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

**SHIPPED MOUNTS (this section predated the two-router split).** Bootstrap mounts
three interop-wire routers plus the gate router. Responses use `sendSuccess` /
`sendError(createError(code,msg))`.

- The **wire** face is at `/api/a2a` (`interop-wire` `wireRoutes()`) and the origin
  root `/.well-known` (bare card).
- The **registry + tasks** face is at `/api/interop` (`interop-wire` `routes()` —
  NOT under `/api/a2a`).
- The **gate** domain (`interop`) also mounts at `/api/a2a` but serves only its
  admission health at `/api/a2a/admission/health` (it deliberately serves no wire
  paths so it does not shadow the wire router).

### wire — `/api/a2a` (`interop-wire/wire/*` + `routes/a2a.routes.ts`)

| Method | Path                        | Purpose                                                                                               |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/api/a2a/health`           | Wire health (registered JSON-RPC methods list, engines)                                               |
| GET    | `/api/a2a/agent-card`       | This instance's agent-card (operator view)                                                            |
| POST   | `/api/a2a/rpc`              | A2A JSON-RPC (`message/send`, `tasks/get`, `tasks/cancel`, `tasks/resubscribe`) — RPC-admission gated |
| POST   | `/api/a2a/ingress`          | Signed-envelope ingress (HMAC/ed25519 verified before admission)                                      |
| GET    | `/.well-known/agent.json`   | Bare agent-card at origin root (RFC 8615) — same card as `/api/a2a/agent-card`                        |
| GET    | `/api/a2a/admission/health` | Gate (`interop` domain) admission health                                                              |

> **Task creation + multi-dispatch are RPC, not REST.** There is no `POST /api/a2a/tasks`
> / `POST /api/a2a/dispatch` route: a task is created and fanned out through the A2A
> JSON-RPC `message/send` method (it drives `multi-dispatch` with the optional
> `all`/`first`/`quorum` strategy). The old REST create/dispatch/slo/`/internal/heartbeat`
> rows below were superseded by this RPC surface + the `/api/interop` registry routes.

### connector process routes — **CUT (not shipped)**

The planned per-runtime connector _process_ control surface
(`/api/a2a/connectors/:runtime/{start,stop,health,stream,input}`) was **not shipped**.
Coding-agent execution is conductor-owned (tmux/worktree substrate + run-tailer) and
A2A dispatch happens over the wire runtimes in `interop-wire/runtimes/`
(claude|codex|cursor|opencode|windsurf|replit — no pi/openfang). openfang runs
in-process via conductor/engines, not as an interop connector process.

### registry + tasks — `/api/interop` (`interop-wire` `routes/agents.routes.ts` + `routes/tasks.routes.ts`)

| Method | Path                                | Purpose                                               |
| ------ | ----------------------------------- | ----------------------------------------------------- |
| GET    | `/api/interop/agents`               | List registered agents (capability filter)            |
| POST   | `/api/interop/agents`               | Register an agent/runtime endpoint                    |
| GET    | `/api/interop/agents/:id`           | Get a registered agent                                |
| DELETE | `/api/interop/agents/:id`           | Deregister                                            |
| POST   | `/api/interop/agents/:id/heartbeat` | Record an authenticated owner-scoped heartbeat sample |
| GET    | `/api/interop/agents/:id/liveness`  | Owner-scoped heartbeat/SLO liveness snapshot          |
| GET    | `/api/interop/tasks/:id`            | Task row + message log (projection)                   |
| POST   | `/api/interop/tasks/:id/cancel`     | Cancel (fail-closed lifecycle transition)             |
| POST   | `/api/interop/tasks/:id/handoff`    | Context-bridge handoff to another agent               |
| GET    | `/api/interop/tasks/:id/context`    | Compact context bundle (messages + notes)             |
| GET    | `/api/interop/tasks/:id/scratchpad` | Read scratchpad notes                                 |
| POST   | `/api/interop/tasks/:id/scratchpad` | Append a scratchpad note                              |

---

## 6. Interfaces exposed vs consumed

### Exposed (other domains wire to these)

- **`InteropChain`** (`ports/interop-chain.port.ts`) — THE seam every edge +
  MCP tool call in the whole backend passes: `authorize → risk → policy →
audit`. Consumed by `edge`, `engines` (MCP host), and every domain's routes.
- **`A2ATransport`** (`ports/a2a-transport.port.ts`) — envelope ingress/egress
  - agent-card. Consumed by `social`/`connectors` ingress, `conductor` egress.
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
rewrite, do NOT make a 4th copy:** _(SHIPPED: this absorption is DONE — the legacy
flat `src/a2a/` dir was folded into `domains/interop` + `domains/interop-wire` and
removed; the map below is retained as historical provenance.)_

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

## 9. MCP tools (`mcp/interop-engine.ts` + `mcp/interop-write-engine.ts`)

Conform to `@recoder/agent-mcp` `McpToolRegistration`. **SHIPPED:** the tools split
across a read engine (`interop-engine.ts`) and a write engine
(`interop-write-engine.ts`); `interop-wire-module.mcp()` composes both and bootstrap
registers them under the in-proc MCP server name **`interop-wire`**. Every tool call
passes the InteropChain.

| Tool                     | Kind  | Purpose                                         |
| ------------------------ | ----- | ----------------------------------------------- |
| `interop_list_agents`    | read  | List registered agents + capabilities           |
| `interop_agent_liveness` | read  | Heartbeat/SLO liveness for an agent             |
| `interop_get_task`       | read  | Task row + message log (projection)             |
| `interop_task_context`   | read  | Compact context bundle for a task               |
| `interop_methods`        | read  | The registered A2A JSON-RPC method surface      |
| `interop_send_task`      | write | Send a task to an agent/runtime (dispatch)      |
| `interop_dispatch`       | write | Multi-dispatch fan-out (`all`/`first`/`quorum`) |
| `interop_respond`        | write | Respond to an input-required task               |
| `interop_inbox`          | write | Pull pending inbound A2A tasks for the actor    |

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
5. **Runtimes** — the runtime-connector registry (`runtimes/index.ts` +
   `runtime-connector.ts`), then each wire adapter
   (claude→codex→opencode→cursor→windsurf→replit — **no pi/openfang wire adapter**,
   **no connector-process supervisor**; openfang runs in-process via
   conductor/engines). Dispatch legs error truthfully when the conductor `localRun`
   seam is absent. Test: degrade-safe down path.
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
