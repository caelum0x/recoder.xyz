# Recoder Backend — Complete File Tree (buildable plan)

> The full folder/file plan across all 14 domains + spine + engines. One line of
> responsibility per file. Grouped by area/language. This is the target the build
> phases in [`BUILD-ORDER.md`](./BUILD-ORDER.md) fill in. Per-domain detail (DB
> schema, edges, reuse notes) is in [`domains/`](./domains/). Legend: `[MOVE]` =
> relocate existing code behind the composer, `[NEW]` = write from scratch,
> `[REUSE]` = package/engine used in place. Tests are co-located.

Approx counts: spine ~26 · identity 36 · persistence 34 · edge 26 · agent-os 46 ·
conductor 45 · interop 40 · engines 44 · inference 26 · social 30 · governance 33 ·
memory 34 · billing 28 · cloud 27 · observability 23 → **~498 files** (incl.
co-located tests, migrations, and the Rust/Python/Go engine seams referenced in
place).

---

## Spine — `backend/src/` root, bootstrap, shared, http (~26 files)

```
backend/
  package.json                              # [NEW] recoder-backend — the single pnpm workspace member
  tsconfig.json                             # [MOVE] TS config for the host
  vitest.config.ts                          # [MOVE] test runner config
  migrations/                               # canonical SQL (see §Migrations); runner in domains/persistence

  src/
    server.ts                               # [NEW] thin entrypoint: parse env → bootstrap.start()

    bootstrap/
      index.ts                              # [NEW] start(): build config → container → migrate → listen
      config.ts                             # [NEW] AppConfig loader: env → typed config, validated once (zod)
      container.ts                          # [NEW] DI container: constructs all 14 modules in dependency order
      lifecycle.ts                          # [NEW] SIGTERM/SIGINT graceful start/drain/stop orchestration
      health-registry.ts                    # [NEW] registry of every domain HealthSource (fed to observability)
      engine-supervisor.ts                  # [NEW] boots/supervises napi/daemon/sidecar engines at startup
      container.test.ts                     # [NEW] boots all modules with fakes; degrade-safe wiring

    shared/
      app-config.ts                         # [NEW] AppConfig type + per-domain slice accessors
      result.ts                             # [NEW] Result<T>/err envelope + ErrorCode enum
      errors.ts                             # [MOVE] sendSuccess/sendError/createError/asyncHandler (from backend/src/errors)
      module-base.ts                        # [NEW] ModuleBase interface: { health(), start?, stop? }
      health-types.ts                       # [NEW] HealthReport/ComponentHealth/EngineStatus shared shapes
      di-tokens.ts                          # [NEW] symbol tokens for every domain module (DI registry keys)
      domain-registry.ts                    # [NEW] canonical list of domain keys + mount bases
      logger.ts                             # [MOVE] child-logger factory over @recoder/logger

    http/
      app.ts                                # [MOVE] createHttpApp(deps) → {app,server,wsUpgrade} (express+express-ws)
      lifecycle.ts                          # [NEW] graceful listen + drain/stop on signals
      openapi.ts                            # [NEW] build OpenAPI 3.1 from route table; serve /api/openapi.json + docs
      middleware/
        chain.ts                            # [NEW] the ONE canonical ordered request pipeline
        request-context.ts                  # [MOVE] request-id + W3C trace ctx + structured logs + metrics
        cors.ts                             # [MOVE] origin allowlist (cors-utils), credentialed cross-subdomain
        rate-limit.ts                       # [MOVE] http token-bucket tiers + WS limiter binding
        auth.ts                             # [MOVE] resolveSession (@recoder/auth): authenticateRequest/optionalAuth
        internal-key.ts                     # [MOVE] /internal/* INTERNAL_SERVICE_KEY constant-time gate
        interop-gate.ts                     # [NEW] authorize→risk→policy→audit edge chain as middleware
        validate.ts                         # [NEW] zod boundary validators validateBody/Query/Params
        error.ts                            # [MOVE] error-envelope terminal middleware + 404 + asyncHandler
        __tests__/internal-key.test.ts      # [NEW] gate rejects missing/short/placeholder/wrong key
        __tests__/interop-gate.test.ts      # [NEW] deny → AUTHZ envelope, audit always recorded
        __tests__/error.test.ts             # [NEW] thrown/rejected → stable envelope, no leak
      ws/
        upgrade-router.ts                   # [NEW] single server.on('upgrade') dispatch + auth + origin check
        terminal.socket.ts                  # [NEW] /terminal WS ↔ conductor TerminalStreamPort (substrate pty)
        stream.socket.ts                    # [NEW] /api/conductor/workspaces/:id/stream WS ↔ agent-os RunEvent fan-out (doc-sync/collaboration cut)
        __tests__/upgrade-router.test.ts    # [NEW] unauth upgrade rejected; bad origin closed; path routing
```

---

## Domain: identity — `backend/src/domains/identity/` (36 files)

```
identity/
  index.ts                                  # [NEW] createIdentityModule() factory + IdentityModule interface
  identity-module.ts                        # [NEW] composer: better-auth + verifier + keys + device + orgs + rbac
  types.ts                                  # [NEW] Identity, Principal, PlatformApiKey, DeviceGrant, Org, Team, Role
  config.ts                                 # [NEW] IdentityConfig slice (secret refs, TTLs, cookie domain)
  health.ts                                 # [NEW] better-auth|auth-db|key-store|device-store|org-store health
  ports/
    session-verifier.port.ts                # [NEW] SessionVerifier.verify(cred)→Principal — the identity→ALL seam
    identity-repository.port.ts             # [NEW] unified read model over user/users; link+resolve
    api-key-store.port.ts                   # [NEW] sk_ key persistence contract
    device-grant-store.port.ts              # [NEW] device/user-code persistence contract
    org-store.port.ts                       # [NEW] OrgStore/MembershipStore + PermissionEvaluator.can()
  adapters/
    better-auth.adapter.ts                  # [MOVE] wraps @recoder/auth createAuth()+toNodeHandler; degrade-safe
  api-key.service.ts                        # [NEW] mint/validate/revoke sk_ (sha256+pepper, prefix index)
  device-flow.service.ts                    # [NEW] RFC-8628 device authorization + rate-limited polling
  principal.service.ts                      # [MOVE] implements SessionVerifier: cookie|sk_|internal → Principal
  org.service.ts                            # [NEW] orgs/teams/memberships/invites (governance-gated writes)
  rbac.service.ts                           # [NEW] implements PermissionEvaluator: role→permission + can()
  routes/
    auth.routes.ts                          # [MOVE] /api/auth/[...all] (Better Auth) + GET /api/auth/session
    api-keys.routes.ts                      # [NEW] /api/identity/keys CRUD (session-gated)
    device.routes.ts                        # [NEW] /api/identity/device/{code,token,approve}
    orgs.routes.ts                          # [NEW] /api/identity/orgs + teams + members + invites
    internal-identity.routes.ts             # [NEW] /internal/identity/{resolve,validate-key}
  middleware/
    authenticate.middleware.ts              # [MOVE] authenticate/authenticateMutating/requireAdmin/requireInternal/requirePermission
  mcp/
    identity-engine.ts                      # [NEW] MCP: identity_whoami/key_mint/key_list/key_revoke
  migrations/
    0001-identity-keys.sql                  # [NEW] platform_api_key
    0002-device-grants.sql                  # [NEW] device_grant
    0003-orgs-teams-rbac.sql                # [NEW] organization, team, org_membership, org_permission_override
    0004-legacy-users-link.sql              # [NEW] user_cli_link (unify without merge; backfill, never drop)
  __tests__/
    api-key.service.test.ts                 # [NEW] mint/hash/validate/revoke/expiry + timing safety
    device-flow.service.test.ts             # [NEW] grant lifecycle, poll rate-limit, expiry, approval race
    principal.service.test.ts               # [NEW] credential precedence, anonymous fallback, invalid token
    rbac.service.test.ts                    # [NEW] role expansion, can() allow/deny, org isolation
    internal-identity.routes.test.ts        # [NEW] INTERNAL_SERVICE_KEY gate (resolve + validate-key)
```

