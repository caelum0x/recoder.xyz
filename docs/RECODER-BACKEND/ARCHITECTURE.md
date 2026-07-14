# Recoder Backend — Master Architecture

> The single comprehensive backend for the Recoder platform. One TypeScript host
> is the spine; Rust and Python are capability engines beside it; Go engines are
> used in place. The desktop embeds this backend; the website consumes its edges.
> This document is the canonical map. Each of the 14 domains has its own detailed
> design under [`domains/`](./domains/); the buildable file plan is
> [`FILE-TREE.md`](./FILE-TREE.md); the phased plan is [`BUILD-ORDER.md`](./BUILD-ORDER.md).

---

## 1. Vision

Recoder is an **agent control plane that presents as a terminal**. A user opens
Recoder, runs their chosen coding agent (Claude Code, Codex, opencode, pi,
openfang, cursor, …) in parallel isolated git worktrees, then reviews and merges.
Everything that makes those agents powerful — identity, memory, retrieval,
governance, networking, the LLM gateway, the issue graph, billing, cloud
sandboxes — lives in **one backend** (`backend/`) that is:

- **The control plane** for tasks, runs, approvals, artifacts, memory, and audit.
- **The MCP host** that exposes every backend capability to the agents behind a
  single governance-gated tool router.
- **The auth origin** (`recoder.xyz` identity) — the website is a proxy, the
  desktop authenticates with `sk_` keys and the CLI device flow.

The full scope is deliberately wide: **auth/identity, database/persistence, the
API/WS server, the agent-OS control plane, the conductor/terminal substrate, A2A
interop + runtime adapters, the multi-language engine boundary, the LLM gateway,
social connectors, governance/security, memory/retrieval, billing/metering,
cloud/sandboxes/multi-tenancy, and observability/ops.** These are the 14 domains.

Design philosophy (from `AGENTS.md`): *less is more, fail fast, surface truthful
health, never fake success.* Every write passes a governance gate; every edge and
MCP call passes the interop chain; every non-TS unit degrades to a truthful
`down` rather than a fabricated result.

---

## 2. Multi-language layout — what lives where, how it builds, how it talks

```
backend/
  src/                    # TS HOST — the spine (orchestration, edges, control-plane, all 14 composers)
    server.ts             # process entrypoint (thin: parse env → bootstrap.start())
    bootstrap/            # composition root: config loader, DI container, lifecycle, health, engine-supervisor
    shared/               # internal cross-domain ports/types (AppConfig, Result/error envelope, ModuleBase, DI tokens)
    http/                 # express + express-ws wiring, middleware chain, WS /terminal /sync, rate-limit, errors
    domains/              # THE 14 DOMAINS — each a self-contained composer over ports + degrade-safe adapters
      identity/ persistence/ edge/ agent-os/ conductor/ interop/ engines/
      inference/ social/ governance/ memory/ billing/ cloud/ observability/
  crates/                 # RUST cargo workspace (NEW first-party native/perf/security crates → napi .node or UDS daemon)
  services/               # PYTHON uv-managed first-party ML/AI sidecars (one venv per service, `uv sync`)
  engines/                # EXISTING vendored OSS engines, USED IN PLACE (never copied)
    rust/{openfang,tensorzero,recoder-governance}
    py/{mem0,colbert,browser-use,ops-recorder,pal-mcp-server}
  migrations/             # canonical parameterized SQL (runner in domains/persistence)
  package.json            # `recoder-backend`, the single pnpm workspace member
```

Plus Go engines that stay under `apps/desktop/server/engines/{multica,ziti,recoder-xds}`
and `apps/desktop/engines/{tmux,dmux,recodergit}` — **used in place**, never
rewritten in `backend/`.

### Language policy — pick the language by the WORK, not by preference

| Language | Home | Owns | Delivery |
|---|---|---|---|
| **TypeScript** | `backend/src/` | The spine: ALL orchestration, control-plane state ownership, HTTP/WS/MCP/A2A edges, governance/interop wiring, every domain composer, config/DI, health aggregation. A capability starts here and only pushes work down when TS can't meet a hard requirement. | in-process |
| **Rust** | `backend/crates/` (first-party) · `backend/engines/rust/` (vendored) | Perf/native/security-critical: the governance kernel + SHA-256 Merkle audit chain, policy/permission/approval/routing evaluation, crypto/signing/envelope verify, high-throughput event/outbox, ANN/retrieval indexing, native pty. Byte-interoperable with its TS facade (golden vectors pinned). | napi `.node` in-proc (default) **or** UDS/loopback daemon |
| **Python** | `backend/services/` (first-party) · `backend/engines/py/` (vendored) | **ML/AI only**: embeddings, colbert rerank, browser-use LLM agent, ops-recorder signal detection, any torch/model pipeline. Auth-preflight before spawn; degrades to no-op/`down` when torch/venv absent. | supervised loopback sidecar (HTTP or stdio-MCP), uv venv |
| **Go** | `apps/desktop/server/engines/*`, `apps/desktop/engines/*` | Existing engines only (multica, ziti, recoder-xds, tmux, dmux, recodergit). **No new Go in `backend/`.** Squad/multica ideas are PORTED to the TS conductor, not deepened in Go. | CLI / loopback REST / gRPC-xDS |

