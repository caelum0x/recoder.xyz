# Recoder Backend — Phased Build Order

> The implementation sequence for the backend described in
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) and enumerated in
> [`FILE-TREE.md`](./FILE-TREE.md). Ordered by dependency: nothing is built before
> the seam it stands on. Each phase lists what it unblocks, what reuses existing
> code vs writes new, and how to verify before moving on.

> **Status (2026-07-18): all 12 phases SHIPPED.** This document is now the historical
> plan-of-record; the live state (per-phase commits, file counts, follow-ups) lives in
> [`BUILD-STATUS.md`](./BUILD-STATUS.md). The 14 designed domains shipped as **15 domain
> dirs under `backend/src/domains/*`** (interop split into `interop` + `interop-wire`);
> `server.ts` is the thin `bootstrap.start()` entrypoint; the host boots with **15
> truthful health sources** (`tsc` 0, ~1462 backend tests). After the phase build, a
> 26-agent doc-vs-code gap audit drove six feature waves + six adversarial-review rounds
> that closed a systemic cross-tenant authorization class — see
> [**Post-build hardening**](#post-build-hardening-2026-07-18) below.

## Guiding rules

- **Ports before implementations.** Every domain lands its `ports/*` +
  `config.ts` + `types.ts` first so downstream domains compile against interfaces
  while the impl is still being written. The four load-bearing seams —
  `SessionVerifier` (identity), `QueryExecutor` (persistence), `GovernanceGate` +
  `InteropChain` (governance/interop), `RouteProvider` (edge) — are frozen earliest.
- **Reuse over rewrite.** Most of this backend already exists in `backend/src/*`
  and `packages/*`. A phase mostly MOVES code behind a composer + writes the thin
  ports/adapters/composer glue; it does NOT create a 4th copy. `[REUSE]` engines
  stay in place.
- **Truthful health at every step.** A phase is not done until its module reports
  `up|down|degraded` truthfully and its degrade paths are unit-tested.
- **Resolve the 10 contract conflicts** (ARCHITECTURE §5) as they are reached —
  they are flagged inline in the relevant phase below.
- **Verify with the narrowest check that proves the touched behavior**
  (`.claude/rules/testing.md`): focused vitest + `pnpm check-types`, then the
  contract/eval gates and the relevant `scripts/verify-*.sh`.

---

## Phase 0 — Foundation: layout, config, DI, spine ✅ SHIPPED

**Goal:** a bootable empty host — `server.ts` → `bootstrap.start()` → an express
app that listens, with the DI container, config loader, and shared error/health
primitives in place. No domain logic yet.

**Build:**
- `backend/package.json`, `tsconfig.json`, `vitest.config.ts`, `backend/migrations/` dir.
- `src/server.ts` (thin entrypoint).
- `src/shared/*` — `app-config.ts`, `result.ts`, `errors.ts` `[MOVE]`,
  `module-base.ts`, `health-types.ts`, `di-tokens.ts`, `domain-registry.ts`, `logger.ts` `[MOVE]`.
- `src/bootstrap/*` — `config.ts` (env → typed `AppConfig`, validated once),
  `container.ts` (DI, empty), `lifecycle.ts`, `health-registry.ts`,
  `engine-supervisor.ts` (skeleton), `index.ts`.

**Reuse:** `backend/src/errors/*`, `@recoder/logger`, `@recoder/utils`,
`server.ts` express+express-ws init pattern.

**Unblocks:** every subsequent phase (they all take an `AppConfig` slice + register
into the container + a `HealthSource`).

**Verify:** `pnpm check-types`; `bootstrap/container.test.ts` boots with fakes;
`GET /health` returns a truthful (empty) aggregate; process starts + drains on SIGTERM.

---

## Phase 1 — Persistence (data authority) ✅ SHIPPED

**Goal:** one shared `pg.Pool`, the `:param` `QueryExecutor`, the migration runner,
the base `Repository`/`RepositoryFactory`, and the DB-backed `KvStore`. This is the
seam beneath the other 12 stateful domains.

**Build (order within phase):**
1. `ports/*` (`query-executor`, `repository`, `kv-store`, `migration-runner`), `config.ts` (+ prod-URL guard), `types.ts`.
2. `client/pg-pool.ts`, `query/named-params.ts`, `query/query-executor.ts` `[MOVE]`, `query/transaction.ts`.
3. Foundational migrations `0000_extensions_and_ledger.sql`, `0001_kv_store.sql`, `0002_state_of_record.sql` + `migrations/migration-runner.ts` `[MOVE]`.
4. `repositories/*` — `base.repository.ts`, `kv-store.repository.ts`, `repository-factory.ts`, `state-of-record.repository.ts`.
5. `schema/schema-inspector.ts` `[MOVE]` + `seed.ts`, `backup.ts`.
6. Composer + `health.ts`; wire boot-time migrate (degrade-safe) into `bootstrap/container.ts`.
7. `routes/persistence.routes.ts` + `mcp/persistence-engine.ts`.

**Reuse:** `backend/src/database/{connection-manager,query-executor,schema-inspector,drivers/*}`,
`agent-os/migrations/apply-migrations.ts`. **Cut:** the deleted JSON `loadStore/saveStore`
(replaced by `core.kv_store`).

**Unblocks:** every stateful domain's repository.

**Verify:** `named-params`, `base-repository` (tenant scoping), `transaction`,
`migration-runner`, `kv-store`, `health` vitest; `/internal/persistence/health`
truthful; `pnpm check-types`.

---

## Phase 2 — Identity & Auth (the credential seam) ✅ SHIPPED

**Goal:** in-process Better Auth, DB-backed `sk_` keys, the CLI device flow, orgs/
RBAC, and the load-bearing `SessionVerifier.verify(cred)→Principal` every domain
guards requests with.

**Build:**
1. `ports/*` (freeze `session-verifier.port.ts` + `Principal` FIRST), `types.ts`, `config.ts`.
2. `adapters/better-auth.adapter.ts` `[MOVE]` + `routes/auth.routes.ts` (host `/api/auth/*` reading the DB directly).
3. `principal.service.ts` `[MOVE]` (implements SessionVerifier) + `middleware/authenticate.middleware.ts` `[MOVE]` (move the server.ts auth block behind the composer).
4. `api-key.service.ts` + store + migration `0001` + `routes/api-keys.routes.ts`.
5. `device-flow.service.ts` + migration `0002` + `routes/device.routes.ts`.
6. `org.service.ts` + `rbac.service.ts` + migration `0003`.
7. Migration `0004` + `IdentityRepository` unification (backfill `user_cli_link`, never drop `users`).
8. `routes/internal-identity.routes.ts` + `mcp/identity-engine.ts` + `health.ts`.

**Reuse:** `@recoder/auth` (createAuth, verifySessionToken, cookie helpers),
`a2a/bridge-auth.ts` (constant-time internal-key), the server.ts auth block. **New:**
DB-backed `sk_` store, device flow, orgs/RBAC, the `user_cli_link` unification.

**Depends on:** Phase 1 (`QueryExecutor`).

**Unblocks:** `Session`/`Principal` for every domain.

**Verify:** `api-key`, `device-flow`, `principal`, `rbac`, `internal-identity`
vitest; `scripts/sso-logout-matrix.sh`, `verify-auth-email-reset-e2e.sh`,
`verify-cli-device-flow-e2e.sh`.

---

## Phase 3 — Governance & Interop (the moat + the chain) ✅ SHIPPED

**Goal:** the `GovernanceGate.decide()` write seam (napi→daemon→ts-fallback ladder,
fail-closed), the tamper-evident Merkle audit chain, secrets, work locks, approvals,
and the `InteropChain` edge seam. Every later write and every edge stands on these.

**Build:**
1. Governance `ports/*` — `gate.port.ts`, `interop.port.ts`, `kernel.port.ts`, `secrets.port.ts`, `audit-repo.port.ts`, `approval-repo.port.ts`.
2. Migration `governance_*` (4 tables + append-only trigger) + repositories (`audit`, `approval-worklock`, `secret`).
3. Kernel ladder: `ts-kernel.adapter.ts` `[MOVE]` (always works) → `napi-kernel.adapter.ts` `[MOVE]` → `daemon-kernel.adapter.ts` `[MOVE]` → `kernel-ladder.adapter.ts`.
4. `governance-gate.service.ts` `[MOVE]` (decide→risk→audit) + `audit-chain.service.ts` (Merkle tip → DB).
5. `interop-chain.service.ts` — **resolve conflict #1**: ONE chain impl (recommend it lives in `interop`, calling governance's gate). `middleware/{interop,rate-limit,ext-authz}.middleware.ts`. **Resolve conflict #10** (single internal-key gate + rate-limit here; edge/identity consume).
6. `secrets.service.ts` + `vault.adapter.ts` `[MOVE]`.
7. `work-lock.service.ts` `[MOVE]` + `approval.service.ts` `[MOVE]` — **resolve conflicts #2, #5**: governance owns `governance_approvals` + `governance_work_locks`; agent-os/conductor consume the ports.
8. Composer + `health.ts` + `routes/governance.routes.ts` + `mcp/governance-engine.ts`.
9. Interop domain `ports/*` + `gate/*` + `wire/*` land here too so the chain is complete (the runtimes half comes in Phase 5).

**Reuse:** `backend/engines/rust/recoder-governance` (9 crates, in place), `packages/{governance,interop,vault,agent-policy,coordination}`, ported `conductor/governance-gate.ts`, `conductor/governance-daemon.ts`, `a2a/rate-limiter.service.ts`, `conductor/conductor-locks.ts`.

**Depends on:** Phase 1 (repos), Phase 2 (`Session`).

**Unblocks:** every write + every edge in all later phases.

**Verify:** `governance-gate`, `kernel-ladder` (degrade + synthetic deny),
`audit-chain` (tamper detection), `interop.middleware` (fail-closed), `secrets`,
`governance-interop.golden` (byte-interop vs Rust); `cargo test` in recoder-governance;
`pnpm test:contracts:agent-os`.

---

## Phase 4 — Edge & API Server (the surface) ✅ SHIPPED

**Goal:** shrink `server.ts` to `parse env → bootstrap.start()`; every domain plugs
in through the `RouteProvider` seam and the one canonical middleware chain; WS
upgrade dispatch for `/terminal` + `/api/conductor/workspaces/:id/stream`.

**Build:**
1. `ports/route-provider.port.ts` + `ports/ws-backend.port.ts` + `types.ts` + `config.ts` (freeze the seam the other domains implement).
2. `http/middleware/error.ts` `[MOVE]` + `validate.ts`, then `request-context.ts` `[MOVE]`, `cors.ts` `[MOVE]`, `rate-limit.ts` `[MOVE]`, `auth.ts` `[MOVE]`, `internal-key.ts` `[MOVE]` (consume governance gate from Phase 3), `interop-gate.ts` (wrap the Phase-3 chain), `chain.ts`.
3. `http/app.ts` `[MOVE]` + `http/lifecycle.ts`.
4. `http/ws/upgrade-router.ts` — the single `WsBackend` registry (longest-prefix path dispatch, auth + origin + rate-limit at the boundary). No standalone `*.socket.ts` deliverables: backends register into the router (the `/terminal` + per-workspace `.../stream` RunEvent fan-out backend ships as `conductor/terminal/terminal-stream.ts` in Phase 5; the old doc-`/sync`/collaboration surface was cut) — **resolve conflict #6**: edge owns `server.on('upgrade')`; conductor/agent-os provide the WsBackends (wired in later phases).
5. `route-table.ts` + `edge-module.ts` + `index.ts` + `health.ts`.
6. `http/openapi.ts` (reads the finished table).
7. Wire `createEdgeModule(deps)` into `bootstrap/container.ts`; mount the already-built identity/persistence/governance providers.

**Reuse:** the express+express-ws init, rate-limit tiers, cors-utils,
`requestIdMiddleware`, the `INTERNAL_SERVICE_KEY` block, `ws-rate-limiter`,
existing `*.routes.ts` factories (folded in as `RouteProvider`s).

**Depends on:** Phases 1–3 (it mounts their routers + uses their gate/chain).

**Unblocks:** every domain's HTTP/WS/MCP edges from here on.

**Verify:** `route-table`, `edge-module`, `internal-key`, `interop-gate`, `error`,
`upgrade-router` vitest; `sso-logout-matrix.sh`, `verify-cli-device-flow-e2e.sh`
still pass end-to-end.

---

## Phase 5 — Agent-OS Control Plane + Conductor (state-of-record + the terminal) ✅ SHIPPED

**Goal:** the control-plane state-of-record (tasks/runs/approvals/artifacts/events/
outbox/squads) and THE terminal product (worktree+tmux execution, run-loop,
restart-survivable reconciler, `/terminal` stream). Built together because
conductor emits RunEvents the agent-os bus ingests, and the interop runtime
adapters dispatch into conductor.

**5a — Agent-OS:**
1. `ports/*` + `config.ts` + `types.ts` + `health.ts`.
2. Repository adapters (`postgres`/`json`/`in-memory`) behind `AgentOsRepositoryPort`; migration `0001-agent-os-schema.sql` `[MOVE]` — **resolve conflict #4** (drop `0002-conductor-workspaces` here, ceded to conductor) and **#2/#5** (approvals/work-locks ceded to governance).
3. `run-transition.ts` (pure) + test (TDD).
4. Domain services (task→run→approval→artifact→instruction→policy→space→memory-candidate→workflow), wiring `@recoder/agent-os` services to the repo port.
5. `run-event-ingest.service.ts` + `outbox-drain.service.ts` `[MOVE]` + `nats-outbox-publisher.adapter.ts` `[MOVE]`.
6. `governance-gate.adapter.ts` + `instruction-compiler.adapter.ts`.
7. Squads: `0003-squads.sql` + `squad.service.ts` (port multica leader-routing).
8. Composer + controller + routes + `mcp/agent-os-engine.ts`.

**5b — Conductor (interop runtime half lands in Phase 6):**
1. `ports/*` + `config.ts` (move `TMUX_BIN`/`TMUX_CONTROL_MODE` into `AppConfig`).
2. `WorkspaceRepositoryPort` impl in persistence + migrations `0001-workspaces` `[MOVE]` (now the sole owner), `0002-run-tails`, `0003-reconcile-findings`.
3. Substrate adapters (tmux default → daytona → in-process/openfang → ssh) + `dmux-attention` + `tmux-control-mode` + `mcp-inject`.
4. Services (`workspace-service`, `run-tailer`, `reconciler`, `run-loop`, `planner`, `prompt-enrichment`, `review`, `review-publish`, `resource-governor`, `completion-watcher`) — MOVE with identical signatures.
5. Locks + audit (route every write through `gate.decide`+`record_audit`).
6. Terminal (`tmux-orchestrator`, `tmux-path`, `terminal-stream`, `live-events`) — provide the `TerminalStreamPort`/`WsBackend` to edge (conflict #6 resolution).
7. Composer + `health.ts` + routes + `mcp/conductor-engine.ts`.

**Reuse:** `@recoder/agent-os`, `@recoder/agent-events`, `@recoder/agent-instructions`,
`@recoder/substrate` (whole package), the existing 71-file `agent-os/` + 127-file
`conductor/` moved behind composers; engines in place (openfang napi, tmux/dmux, beads, colbert).

**Depends on:** Phases 1–4.

**Unblocks:** interop dispatch (Phase 6), social dispatch (Phase 7), memory hooks (Phase 8), billing run-gating (Phase 9), cloud run→preview (Phase 10).

**Verify:** agent-os `run-transition`, `run-event-ingest`, `approval-service`,
`outbox-drain`, `squad`, routes-integration; conductor `workspace-lifecycle`,
`reconciler`, `substrate-registry`, `terminal-stream`, `run-loop` (no fabricated
exit code), `health`, `governance-write`; `pnpm test:contracts:agent-os`,
`test:evals:agent-os`, `agent:instructions:check`.

---

## Phase 6 — Engines Integration + Inference Gateway (the multi-language boundary) ✅ SHIPPED

> **Owner mandate (2026-07-15):** each OSS engine in `backend/engines/{py,rust}/*`
> becomes a DEEP backend module that exercises the engine's REAL surface in place
> (mem0's full memory API, tensorzero inference+feedback+config, openfang's ~51
> napi methods, governance's policy/approval/audit crates, browser-use's real agent
> loop, colbert rerank+index, ops-recorder detectors, pal multi-model+clink) — NOT
> the current thin "couple-file" `*-client.ts` wrappers, which this phase REPLACES.
> Use the engine from its own dir via the fusion ladder; never copy into packages/.

**Goal:** the one governed engine seam (napi/daemon/sidecar/cli supervisors + MCP
host) exposing DEEP engine modules, and the LLM gateway that funnels every inference call.

**6a — Engines:**
1. `ports/*` + `types.ts` + `config.ts` + `constants.ts`.
2. Supervisors (`backoff`, `health-prober`, `process-registry`, `napi-loader`, `daemon-supervisor`, `sidecar-supervisor`) — ONE impl each, folding the scattered conductor daemons.
3. Migration `engine_registry` + `engine-health.repository.ts`.
4. Adapters in degrade priority: `napi/*` → `daemon/*` → `sidecar/*` → `cli/*`. **Resolve conflict #8**: engines owns the raw napi/daemon transport (`openfang`, `tensorzero`, `governance-napi`, `colbert`, `mem0`, …); governance keeps only its TS fallback; inference/memory/conductor consume the typed engine client, not a second `.node` load.
5. MCP host: `inproc-router.ts` `[MOVE]`, `mcp-host.ts` `[MOVE]`, `engine-registry.ts` (wiring-checklist guard), `engines-engine.ts`.
6. Composer + `health.ts` + `routes/engines.routes.ts`.

**6b — Inference (also completes the interop runtimes started in Phase 5b):**
1. `ports/*` + `types.ts` + `config.ts`.
2. Migrations (provider_keys, model_catalog, delivery_outcome, usage_ledger) + repositories.
3. Transport adapters (napi→loopback→router ladder) consuming the engines tensorzero client; `tz-config-generator`, `byok-key-cache`, `token-accounting`.
4. Composer + `health.ts` + `routes/{inference,openai-compat}.routes.ts` + `mcp/inference-engine.ts`.
5. **Interop runtimes** (Phase-5-deferred): `runtimes/*` adapters (claude/codex/opencode/pi/openfang) + `connector-process.supervisor` + `run-event.emitter` + `runtime-registry`; widen `ConductorRuntimeId`.

**Reuse:** `@recoder/interop` (McpHost, ExternalMcpProcessManager, PAL), `@recoder/agent-mcp`,
`backend/src/agent-os/mcp/{inproc-engines,interop-host}.ts`, `backend/src/conductor/{openfang-daemon,openfang-native,governance-daemon,colbert-daemon,ops-recorder-daemon}.ts`,
`backend/src/gateway/{tensorzero-client,openai-compat.routes,gateway.routes}.ts`,
`backend/src/engines/{llm-router,tensorzero-config,byok-key-cache,multica-client,ziti-client}.ts`;
engines in place (openfang/tensorzero/recoder-governance napi, mem0/colbert/browser-use/ops-recorder/pal-mcp-server py, multica/ziti Go, bd/dmux/tmux CLI).

**Depends on:** Phases 1–5 (repos, gate, edge, RunEvent bus).

**Unblocks:** memory embeddings (Phase 8), social reply agent (Phase 7), any MCP tool.

**Verify:** engines `engines-module`, `mcp-host.contract`, `napi-loader`,
`daemon-supervisor`, `engine-registry`, `colbert.adapter`; inference `inference-module`
(ladder degrade), `openai-compat`, `byok-resolution`, `token-accounting`,
`feedback-loop`; interop `runtime-registry`; `scripts/verify-byok-e2e.sh`.

---

## Phase 7 — A2A wire completion + Social Connectors ✅ SHIPPED

**Goal:** finish the A2A interop domain (wire ingress, dispatch, registry, bridge)
and stand up the agents' human-channel presence.

**7a — Interop (wire/dispatch/registry, runtimes done in Phase 6):**
1. Migrations `interop_agents`, `interop_tasks_scratchpad` + repositories.
2. `wire/*` (`a2a-envelope`, `agent-card`, `signed-ingress.gate`, `a2a-jsonrpc-server`).
3. `dispatch/{multi-dispatch,task-lifecycle}` + `registry/{agent-registry,heartbeat-slo}` + `bridge/{context-bridge,scratchpad}`.
4. Composer + 3 route files + `mcp/interop-engine.ts`.

**7b — Social:**
1. `ports/*` + `types.ts` + `schema.ts` + `config.ts`.
2. Migrations (connectors+bindings, inbound-log) + `social-repository.adapter.ts`.
3. Trust boundary: `webhook-ingress.adapter.ts` `[MOVE]` + `mention-gate.adapter.ts` `[MOVE]` (TDD RED→GREEN first).
4. Engine binding: `channel-adapter-registry` + `openclaw-gateway.adapter` `[MOVE]` + `connector-secrets.adapter`; prove telegram end-to-end.
5. Dispatch: `conductor-dispatch.adapter` (→ conductor createWorkspace) + `reply-agent.adapter` (→ inference gateway).
6. `zrok-tunnel.adapter.ts` (NAT, degrade-safe).
7. Composer + routes + `mcp/social-engine.ts`; retire `apps/social`; drop discord live wiring.

**Reuse:** `backend/src/a2a/*` (139 files → 3 route files behind composer),
`@recoder/{a2a-sdk,agent-runtimes}`, `backend/src/connectors/*`, `apps/social`,
`@recoder/connectors`, `apps/desktop/engines/openclaw/social-gateways` (in place).

**Depends on:** Phases 1–6 (gate, edge, conductor dispatch, inference reply agent).

**Verify:** interop `interop-chain`, `a2a-envelope.contract` (golden vectors),
`signed-ingress.gate`, `task-lifecycle`; social `mention-gate`, `webhook-ingress`,
`dispatch-reply`, `health`; `verify-byok-e2e.sh`, `verify-cli-device-flow-e2e.sh`.

---

## Phase 8 — Memory & Retrieval ✅ SHIPPED

**Goal:** the one memory entry point — recall fusion (mem0 ∪ beads ∪ candidates →
rerank → dedupe → provenance), the gated remember→promote→forget→relate lifecycle,
retrieval ingest/search, and the conductor launch-recall + completion-harvest hooks.

**Build:**
1. `ports/*` (8) + `config.ts` + `types.ts` + `health.ts`.
2. Migration `memory_relations` **only** — **resolve conflict #3**: items/candidates tables owned by agent-os; memory consumes the agent-os repo port + adds relations. De-duplicate `/memory/candidates` route (memory owns recall/remember/promote/forget/relate/retrieval; agent-os owns lifecycle/review).
3. `adapters/*` (mem0, beads-memory, colbert, qdrant, embedding, candidate-repository, sidecar clients) — consume engines clients from Phase 6, each degrade-safe.
4. `retrieval/*` (vector-foundation, chunker, retrieval-service).
5. `recall/*` (recall-fusion, dedupe, provenance, rank) — the highest-new-value piece; TDD.
6. `lifecycle/*` (candidate-service, memory-lifecycle gated, harvest, relate).
7. Composer + routes + `mcp/{memory,retrieval}-engine.ts`.
8. **Conductor rewiring:** refactor `bundle.ts::enrichPrompt` → `recallForLaunch`, `completion-watcher` → `harvestOnCompletion` (conductor stops importing mem0/beads/colbert directly).

**Reuse:** `@recoder/{agent-memory,retrieval}`, `backend/src/engines/mem0-client.ts`,
`backend/src/conductor/{beads-memory,colbert-rerank}.ts`,
`backend/src/agent-os/mcp/{vector-store,retrieval-engine,memory-store-adapter}.ts`;
engines in place (mem0/colbert py, beads Go, Qdrant).

**Depends on:** Phases 1–6 (repos, gate, engines embeddings/colbert, agent-os candidate store), Phase 5 (conductor hooks).

**Verify:** `recall-fusion`, `memory-lifecycle` (gate-deny → no write), `retrieval-service`,
`memory-integration`, `harvest-recall`; degrade matrix (no Qdrant/mem0/colbert/bd/
embeddings → truthful empty); `pnpm test:contracts:agent-os`.

---

## Phase 9 — Billing, Metering & Plans ✅ SHIPPED

**Goal:** the `EntitlementGate` other domains gate on (quota + feature + BYOK), durable
Postgres metering, signed webhooks, and fail-safe money health.

**Build:**
1. `types.ts` + `config.ts` + `ports/*` (billing-provider, metering.repo, entitlement).
2. Migrations (`0001_billing_core`, `0002_billing_usage`) + `billing.repository.ts` (idempotency UNIQUE).
3. `plan-catalog.service.ts` + `distribution-billing.adapter.ts` + `entitlement.service.ts` → working `EntitlementGate` before any provider exists.
4. `quota.service.ts` + `metering.service.ts` (fail-safe deny path first).
5. Providers: `polar.adapter.ts` `[MOVE]` + `{creem,paddle,dodo}.adapter.ts` + `shared.ts` (new MoR adapters, never Stripe) + `invoice.service.ts`.
6. `webhook.service.ts` + `routes/billing-webhooks.routes.ts` (raw body signature verify).
7. `routes/billing.routes.ts` + `mcp/billing-engine.ts` `[MOVE]`.
8. Composer + `health.ts`; wire `EntitlementGate` into conductor (pre-dispatch quota+feature gate), inference (token metering), engines (per-engine usage).

**Reuse:** `@recoder/distribution` (plan/quota/entitlement algebra — the core),
`backend/src/engines/polar-client.ts`, `backend/src/routes/billing-polar.routes.ts`,
`backend/src/agent-os/mcp/billing-engine.ts`. **New:** Creem/Paddle/Dodo MoR adapters (never Stripe), durable
Postgres metering, webhook reconcile loop, `max` tier. No engine daemons (pure TS + HTTPS).

**Depends on:** Phases 1–4 (+ inference/engines/conductor for the metering hooks).

**Verify:** `quota`, `entitlement` (BYOK bypass), `webhook` (bad sig / duplicate /
upgrade), `mor-adapters`, `billing.repository`, `health`; `scripts/verify-byok-e2e.sh`.

---

## Phase 10 — Cloud, Sandboxes & Multi-tenancy ✅ SHIPPED

**Goal:** the off-box substrate provider — remote sandboxes, preview deploys with
signed expiring URLs + truthful health, fleet supervisor, tenancy isolation +
quotas, and mesh diagnostics (registered, no live data plane yet).

**Build:**
1. `types.ts` + `config.ts` + `ports/*` (sandbox-provider, deploy-target, mesh, cloud-repository).
2. Migrations (`cloud_core`, `cloud_fleet_mesh`) + `cloud.repository.ts`.
3. `tenancy.service.ts` + `tenancy.quota.test.ts` (gates everything downstream).
4. Sandbox adapters (daytona/e2b/local-container) + `sandbox-provisioner.service.ts` (quota → provider select → provision → persist → RunEvent; TTL reaper + reconcile).
5. `preview-url-signer.ts` + `preview-deploy.service.ts` (HMAC signed URLs, real health probe).
6. `fleet-supervisor.service.ts`.
7. Mesh: `ziti-mesh.adapter` + `xds-envoy.adapter` (read-only status) + `mesh-diagnostics.service.ts`.
8. Composer + `health.ts` + `routes/cloud.routes.ts` + `mcp/cloud-engine.ts`.

**Reuse:** `@recoder/{agent-sandbox,sandbox-daytona,daytona-api-client,daytona-toolbox-api-client,substrate,network}`,
Go engines `apps/desktop/server/engines/{ziti,recoder-xds}` (in place),
`backend/src/agent-os/mcp/{preview-engine,deployment-engine}.ts`, legacy `backend/src/sandbox/*` (ported DB-backed).

**Depends on:** Phases 1–5 (repos, gate, edge, conductor substrate seam), Phase 9 (tenancy↔billing quota alignment).

**Verify:** `sandbox-provisioner` (quota + fallback + reconcile), `preview-url-signer`,
`tenancy.quota`, `mesh-degrade`, `cloud.routes`; `scripts/verify-byok-e2e.sh` for provider-key degrade.

---

## Phase 11 — Observability & Ops (the truth surface) ✅ SHIPPED

**Goal:** structured logging + correlation, Prometheus metrics, OTel tracing, the
aggregated `/health` + `/health/full` across all 15 domains, the audit/XDR
projection, and the ops-recorder work-signals pipeline. Built last because it fuses
every other domain's `HealthSource`.

**Build:**
1. `ports/*` (metrics, tracer, health-source, signals, repository) + `config.ts` + `types.ts` + `health.ts` — ship the seams early enough that domains can inject `MetricsPort`/`TracerPort`/`HealthSource` (in practice retro-wired in each phase; formalized here).
2. `correlation.service.ts` + `pino-logger.adapter.ts` `[MOVE]`.
3. `prometheus-registry.adapter.ts` + `otel-tracer.adapter.ts` + `telemetry.middleware.ts`.
4. `health-aggregator.service.ts` + `/health`, `/health/full` routes — **resolve conflict #7**: observability owns the aggregation; edge mounts it; agent-os contributes a HealthSource.
5. Migration `0014-observability-ops` + repositories.
6. `ops-recorder.adapter.ts` + `work-signals.service.ts` (loopback to Python sidecar; normalize → RunEvent → board).
7. `alerting.service.ts` + alert/signal edges (governance-gated writes).
8. `audit-xdr.adapter.ts` + audit edge (Merkle re-verify before display).
9. `mcp/observability-engine.ts` + composer + factory.

**Reuse:** `@recoder/agent-observability` (summarizeHealth, trace, evidence),
`@recoder/logger`, `backend/src/agent-os/mcp/logs-engine.ts`,
`backend/src/conductor/conductor-health.ts`, `backend/src/a2a/connector-health-monitor.service.ts`,
`backend/src/routes/integrations-health.routes.ts`, `@recoder/governance` verify_audit,
`backend/engines/py/ops-recorder/work-signals/` (in place); `@recoder/herd` for notify/board.

**Depends on:** all prior phases (it aggregates their health).

**Verify:** `health-aggregator` (down → degraded, timeout → unknown), `correlation`,
`telemetry-middleware`, `work-signals` (sidecar down → no fabricated signals),
`audit-xdr` (tamper → error); manual truthfulness check (kill ops-recorder →
`/health/full` shows signals `down`, not green); `pnpm test:contracts:agent-os`.

---

## Cross-cutting: first-party Rust/Python (as needed)

`backend/crates/` (new cargo workspace) and `backend/services/` (uv-managed
sidecars) are populated *only when a TS capability hits a hard requirement* (native
perf, ML runtime, isolation) that the vendored `engines/rust|py/*` don't already
cover. They are not a phase; they are added under the fusion law (napi `.node` /
UDS daemon for Rust, loopback sidecar for Python) with golden-vector byte-interop and
a degrade-safe `down`. Until then, the vendored engines in `engines/` cover the
Rust/Python surface.

---

## Dependency graph (phase → prerequisites)

```
0 Foundation
1 Persistence           ← 0
2 Identity              ← 0,1
3 Governance+Interop    ← 0,1,2
4 Edge                  ← 0,1,2,3
5 Agent-OS + Conductor  ← 0,1,2,3,4
6 Engines + Inference   ← 0,1,2,3,4,5
7 Interop-wire + Social ← 0..6
8 Memory                ← 0..6 (+5 hooks)
9 Billing               ← 0..4 (+5,6 hooks)
10 Cloud                ← 0..5 (+9)
11 Observability        ← 0..10 (fuses all)
```

Phases 6–10 are largely parallelizable once 0–5 exist, subject to the noted hooks
(conductor↔memory, inference/engines↔billing, tenancy↔billing). Phase 11 lands last.

## Global verification (run at each phase boundary)

```bash
pnpm format
pnpm check-types
pnpm test                       # focused domain vitest, co-located
pnpm test:contracts:agent-os    # control-plane contract
pnpm test:evals:agent-os        # behavior evals
pnpm agent:instructions:check   # instruction provenance
# targeted scripts by touched area:
scripts/verify-byok-e2e.sh              # inference/billing/secrets/cloud key-degrade
scripts/verify-cli-device-flow-e2e.sh   # identity device flow + agent CLI availability
scripts/sso-logout-matrix.sh            # auth/cookie cross-subdomain
scripts/verify-auth-email-reset-e2e.sh  # auth email/reset
cargo test                              # recoder-governance golden vectors (Phase 3)
```

A phase is complete only when its module reports truthful `up|down|degraded`, its
degrade paths are unit-tested, and the relevant gate above passes — never claim
success from implementation alone.

---

## Post-build hardening (2026-07-18)

All 12 phases shipped green, but a 26-agent doc-vs-code gap audit
(`docs/GAP-AUDIT.md`, 337 capabilities, ~70 gaps) measured the product at ~60–65% of
the docs' full version. Six Workflow build waves closed the gaps, then six adversarial
review rounds closed a systemic authorization defect. Result: **tsc 0 · ~1462 backend
tests · boots with 15 truthful health sources.** Where the shipped surface differs from
the phase plan above, this section is authoritative.

**Feature waves (what changed vs the plan):**
- **Inference (Phase 6):** the TensorZero napi ladder now runs the **release `.node`**
  with REAL in-proc SSE via `inferenceStream` → supervised loopback → direct BYOK
  rung-3 multi-provider router; BYOK keys resolve from the governance secrets vault into
  the delivery path. OpenAI-compatible **`POST /api/gateway/inference/v1/embeddings`**
  edge + `inference.embed` MCP tool landed.
- **Engines MCP edge (Phase 6):** the governed **`POST /api/mcp/tools/:server/:tool/call`**
  HTTP edge is LIVE (was 404).
- **Agent-OS (Phase 5a):** Postgres state-of-record (`agentos_0004`) + full
  `/api/agent-os` CRUD + `/internal/agent-os` ingest edges + **squad autopilots**
  (cron→beads→conductor) + workflow driver & Postgres definition store.
- **Billing (Phase 9):** **metering emitters** now decrement quotas at conductor +
  inference call sites + `/internal/billing/meter`; invoice projection; webhook
  idempotency dedups on `processed_at` (commit after projection). MoR only — Polar /
  Creem / Paddle / Dodo, **no Stripe**.
- **Conductor (Phase 5b):** create→persist→launch, steer `send-keys` (tmux),
  stop/advance (cancel flows go only through `stopWorkspace`, **not** `advance`),
  attention classifier, tmux control-mode observer, `.mcp.json` injection,
  cloud-sandbox substrate bridge.
- **Cloud (Phase 10):** `GovernanceGate` on every write, fleet heartbeat, custom-domains
  + DNS/TLS verifier; mesh registered (`ziti` + `xds-envoy` status, no live data plane).
- **Memory (Phase 8):** mem0 (google/Gemini default), lance embedded `VectorStorePort`,
  colbert real MaxSim rerank, qdrant real liveness probe, forget/harvest.
- **Interop (Phases 3/6/7):** the domain shipped as two dirs — `interop` (wire) +
  `interop-wire` — with ed25519 ingress verification, `localRun` (conductor) +
  `remoteSender` wired, and first/quorum/handoff dispatch.
- **Social (Phase 7):** mounts at **`/api/social`** (not `/api/connectors`).
- **Website Phase-A:** auth backend-seam (`RECODER_AUTH_BACKEND_SEAM`, off by default) +
  idempotent `users→user` backfill migration (**not yet run on prod**; the compat bridge
  is kept until the runbook runs).

**Security rounds 1–6 (the authorization class):** the new subject-bearing MCP tools
initially resolved tenant/subject from **caller-supplied args** → cross-tenant quota
drain, spend misattribution, sandbox provision/destroy, memory read/forget,
audit/billing disclosure, identity leak, `identity_link` account hijack (~26 tools).
Closed by binding every subject-bearing tool to the host-authorized **`McpToolCaller`**
at the MCP edge trust boundary (non-privileged caller → own subject, foreign → 403,
admin/internal → arbitrary, absent → `AUTH_REQUIRED`); converged + verified by exhaustive
enumeration (only pure-infra MCP files remain caller-free).

**Owner-gated follow-ups (need prod access / a decision):** run the auth backfill
migration runbook (then delete the compat bridge); rotate `COMPOSIO_API_KEY`; the
Next 15.4.x→15.5.x bump. See [`BUILD-STATUS.md`](./BUILD-STATUS.md) for the live list.
