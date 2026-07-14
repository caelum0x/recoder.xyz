# Domain: Database & Persistence

**Folder prefix:** `backend/src/domains/persistence/` (+ `backend/migrations/`)
**Language:** TypeScript (query/repo layer) + SQL (migrations). Rust `sqlx` noted where an engine (tensorzero) owns its own ClickHouse/Postgres access — persistence does NOT wrap it.
**Owns:** the data authority — the pg connection/pool manager, the parameterized `:param` query-executor, drivers, the migration runner, the schema-inspector, the DB-backed KV store (replacing the deleted JSON `loadStore/saveStore`), the versioned state-of-record helpers, and the **base `Repository` implementations** every other domain's repo *port* binds to.
**Owns NO business logic.** It is the seam beneath the other 13 domains: they declare `Repository` ports in their own `ports/`; persistence provides the concrete `QueryExecutor` + `RepositoryFactory` those impls are built on.

---

## 1. Overview

Every stateful domain in the backend reaches Postgres through exactly one path:

```
domain repo impl (identity/UserRepo, agent-os/TaskRepo, billing/InvoiceRepo, …)
    └─ depends on  QueryExecutor  (persistence port)   ← :param SQL, app-layer WHERE user_id = :user_id
        └─ PgPool (single shared pg.Pool)              ← prod-URL-validated, SSL, pooled
            └─ Postgres 17 (recoder consolidated DB)
```

Design laws this domain enforces for the whole backend:

1. **One pool, one authority.** A single shared `pg.Pool` is created here from `AppConfig.persistence.databaseUrl`. No other domain constructs a pool. (The existing `connection-manager.ts` — encrypted *user-project external* DB connections — is a **separate** capability that also lives here, kept distinct from the control-plane pool.)
2. **Parameterized only.** All access goes through the `:param` executor which compiles named params to positional `$n` and rejects raw string interpolation. Inherits the existing `query-executor.ts` security analysis (injection-pattern detection, param type validation, error sanitization, bounded audit log).
3. **App-layer access control.** No Supabase RLS, no `auth.uid()`, no Basejump. Tenancy is `WHERE user_id = :user_id` enforced in the base repo; the `Session.userId` (from identity) is threaded into every scoped query.
4. **Recoder-owned state-of-record.** The canonical Task/Run/Approval/Artifact/Memory tables are agent-os `@recoder/agent-os` shapes; persistence stores them but never reinterprets them. State is versioned (append-only event log + snapshot rows) so time-travel and audit are truthful.
5. **Degrade-safe.** Missing/invalid `DATABASE_URL` → the module reports `down` (never a faked `up`). Migration failure logs + is reported, never thrown into boot (matches the existing `apply-migrations` boot pattern). SQLite driver is a dev/embedded fallback only.
6. **Consolidation.** The three legacy logical DBs (`recoder_main` auth+app, `recoder_backend` API, `recoder_pm` PM+pgvector) consolidate into ONE physical database using **Postgres schemas** (`core`, `agent_os`, `pm`, `billing`, `kv`) so cross-domain joins and one migration ledger are possible. `pgvector` extension is enabled once, globally.

**REUSE vs NEW (headline):** the existing `backend/src/database/*` (connection-manager, query-executor, drivers, schema-inspector) and `backend/src/agent-os/migrations/apply-migrations.ts` are **moved behind this composer and generalized** — not rewritten. NEW work is: the `:param` named-param compiler, the `RepositoryFactory` + `BaseRepository`, the DB-backed `KvStoreRepository` (replacing deleted JSON persistence), the state-of-record versioning helpers, the consolidated migration set, and the composer/ports/health wiring.

---

## 2. File tree