### Inter-language transport ladder (the fusion law)

**Native-first → subprocess-second → http-last**, every rung degrade-safe:

1. **Rust → TS**: napi `.node` loaded in-process (default) or a UDS/loopback daemon binary.
2. **Python → TS**: supervised loopback sidecar (HTTP or stdio-MCP), auth-preflight before spawn.
3. **Go → TS**: CLI one-shot or loopback REST / gRPC-xDS.
4. **Every path degrades to a truthful `down`** — a missing `.node`, unbuilt binary,
   absent venv, or missing CLI on `PATH` yields `status:'down'` with a reason,
   never a faked `up` and never a fabricated result.

**Enforcement:** a domain may only reach another language through an explicit port
(`backend/src/domains/<d>/ports/`) with a degrade-safe adapter (`adapters/`). No
domain shells out ad hoc or imports a raw engine `dist/` directly. The **engines**
domain is the one governed seam that owns engine clients, supervision, health, and
MCP registration.

---

## 3. The layer model

```
        ┌──────────────────────────────────────────────────────────────┐
        │  DESKTOP (Electron cockpit)          WEBSITE (recoder.xyz)     │  consumers
        │  embeds backend in-process           proxies /api/* /internal  │
        └───────────────┬──────────────────────────────┬───────────────┘
                        │                              │
        ┌───────────────▼──────────────────────────────▼───────────────┐
        │  EDGE  (backend/src/http + domains/edge)                      │  L1 untrusted edge
        │  express+express-ws · middleware chain · route-mount table    │
        │  WS /terminal /sync · OpenAPI · rate-limit · error envelope   │
        └───────────────┬──────────────────────────────────────────────┘
                        │  every call → InteropChain(authorize→risk→policy→audit)
        ┌───────────────▼──────────────────────────────────────────────┐
        │  GOVERNANCE + INTEROP  (the gate + the chain)                 │  L2 policy moat
        │  GovernanceGate.decide() on every WRITE · SHA-256 Merkle audit │
        └───────────────┬──────────────────────────────────────────────┘
                        │
        ┌───────────────▼──────────────────────────────────────────────┐
        │  DOMAIN COMPOSERS  (state-of-record + capability orchestration)│  L3 control plane
        │  identity · agent-os · conductor · inference · social ·        │
        │  memory · billing · cloud · observability                     │
        └───────────────┬──────────────────────────────────────────────┘
                        │  ports/ + degrade-safe adapters/
        ┌───────────────▼──────────────────────────────────────────────┐
        │  PERSISTENCE  (one pg.Pool · :param QueryExecutor · migrations)│  L4 data authority
        └───────────────┬──────────────────────────────────────────────┘
                        │  fusion law (napi / daemon / sidecar / cli)
        ┌───────────────▼──────────────────────────────────────────────┐
        │  ENGINES  (Rust napi · Rust/Go daemon · Python sidecar · CLI)  │  L5 capability engines
        │  openfang · tensorzero · governance-kernel · colbert · mem0 ·  │
        │  browser-use · ops-recorder · multica · ziti · recoder-xds · bd │
        └──────────────────────────────────────────────────────────────┘
```

Each domain is a **pure factory** — `create<Domain>Module(deps)` — returning a
composer that exposes a single public interface plus a truthful `health()`. There
are no top-level singletons and no `process.env` reads inside domain code; config
arrives as a typed `AppConfig` slice from `bootstrap`.

---

## 4. The 14 domains

Each paragraph is a one-line boundary + the load-bearing seam; follow the link for
the full file tree, DB schema, edges, and reuse notes.

1. **Identity & Auth** — [`domains/identity-auth.md`](./domains/identity-auth.md) ·
   `backend/src/domains/identity/` (36 files). The single identity authority: hosts
   Better Auth in-process against the auth DB, owns the unified identity read model
   over the *physically separate* `user`/`users` tables (link, never merge),
   DB-backed `sk_` platform keys, the RFC-8628 CLI device flow, orgs/teams/RBAC, and
   the `INTERNAL_SERVICE_KEY` service gate. **Exposes `SessionVerifier.verify(cred)→Principal`** —
   the seam every other domain guards a request with.

2. **Database & Persistence** — [`domains/database-persistence.md`](./domains/database-persistence.md) ·
   `backend/src/domains/persistence/` (34 files). The data authority: one shared
   `pg.Pool`, the parameterized `:param` `QueryExecutor` (injection analysis, error
   sanitization), drivers, the migration runner, the DB-backed KV store (replacing
   the deleted JSON `loadStore/saveStore`), versioned state-of-record helpers, and the
   base `Repository` every domain's repo port binds to. Consolidates the 3 legacy DBs
   into ONE Postgres partitioned by schema (`core/agent_os/pm/billing/kv`). **Exposes
   `QueryExecutor` + `Repository`/`RepositoryFactory`.**