---

## Domain: persistence — `backend/src/domains/persistence/` (34 files)

```
persistence/
  index.ts                                  # [NEW] createPersistenceModule(deps) + PersistenceModule interface
  persistence-module.ts                     # [NEW] composer: PgPool + QueryExecutor + MigrationRunner + RepositoryFactory
  config.ts                                 # [NEW] PersistenceConfig slice + prod-URL guard
  types.ts                                  # [NEW] QueryRow, TxContext, PoolStats, MigrationReport, KvEntry, StateEvent
  health.ts                                 # [NEW] pool ping + migration ledger + saturation → up|down|degraded
  ports/
    query-executor.port.ts                  # [NEW] QueryExecutor (execute/one/read/mutate + withTransaction)
    repository.port.ts                       # [NEW] Repository<T,Id> + UnitOfWork/TxContext seam
    kv-store.port.ts                        # [NEW] KvStore (namespaced get/set/delete/list) — replaces JSON persistence
    migration-runner.port.ts                # [NEW] MigrationRunner (apply/status)
  client/
    pg-pool.ts                              # [NEW] shared pg.Pool factory; prod-URL validation; SSL; graceful drain
    connection-manager.ts                   # [MOVE] encrypted external user-project DB connections (AES-256-GCM)
  query/
    query-executor.ts                       # [MOVE] :param executor, helpers, injection analysis, bounded audit
    named-params.ts                         # [NEW] compile :name SQL → positional $n; IN-array expansion
    transaction.ts                          # [NEW] withTransaction(fn): BEGIN/COMMIT/ROLLBACK on pooled client
  drivers/
    postgres.driver.ts                      # [MOVE] pg driver wrapper (typed query, fields, pooled client)
    sqlite.driver.ts                        # [MOVE] sqlite driver — dev/embedded fallback ONLY
  repositories/
    base.repository.ts                      # [NEW] abstract CRUD + user_id scoping + row↔entity map + version bump
    kv-store.repository.ts                  # [NEW] KvStore over core.kv_store (replaces loadStore/saveStore)
    repository-factory.ts                   # [NEW] RepositoryFactory: injects QueryExecutor into domain repos
    state-of-record.repository.ts           # [NEW] append-only state_events + versioned state_snapshots (time-travel)
  schema/
    schema-inspector.ts                     # [MOVE] read-only introspection (tables/columns/indexes)
    seed.ts                                 # [NEW] idempotent dev/test seed loader
    backup.ts                               # [NEW] logical pg_dump/restore wrapper — approval-gated, degrade-safe
  migrations/
    migration-runner.ts                     # [MOVE] ledger, idempotent, degrade-safe (from apply-migrations.ts)
  routes/
    persistence.routes.ts                   # [NEW] /internal/persistence/{health,migrate,introspect,backup}
  mcp/
    persistence-engine.ts                   # [NEW] MCP: db_schema_inspect, db_query_readonly (governed)
  __tests__/
    named-params.test.ts                    # [NEW] :param compile, IN-array, missing/extra param errors
    base-repository.test.ts                 # [NEW] CRUD + user_id scoping + cross-tenant denial
    transaction.test.ts                     # [NEW] commit persists, thrown fn rolls back, client released
    migration-runner.test.ts                # [NEW] idempotent ledger, ordered apply, degrade-safe failure
    kv-store.repository.test.ts             # [NEW] namespaced get/set/delete/list, TTL expiry, concurrent upsert
    health.test.ts                          # [NEW] up on ping, down without pool, degraded on saturation
```

---

## Domain: edge — `backend/src/domains/edge/` (part of the 26-file edge domain; http/ listed in Spine)

```
domains/edge/
  index.ts                                  # [NEW] createEdgeModule(deps): EdgeModule — the ONE public interface
  edge-module.ts                            # [NEW] composer: builds app, applies chain, mounts route table + WS, health
  route-table.ts                            # [NEW] declarative mount table [{base, provider, guard, internal}]
  config.ts                                 # [NEW] EdgeConfig slice (origins, limits, ws, timeouts)
  health.ts                                 # [NEW] server up + per-mount registration status
  types.ts                                  # [NEW] EdgeModule, MountSpec, GuardPolicy, EdgeHealth
  ports/
    route-provider.port.ts                  # [NEW] RouteProvider — every domain implements to expose HTTP/MCP edges
    ws-backend.port.ts                      # [NEW] WsBackend — /terminal + workspace-stream backends implement this
  __tests__/
    route-table.test.ts                     # [NEW] every mount has a guard; no duplicate/overlapping base paths
    edge-module.test.ts                     # [NEW] boot mounts providers; degraded provider skipped + health down
```

---

## Domain: agent-os — `backend/src/domains/agent-os/` (46 files)