```
backend/src/domains/persistence/
  index.ts                          # factory createPersistenceModule(deps) + public PersistenceModule interface
  persistence-module.ts             # composer: fuses PgPool + QueryExecutor + MigrationRunner + RepositoryFactory
  config.ts                         # PersistenceConfig slice (typed from AppConfig; no process.env)
  types.ts                          # domain types: QueryRow, TxContext, PoolStats, MigrationReport, KvEntry
  health.ts                         # health(): pings pool, checks migration ledger + pool saturation

  ports/
    query-executor.port.ts          # QueryExecutor interface (execute/one/read/mutate + withTransaction)
    repository.port.ts              # generic Repository<T> + UnitOfWork/TxContext ports (the seam)
    kv-store.port.ts                # KvStore port (namespaced get/set/delete/list) — replaces JSON persistence
    migration-runner.port.ts        # MigrationRunner interface (apply/status)

  client/
    pg-pool.ts                      # shared pg.Pool factory; prod-URL validation; SSL; graceful drain
    connection-manager.ts           # MOVED: encrypted external user-project DB connections (AES-256-GCM)

  query/
    query-executor.ts               # MOVED+generalized: :param executor, helpers, security analysis, audit
    named-params.ts                 # NEW: compile ":name" SQL + params object → ("$1..", values[]) positional
    transaction.ts                  # NEW: withTransaction(fn) — BEGIN/COMMIT/ROLLBACK on a pooled client

  drivers/
    postgres.driver.ts              # MOVED: pg driver wrapper (query, typed fields, pool client)
    sqlite.driver.ts                # MOVED: sqlite driver — dev/embedded fallback ONLY

  repositories/
    base.repository.ts              # NEW: abstract BaseRepository<T> — CRUD + user_id scoping + row<->entity map
    kv-store.repository.ts          # NEW: DB-backed KV over core.kv_store (replaces loadStore/saveStore)
    repository-factory.ts           # NEW: RepositoryFactory — binds QueryExecutor into per-aggregate repos
    state-of-record.repository.ts   # NEW: versioned append-only state log + snapshot read (time-travel)

  schema/
    schema-inspector.ts             # MOVED: introspection (tables/columns/indexes) — read-only, governed
    seed.ts                         # NEW: idempotent seed loader (dev/test fixtures)
    backup.ts                       # NEW: logical backup/restore (pg_dump wrapper) — approval-gated, degrade-safe

  migrations/
    migration-runner.ts             # MOVED+generalized from apply-migrations.ts: ledger, idempotent, degrade-safe

  routes/
    persistence.routes.ts           # /internal/persistence/* edges (INTERNAL_SERVICE_KEY): health, migrate, introspect

  mcp/
    persistence-engine.ts           # MCP tools: db_schema_inspect, db_query_readonly (governance-gated)

  __tests__/
    named-params.test.ts            # :param compilation, escaping, missing-param error, IN-array expansion
    base-repository.test.ts         # CRUD + WHERE user_id scoping + cross-tenant denial
    transaction.test.ts             # commit persists, thrown fn rolls back, nested reuse
    migration-runner.test.ts        # idempotent ledger, degrade-safe failure, ordered application
    kv-store.repository.test.ts     # namespaced get/set/delete/list, TTL expiry, concurrent upsert
    health.test.ts                  # up when pool pings, down when pool absent, degraded on saturation

backend/migrations/
  0000_extensions_and_ledger.sql    # extensions (vector, pgcrypto, citext) + schemas + _recoder_migrations ledger
  0001_kv_store.sql                 # core.kv_store (namespaced KV, JSONB value, TTL) — replaces JSON files
  0002_state_of_record.sql          # core.state_events (append-only) + core.state_snapshots (versioned)
```

*(agent-os / identity / billing / pm domain tables ship as their own numbered SQL files added to `backend/migrations/` by those domains; persistence owns the runner + the foundational `000x` files above.)*

---

## 3. Per-file responsibilities