3. **Edge & API Server** — [`domains/edge-api-server.md`](./domains/edge-api-server.md) ·
   `backend/src/http/` + `backend/src/domains/edge/` (26 files). The stateless
   untrusted-until-proven edge: express+express-ws bootstrap, the one canonical
   middleware chain, the declarative route-mount table, WS `/terminal` + `/sync`
   upgrade dispatch, OpenAPI, rate-limit, CORS, the error envelope. **Exposes
   `RouteProvider` + `WsBackend`** — the seam every domain plugs its edges into.

4. **Agent OS Control Plane** — [`domains/agent-os-control-plane.md`](./domains/agent-os-control-plane.md) ·
   `backend/src/domains/agent-os/` (46 files). The state-of-record: tasks, runs,
   approvals, artifacts, instructions, policies, spaces, events/outbox, workflows,
   memory candidates, and squads. Legal run state transitions in one pure module,
   RunEvent ingestion, at-least-once outbox drain, governance-gated writes. **Exposes
   `AgentOsModule` + `AgentOsRepositoryPort` + `RunEventBusPort`.**

5. **Conductor & Terminal Substrate** — [`domains/conductor-terminal.md`](./domains/conductor-terminal.md) ·
   `backend/src/domains/conductor/` (45 files). **THE terminal product**: parallel-agent
   execution over isolated git worktrees + pinned-binary tmux, the run-loop, planner,
   restart-survivable reconciler, and the `/terminal` control-mode stream. Composes the
   `@recoder/substrate` engine with concrete Recoder ports. **Exposes `ConductorModule`
   + `WorkspaceRepositoryPort` + `TerminalStreamPort`.**

6. **A2A & Interop Runtimes** — [`domains/a2a-interop-runtimes.md`](./domains/a2a-interop-runtimes.md) ·
   `backend/src/domains/interop/` (40 files). The hostile-by-default wire (A2A envelope
   ingress/egress, agent-cards, ed25519/HMAC verify) **and** the runtime fan-out
   (`ConductorRuntime` adapters that turn a Task into a live coding-agent Run emitting
   RunEvents). **Exposes `InteropChain` (authorize→risk→policy→audit) + `A2ATransport` +
   `RuntimeRegistry.dispatch`.**

7. **Engines Integration** — [`domains/engines-integration.md`](./domains/engines-integration.md) ·
   `backend/src/domains/engines/` (44 files). The ONE governed path every engine is
   reached through: the MCP host + engine-fusion layer binding all Rust napi / Rust-Go
   daemon / Python sidecar / CLI engines to the spine behind typed ports, supervising
   lifecycles, reporting truthful health, registering tools into the interop-gated MCP
   host. **Exposes `EnginesModule` + `McpHostPort` + `EngineClientPort`.**

8. **Inference & LLM Gateway** — [`domains/inference-gateway.md`](./domains/inference-gateway.md) ·
   `backend/src/domains/inference/` (26 files). Every LLM/embedding call funnels here:
   the TensorZero embedded gateway (napi → loopback → direct-provider BYOK ladder), the
   model catalog, SSE streaming, the feedback→delivery-outcome loop, token accounting,
   and the OpenAI-compatible edge. **Exposes `InferenceGateway`.**

9. **Social Connectors** — [`domains/social-connectors.md`](./domains/social-connectors.md) ·
   `backend/src/domains/social/` (30 files). The agents' presence on human channels:
   connector ingress + webhook, 7 live `ConnectorPort` adapters (telegram/slack/signal/
   imessage/whatsapp/line/feishu), the hostile-by-default mention gate, inbound→conductor
   dispatch, and the embedded reply agent. **Exposes `SocialModule` (send/listChannels/health).**

10. **Governance & Security** — [`domains/governance-security.md`](./domains/governance-security.md) ·
    `backend/src/domains/governance/` (33 files). **The moat**: `GovernanceGate.decide()`
    (napi kernel → UDS daemon → deny-biased TS fallback), the tamper-evident SHA-256
    Merkle audit chain, envelope-encrypted secrets, ed25519 signed envelopes, rate limit,
    ext-authz, work locks, and approval gates. **Exposes `GovernanceGate` + `SecretsPort`
    + work-lock/approval services + edge middleware.**

11. **Memory & Retrieval** — [`domains/memory-retrieval.md`](./domains/memory-retrieval.md) ·
    `backend/src/domains/memory/` (34 files). The one memory entry point: fuses mem0 ∪
    beads ∪ agent-os candidates → colbert rerank → dedupe → provenance (recall fusion),
    the remember→promote→forget→relate lifecycle (promote is gated), retrieval ingest/
    search, and the conductor launch-recall + completion-harvest hooks. **Exposes
    `MemoryModule` + `RetrievalPort`.**

12. **Billing, Metering & Plans** — [`domains/billing-metering.md`](./domains/billing-metering.md) ·
    `backend/src/domains/billing/` (28 files). Money: Polar (MoR) + Stripe behind one
    `BillingProviderPort`, plans/entitlements, durable Postgres metering + quotas, signed
    webhooks, invoicing, BYOK-vs-platform, and fail-safe health that degrades explicitly
    when keys are missing. **Exposes `EntitlementGate` (resolvePlan/checkEntitlement/checkQuota/isBYOK).**