```
agent-os/
  index.ts                                  # [NEW] createAgentOsModule(deps) + AgentOsModule interface
  agent-os-module.ts                        # [NEW] composer: fuses services + repo + gate behind the interface
  config.ts                                 # [NEW] AgentOsConfig zod slice (repo driver, NATS url, outbox interval)
  types.ts                                  # [NEW] AgentOsDeps, IngestResult, DrainStats
  health.ts                                 # [NEW] repository|outbox/NATS|gate|compiler health
  middleware/
    schema-guard.middleware.ts              # [MOVE] validateBody/validateQuery zod boundary
  ports/
    index.ts                                # [NEW] barrel
    agent-os-repository.port.ts             # [NEW] state-of-record CRUD port (EXPOSED to persistence)
    run-event-bus.port.ts                   # [NEW] RunEvent ingest + subscribe port
    outbox-publisher.port.ts                # [NEW] CloudEvents publisher port
    governance-gate.port.ts                 # [NEW] decide()/record_audit() port (CONSUMED from governance)
    instruction-compiler.port.ts            # [NEW] compile bundle port (CONSUMED from agent-instructions)
  adapters/
    postgres-agent-os.repository.ts         # [MOVE] pg impl (:param SQL, WHERE user_id)
    json-file-agent-os.repository.ts        # [MOVE] json-file impl (degrade/dev)
    in-memory-agent-os.repository.ts        # [MOVE] in-memory impl (tests/no-DB degrade)
    governance-gate.adapter.ts              # [NEW] wraps @recoder/governance; degrades deny/allow+log
    instruction-compiler.adapter.ts         # [NEW] wraps @recoder/agent-instructions compiler
    nats-outbox-publisher.adapter.ts        # [MOVE] publishes to NATS; degrades to log-only sink
  services/
    run-transition.ts                       # [NEW] PURE legal state machine (transitionTaskRun wrap)
    task.service.ts                         # [MOVE] task create/route/context-pack orchestration
    run.service.ts                          # [MOVE] run claim/transition/handoff/verification
    approval.service.ts                     # [MOVE] approval request + approve/reject (gate-checked) *see conflict #2*
    artifact.service.ts                     # [MOVE] artifact + PR/preview artifact creation
    instruction.service.ts                  # [MOVE] compile + persist instruction bundles w/ provenance
    policy.service.ts                       # [MOVE] policy decision evaluate + persist
    space.service.ts                        # [MOVE] spaces + space policies + repo connect
    memory-candidate.service.ts             # [MOVE] remember→review lifecycle (no direct durable write)
    workflow.service.ts                     # [NEW] workflow definition CRUD + run dispatch (driver)
    squad.service.ts                        # [NEW] squads: leader-routing + autopilots (ported multica)
    run-event-ingest.service.ts             # [NEW] RunEvent → validate → apply → append → outbox
    outbox-drain.service.ts                 # [MOVE] at-least-once drain loop (degrade-safe)
  controllers/
    agent-os.controller.ts                  # [MOVE] HTTP handlers over the services
  routes/
    agent-os.routes.ts                      # [MOVE] /api/agent-os/* main table
    internal.routes.ts                      # [MOVE] /internal/agent-os/* RunEvent ingest (INTERNAL_SERVICE_KEY)
    memory-candidate.routes.ts              # [MOVE] /api/agent-os/memory/lifecycle/*
    policy-evaluate.routes.ts               # [MOVE] /api/agent-os/policy/evaluate
    workflow.routes.ts                      # [NEW] /api/agent-os/workflows/*
    squad.routes.ts                         # [NEW] /api/agent-os/squads/*
  mcp/
    agent-os-engine.ts                      # [NEW] MCP: task.create/run.claim/approval.request/memory.remember/squad.dispatch
  migrations/
    0001-agent-os-schema.sql                # [MOVE] tasks/runs/approvals/artifacts/instructions/policies/spaces/events/outbox
    0003-squads.sql                         # [NEW] squads + squad_members + squad_activity
  __tests__/
    run-transition.test.ts                  # [NEW] legal/illegal state machine transitions
    run-event-ingest.test.ts                # [NEW] ingest → state + event + outbox, idempotency
    approval-service.test.ts                # [NEW] gate-checked approve/reject + audit append
    outbox-drain.test.ts                    # [NEW] at-least-once, NATS-down degrade
    squad.service.test.ts                   # [NEW] leader-routing + autopilot dispatch
    agent-os-routes.integration.test.ts     # [NEW] happy + 401/403/validation paths
```
*Note: `0002-conductor-workspaces.sql` ceded to conductor (conflict #4); `work_locks`/`governance_approvals` ceded to governance (conflicts #2, #5).*

---

## Domain: conductor — `backend/src/domains/conductor/` (45 files)

```
conductor/
  index.ts                                  # [NEW] createConductorModule(deps) + ConductorModule interface
  conductor-module.ts                       # [NEW] composer: substrate engine + terminal + runloop behind one iface
  config.ts                                 # [NEW] ConductorConfig zod slice (TMUX_BIN, worktree root, caps)
  types.ts                                  # [NEW] WorkspaceView, SteerInput, RunLoopState, SubstrateKind
  health.ts                                 # [NEW] per-engine up|down aggregate
  errors.ts                                 # [NEW] domain→ErrorCode mapping
  ports/
    index.ts                                # [NEW] barrel
    workspace-repository.port.ts            # [NEW] conductor_workspaces + run-tails repo port
    substrate-registry.port.ts              # [NEW] narrow EngineSubstrate + registry view (@recoder/substrate)
    run-event-sink.port.ts                  # [NEW] RunEvent sink the tailer writes to
    work-lock.port.ts                       # [NEW] coordination lock port (acquire/reacquire/release)
    admission.port.ts                       # [NEW] resource-governor admission port
    brain.port.ts                           # [NEW] prompt-enrichment port
    terminal-stream.port.ts                 # [NEW] EXPOSED to edge: /terminal WS control iface
    governance-gate.port.ts                 # [NEW] consumes @recoder/governance decide/record_audit
  adapters/
    index.ts                                # [NEW] registerDefaultSubstrates(deps)
    substrate-tmux.adapter.ts               # [MOVE] tmux_worktree substrate (DEFAULT)
    substrate-daytona.adapter.ts            # [MOVE] daytona remote sandbox substrate
    substrate-in-process.adapter.ts         # [MOVE] openfang napi .node in-proc substrate
    substrate-ssh.adapter.ts                # [MOVE] ssh remote-exec substrate
    tmux-control-mode.adapter.ts            # [MOVE] opt-in real-time %output stream (degrade→poller)
    dmux-attention.adapter.ts               # [MOVE] pane attention classifier (dmux heuristics, in place)
    mcp-inject.adapter.ts                   # [MOVE] write per-worktree .mcp.json (git-excluded)
  services/
    workspace-service.ts                    # [MOVE] lifecycle facade over @recoder/substrate WorkspaceEngine
    reconciler.ts                           # [MOVE] restart-survivable reconcile (live ⋈ persisted)
    run-tailer.ts                           # [MOVE] backend adapter over substrate observe/run-tailer
    run-loop.ts                             # [MOVE] per-workspace loop: launch→tail→complete→review
    planner.ts                              # [MOVE] choose runtime/substrate/model from TaskSpec
    prompt-enrichment.ts                    # [MOVE] beads recall + colbert rerank → enriched prompt
    review.ts                               # [MOVE] workspace diff / file tree / archive
    review-publish.ts                       # [MOVE] merge to base / open PR (governed delivery)
    resource-governor.ts                    # [MOVE] admission (disk/session/workspace caps)
    completion-watcher.ts                   # [MOVE] finished run → completion RunEvent + memory candidate
  terminal/
    tmux-orchestrator.ts                    # [MOVE] tmux session primitives (start/list/capture/send-keys/kill)
    tmux-path.ts                            # [MOVE] pinned tmux binary resolution + version guard
    terminal-stream.ts                      # [MOVE] /terminal control-mode WS handler (attach/stream/steer)
    live-events.ts                          # [MOVE] /workspaces/:id/stream workspace RunEvent fan-out
  locks/
    conductor-locks.ts                      # [MOVE] work-lock adapter over @recoder/coordination
  audit/
    conductor-audit.ts                      # [MOVE] governance-gate write wrapper + audit-chain query/verify
  routes/
    conductor.routes.ts                     # [MOVE] /api/conductor/* HTTP edges
    terminal.routes.ts                      # [MOVE] WS /terminal + /workspaces/:id/stream mount *(via edge upgrade-router — conflict #6)*
  mcp/
    conductor-engine.ts                     # [NEW] registerConductorMcpTools: workspace_* MCP tools
  migrations/
    0001-conductor-workspaces.sql           # [MOVE] conductor_workspaces state-of-record
    0002-conductor-run-tails.sql            # [NEW] persisted tail cursor (restart-survivable tailing)
    0003-conductor-reconcile-findings.sql   # [NEW] orphan/reconcile audit rows
  __tests__/
    workspace-lifecycle.test.ts             # [NEW] create→ready→running persisted-before-launch
    reconciler.test.ts                      # [NEW] orphan sessions/worktrees flagged not killed
    substrate-registry.test.ts              # [NEW] 4 substrates register; missing creds → available:false
    terminal-stream.test.ts                 # [NEW] control-mode parse + degrade-to-poller
    run-loop.test.ts                        # [NEW] launch→tail→exitcode; unknown exit ≠ fabricated 0
    health.test.ts                          # [NEW] truthful per-engine up|down; degraded labelling
    governance-write.test.ts                # [NEW] every write calls gate.decide + record_audit; deny blocks launch
```

---

## Domain: interop — `backend/src/domains/interop/` (40 files)

```
interop/
  index.ts                                  # [NEW] createInteropModule(deps) + InteropModule interface
  interop-module.ts                         # [NEW] composer: fuses wire + gate + runtimes
  types.ts                                  # [NEW] AgentRow, DispatchPlan, ConnectorSpec, RuntimeSelection, SloWindow
  config.ts                                 # [NEW] InteropConfig slice (runtime flags, timeouts, signing mode)
  health.ts                                 # [NEW] a2a-sdk + each runtime + governance link health
  ports/
    interop-chain.port.ts                   # [NEW] EXPOSED: InteropChain (authorize→risk→policy→audit) *see conflict #1*
    a2a-transport.port.ts                   # [NEW] EXPOSED: A2ATransport (ingress/egress + agent-card)
    runtime-adapter.port.ts                 # [NEW] re-export ConductorRuntime (widened id union)
    connector-runtime.port.ts               # [NEW] ConnectorRuntime process port (spawn/attach/stream/stop)
    agent-registry.repo.ts                  # [NEW] Repository port for agents + heartbeat
    task-store.repo.ts                      # [NEW] Repository port for A2A tasks/messages/scratchpad
  wire/
    a2a-envelope.service.ts                 # [MOVE] build/parse/validate A2A envelopes (wraps @recoder/a2a-sdk)
    agent-card.service.ts                   # [MOVE] build+serve local agent-card; cache remote cards
    signed-ingress.gate.ts                  # [MOVE] verify sig (HMAC/ed25519) → admit against MCP tool policy
    a2a-jsonrpc-server.ts                   # [MOVE] A2A JSON-RPC method surface (message/send, tasks/get…)
  gate/
    interop-chain.service.ts                # [NEW] concrete InteropChain orchestration *(single owner — conflict #1)*
    governance-gate.adapter.ts              # [NEW] degrade-safe adapter over @recoder/governance
    approval-gate.service.ts                # [MOVE] blocking approval wait for risky actions
  runtimes/
    runtime-registry.ts                     # [MOVE] registry + selector; dispatch entrypoint
    claude-runtime.adapter.ts               # [MOVE] Claude Code adapter (spawn/attach → RunEvent)
    codex-runtime.adapter.ts                # [MOVE] Codex adapter
    opencode-runtime.adapter.ts             # [MOVE] opencode adapter (@recoder/opencode-sdk)
    pi-runtime.adapter.ts                   # [MOVE] pi adapter (pi-* packages)
    openfang-runtime.adapter.ts             # [MOVE] openfang in-proc napi adapter (widened runtime id)
    connector-process.supervisor.ts         # [MOVE] generic CLI connector supervisor (cursor/windsurf/replit)
    run-event.emitter.ts                    # [MOVE] normalize adapter output → RunEvent, push to outbox
  registry/
    agent-registry.service.ts               # [MOVE] register/list/heartbeat; capability match for routing
    heartbeat-slo.service.ts                # [MOVE] heartbeat tracker + SLO metrics
  dispatch/
    multi-dispatch.service.ts               # [MOVE] fan a task to N runtimes (squad), aggregate strategies
    task-lifecycle.service.ts               # [MOVE] A2A task state machine + RunEvent emission
  bridge/
    context-bridge.service.ts               # [MOVE] pass ContextPack/handoff across delegation chain
    scratchpad.service.ts                   # [MOVE] shared per-task scratchpad (append/read, TTL)
  repositories/
    agent-registry.repository.ts            # [MOVE] concrete AgentRegistryRepo over QueryExecutor
    task-store.repository.ts                # [MOVE] concrete TaskStoreRepo (tasks/messages/scratchpad)
  routes/
    interop.routes.ts                       # [MOVE] /api/a2a/* wire ingress + agent-card + registry
    connectors.routes.ts                    # [MOVE] /api/a2a/connectors/* per-runtime connector control
    runtimes.routes.ts                      # [MOVE] task-lifecycle/multi-dispatch/heartbeat/scratchpad/handoff
  mcp/
    interop-engine.ts                       # [NEW] MCP: send_task/task_respond/list_agents/inbox/dispatch
  migrations/
    0001_interop_agents.sql                 # [NEW] interop_agents + interop_heartbeats
    0002_interop_tasks_scratchpad.sql       # [NEW] interop_tasks + interop_task_messages + interop_scratchpad
  __tests__/
    interop-chain.test.ts                   # [NEW] chain admits valid, rejects per stage
    a2a-envelope.contract.test.ts           # [NEW] golden envelope round-trip vs @recoder/a2a-sdk vectors
    signed-ingress.gate.test.ts             # [NEW] ed25519 + HMAC verify; tamper/expired/replay rejection
    runtime-registry.test.ts                # [NEW] selection + degrade-safe down when key absent
    task-lifecycle.test.ts                  # [NEW] state-machine legal/illegal + RunEvent emission
```

---

## Domain: engines — `backend/src/domains/engines/` (44 files)

```
engines/
  index.ts                                  # [NEW] createEnginesModule() + EnginesModule interface
  engines-module.ts                         # [NEW] composer: supervisors + adapters + MCP host; fuses all engines
  config.ts                                 # [NEW] EnginesConfig slice (binary paths, loopback addrs, PAL root)
  types.ts                                  # [NEW] EngineId, EngineTransport, EngineDescriptor, EngineHealth, InvokeResult
  constants.ts                              # [NEW] canonical engine ids + default loopback addrs + backoff caps
  health.ts                                 # [NEW] per-engine + aggregate HealthReport builder
  ports/
    engine-client.port.ts                   # [NEW] EngineClientPort<TReq,TRes> — common engine contract
    daemon-supervisor.port.ts               # [NEW] DaemonSupervisorPort — spawn/backoff/probe loopback binaries
    sidecar-supervisor.port.ts              # [NEW] SidecarSupervisorPort — Python uv-venv sidecars
    napi-loader.port.ts                     # [NEW] NapiLoaderPort — load a .node in-proc, degrade if absent
    mcp-host.port.ts                        # [NEW] McpHostPort — register/list/call over the interop gate
    engine-registry.port.ts                 # [NEW] EngineRegistryPort + EngineHealthRepository
    index.ts                                # [NEW] barrel
  supervisor/
    daemon-supervisor.ts                    # [NEW] spawn once, wait /health 200, restart w/ backoff (folds N copies)
    sidecar-supervisor.ts                   # [NEW] auth-preflight → uv venv → stdio/HTTP; no-op when venv absent
    napi-loader.ts                          # [NEW] require() the .node, cache, version-probe; null when missing
    backoff.ts                              # [NEW] exponential backoff w/ jitter + cap
    health-prober.ts                        # [NEW] HTTP /health probe + timeout + classifier
    process-registry.ts                     # [NEW] track children; SIGTERM graceful shutdown
    napi-loader.test.ts                     # [NEW] present .node loads+versions; absent → null (no throw)
    daemon-supervisor.test.ts               # [NEW] skip-spawn on <ENGINE>_URL, backoff, down when missing
  adapters/
    napi/openfang-napi.adapter.ts           # [MOVE] in-proc openfang kernel (.node)
    napi/tensorzero-napi.adapter.ts         # [MOVE] in-proc TensorZero EmbeddedGateway (.node) *see conflict #8*
    napi/governance-napi.adapter.ts         # [MOVE] in-proc governance kernel (.node); byte-interop golden vectors *conflict #8*
    daemon/colbert.adapter.ts               # [MOVE] loopback ColBERT rerank daemon client
    daemon/ops-recorder.adapter.ts          # [MOVE] loopback ops-recorder signal-detection daemon client
    daemon/multica.adapter.ts               # [MOVE] loopback multica squads/assignment daemon (Go)
    daemon/ziti.adapter.ts                  # [MOVE] OpenZiti controller Edge-Management REST client (Go)
    daemon/tensorzero-loopback.adapter.ts   # [MOVE] TZ gateway loopback fallback when napi absent
    daemon/colbert.adapter.test.ts          # [NEW] rerank round-trip + down when daemon missing
    sidecar/mem0.adapter.ts                 # [MOVE] Python mem0 memory sidecar (loopback HTTP)
    sidecar/browser-use.adapter.ts          # [MOVE] Python browser-use LLM-agent sidecar (loopback HTTP)
    sidecar/pal-mcp.adapter.ts              # [MOVE] Python pal-mcp-server (stdio-MCP) — external MCP registration
    cli/beads.adapter.ts                    # [MOVE] `bd` issue-graph CLI (one-shot, cwd-scoped)
    cli/dmux.adapter.ts                     # [MOVE] dmux terminal-mux CLI adapter
    cli/tmux.adapter.ts                     # [MOVE] tmux session CLI adapter
    cli/recodergit.adapter.ts               # [MOVE] recodergit code-intel CLI/indexer adapter
    engine-health.repository.ts             # [NEW] EngineHealthRepository over persistence QueryExecutor
  mcp/
    mcp-host.ts                             # [MOVE] InteropHostBundle — interop McpHost facade + PAL wiring
    inproc-router.ts                        # [MOVE] buildInProcEngineRouter + ENGINE_SERVERS + forEachInProcEngineTool
    engine-registry.ts                      # [NEW] IN_PROC_SERVERS catalog + wiring-checklist guard
    engines-engine.ts                       # [NEW] MCP: engine.list/engine.health/engine.restart
    engine-registry.test.ts                 # [NEW] assertWiringComplete catches mis-registered engine
  routes/
    engines.routes.ts                       # [NEW] list/health/restart + /api/mcp servers/call + /internal
  migrations/
    NNNN_engine_registry.sql                # [NEW] engine_registry + engine_health_log + engine_restart_log
  __tests__/
    engines-module.test.ts                  # [NEW] composer wiring + degrade-safe fan-out
    mcp-host.contract.test.ts               # [NEW] every registered tool passes authorize→risk→audit
```

---

## Domain: inference — `backend/src/domains/inference/` (26 files)

```
inference/
  index.ts                                  # [NEW] createInferenceModule factory + InferenceGateway (barrel)
  inference-module.ts                       # [NEW] composer: napi/loopback/router ladder behind InferenceGateway
  config.ts                                 # [NEW] InferenceConfig zod slice (TZ urls, napi flag, default model)
  types.ts                                  # [NEW] CompletionRequest/Result, StreamDelta, DeliveryOutcome, ModelCatalogEntry
  health.ts                                 # [NEW] per-rung up|down aggregation
  ports/
    inference-gateway.port.ts               # [NEW] InferenceGateway public port
    llm-transport.port.ts                   # [NEW] internal transport rung interface (complete/embed/stream + probe)
    byok-store.port.ts                      # [NEW] BYOK credential repository port
    model-catalog.port.ts                   # [NEW] model/provider registry repository port
    feedback-store.port.ts                  # [NEW] delivery-outcome/feedback repository port
  adapters/
    tensorzero-napi.adapter.ts              # [MOVE] rung 1: in-proc EmbeddedGateway .node *(consume engines client — conflict #8)*
    tensorzero-loopback.adapter.ts          # [MOVE] rung 2: TZ OpenAI-wire over UDS/loopback *conflict #8*
    llm-router.adapter.ts                   # [MOVE] rung 3: direct BYOK multi-provider
    tz-config-generator.ts                  # [MOVE] registry → tensorzero.toml (env NAMES only)
    byok-key-cache.adapter.ts               # [MOVE] AES-256-GCM per-user key cache (vault, 5-min TTL)
    token-accounting.adapter.ts             # [NEW] usage → billing meter + RunEvent emit
  routes/
    inference.routes.ts                     # [MOVE] /api/gateway/* (health, complete, embed, models, feedback)
    openai-compat.routes.ts                 # [MOVE] /api/gateway/v1/{chat/completions,embeddings} (OpenAI wire + SSE)
  mcp/
    inference-engine.ts                     # [NEW] MCP: inference.complete/embed/feedback/models
  repositories/
    byok-store.repository.ts                # [NEW] concrete BYOK store (pg :param, WHERE user_id, ciphertext)
    model-catalog.repository.ts             # [NEW] concrete catalog repo (pg, seeds platform models)
    feedback-store.repository.ts            # [NEW] concrete delivery-outcome repo (pg)
  migrations/
    ..._inference_provider_keys.sql         # [NEW] inference_provider_keys
    ..._inference_model_catalog.sql         # [NEW] inference_model_catalog
    ..._inference_delivery_outcome.sql      # [NEW] inference_delivery_outcome
    ..._inference_usage_ledger.sql          # [NEW] inference_usage_ledger
  __tests__/
    inference-module.test.ts                # [NEW] ladder fallthrough + degrade + governance/interop pass
    openai-compat.routes.test.ts            # [NEW] OpenAI mapping + SSE framing + honest error bodies
    byok-resolution.test.ts                 # [NEW] per-user→platform→env precedence + cache + fail-safe
    token-accounting.test.ts                # [NEW] usage → meter + RunEvent, degrade when billing down
    feedback-loop.test.ts                   # [NEW] DeliveryOutcome → TZ feedback() + repo persistence
```

---

## Domain: social — `backend/src/domains/social/` (30 files)

```
social/
  index.ts                                  # [NEW] createSocialModule() + SocialModule interface
  social-module.ts                          # [MOVE] composer: gateway + gate + dispatch + engine
  config.ts                                 # [MOVE] SocialConfig slice (per-channel enable + secret refs)
  types.ts                                  # [NEW] ChannelId, InboundEnvelope, MentionDecision, DispatchOutcome
  schema.ts                                 # [NEW] zod: inbound webhook body, admin bind, send payload
  health.ts                                 # [NEW] per-channel up|down aggregation
  ports/
    connector-port.ts                       # [NEW] ConnectorPort narrowed from @recoder/connectors
    mention-gate.port.ts                    # [NEW] MentionGate.admit(inbound) → MentionDecision
    dispatch.port.ts                        # [NEW] DispatchPort: dispatchToConductor + replyInChannel
    tunnel.port.ts                          # [NEW] PublicTunnelPort.ensurePublicUrl (zrok NAT exposure)
    connector-secrets.port.ts               # [NEW] ConnectorSecretsPort: resolve per-channel token/secret
    social-repository.port.ts               # [NEW] SocialRepository: connectors/bindings/inbound-log CRUD
  adapters/
    channel-adapter-registry.ts             # [MOVE] ChannelId → ConnectorPort factory; optional-SDK loader
    openclaw-gateway.adapter.ts             # [MOVE] wraps apps/desktop/engines/openclaw social-gateways (in place)
    mention-gate.adapter.ts                 # [MOVE] hostile-by-default gate (allowlist+mention+command+claim)
    webhook-ingress.adapter.ts              # [MOVE] HMAC verify (LINE/Slack) over raw body + replay window
    zrok-tunnel.adapter.ts                  # [NEW] public-URL tunnel via zrok binary; degrade → down
    conductor-dispatch.adapter.ts           # [MOVE] DispatchPort → conductor createWorkspace + RunEvent follow
    reply-agent.adapter.ts                  # [MOVE] embedded conversational reply agent via inference gateway
    connector-secrets.adapter.ts            # [NEW] @recoder/vault-backed secret resolution, degrade → down
    social-repository.adapter.ts            # [NEW] concrete SocialRepository over QueryExecutor
  routes/
    social.routes.ts                        # [MOVE] GET /api/connectors + admin bind/unbind/send
    webhook.routes.ts                       # [MOVE] POST /api/connectors/webhooks/:channel (RAW body, HMAC gate)
  mcp/
    social-engine.ts                        # [NEW] MCP: social.list_channels/send_message/channel_health
  migrations/
    0001_social_connectors.sql              # [NEW] connectors + channel_bindings
    0002_social_inbound_log.sql             # [NEW] inbound_messages audit + dedup index
  __tests__/
    mention-gate.test.ts                    # [NEW] empty allowlist rejects; mention+allow admits
    webhook-ingress.test.ts                 # [NEW] LINE/Slack HMAC verify, replay reject, missing-secret 401
    dispatch-reply.test.ts                  # [NEW] /run → conductor; plain mention → reply-agent turn
    health.test.ts                          # [NEW] truthful per-channel; no-channels inert; degraded labelling
```
*Engine in place: `apps/desktop/engines/openclaw/social-gateways/{telegram,slack,signal,imessage,whatsapp,line,feishu,_dispatch,config,infra}` [REUSE]. `discord` dropped from live set.*

---

## Domain: governance — `backend/src/domains/governance/` (33 files)

```
governance/
  index.ts                                  # [NEW] createGovernanceModule(deps) + GovernanceModule interface
  governance-module.ts                      # [NEW] composer: kernel + interop + secrets + locks + approvals
  config.ts                                 # [NEW] GovernanceConfig zod slice (socket path, napi toggle, vault ref)
  types.ts                                  # [NEW] GateVerdict, RiskTier, WorkLock, ApprovalRecord, SecretRef, AuditEntry
  health.ts                                 # [NEW] napi/daemon/ts/vault up|down; degraded off-napi path
  ports/
    gate.port.ts                            # [NEW] GovernanceGate (decide/enforceTool/route/recordAudit/verifyAudit)
    interop.port.ts                         # [NEW] InteropChain (authorize→risk→policy→audit) *see conflict #1*
    kernel.port.ts                          # [NEW] GovernanceKernelPort (Rust engine seam)
    secrets.port.ts                         # [NEW] SecretsPort (get/set/rotate/delete/list)
    audit-repo.port.ts                      # [NEW] AuditRepository (append/tip/range/verifyChain)
    approval-repo.port.ts                   # [NEW] ApprovalRepository + WorkLockRepository + SecretRepository
  adapters/
    napi-kernel.adapter.ts                  # [MOVE] loads recoder-governance-napi .node (degrade→undefined) *conflict #8*
    daemon-kernel.adapter.ts                # [MOVE] spawn/connect UDS governance daemon
    ts-kernel.adapter.ts                    # [MOVE] pure-TS deny-biased fallback over @recoder/governance
    kernel-ladder.adapter.ts                # [NEW] compose napi→daemon→ts into one GovernanceKernelPort
    vault.adapter.ts                        # [MOVE] @recoder/vault node-crypto store (degrade→noop→down)
  services/
    governance-gate.service.ts              # [MOVE] GovernanceGate impl (decide→risk→audit) — the WRITE seam
    interop-chain.service.ts                # [MOVE] InteropChain impl *(single owner — conflict #1)*
    audit-chain.service.ts                  # [NEW] Merkle writer+verifier, persists tip via AuditRepository
    secrets.service.ts                      # [NEW] SecretsPort impl: envelope encryption + rotation
    work-lock.service.ts                    # [MOVE] path/work-lock acquire/release/check
    approval.service.ts                     # [MOVE] approval-gate lifecycle *(single owner — conflict #2)*
    signed-envelope.service.ts              # [MOVE] ed25519 sign/verify signed envelopes
  middleware/
    interop.middleware.ts                   # [MOVE] express guard: interop chain + INTERNAL_SERVICE_KEY gate
    rate-limit.middleware.ts                # [MOVE] token-bucket rate limit + abuse prevention *conflict #10*
    ext-authz.middleware.ts                 # [MOVE] fail-closed ext_authz / signed-ingress gate
  repositories/
    audit.repository.ts                     # [NEW] concrete AuditRepository (pg, append-only)
    approval-worklock.repository.ts         # [NEW] concrete ApprovalRepository + WorkLockRepository (pg)
    secret.repository.ts                    # [NEW] concrete SecretRepository (pg, ciphertext only)
  routes/
    governance.routes.ts                    # [MOVE] /api/agent-os/{policies,approvals,audit,locks} + /internal
  mcp/
    governance-engine.ts                    # [NEW] MCP: decide/verify_audit/request_approval/acquire_lock
  __tests__/
    governance-gate.test.ts                 # [NEW] decide→risk→audit + fail-closed on kernel throw
    kernel-ladder.test.ts                   # [NEW] degrade napi→daemon→ts; synthetic deny on total failure
    audit-chain.test.ts                     # [NEW] Merkle append + verify + tamper detection
    interop.middleware.test.ts              # [NEW] edge fail-closed + INTERNAL_SERVICE_KEY gate
    secrets.test.ts                         # [NEW] encrypt/decrypt roundtrip + missing key → down
    governance-interop.golden.test.ts       # [NEW] byte-interop golden vectors vs Rust kernel
  migrations/
    NNNN_governance_audit_approvals_locks_secrets.sql  # [NEW] 4 tables + append-only trigger
```

---

## Domain: memory — `backend/src/domains/memory/` (34 files)

```
memory/
  index.ts                                  # [NEW] createMemoryModule(deps) + MemoryModule interface
  memory-module.ts                          # [NEW] composer: recall/retrieval/lifecycle behind the interface
  config.ts                                 # [NEW] MemoryConfig slice (QDRANT_URL, MEM0_*, COLBERT_RERANK_URL)
  types.ts                                  # [NEW] RecallQuery, RecalledMemory, Provenance, FusionResult, IngestDoc
  health.ts                                 # [NEW] mem0|beads|colbert|vector|candidates health
  recall/
    recall-fusion.ts                        # [NEW] fuse mem0 ∪ beads ∪ candidates → rerank → dedupe → provenance
    dedupe.ts                               # [NEW] near-dup collapse (normalized text + similarity threshold)
    provenance.ts                           # [NEW] tag each RecalledMemory with {source, ref, score, scope}
    rank.ts                                 # [NEW] merge+rerank orchestration (colbert when up, score-blend fallback)
    recall-fusion.test.ts                   # [NEW] union, dedupe, provenance, source-down drop
  lifecycle/
    memory-lifecycle.ts                     # [NEW] remember→promote→forget→relate; promote/forget gated
    candidate-service.ts                    # [MOVE] MemoryCandidate create/list/review over repository port
    harvest.ts                              # [NEW] completion harvest: RunEvent/artifact → MemoryCandidate
    relate.ts                               # [NEW] relate(memoryId, memoryId, kind) edges
    memory-lifecycle.test.ts                # [NEW] promote gated, forget gated, remember ephemeral, relate edges
  retrieval/
    retrieval-service.ts                    # [MOVE] ingest/search over shared vector+embed+rerank
    vector-foundation.ts                    # [MOVE] EmbeddingPort + VectorStorePort (BYOK + Qdrant)
    chunker.ts                              # [NEW] document chunking (token-window + overlap)
    retrieval-service.test.ts               # [NEW] ingest→search roundtrip, not_configured degrade
  ports/
    memory-store.port.ts                    # [NEW] re-exports @recoder/agent-memory MemoryStore
    memory-repository.port.ts               # [NEW] Repository port: candidates + items + relations
    mem0.port.ts                            # [NEW] Mem0Port: search/add/health
    beads-memory.port.ts                    # [NEW] BeadsMemoryPort: remember/recall/promote/note
    reranker.port.ts                        # [NEW] RerankerPort: rerank(query, passages)
    embedding.port.ts                       # [NEW] EmbeddingPort: embed(texts) → vectors | null
    vector-store.port.ts                    # [NEW] VectorStorePort: ensureCollection/upsert/search
    retrieval.port.ts                       # [NEW] RetrievalPort: ingest/search (RAG facade, consumed elsewhere)
  adapters/
    mem0.adapter.ts                         # [MOVE] wraps engines/mem0-client.ts *(consume engines client — conflict #8)*
    beads-memory.adapter.ts                 # [MOVE] wraps conductor/beads-memory.ts (bd CLI)
    colbert.adapter.ts                      # [MOVE] wraps conductor/colbert-rerank.ts; identity fallback *conflict #8*
    qdrant.adapter.ts                       # [MOVE] wraps agent-os/mcp/vector-store.ts createVectorStore
    embedding.adapter.ts                    # [MOVE] wraps createEmbeddingPort (BYOK/tensorzero/openai)
    candidate-repository.adapter.ts         # [NEW] concrete MemoryRepository over QueryExecutor
    mem0-sidecar.client.ts                  # [MOVE] HTTP client to engines/py/mem0 FastAPI
    colbert-sidecar.client.ts               # [MOVE] HTTP client to engines/py/colbert rerank_server
  routes/
    memory.routes.ts                        # [NEW] recall/remember/promote/forget/relate/candidates
    retrieval.routes.ts                     # [NEW] retrieval ingest/search
    memory.routes.test.ts                   # [NEW] auth, validation, error envelope, gate on promote
  mcp/
    memory-engine.ts                        # [NEW] MCP: memory.search/remember/promote/relate
    retrieval-engine.ts                     # [MOVE] MCP: retrieval.ingest/retrieval.search
    memory-engine.test.ts                   # [NEW] router conformance + interop passes
  migrations/
    0xx_memory_relations.sql                # [NEW] memory_relations *(items/candidates owned by agent-os — conflict #3)*
  __tests__/
    memory-integration.test.ts              # [NEW] remember→recall→promote→search e2e (fake engines)
    harvest-recall.test.ts                  # [NEW] harvest on completion + recall on launch hooks
```

---

## Domain: billing — `backend/src/domains/billing/` (28 files)

```
billing/
  index.ts                                  # [NEW] createBillingModule(deps) + BillingModule interface
  billing-module.ts                         # [NEW] composer: distribution + MoR providers + metering + gate
  config.ts                                 # [NEW] BillingConfig slice (provider keys, webhook secrets, flush interval)
  types.ts                                  # [NEW] BillingSubject, PlanTier, UsageRecord, Invoice, EntitlementView
  health.ts                                 # [NEW] per-provider up|down aggregate; degraded when key missing
  ports/
    billing-provider.port.ts                # [NEW] BillingProviderPort — the MoR-provider seam (Polar|Creem|Paddle|Dodo, never Stripe)
    metering.repo.port.ts                   # [NEW] MeteringRepository — usage/quota/subscription/invoice port
    entitlement.port.ts                     # [NEW] EntitlementGate — exposed to ALL other domains
  adapters/
    distribution-billing.adapter.ts         # [MOVE] wraps @recoder/distribution createBillingService
    polar.adapter.ts                        # [MOVE] Polar (MoR) provider over polar-client
    creem.adapter.ts                        # [NEW] Creem (MoR) provider (fetch-based, sig verify)
    paddle.adapter.ts                       # [NEW] Paddle (MoR) provider (fetch-based, sig verify)
    dodo.adapter.ts                         # [NEW] Dodo Payments (MoR) provider (fetch-based, sig verify)
    shared.ts                               # [NEW] shared MoR adapter helpers (fetch, sig verify)
  services/
    plan-catalog.service.ts                 # [NEW] free/pro/team/max/enterprise + plan→capability matrix
    entitlement.service.ts                  # [NEW] feature gates + BYOK-vs-platform decision
    quota.service.ts                        # [NEW] limit resolution, headroom, consume, reset windows
    metering.service.ts                     # [NEW] record usage, idempotent batch flush
    invoice.service.ts                      # [NEW] invoice list/get (provider + local receipts)
    webhook.service.ts                      # [NEW] verify + dispatch provider events → reconcile
  persistence/
    billing.repository.ts                   # [NEW] concrete MeteringRepository over QueryExecutor
  routes/
    billing.routes.ts                       # [MOVE] plan/checkout/usage/entitlements/invoices/portal
    billing-webhooks.routes.ts              # [NEW] POST webhook edges (raw body + signature verify)
  mcp/
    billing-engine.ts                       # [MOVE] MCP: billing.plan.read/usage.read/entitlement.check
  migrations/
    0001_billing_core.sql                   # [NEW] subscriptions + invoices + webhook_events (idempotency)
    0002_billing_usage.sql                  # [NEW] usage_events + usage_counters
  __tests__/
    quota.service.test.ts                   # [NEW] headroom, consume, reset, unlimited, fail-safe deny
    entitlement.service.test.ts             # [NEW] effective-plan max, feature gate, BYOK bypass
    webhook.service.test.ts                 # [NEW] bad sig reject; duplicate event no-op; upgrade projected
    mor-adapters.test.ts                    # [NEW] each MoR adapter: down when key absent; sig verify golden; checkout shape
    billing.repository.test.ts              # [NEW] :param binding, idempotency UNIQUE, WHERE subject scoping
    health.test.ts                          # [NEW] missing keys → degraded + per-provider down
```

---

## Domain: cloud — `backend/src/domains/cloud/` (27 files)

```
cloud/
  index.ts                                  # [NEW] createCloudModule(deps) + CloudModule interface
  cloud-module.ts                           # [NEW] composer: provisioner+deploy+fleet+tenancy+mesh
  config.ts                                 # [NEW] CloudConfig slice (provider keys, preview domain, HMAC secret)
  types.ts                                  # [NEW] Sandbox, Deployment, PreviewUrl, Tenant, FleetNode, MeshEndpoint
  health.ts                                 # [NEW] per-engine up|down aggregate
  ports/
    sandbox-provider.port.ts                # [NEW] SandboxProvider (provision/get/destroy/exec/status)
    deploy-target.port.ts                   # [NEW] DeployTarget + PreviewService (deploy/status/health)
    mesh.port.ts                            # [NEW] MeshDiagnostics (ziti identities + xds clusters, status only)
    cloud-repository.port.ts                # [NEW] Sandbox/Deployment/Tenant/Fleet/Domain/Mesh/PreviewToken repos
  adapters/
    daytona-sandbox.adapter.ts              # [MOVE] Daytona provider (@recoder/sandbox-daytona) — degrade-safe
    e2b-sandbox.adapter.ts                  # [MOVE] E2B provider (@recoder/agent-sandbox e2b) — degrade-safe
    local-container.adapter.ts              # [MOVE] local docker/container fallback (self-host tier)
    ziti-mesh.adapter.ts                    # [NEW] loopback REST/CLI to ziti Go engine — status only
    xds-envoy.adapter.ts                    # [NEW] recoder-xds adapter (@recoder/network xds-contract) — status only
  services/
    sandbox-provisioner.service.ts          # [MOVE] quota-checked provisioning, provider selection, reconcile, TTL reaper
    preview-deploy.service.ts               # [MOVE] deploy → sign URL → health probe → persist Deployment
    preview-url-signer.ts                   # [NEW] HMAC signer/verifier for signed expiring preview URLs
    fleet-supervisor.service.ts             # [NEW] fleet manifest, heartbeats, capacity accounting
    tenancy.service.ts                      # [NEW] tenant tier/isolation/region + quota + self-host-vs-cloud split
    mesh-diagnostics.service.ts             # [NEW] merge ziti+xds status into one diagnostics view
  repositories/
    cloud.repository.ts                     # [NEW] concrete repo impls over persistence QueryExecutor
  routes/
    cloud.routes.ts                         # [NEW] sandboxes/deployments/preview/fleet/tenants/domains/mesh
  mcp/
    cloud-engine.ts                         # [NEW] MCP: provision/destroy/deploy/preview_url/preview_health/fleet/mesh
  migrations/
    20260715_0001_cloud_core.sql            # [NEW] cloud_tenants, cloud_sandboxes, cloud_deployments, cloud_preview_tokens
    20260715_0002_cloud_fleet_mesh.sql      # [NEW] cloud_fleet_nodes, cloud_domains, cloud_mesh_endpoints
  __tests__/
    sandbox-provisioner.test.ts             # [NEW] quota reject + provider fallback + reconcile
    preview-url-signer.test.ts              # [NEW] sign/verify/expiry/revocation/tamper
    tenancy.quota.test.ts                   # [NEW] tier isolation + quota exhaustion
    mesh-degrade.test.ts                    # [NEW] ziti/xds absent → down, module degraded, no throw
    cloud.routes.test.ts                    # [NEW] auth + validation + governance-gate on writes
```

---

## Domain: observability — `backend/src/domains/observability/` (23 files)

```
observability/
  index.ts                                  # [NEW] createObservabilityModule(deps) + ObservabilityModule interface
  observability-module.ts                   # [NEW] composer: logging/metrics/tracing/health/audit/signals
  config.ts                                 # [NEW] ObservabilityConfig slice (OTLP, metrics auth, sample rate)
  types.ts                                  # [NEW] HealthFull, AlertRule, WorkSignal, XdrQuery, SloTarget
  health.ts                                 # [NEW] module self-health (its own engines)
  ports/
    metrics.port.ts                         # [NEW] MetricsPort consumed by ALL domains (counter/gauge/histogram)
    tracer.port.ts                          # [NEW] TracerPort (startSpan/withSpan/inject/extract)
    health-source.port.ts                   # [NEW] HealthSource — what a domain implements to be aggregated
    signals.port.ts                         # [NEW] WorkSignalsPort (engine boundary to ops-recorder sidecar)
    observability.repository.ts             # [NEW] AlertRepository + SignalDispositionRepository + SloRepository ports
  adapters/
    pino-logger.adapter.ts                  # [MOVE] correlation + redaction over @recoder/logger; ring buffer
    prometheus-registry.adapter.ts          # [NEW] prom-client registry, default+custom collectors, SLO rules
    otel-tracer.adapter.ts                  # [NEW] OTel NodeSDK + OTLP/no-op exporter (degrade-safe)
    ops-recorder.adapter.ts                 # [NEW] supervised loopback client for work-signals sidecar
    audit-xdr.adapter.ts                    # [NEW] read+verify projection over governance Merkle chain
  services/
    health-aggregator.service.ts            # [NEW] fuse HealthRegistry → /health/full + SLO rollup
    correlation.service.ts                  # [NEW] request/run correlation-id lifecycle (AsyncLocalStorage)
    alerting.service.ts                     # [NEW] rule eval → notify (herd), dedupe, ack
    work-signals.service.ts                 # [NEW] normalize sidecar signals → RunEvent → board
  routes/
    observability.routes.ts                 # [NEW] /health, /health/full, /metrics, /api/agent-os/observability/*
  middleware/
    telemetry.middleware.ts                 # [NEW] correlation id, trace ctx, RED metrics, access log
  mcp/
    observability-engine.ts                 # [NEW] MCP: obs.health/metrics_query/audit_search/signals
  migrations/
    0014-observability-ops.sql              # [NEW] slo_targets, alert_rules, alert_events, work_signal_dispositions
  __tests__/
    health-aggregator.test.ts               # [NEW] one down engine → degraded; timeout → unknown; SLO math
    correlation.test.ts                     # [NEW] correlation propagates across async boundaries
    telemetry-middleware.test.ts            # [NEW] injects trace ctx, RED metric on 200+500, redacts secrets
    work-signals.service.test.ts            # [NEW] raw signal → RunEvent; sidecar down → no fabricated signals
    audit-xdr.adapter.test.ts               # [NEW] Merkle re-verify; tampered proof → error not silent pass
```

---

## Canonical migrations — `backend/migrations/` (runner in domains/persistence)

Each domain's SQL is mirrored here in lexical order; the persistence runner applies
unseen files in a tx and records the `core._recoder_migrations` ledger.

```
migrations/
  0000_extensions_and_ledger.sql            # [NEW] vector/pgcrypto/citext + schemas + migration ledger
  0001_kv_store.sql                         # [NEW] core.kv_store (replaces JSON persistence)
  0002_state_of_record.sql                  # [NEW] core.state_events + core.state_snapshots (time-travel)
  … per-domain numbered SQL (identity 0001-0004, agent-os schema+squads, conductor
    workspaces+tails+findings, interop agents+tasks, engines registry, inference 4x,
    social connectors+inbound, governance audit/approvals/locks/secrets, memory
    relations, billing core+usage, cloud core+fleet/mesh, observability ops)
```

---

## Rust — `backend/crates/` (first-party) + `backend/engines/rust/` (vendored, in place)

```
crates/
  Cargo.toml                                # [NEW] cargo workspace root for first-party crates
  <crate>/                                  # [NEW] first-party native/perf crates → napi .node or UDS daemon binary

engines/rust/                               # [REUSE] vendored, used in place, never copied
  openfang/                                 # agent kernel — napi .node in-proc substrate/runtime
  tensorzero/crates/tensorzero-gateway-napi # EmbeddedGateway .node (inference rung 1) + tensorzero-node
  recoder-governance/                       # 9-crate workspace: kernel/permission/policy/routing/approval/audit/napi/daemon/ipc
    recoder-governance-kernel/              # decide() core
    recoder-governance-permission/          # deny-biased permission enforcement
    recoder-governance-policy/              # policy + routing + approval + SHA-256 Merkle audit
    recoder-governance-napi/src/lib.rs      # napi .node facade (in-proc default)
    recoder-governance-daemon/src/main.rs   # UDS daemon binary (INTERNAL_SERVICE_KEY fail-closed)
    recoder-governance-ipc / -types         # wire + shared types (golden vectors pinned)
```

---

## Python — `backend/services/` (first-party) + `backend/engines/py/` (vendored, in place)

```
services/
  <svc>/pyproject.toml                      # [NEW] first-party ML/AI sidecar (uv venv, `uv sync`, loopback HTTP/stdio-MCP)

engines/py/                                 # [REUSE] vendored, used in place (loopback sidecars / stdio-MCP)
  mem0/                                     # semantic per-user memory (FastAPI over Qdrant)
  colbert/                                  # rerank_server (POST /rerank)
  browser-use/                              # browser-use LLM agent sidecar
  ops-recorder/work-signals/                # stuck/blocked/needs-you signal detection (main.py, api/, detectors/, normalizers/, storage/, handoff/, integrations/)
  pal-mcp-server/                           # PAL stdio-MCP server (external MCP registration)
```

---

## Go — used in place (no new Go in `backend/`)

```
apps/desktop/server/engines/               # [REUSE] driven via CLI / loopback REST / gRPC-xDS
  multica/                                  # squads/assignment daemon (ideas ported to TS conductor)
  ziti/                                     # OpenZiti zero-trust overlay controller
  recoder-xds/                              # Envoy xDS control plane
  beads/                                    # bd issue-graph CLI (shared memory layer)
apps/desktop/engines/                       # [REUSE]
  tmux/  dmux/  recodergit/  openclaw/       # terminal-mux, pane attention, code-intel, social gateways
```