| File | lang | kind | Responsibility | Key exports |
|---|---|---|---|---|
| `index.ts` | ts | service | Public factory + the ONE interface other domains import | `createPersistenceModule(deps: PersistenceDeps): PersistenceModule`, `interface PersistenceModule` |
| `persistence-module.ts` | ts | service | Composer: builds pool, runs migrations at boot (degrade-safe), exposes executor/factory/kv/schema; aggregates health | `class PersistenceComposer implements PersistenceModule` |
| `config.ts` | ts | config | Typed `PersistenceConfig` slice from `AppConfig`; prod-URL guard (reject localhost/sqlite when `NODE_ENV=production`) | `type PersistenceConfig`, `assertProdDatabaseUrl(cfg)` |
| `types.ts` | ts | type | Shared domain types | `QueryRow`, `TxContext`, `PoolStats`, `MigrationReport`, `KvEntry`, `StateEvent`, `StateSnapshot` |
| `health.ts` | ts | service | `health()` — `SELECT 1` ping, pool saturation %, migration ledger completeness → `up|down` + `degraded` | `buildPersistenceHealth(pool, runner): HealthReport` |
| `ports/query-executor.port.ts` | ts | port | The executor contract every repo depends on | `interface QueryExecutor { execute, one, read, mutate, withTransaction }` |
| `ports/repository.port.ts` | ts | port | Generic repo + unit-of-work seam other domains bind to | `interface Repository<T, Id>`, `interface UnitOfWork`, `type TxContext` |
| `ports/kv-store.port.ts` | ts | port | Namespaced KV contract (replaces JSON persistence) | `interface KvStore { get, set, delete, list, getJson, setJson }` |
| `ports/migration-runner.port.ts` | ts | port | Migration contract | `interface MigrationRunner { apply, status }` |
| `client/pg-pool.ts` | ts | client | Build/own the single shared `pg.Pool`; SSL from config; prod-URL validation; graceful `drain()` | `createPgPool(cfg): Pool`, `drainPool(pool)`, `poolStats(pool): PoolStats` |
| `client/connection-manager.ts` | ts | client | MOVED — encrypted (AES-256-GCM) *external user-project* DB connections, distinct from control-plane pool | `connectionManager`, `encryptCredential`, `DatabaseConnection` |
| `query/query-executor.ts` | ts | service | MOVED+generalized — impl of `QueryExecutor`; wraps named-params + driver + injection analysis + error sanitize + bounded audit log | `class PgQueryExecutor implements QueryExecutor`, `analyzeQuery` |
| `query/named-params.ts` | ts | service | NEW — compile `:name` placeholders + params object to positional `$n`; expand array params for `IN (:ids)`; throw on missing/extra | `compileNamedQuery(sql, params): { text, values }` |
| `query/transaction.ts` | ts | service | NEW — `withTransaction(fn)`: checkout client, BEGIN, run fn with a tx-scoped executor, COMMIT/ROLLBACK, release | `withTransaction<T>(pool, fn): Promise<T>` |
| `drivers/postgres.driver.ts` | ts | client | MOVED — pg driver wrapper (typed `query`, fields, pooled client) | `class PostgresDriver` |
| `drivers/sqlite.driver.ts` | ts | client | MOVED — sqlite driver, **dev/embedded fallback only**; blocked in prod path | `class SqliteDriver`, `validateDatabasePath` |
| `repositories/base.repository.ts` | ts | repository | NEW — abstract CRUD base: `findAll/findById/create/update/delete`, mandatory `user_id` scoping, row↔entity mapping, optimistic version bump | `abstract class BaseRepository<T, Id>` |
| `repositories/kv-store.repository.ts` | ts | repository | NEW — `KvStore` impl over `core.kv_store`; JSON values, per-namespace, TTL sweep; **replaces deleted `loadStore/saveStore`** | `class KvStoreRepository implements KvStore` |
| `repositories/repository-factory.ts` | ts | repository | NEW — the seam: injects the shared `QueryExecutor` into any domain's repo class; central place DI hands out repos | `class RepositoryFactory`, `createRepositoryFactory(executor)` |
| `repositories/state-of-record.repository.ts` | ts | repository | NEW — append-only `state_events` write + `state_snapshots` versioned read; powers time-travel + audit provenance | `class StateOfRecordRepository`, `appendEvent`, `readAt(version)` |
| `schema/schema-inspector.ts` | ts | service | MOVED — read-only introspection of tables/columns/indexes for the MCP tool + `/introspect` edge | `schemaInspector`, `inspectTables`, `inspectColumns` |
| `schema/seed.ts` | ts | service | NEW — idempotent seed loader for dev/test (upsert fixtures; no-op in prod unless `PERSISTENCE_ALLOW_SEED`) | `runSeeds(executor, env): Promise<SeedReport>` |
| `schema/backup.ts` | ts | service | NEW — logical `pg_dump`/restore wrapper; approval-gated write; degrades to `down` when `pg_dump` absent | `createBackup(cfg): Promise<BackupResult>`, `restoreBackup(cfg, ref)` |
| `migrations/migration-runner.ts` | ts | service | MOVED+generalized — reads `backend/migrations/*.sql` in lexical order, applies unseen files in a tx, records `_recoder_migrations` ledger; idempotent + degrade-safe | `class SqlMigrationRunner implements MigrationRunner`, `applyMigrations(pool, dir)` |
| `routes/persistence.routes.ts` | ts | route | `/internal/persistence/health`, `POST /internal/persistence/migrate`, `GET /internal/persistence/introspect` — all `INTERNAL_SERVICE_KEY`-gated, writes through governance gate | `registerPersistenceRoutes(router, module)` |
| `mcp/persistence-engine.ts` | ts | service | MCP tools `db_schema_inspect` (read) + `db_query_readonly` (SELECT-only, governance+interop gated) | `registerPersistenceMcpTools(host)` |
| `0000_extensions_and_ledger.sql` | sql | migration | Enable `vector`, `pgcrypto`, `citext`; create schemas `core/agent_os/pm/billing/kv`; create migration ledger table | — |
| `0001_kv_store.sql` | sql | migration | `core.kv_store(namespace, key, value jsonb, expires_at, version, updated_at)` PK `(namespace,key)` | — |
| `0002_state_of_record.sql` | sql | migration | `core.state_events` (append-only, seq) + `core.state_snapshots` (aggregate, version, payload jsonb) | — |
| `__tests__/named-params.test.ts` | ts | test | `:param` compile, IN-array expansion, missing/extra param errors | — |
| `__tests__/base-repository.test.ts` | ts | test | CRUD + `user_id` scoping + cross-tenant read denial | — |
| `__tests__/transaction.test.ts` | ts | test | commit persists, thrown fn rolls back, client released | — |
| `__tests__/migration-runner.test.ts` | ts | test | idempotent ledger, ordered apply, degrade-safe failure | — |
| `__tests__/kv-store.repository.test.ts` | ts | test | namespaced get/set/delete/list, TTL expiry, concurrent upsert | — |
| `__tests__/health.test.ts` | ts | test | up on ping, down without pool, degraded on saturation | — |