13. **Cloud, Sandboxes & Multi-tenancy** — [`domains/cloud-infra.md`](./domains/cloud-infra.md) ·
    `backend/src/domains/cloud/` (27 files). The substrate provider for everything off
    the local box: remote sandboxes (Daytona/E2B/local), preview deployments with signed
    expiring URLs + truthful health, the fleet supervisor, multi-tenancy isolation +
    quotas, and mesh diagnostics (ziti + recoder-xds — registered, no live data plane yet).
    **Exposes `SandboxProvider` + `PreviewService`/`DeployTarget` + `TenancyService`.**

14. **Observability & Ops** — [`domains/observability-ops.md`](./domains/observability-ops.md) ·
    `backend/src/domains/observability/` (23 files). Truthful operational visibility:
    structured logging + correlation, Prometheus metrics, OTel tracing, the aggregated
    `/health` + `/health/full` surface across all 14 domains, the audit/XDR projection
    (re-verifies Merkle proofs), and the ops-recorder work-signals pipeline
    (stuck/blocked/needs-you → board). **Exposes `MetricsPort` + `TracerPort` +
    `HealthSource` + `CorrelationContext`.**

---

## 5. Cross-domain contract map (exposes → consumes)

The backbone: **four seams are consumed by (almost) everyone.**

| Seam | Owner (exposes) | Consumed by |
|---|---|---|
| `SessionVerifier.verify(cred)→Principal` / `Session` | **identity** | edge, and every domain guarding a request |
| `QueryExecutor` / `Repository` / `RepositoryFactory` | **persistence** | every stateful domain (identity, agent-os, conductor, interop, engines, inference, social, governance, memory, billing, cloud, observability) |
| `GovernanceGate.decide()` + `record_audit`/`verify_audit` | **governance** | every domain that WRITES |
| `InteropChain` (authorize→risk→policy→audit) | **interop** (chain) + **governance** (gate wiring) | edge + every route + every MCP tool call |

Domain-to-domain ports:

| Producer → port | Consumers |
|---|---|
| **agent-os** → `AgentOsModule`, `AgentOsRepositoryPort`, `RunEventBusPort`, `OutboxPublisherPort` | conductor, interop, social, billing, edge, observability |
| **conductor** → `ConductorModule`, `WorkspaceRepositoryPort`, `TerminalStreamPort` | social (dispatch), edge (terminal WS), interop |
| **interop** → `InteropChain`, `A2ATransport`, `RuntimeRegistry.dispatch`, `ConductorRuntime` | edge, engines (MCP host), agent-os, conductor, social |
| **engines** → `EnginesModule`, `McpHostPort`, `EngineClientPort`, `EngineRegistryPort` | interop, agent-os, inference, memory, conductor, governance (kernel) |
| **inference** → `InferenceGateway` | memory (embeddings), agent-os/conductor (agent inference), social (reply agent), observability |
| **governance** → `GovernanceGate`, `SecretsPort`, `WorkLockService`, `ApprovalService`, edge middleware | identity, billing, inference, interop, conductor, agent-os, social, memory, cloud, edge |
| **memory** → `MemoryModule`, `RetrievalPort` | conductor (recallForLaunch/harvestOnCompletion), agent-os, interop/engines (MCP), edge |
| **billing** → `EntitlementGate` | conductor (quota+feature gate before dispatch), inference (token metering), engines (per-engine usage), agent-os (run gating), edge |
| **cloud** → `SandboxProvider`, `PreviewService`, `TenancyService`, `MeshDiagnostics` | conductor (remote substrate), agent-os (run→preview), observability (mesh health), edge |
| **observability** → `MetricsPort`, `TracerPort`, `HealthSource`, `CorrelationContext` | every domain (metrics/trace/health) |
| **edge** → `RouteProvider`, `WsBackend` | every domain (they implement it to expose edges) |
| **persistence** → `KvStore`, `StateOfRecordRepository`, `MigrationRunner` | any domain needing KV / versioned state; bootstrap (migrate at boot) |

### Contract mismatches to resolve (flagged during synthesis)

These are real conflicts where two domains' `exposes`/`consumes`/routes/tables
overlap. They must be resolved before implementation to avoid duplicate ownership.