---

## 4. DB schema (owned/foundational)

Consolidated single Postgres DB, partitioned by schema. Persistence owns the **foundational** objects; each domain adds its own numbered SQL for its tables.

```sql
-- 0000_extensions_and_ledger.sql
create extension if not exists vector;
create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists core;
create schema if not exists agent_os;
create schema if not exists pm;
create schema if not exists billing;
create schema if not exists kv;

create table if not exists core._recoder_migrations (
  filename    text primary key,
  checksum    text not null,
  applied_at  timestamptz not null default now()
);

-- 0001_kv_store.sql  (replaces deleted JSON loadStore/saveStore)
create table if not exists core.kv_store (
  namespace   text not null,
  key         text not null,
  value       jsonb not null,
  expires_at  timestamptz,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now(),
  primary key (namespace, key)
);
create index if not exists kv_store_expires_idx on core.kv_store (expires_at)
  where expires_at is not null;

-- 0002_state_of_record.sql  (versioned, event-sourced, time-travel)
create table if not exists core.state_events (
  seq          bigserial primary key,
  aggregate    text not null,           -- 'task' | 'run' | 'approval' | ...
  aggregate_id text not null,
  event_type   text not null,
  actor_id     text,
  payload      jsonb not null,
  recorded_at  timestamptz not null default now()
);
create index if not exists state_events_agg_idx
  on core.state_events (aggregate, aggregate_id, seq);

create table if not exists core.state_snapshots (
  aggregate    text not null,
  aggregate_id text not null,
  version      bigint not null,
  payload      jsonb not null,
  user_id      text not null,           -- app-layer tenancy
  created_at   timestamptz not null default now(),
  primary key (aggregate, aggregate_id, version)
);
```

Notes:
- `agent_os.*` tables are the existing `0001-agent-os-schema.sql` set (`agent_profiles`, `agent_sessions`, `spaces`, plus Task/Run/Approval/Artifact/Memory) re-homed under the `agent_os` schema.
- `pm.*` keeps the pgvector-backed memory/embeddings tables (recoder_pm consolidation).
- **Dolt / Rust sqlx:** `tensorzero` (engine) owns its own ClickHouse/Postgres via Rust `sqlx` — persistence does NOT wrap it; it only records the fusion note. No Dolt in the control-plane DB; the beads memory layer keeps its own Dolt store outside this domain.

---

## 5. Edges (HTTP / MCP)

All internal, `INTERNAL_SERVICE_KEY`-gated, mounted by the `edge` domain's route table; every write passes the interop chain `authorize→risk→policy→audit` and the governance gate.

| Method | Path | Purpose | Gate |
|---|---|---|---|
| GET | `/internal/persistence/health` | pool ping + migration ledger + saturation | internal key |
| POST | `/internal/persistence/migrate` | apply pending migrations (idempotent) | internal key + governance write |
| GET | `/internal/persistence/introspect` | list tables/columns/indexes (read-only) | internal key |
| POST | `/internal/persistence/backup` | trigger logical backup | internal key + **approval-gated** |

MCP tools (`mcp/persistence-engine.ts`, registered via IN_PROC_SERVERS + ENGINE_SERVERS wiring checklist):
- `db_schema_inspect` — read-only schema introspection for agents.
- `db_query_readonly` — SELECT-only, param-bound, governance+interop gated, result-size capped.

---

## 6. Interfaces (ports)

**Exposes** (consumed by every stateful domain):
- `QueryExecutor` — `execute(sql, params)`, `one<T>()`, `read<T>()`, `mutate()` (returns rowCount), `withTransaction(fn)`. All `:param` named-bound.
- `Repository<T, Id>` + `UnitOfWork`/`TxContext` — the base a domain's repo impl extends; `RepositoryFactory` injects the executor.
- `KvStore` — namespaced `get/set/delete/list/getJson/setJson` (the JSON-persistence replacement).
- `MigrationRunner` — `apply()`, `status()`.
- `StateOfRecordRepository` — `appendEvent()`, `readAt(version)` for versioned/audit reads.

**Consumes:**
- `AppConfig.persistence` (bootstrap) — `databaseUrl`, pool sizes, SSL, `encryptionKey`, `allowSeed`.
- `Session` (identity) — `userId` threaded into scoped queries (persistence never authenticates; it receives the resolved identity).
- `GovernanceGate.decide()` (governance) — every write edge/tool routes through it.
- `InteropChain` (interop) — every edge + MCP tool passes `authorize→risk→policy→audit`.
- `@recoder/logger` — child logger tagged `persistence`.
- `Result`/`ErrorCode` + `sendSuccess/sendError` (`shared/errors`) — `SERVICE_UNAVAILABLE` on pool-down, `AUTHZ_PROJECT_ACCESS_DENIED` on cross-tenant.