1. **`InteropChain` is claimed by BOTH `interop` and `governance`.** `interop`
   exposes it (`ports/interop-chain.port.ts`, `gate/interop-chain.service.ts`) as
   "the seam every edge + MCP call passes"; `governance` also exposes it
   (`ports/interop.port.ts`, `services/interop-chain.service.ts`). **Resolution:**
   governance owns the *gate primitives* (`decide`/risk/policy/audit); interop owns
   the *chain composition* that calls the gate and adds A2A authorize/wire concerns.
   Pick ONE `interop-chain.service.ts` (recommend it lives in `interop`, consuming
   `governance`'s `GovernanceGate`), and have governance expose only the gate +
   `interopGuard` middleware. The edge consumes the single `@recoder/interop` chain.

2. **Approvals are owned by BOTH `agent-os` and `governance`, with colliding
   routes and tables.** agent-os: `approval_requests`/`approval_decisions` tables +
   `POST /api/agent-os/approvals`, `/approvals/:id/approve`, `/approvals/:id/reject`.
   governance: `governance_approvals` table + `POST /api/agent-os/approvals`,
   `/approvals/:id/decide`. **Resolution:** governance owns the approval *gate
   lifecycle + table* (it ties to `needs_approval` verdicts and the Merkle chain);
   agent-os *projects/links* approvals to Task/Run state via the governance
   `ApprovalService` port — it must NOT own a second table. Consolidate to
   `governance_approvals` and one route surface (`/approvals/:id/decide`).

3. **Memory tables + `/memory/candidates` route owned by BOTH `agent-os` and
   `memory`.** Both write migrations for `memory_items` + `memory_candidates`; both
   mount `/api/agent-os/memory/candidates`. **Resolution:** agent-os owns the
   canonical `memory_items`/`memory_candidates`/`memory_reviews` state-of-record
   tables (the shapes come from `@recoder/agent-os`); memory owns `memory_relations`
   + the recall/retrieval/fusion logic and consumes the agent-os repository port.
   ONE migration set (agent-os) for items/candidates; memory adds only `memory_relations`.
   Split routes: agent-os owns `/memory/lifecycle/*` review; memory owns
   `/memory/recall|remember|promote|forget|relate|retrieval/*`. De-duplicate
   `/memory/candidates` (single owner).

4. **`conductor_workspaces` migration owned by BOTH `conductor` (`0001`) and
   `agent-os` (`0002`).** **Resolution:** conductor owns the `conductor_workspaces`
   migration + the `conductor_run_tails`/`conductor_reconcile_findings` tables;
   agent-os drops its `0002-conductor-workspaces.sql` and references the conductor
   table. Single owner = conductor.

5. **Work locks owned by BOTH `agent-os` (`work_locks` table) and `governance`
   (`governance_work_locks` + `WorkLockService`); conductor consumes a lock port.**
   **Resolution:** governance owns the lock table + `WorkLockService` (conflict
   detection before writes, TTL); agent-os and conductor consume the port. Drop the
   agent-os `work_locks` table; keep `work_signals` (that is agent-os/observability).

6. **`/terminal` and `/sync` WS mounts claimed by BOTH `edge` and `conductor`.**
   edge owns `ws/upgrade-router.ts` (the single `server.on('upgrade')`); conductor
   has `routes/terminal.routes.ts::mountTerminalWs` + `terminal/live-events.ts`.
   **Resolution:** edge owns the upgrade dispatch and WS lifecycle; conductor
   provides the `WsBackend`/`TerminalStreamPort` implementations that edge routes to.
   Conductor must NOT call `server.on('upgrade')` itself. Same for `/sync`
   (edge fan-out over the agent-os RunEvent bus; conductor publishes onto it).

7. **`/health` + `/api/agent-os/health` served by `edge`, `agent-os`, AND
   `observability`.** **Resolution:** observability owns the health *aggregation*
   (`health-aggregator.service.ts`, `/health/full`); edge mounts the routes and
   delegates to the aggregator; agent-os contributes a `HealthSource`, not its own
   `/health` handler. One aggregator, one `/health` implementation.

8. **Engine adapters duplicated between capability domains and the `engines`
   domain** — tensorzero (inference `adapters/tensorzero-napi|loopback` vs engines
   `adapters/napi/tensorzero-napi` + `adapters/daemon/tensorzero-loopback`),
   governance kernel (governance `adapters/napi-kernel` vs engines
   `adapters/napi/governance-napi`), colbert/mem0 (memory adapters vs engines
   sidecar/daemon adapters). **Resolution:** the `engines` domain owns the raw
   transport (`EngineClientPort` + supervisors + napi loader); capability domains
   consume the typed engine client from `EnginesModule` (e.g. `engines.tensorzero()`,
   `engines.governanceKernel()`, `engines.colbert()`, `engines.mem0()`) instead of
   re-wrapping the `.node`/daemon. The one sanctioned exception is governance's TS
   *fallback* kernel (pure-TS deny-biased), which is legitimately governance-owned.
   Where a domain doc shows its own napi/daemon adapter, treat it as "consumes the
   engines client," not "loads the binary twice."

9. **Secret stores overlap: `governance_secrets` (SecretsPort) vs inference
   `inference_provider_keys` vs identity `platform_api_key`.** These are three
   *different* concerns (generic vault secrets, BYOK provider ciphertext, hashed
   `sk_` keys) so separate tables are acceptable — BUT inference BYOK ciphertext
   should be written via governance `SecretsPort`/`@recoder/vault`, not a bespoke
   crypto path. **Resolution:** keep the tables; route encryption through the shared
   vault adapter so key material handling is uniform.

10. **Three `INTERNAL_SERVICE_KEY` gates** (edge `middleware/internal-key.ts`,
    governance `internalServiceGuard`, identity `requireInternal`) and **two
    rate-limit middlewares** (edge `rate-limit.ts`, governance `rate-limit.middleware.ts`).
    **Resolution:** governance owns the security-grade constant-time internal-key
    gate + abuse/rate-limit; edge consumes them in its chain rather than
    re-implementing. identity's `requireInternal` becomes a thin re-export.

None of these block parallel design; they are ownership de-conflictions to settle
when wiring the composers in `bootstrap/container.ts`.

---

## 6. Auth + identity spine (backend-owned, unified model)

The backend is the **auth origin**, not a proxy:

- **Better Auth is hosted in-process** at `/api/auth/[...all]` via `@recoder/auth`
  `createAuth()`, reading the auth DB directly. `recoder.xyz` (the website) proxies
  to this backend; it is not a second auth system.
- **Unified identity WITHOUT merging tables.** The repo's critical rule stands:
  `user` (Better Auth web) and `users` (legacy CLI plural) stay physically separate.
  A new `user_cli_link` table maps them; `IdentityRepository.resolveIdentity()`
  returns one `Identity` regardless of arrival path. Migration `0004` backfills,
  **never drops**.
- **One credential-resolution port.** `SessionVerifier.verify(cred)→Principal`
  turns any inbound credential — session cookie, `sk_` platform key,
  `INTERNAL_SERVICE_KEY` — into a canonical `Principal`
  `{ userId, orgId?, sessionId, kind, scopes, isAnonymous }`. Precedence:
  internal-key → `sk_` key → Better Auth session → anonymous fallback (gated by
  `STRICT_AUTH`, strict in prod).
- **`sk_` keys are DB-backed** (`platform_api_key`, hashed at rest with pepper,
  prefix-indexed), replacing the in-memory validator. **CLI device flow** (RFC-8628)
  mints `sk_` keys after browser approval.
- **Orgs / teams / RBAC** — a deterministic role→permission evaluator
  (`owner⊃admin⊃member⊃viewer`) with org isolation (`WHERE org_id = :orgId`),
  consulted by any domain doing authorization via `PermissionEvaluator.can()`.
- **Cross-subdomain sessions** on `.recoder.xyz` reuse `@recoder/auth` cookie helpers.

Every identity write (key mint/revoke, org mutation) passes the governance gate;
every identity edge passes the interop chain. Missing `BETTER_AUTH_SECRET`/
`AUTH_DATABASE_URL` → the auth engine reports `down` and routes return
`SERVICE_UNAVAILABLE` — never a faked 200.

---

## 7. Data model overview (all tables, by owning domain)

One consolidated Postgres 17 database, partitioned by schema
(`core`, `agent_os`, `pm`, `billing`, `kv`). `pgvector` enabled once. All access is
app-layer scoped (`WHERE user_id = :user_id` / `WHERE org_id` / `WHERE tenant_id` /
`WHERE space_id`) with parameterized `:param` SQL. **No Supabase RLS / `auth.uid()`.**

| Domain | Tables |
|---|---|
| **persistence** (foundational) | `core._recoder_migrations`, `core.kv_store`, `core.state_events`, `core.state_snapshots`; schemas `core/agent_os/pm/billing/kv` |
| **identity** | `platform_api_key`, `device_grant`, `organization`, `team`, `org_membership`, `org_permission_override`, `user_cli_link` *(Better Auth `user`/`session`/`account`/`verification` owned by `@recoder/auth`, not redefined; legacy `users` linked not merged)* |
| **agent-os** | `agent_profiles`, `agent_sessions`, `agent_runtime_connections`, `agent_capabilities`, `spaces`, `space_members`, `space_repositories`, `space_policies`, `tasks`, `task_assignments`, `task_runs`, `task_run_steps`, `artifacts`, `artifact_parts`, `artifact_links`, `instruction_bundles`, `instruction_sources`, `instruction_source_hashes`, `policy_decisions`, `runtime_evidence`, `runtime_credentials`, `work_signals`, `events`, `event_outbox`, `github_delivery_links`, `webhook_deliveries`, `connector_installations`, `oss_components`, `mcp_servers`, `mcp_tools`, `mcp_sessions`, `mcp_tool_calls`, `squads`, `squad_members`, `squad_activity`, `memory_items`, `memory_candidates`, `memory_reviews`, `memory_embeddings` *(memory tables shared with memory domain — see conflict #3; approval/work-lock tables ceded to governance — conflicts #2, #5; conductor_workspaces ceded to conductor — conflict #4)* |
| **conductor** | `conductor_workspaces`, `conductor_run_tails`, `conductor_reconcile_findings` |
| **interop** | `interop_agents`, `interop_heartbeats`, `interop_tasks`, `interop_task_messages`, `interop_scratchpad` *(projection; canonical Task/Run stays in agent-os)* |
| **engines** | `engine_registry`, `engine_health_log`, `engine_restart_log` |
| **inference** | `inference_provider_keys`, `inference_model_catalog`, `inference_delivery_outcome`, `inference_usage_ledger` |
| **social** | `connectors`, `channel_bindings`, `inbound_messages` |
| **governance** | `governance_audit_chain` (append-only Merkle), `governance_approvals`, `governance_work_locks`, `governance_secrets` |
| **memory** | `memory_relations` *(+ consumes agent-os `memory_items`/`memory_candidates`; Qdrant holds the derived vectors, not Postgres)* |
| **billing** | `billing_subscriptions`, `billing_invoices`, `billing_webhook_events`, `billing_usage_events`, `billing_usage_counters` |
| **cloud** | `cloud_tenants`, `cloud_sandboxes`, `cloud_deployments`, `cloud_preview_tokens`, `cloud_fleet_nodes`, `cloud_domains`, `cloud_mesh_endpoints` |
| **observability** | `slo_targets`, `alert_rules`, `alert_events`, `work_signal_dispositions` |

**Vector data** (mem0 memories, retrieval chunks) lives in **Qdrant**, not Postgres —
Postgres is the store-of-record for the reviewed candidate/item lifecycle; Qdrant is
the rebuildable semantic index. **tensorzero** owns its own ClickHouse/Postgres via
Rust `sqlx` — persistence records this as a fusion boundary and does not proxy it.

---

## 8. Edge / API surface (all routes consolidated)

Every HTTP edge and MCP tool call passes the interop chain; `/internal/*` is
additionally `INTERNAL_SERVICE_KEY`-gated; writes additionally pass
`GovernanceGate.decide()`. Mounted declaratively by the edge `route-table.ts`.

**Edge-owned / public:** `GET /health`, `GET /health/full`, `GET /metrics`
(internal-key), `GET /api/openapi.json`, `GET /api/docs`, `GET /api/edge/routes`.

**Auth / identity:** `ALL /api/auth/[...all]`, `GET /api/auth/session`,
`GET|POST|DELETE /api/identity/keys`, `POST /api/identity/device/{code,token,approve}`,
`GET|POST /api/identity/orgs` (+ teams/members/invites), `POST /internal/identity/{resolve,validate-key}`,
`/api/v1/*` (external programmatic API, api-key gated).

**Agent-OS control plane** `/api/agent-os/*`: `summary`; `agents` (+reconcile);
`spaces` (+repositories/github, +policies); `tasks` (+route, +history, +context-pack);
`runs` (+claim, +transition, +handoff, +verification-results, +history); `artifacts`
(+pull-request, +preview); `runtime-evidence`; `instructions` (+compile); `policies`
(+evaluate); `workflows` (+dispatch); `squads` (+members, +dispatch, +activity);
`events`. `/internal/agent-os/*`: `events` (RunEvent ingest), `runs/:id/steps`,
`runtime-evidence`, `outbox/drain`.

**Governance** `/api/agent-os/*`: `policies/decide`, `audit`, `audit/verify`,
`approvals` (+`:id/decide`), `locks` (GET/POST/DELETE). `/internal/governance/audit/append`.

**Memory** `/api/agent-os/*`: `memory/recall|remember|promote|reject|forget|relate|candidates|health`,
`retrieval/ingest|search`. `/internal/agent-os/memory/harvest`.

**Conductor** `/api/conductor/*`: `workspaces` (+events, +advance, +steer, +continue,
+stop, +diff, +tree, +merge, +pr), `reconcile`, `substrates`, `runtimes`, `health`.
WS `/terminal`, `/sync`.

**Interop / A2A** `/api/a2a/*`: `rpc`, `message`, `/.well-known/agent.json`, `agents`
(+`:id/card`), `connectors/:runtime/{start,stop,health,stream(WS),input}`, `tasks`
(+`:id`, +cancel, +scratchpad, +handoff), `dispatch`, `slo`.
`/internal/a2a/heartbeat`.

**Engines / MCP** : `GET /api/agent-os/engines` (+`:id/health`, +`:id/restart`),
`GET /api/mcp/servers`, `POST /api/mcp/call`, `GET /internal/engines/health`.

**Inference** `/api/gateway/*`: `health`, `models`, `complete`, `embed`, `feedback`,
`v1/chat/completions` (SSE), `v1/embeddings`.

**Social** : `GET /api/connectors`, `POST /api/connectors/webhooks/:channel`
(HMAC raw-body), `POST /api/connectors/:id/{bind,send}`, `DELETE .../bind/:chatRef`,
`POST /internal/social/probe`.

**Billing** `/api/billing/*`: `plan`, `entitlements`, `usage`, `invoices`,
`checkout`, `portal`, `health`, `webhooks/polar`, `webhooks/stripe` (signature).
`/internal/billing/meter`.

**Cloud** `/api/agent-os/cloud/*`: `sandboxes` (+`:id`), `deployments`
(+`:id`, +preview, +health), `fleet`, `tenants`, `domains` (+`:id/verify`), `mesh`.
`/internal/agent-os/cloud/fleet/heartbeat`.

**Observability** : `/api/agent-os/observability/{slo,alerts,signals,audit}`
(+`alerts/:id/ack`, +`signals/:id/disposition`).

**Persistence** (internal only): `/internal/persistence/{health,migrate,introspect,backup}`.

**MCP tool surface** (all interop-gated, registered via the wiring checklist —
`IN_PROC_SERVERS` + `ENGINE_SERVERS` + `register*McpTools` in `buildInProcEngineRouter`):
identity (`whoami`/`key_*`), persistence (`db_schema_inspect`/`db_query_readonly`),
agent-os (`task.create`/`run.claim`/`run.transition`/`approval.request`/`memory.remember`/`squad.dispatch`),
conductor (`workspace_*`), interop (`send_task`/`task_respond`/`list_agents`/`inbox`/`dispatch`),
engines (`engine.list`/`health`/`restart`), inference (`complete`/`embed`/`feedback`/`models`),
social (`list_channels`/`send_message`/`channel_health`), governance (`decide`/`verify_audit`/`request_approval`/`acquire_lock`),
memory (`memory.*`/`retrieval.*`), billing (`plan.read`/`usage.read`/`entitlement.check`),
cloud (`sandbox_provision`/`destroy`/`deploy`/`preview_url`/`preview_health`/`fleet_status`/`mesh_status`),
observability (`health`/`metrics_query`/`audit_search`/`signals`).

---

## 9. Engine integration map (the Rust / Python / Go seam)

The **engines** domain is the one governed boundary. Every engine is reached through
`EngineClientPort`, supervised by one of three supervisors, and surfaced through the
interop-gated MCP host.

| Delivery | Transport | Engines | Home | Fusion law |
|---|---|---|---|---|
| **Rust napi** | in-process `.node` | openfang (agent kernel), tensorzero (EmbeddedGateway), governance kernel (decide + Merkle) | `backend/engines/rust/*` | Native-first (default) |
| **Rust/Go daemon** | supervised loopback HTTP / UDS | colbert (rerank), ops-recorder (signals), multica (squads, Go), ziti (Go), recoder-xds (Go), tensorzero loopback fallback | `backend/engines/{rust,py}/*`, `apps/desktop/server/engines/*` | Subprocess-second |
| **Python sidecar** | loopback HTTP / stdio-MCP | mem0 (memory), browser-use (LLM agent), pal-mcp-server | `backend/engines/py/*`, `backend/services/*` | Subprocess-second (ML only) |
| **CLI binary** | one-shot subprocess | beads/`bd` (issue graph), tmux, dmux, recodergit | `apps/desktop/engines/*`, system | Subprocess |

Supervisors (one implementation each, replacing N scattered copies):
`napi-loader` (require the `.node`, cache, version-probe, `null` when absent),
`daemon-supervisor` (spawn loopback binary, wait `/health` 200, restart with
backoff, skip-spawn on external `<ENGINE>_URL`), `sidecar-supervisor` (auth-preflight
→ uv venv → stdio/HTTP, no-op when venv/torch absent).

**Byte-interop guarantees:** the governance kernel and tensorzero pin golden vectors
so the TS facade output equals the Rust engine's for the same input. A restart is a
governance-gated write recorded in `engine_restart_log` + the Merkle chain. napi/CLI
engines return a truthful "not restartable" rather than faking it.

---

## 10. Invariants (truthful health + governance)

Non-negotiable laws every domain obeys:

1. **Truthful health.** Every module exposes `health(): { status, degraded, engines:[{name,status}] }`.
   A missing key/binary/venv → `down` with a reason. `degraded:true` when a module still
   serves but an engine is down. **Never a faked `up`, never a fabricated result.**
   The observability aggregator fuses all 14; a timeout → `unknown`, never a hang.
2. **Every WRITE passes `GovernanceGate.decide()`** before persistence and appends to
   the SHA-256 Merkle audit chain. On gate fault: deny-biased (fail closed) for risky
   writes, allow+log for safe reads, never a silent allow.
3. **Every edge + MCP call passes the interop chain** `authorize→risk→policy→audit`.
   Deny → `AUTHZ_PROJECT_ACCESS_DENIED`; audit is recorded even on allow.
4. **`/internal/*` is `INTERNAL_SERVICE_KEY`-gated** with constant-time compare and
   fail-fast validation at boot (≥32 chars, no placeholder/dev default in prod).
5. **Security is enforced below the model.** Never trust agent output, MCP tool
   descriptions, runtime-reported success, browser content, or memory candidates.
   Always verify actor identity, task ownership, envelope validity, lock coverage,
   approval records, artifact provenance.
6. **State-of-record is Recoder-owned.** Runtimes/engines/sandboxes are replaceable
   execution surfaces that emit `RunEvent`s back; they never own task/approval/memory
   state. Restart-survivability: the record is persisted BEFORE launch; the reconciler
   joins live substrate against persisted rows and flags orphans (never silently kills).
7. **Durable memory is reviewable.** `remember` produces an ephemeral candidate;
   `promote` is a governance-gated write. No domain writes durable memory directly.
8. **Config only from bootstrap.** No `process.env` in domain code; a typed `AppConfig`
   slice is injected. Pure factories, no top-level singletons. Missing secret → fail
   safe (`down` / `SERVICE_UNAVAILABLE`), never a crash and never a fake success.
9. **Error envelope is uniform.** `sendSuccess(res,data)` / `sendError(res, createError(code,msg))`,
   codes `SERVICE_UNAVAILABLE` / `AUTHZ_PROJECT_ACCESS_DENIED` (no `FORBIDDEN` /
   `EXTERNAL_SERVICE_ERROR`). Errors never leak stack/secret to the client; full context
   logged server-side.
10. **Reuse over rewrite.** The 14 domains MOVE the existing `backend/src/*` and
    `packages/*` behind composers; they do not create a 4th copy. Vendored OSS engines
    are used in place, never copied, never pruned.