**Load-bearing seams provided to the 14 designers:** `QueryExecutor` and `Repository`/`RepositoryFactory` — this is where every other domain's repo *port* gets its concrete impl.

---

## 7. Reuse notes

**MOVE behind composer (do NOT rewrite):**
- `backend/src/database/connection-manager.ts` → `client/connection-manager.ts` (external user-project encrypted connections).
- `backend/src/database/query-executor.ts` → `query/query-executor.ts` (keep injection analysis, param validation, error sanitization, bounded audit; add `:param` compile + `one/read/mutate` helpers).
- `backend/src/database/drivers/{postgresql,sqlite}.ts` → `drivers/*`.
- `backend/src/database/schema-inspector.ts` → `schema/schema-inspector.ts`.
- `backend/src/agent-os/migrations/apply-migrations.ts` → `migrations/migration-runner.ts` (generalize from the agent-os dir to `backend/migrations/`; keep the `dist→src` `.sql` resolution + ledger + degrade-safe boot).
- `backend/src/agent-os/repositories/postgres-agent-os.repository.ts` — **stays in agent-os** but its `Queryable` is now satisfied by persistence's `QueryExecutor`; the in-memory/json fallbacks it uses become the `memory`/dev drivers.

**REUSE `packages/*` (do not redefine):** `@recoder/agent-os` + `@recoder/agent-schemas` (the row shapes stored), `@recoder/agent-events` (outbox/RunEvent rows), `@recoder/governance` + `@recoder/interop` (write/edge gates), `@recoder/auth` (`Session.userId`), `@recoder/logger`, `@recoder/utils`.

**CUT (owner-removed — do NOT restore):** `backend/src/database/` as a *top-level* dir (the stale location) and `backend/src/collaboration/persistence.ts` JSON store — folded into `KvStoreRepository`. The deleted JSON `loadStore/saveStore` + `data/*.json` are replaced by `core.kv_store`.

**NEW:** `named-params.ts`, `transaction.ts`, `base.repository.ts`, `kv-store.repository.ts`, `repository-factory.ts`, `state-of-record.repository.ts`, `seed.ts`, `backup.ts`, the composer/ports/health/routes/mcp, and the `000x` consolidated migrations.

**Rust sqlx note:** `engines/rust/tensorzero` owns its own DB access via `sqlx` (root `.env` must stay dotenvy-parseable, `SQLX_OFFLINE=1`) — persistence records this as a fusion boundary and does **not** proxy it.

---

## 8. Implementation order

1. **Ports + config + types** — `ports/*`, `config.ts` (+ prod-URL guard), `types.ts`. Locks the seam so other domains can code against interfaces immediately.
2. **Client + query core** — `client/pg-pool.ts`, `query/named-params.ts` (+ test), `query/query-executor.ts` (move existing), `query/transaction.ts` (+ test).
3. **Foundational migrations + runner** — `0000/0001/0002.sql`, `migrations/migration-runner.ts` (move+generalize, + test).
4. **Repositories** — `base.repository.ts` (+ test), `kv-store.repository.ts` (+ test), `repository-factory.ts`, `state-of-record.repository.ts`.
5. **Schema services** — move `schema-inspector.ts`; add `seed.ts`, `backup.ts`.
6. **Composer + health** — `persistence-module.ts`, `index.ts`, `health.ts` (+ test); wire boot-time migrate (degrade-safe) into `bootstrap/container.ts`.
7. **Edges + MCP** — `routes/persistence.routes.ts`, `mcp/persistence-engine.ts`; register via the MCP wiring checklist; confirm interop + governance gating.
8. **Verify** — `pnpm check-types`, domain vitest, `pnpm test:contracts:agent-os` (repo contract), confirm `/internal/persistence/health` truthful `up|down|degraded`.
