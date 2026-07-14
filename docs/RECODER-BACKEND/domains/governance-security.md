# Domain: Governance & Security

> Folder prefix: `backend/src/domains/governance/`
> Native engine (reused in place): `backend/engines/rust/recoder-governance` (9-crate cargo workspace)
> Owner interface: `GovernanceModule` (the gate + interop chain + secrets + locks + approvals)

## 1. Overview

Governance & Security is **the moat**: the one place every mutation in the whole
backend must pass before it happens, and the tamper-evident record of what
happened. It owns four load-bearing seams the other 13 domains wire to:

1. **`GovernanceGate.decide()`** — the `decide() → risk → audit` pipeline every
   WRITE flows through. Byte-interoperable with the Rust kernel
   (`recoder-governance`) via a strict degrade ladder: **napi `.node` (in-proc,
   default) → UDS daemon → deny-biased pure-TS fallback**. Never a silent allow.
2. **`InteropChain` (`authorize → risk → policy → audit`)** — the edge chain every
   HTTP route + MCP tool call passes before the handler runs. Fail-closed.
3. **Tamper-evident SHA-256 Merkle audit chain** — every decision seals into a
   hash chain whose tip is persisted; `verifyAudit()` re-walks the chain and
   detects any tampering.
4. **Secrets & security primitives** — envelope-encrypted vault, ed25519 signed
   envelopes, rate limiting / abuse prevention, `ext_authz` fail-closed, and
   path **work locks** + **approval gates**.

Security is enforced **below the model**: instruction files shape behavior, but
this domain's hooks, policy gates, signed envelopes, and server-side validation
*enforce* it. We never trust agent output, MCP tool descriptions, runtime-reported
success, or memory candidates — we verify actor identity, task ownership, envelope
validity, lock coverage, approval records, and artifact provenance.

### Degrade ladder (the core security invariant)

```
decide(req)
  ├─ napi kernel loaded?      → GovernanceKernel.decide()  [sync, in-proc]   ─┐
  ├─ else UDS daemon up?      → daemon.decide()            [loopback JSON]    ├─ real kernel
  └─ else                     → tsFallback.decide()        [deny-biased]     ─┘
                                                                              │
  any path fault / build error → synthetic DENY (fail CLOSED)  ──────────────┘
```

`verdict.degraded === true` is set truthfully whenever we are not on the napi
path. A governance fault **never** takes the server down and **never** produces a
fake allow.

## 2. File Tree

```
backend/src/domains/governance/
  index.ts                              # factory + public GovernanceModule interface
  governance-module.ts                  # composer: fuses kernel + interop + secrets + locks + approvals
  config.ts                             # GovernanceConfig slice (zod) of AppConfig
  types.ts                              # GateVerdict, RiskTier, WorkLock, ApprovalRecord, SecretRef, AuditEntry
  health.ts                             # per-engine up|down aggregation (napi/daemon/ts/vault)

  ports/
    gate.port.ts                        # GovernanceGate (decide/enforceTool/route/recordAudit/verifyAudit)
    interop.port.ts                     # InteropChain (authorize→risk→policy→audit)
    kernel.port.ts                      # GovernanceKernelPort (the Rust engine seam)
    secrets.port.ts                     # SecretsPort (get/set/rotate/delete/list)
    audit-repo.port.ts                  # AuditRepository (append/tip/range/verifyChain)
    approval-repo.port.ts               # ApprovalRepository + WorkLockRepository + SecretRepository

  adapters/
    napi-kernel.adapter.ts              # loads recoder-governance-napi .node in-proc (degrade→undefined)
    daemon-kernel.adapter.ts            # spawn/connect UDS governance daemon (degrade→undefined)
    ts-kernel.adapter.ts                # pure-TS deny-biased fallback over @recoder/governance
    kernel-ladder.adapter.ts            # composes napi→daemon→ts into one GovernanceKernelPort
    vault.adapter.ts                    # @recoder/vault node-crypto store (degrade→noop→down)

  services/
    governance-gate.service.ts          # GovernanceGate impl (decide→risk→audit) — the WRITE seam
    interop-chain.service.ts            # InteropChain impl (authorize→risk→policy→audit) — the EDGE seam
    audit-chain.service.ts              # Merkle writer+verifier, persists tip via AuditRepository
    secrets.service.ts                  # SecretsPort impl: envelope encryption + rotation
    work-lock.service.ts                # path/work-lock acquire/release/check
    approval.service.ts                 # approval-gate lifecycle (request/decide/lookup)
    signed-envelope.service.ts          # ed25519 sign/verify signed envelopes

  middleware/
    interop.middleware.ts               # express guard: runs interop chain + INTERNAL_SERVICE_KEY gate
    rate-limit.middleware.ts            # token-bucket rate limit + abuse prevention
    ext-authz.middleware.ts             # fail-closed ext_authz / signed-ingress gate

  repositories/
    audit.repository.ts                 # concrete AuditRepository (pg, parameterized :param)
    approval-worklock.repository.ts     # concrete ApprovalRepository + WorkLockRepository (pg)
    secret.repository.ts                # concrete SecretRepository (pg, ciphertext only)

  routes/
    governance.routes.ts                # HTTP edges: /api/agent-os/{policies,approvals,audit,locks} + /internal

  mcp/
    governance-engine.ts                # MCP tools: decide, verify_audit, request_approval, acquire_lock

  __tests__/
    governance-gate.test.ts             # decide→risk→audit + fail-closed on kernel throw
    kernel-ladder.test.ts               # degrade napi→daemon→ts; synthetic deny on total failure
    audit-chain.test.ts                 # Merkle append + verify + tamper detection
    interop.middleware.test.ts          # edge fail-closed + INTERNAL_SERVICE_KEY gate
    secrets.test.ts                     # encrypt/decrypt roundtrip + missing key → down (no fake)
    governance-interop.golden.test.ts   # byte-interop golden vectors vs Rust kernel

backend/engines/rust/recoder-governance/            # REUSED IN PLACE (never copied)
  recoder-governance-kernel/                         # decide() core
  recoder-governance-permission/                     # deny-biased permission enforcement
  recoder-governance-policy (routing/approval/audit) # policy + routing + approval + SHA-256 Merkle audit
  recoder-governance-napi/src/lib.rs                 # napi .node facade (in-proc, default)
  recoder-governance-daemon/src/main.rs              # UDS daemon binary (INTERNAL_SERVICE_KEY fail-closed)
  recoder-governance-ipc / -types                    # wire + shared types (golden vectors pinned here)

backend/migrations/
  NNNN_governance_audit_approvals_locks_secrets.sql  # 4 tables (see §4)
```

## 3. Per-file Responsibilities

| Path | lang | kind | Responsibility | Key exports |
|---|---|---|---|---|
| `index.ts` | ts | service | Pure factory + the one public interface; no top-level singletons. | `createGovernanceModule(deps)`, `GovernanceModule` |
| `governance-module.ts` | ts | service | Composer: builds kernel ladder, gate, interop chain, secrets, locks, approvals behind `GovernanceModule`; owns `health()`. | `GovernanceModuleImpl` |
| `config.ts` | ts | config | Zod schema for the `governance` slice of `AppConfig` (socket path, napi toggle, vault master key ref, rate-limit buckets, insecure flags). Fail-safe: missing vault key → secrets report `down`. | `GovernanceConfig`, `governanceConfigSchema` |
| `types.ts` | ts | type | Domain types not owned by `packages/*`: `GateVerdict`, `RiskTier`, `SecurityContext`, `WorkLock`, `ApprovalRecord`, `SecretRef`, `AuditEntry`, `EngineStatus`. | those types |
| `health.ts` | ts | service | Reports `{status, degraded, engines:[{name,status}]}` for napi/daemon/ts/vault; degraded when not on napi path. | `governanceHealth(deps)` |
| `ports/gate.port.ts` | ts | port | The WRITE seam every domain consumes: `decide`, `enforceTool`, `route`, `recordAudit`, `verifyAudit`. | `GovernanceGate` |
| `ports/interop.port.ts` | ts | port | The EDGE seam: `run(ctx): InteropDecision` = `authorize→risk→policy→audit`. | `InteropChain`, `InteropDecision` |
| `ports/kernel.port.ts` | ts | port | Engine seam over Rust: `decide`, `enforceTool`, `route`, `auditTip`, `verifyAudit`, `status()`. | `GovernanceKernelPort` |
| `ports/secrets.port.ts` | ts | port | Consumed by identity/billing/interop: `get`, `set`, `rotate`, `delete`, `list`. Values never logged. | `SecretsPort`, `SecretRef` |
| `ports/audit-repo.port.ts` | ts | port | Persistence contract for the Merkle chain: `append(entry)`, `tip()`, `range(from,to)`, `verifyChain()`. | `AuditRepository` |
| `ports/approval-repo.port.ts` | ts | port | Persistence contracts: approvals, work locks, encrypted secret rows. | `ApprovalRepository`, `WorkLockRepository`, `SecretRepository` |
| `adapters/napi-kernel.adapter.ts` | ts | client | Load `recoder-governance-napi` `.node` in-proc; return `undefined` when absent (degrade), never throw at load. | `createNapiKernelAdapter()` |
| `adapters/daemon-kernel.adapter.ts` | ts | client | Spawn/connect the prebuilt UDS daemon (ported from `conductor/governance-daemon.ts`); publishes `GOVERNANCE_SOCKET`; passes `INTERNAL_SERVICE_KEY`; never builds the crate. | `createDaemonKernelAdapter()`, `ensureGovernanceDaemon()` |
| `adapters/ts-kernel.adapter.ts` | ts | client | Pure-TS deny-biased kernel wrapping `@recoder/governance` `Governance` — always available, always real governance. | `createTsKernelAdapter()` |
| `adapters/kernel-ladder.adapter.ts` | ts | client | Compose napi→daemon→ts into one `GovernanceKernelPort`; per-call fault → next rung; total failure → synthetic DENY. | `createKernelLadder(cfg)` |
| `adapters/vault.adapter.ts` | ts | client | Wrap `@recoder/vault` `node-crypto` encrypted store; degrade to `noop-vault` → status `down` when master key absent (never fakes storage). | `createVaultAdapter(cfg)` |
| `services/governance-gate.service.ts` | ts | service | `GovernanceGate` impl: builds `GovernanceRequest`, runs kernel ladder, seals audit entry, returns `GateVerdict`; fails CLOSED. Ported from `conductor/governance-gate.ts`, widened to all writes. | `GovernanceGateService` |
| `services/interop-chain.service.ts` | ts | service | `InteropChain` impl over `@recoder/interop` + gate: authorize (session), risk (tier-classify), policy (`@recoder/agent-policy`), audit (seal). | `InteropChainService` |
| `services/audit-chain.service.ts` | ts | service | Bridges kernel Merkle tip to `AuditRepository` (durable prev/entry hash); `verify()` re-walks chain, cross-checks kernel tip vs DB tip. | `AuditChainService` |
| `services/secrets.service.ts` | ts | service | `SecretsPort` impl: envelope-encrypt via vault, store ciphertext via `SecretRepository`, key-version rotation, app-layer `WHERE owner_user_id`. | `SecretsService` |
| `services/work-lock.service.ts` | ts | service | Path/work-lock acquire/release/check over `@recoder/coordination` + `WorkLockRepository`; TTL expiry; conflict detection before writes. | `WorkLockService` |
| `services/approval.service.ts` | ts | service | Approval-gate lifecycle speaking the `@recoder/agent-os` `Approval` contract; request/decide/lookup; ties to gate `needs_approval` verdicts. | `ApprovalService` |
| `services/signed-envelope.service.ts` | ts | service | ed25519 sign/verify (via `@recoder/interop` `ed25519`) for A2A + `/internal` envelopes; rejects unsigned when configured. | `SignedEnvelopeService` |
| `middleware/interop.middleware.ts` | ts | middleware | Express guard running the interop chain on every mounted edge; `internalServiceGuard` gates `/internal/*` with `INTERNAL_SERVICE_KEY` (timing-safe). | `interopGuard(chain)`, `internalServiceGuard(cfg)` |
| `middleware/rate-limit.middleware.ts` | ts | middleware | Token-bucket per actor/route + abuse detection (ported from `a2a/rate-limiter.service.ts`); `429` with `Retry-After`; fail-open only for reads, fail-closed for writes. | `createRateLimitMiddleware(cfg)` |
| `middleware/ext-authz.middleware.ts` | ts | middleware | Fail-closed external-authz gate for ingress (envoy `ext_authz` + `@recoder/interop` `signed-ingress-gate`); denies on any evaluator fault. | `extAuthzGuard(deps)` |
| `repositories/audit.repository.ts` | ts | repository | Concrete `AuditRepository` (pg, `:param` SQL); append is append-only (no update/delete); `verifyChain()` walks `prev_hash`/`entry_hash`. | `createAuditRepository(qe)` |
| `repositories/approval-worklock.repository.ts` | ts | repository | Concrete `ApprovalRepository` + `WorkLockRepository` (pg); unique active-lock constraint per path. | `createApprovalRepository(qe)`, `createWorkLockRepository(qe)` |
| `repositories/secret.repository.ts` | ts | repository | Concrete `SecretRepository` (pg); stores ciphertext/nonce/key_version only — never plaintext; `WHERE owner_user_id`. | `createSecretRepository(qe)` |
| `routes/governance.routes.ts` | ts | route | HTTP edges (§5) using `sendSuccess`/`sendError`; zod-validates inbound; mounted by the `edge` domain route table. | `mountGovernanceRoutes(router, deps)` |
| `mcp/governance-engine.ts` | ts | service | MCP tools conforming to `@recoder/agent-mcp` ToolRouter: `governance_decide`, `governance_verify_audit`, `request_approval`, `acquire_lock`. Registered via the wiring checklist. | `registerGovernanceMcpTools(router, deps)` |
| `__tests__/governance-gate.test.ts` | ts | test | decide→risk→audit happy path; kernel throw → synthetic DENY (fail closed); `needs_approval` requires an Approval record. | — |
| `__tests__/kernel-ladder.test.ts` | ts | test | napi present → used; napi absent+daemon up → daemon; both down → ts; all fault → synthetic deny; `degraded` flag truthful. | — |
| `__tests__/audit-chain.test.ts` | ts | test | append N entries, `verify()` passes; mutate a DB row → `verify()` fails at that seq; kernel-tip vs DB-tip mismatch surfaces. | — |
| `__tests__/interop.middleware.test.ts` | ts | test | unauthorized → deny; policy deny → `AUTHZ_PROJECT_ACCESS_DENIED`; evaluator throw → fail-closed; bad `INTERNAL_SERVICE_KEY` → 401. | — |
| `__tests__/secrets.test.ts` | ts | test | set→get roundtrip; rotate bumps key_version and re-encrypts; missing master key → `down` + `SERVICE_UNAVAILABLE` (no fake write). | — |
| `__tests__/governance-interop.golden.test.ts` | ts | test | Pinned golden vectors: TS facade verdict + Merkle hash bytes equal the Rust kernel's for the same request (byte-interop guarantee). | — |
| `backend/migrations/NNNN_governance_*.sql` | sql | migration | Creates the 4 tables + indexes + append-only trigger on the audit chain. | — |

## 4. Database Schema

All access is app-layer (`WHERE owner_user_id = :user_id`); **no** Supabase RLS.
Owned by `domains/persistence`'s `QueryExecutor`; this domain declares the ports,
persistence provides the driver.

```sql
-- governance_audit_chain: append-only SHA-256 Merkle chain (tamper-evident)
CREATE TABLE governance_audit_chain (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY,      -- monotonic order
  prev_hash    text NOT NULL,                            -- tip before this entry
  entry_hash   text NOT NULL UNIQUE,                     -- SHA-256(prev_hash || canonical(payload))
  actor_id     text NOT NULL,
  action       text NOT NULL,                            -- e.g. pr.create, branch.push, secret.rotate
  resource     text NOT NULL,
  effect       text NOT NULL CHECK (effect IN ('allow','deny','needs_approval')),
  risk_tier    text NOT NULL CHECK (risk_tier IN ('low','medium','high','critical')),
  degraded     boolean NOT NULL DEFAULT false,
  payload      jsonb NOT NULL,                           -- request + verdict metadata (no secrets)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor  ON governance_audit_chain(actor_id, created_at DESC);
CREATE UNIQUE INDEX idx_audit_seq ON governance_audit_chain(seq);
-- append-only: a BEFORE UPDATE/DELETE trigger raises to keep the chain immutable

-- governance_approvals: control-plane approval records (agent-os Approval shape)
CREATE TABLE governance_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      text,
  run_id       text,
  action       text NOT NULL,
  risk_tier    text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','denied','expired')),
  requested_by text NOT NULL,
  decided_by   text,
  reason       text,
  expires_at   timestamptz,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_approvals_task ON governance_approvals(task_id, status);

-- governance_work_locks: path/work locks (conflict prevention before writes)
CREATE TABLE governance_work_locks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_path  text NOT NULL,
  holder_agent_id text NOT NULL,
  task_id        text,
  mode           text NOT NULL DEFAULT 'exclusive' CHECK (mode IN ('exclusive','shared')),
  acquired_at    timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  released_at    timestamptz
);
-- one active exclusive lock per path
CREATE UNIQUE INDEX idx_worklock_active
  ON governance_work_locks(resource_path)
  WHERE released_at IS NULL AND mode = 'exclusive';

-- governance_secrets: envelope-encrypted secret store (ciphertext only)
CREATE TABLE governance_secrets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref            text NOT NULL,                          -- logical name, e.g. byok/openai
  owner_user_id  text NOT NULL,
  ciphertext     bytea NOT NULL,                         -- AES-GCM, envelope-encrypted
  nonce          bytea NOT NULL,
  key_version    int NOT NULL DEFAULT 1,
  rotated_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, ref)
);
```

## 5. Edges (HTTP + MCP)

Every edge passes `interopGuard` (`authorize→risk→policy→audit`). Writes also flow
through the gate `decide()`. `/internal/*` additionally passes `internalServiceGuard`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/agent-os/policies/decide` | session | Run gate `decide()` for a proposed action; returns `GateVerdict`. |
| GET | `/api/agent-os/audit` | session | Paged audit range (`?from=&to=`), actor-scoped. |
| GET | `/api/agent-os/audit/verify` | session | Re-walk chain; returns `{ok, brokenAtSeq?}`. |
| POST | `/api/agent-os/approvals` | session | Request an approval for a risky action. |
| POST | `/api/agent-os/approvals/:id/decide` | session (approver) | Approve/deny an approval record. |
| GET | `/api/agent-os/approvals/:id` | session | Fetch approval status. |
| POST | `/api/agent-os/locks` | session | Acquire a work lock on a path. |
| DELETE | `/api/agent-os/locks/:id` | session | Release a held lock. |
| GET | `/api/agent-os/locks` | session | List active locks (task/agent scoped). |
| POST | `/internal/governance/audit/append` | `INTERNAL_SERVICE_KEY` | Worker-to-backend audit seal (out-of-band). |
| GET | `/api/agent-os/health` (contribution) | none | Governance engines up/down + degraded flag. |

**MCP tools** (`mcp/governance-engine.ts`, registered via
`IN_PROC_SERVERS` + `ENGINE_SERVERS` + `buildInProcEngineRouter`):
`governance_decide`, `governance_verify_audit`, `request_approval`, `acquire_lock`.

## 6. Interfaces

**Exposes to other domains** (via `backend/src/shared` re-export or `packages/*`):

- `GovernanceGate` — `ports/gate.port.ts`. **Every stateful domain consumes this
  for writes.** `decide(req) → GateVerdict`, `enforceTool`, `route`,
  `recordAudit`, `verifyAudit`.
- `InteropChain` — `ports/interop.port.ts`. **Every edge + MCP tool consumes
  this.** `run(ctx) → InteropDecision`.
- `SecretsPort` — `ports/secrets.port.ts`. Consumed by `identity` (sk_ keys),
  `billing`, `inference` (BYOK), `interop` (connector creds).
- `interopGuard` / `internalServiceGuard` / `createRateLimitMiddleware` /
  `extAuthzGuard` — middleware consumed by the `edge`/`http` domain.
- `WorkLockService` / `ApprovalService` — consumed by `conductor` + `agent-os`.

**Consumes from other domains / packages:**

- `QueryExecutor` / `Repository` — from `domains/persistence` (pg driver).
- `Session` — from `identity` (`@recoder/auth`) on every request.
- `AppConfig` slice — from `bootstrap/config`.
- `@recoder/governance` — the gate facade + Merkle verifier (byte-interop with Rust).
- `@recoder/interop` — `authorize→risk→policy→audit` chain + `ed25519` + `signed-ingress-gate`.
- `@recoder/agent-policy` — deterministic policy decisions.
- `@recoder/agent-os` + `@recoder/agent-schemas` — `Approval` state-of-record shape.
- `@recoder/agent-events` — emits `RunEvent` (`governance.decided`, `approval.requested`).
- `@recoder/vault` — `node-crypto` encrypted store / `noop-vault` degrade.
- `@recoder/coordination` — lock primitives backing `WorkLockService`.
- `@recoder/agent-mcp` — ToolRouter shape for `mcp/governance-engine.ts`.
- `@recoder/logger` — child logger tagged `governance`.

## 7. Reuse Notes

**REUSE (do not rebuild):**

- `backend/engines/rust/recoder-governance` (9 crates) — the kernel, permission,
  policy/routing/approval, SHA-256 Merkle audit, napi facade, UDS daemon. **Used
  in place, never copied.** Golden vectors pinned in `recoder-governance-types`.
- `packages/governance` — `Governance` facade, `evaluatePolicy`,
  `InMemoryAuditStore`, IPC wire. The ts-fallback adapter wraps this directly.
- `packages/interop` — `ed25519`, `signed-ingress-gate`, `connector-ingress`,
  a2a/mcp chain. The interop chain + signed-envelope service build on this.
- `packages/vault` — `node-crypto`, `noop-vault`, `wave-secret-store`. The vault
  adapter wraps these.
- **Ported (moved behind the composer, not rewritten):**
  `conductor/governance-gate.ts` → `services/governance-gate.service.ts`;
  `conductor/governance-daemon.ts` → `adapters/daemon-kernel.adapter.ts`;
  `network/governance-ports.ts` → folded into `ts-kernel`/`interop` wiring;
  `a2a/rate-limiter.service.ts` → `middleware/rate-limit.middleware.ts`;
  `conductor/conductor-locks.ts` + `delivery-approval.ts` → `work-lock.service.ts` +
  `approval.service.ts`.

**WRITE NEW:** the composer (`governance-module.ts`), the kernel ladder
(`kernel-ladder.adapter.ts`), the durable audit bridge (`audit-chain.service.ts`
+ `audit.repository.ts` — the package store is in-memory), the pg repositories,
the secrets service over vault+pg, the routes + MCP engine, the 4-table migration.

**CUT (do not restore):** the removed `backend/src/{code,collaboration,database,
sandbox}` dirs and dangling `server.ts` security imports — re-introduce only
DB-backed (secrets → `governance_secrets`, not env-only).

## 8. Implementation Order

1. **Ports first** (`ports/*`) — lock the seams the other 13 domains wire to:
   `GovernanceGate`, `InteropChain`, `SecretsPort`, `AuditRepository`,
   `GovernanceKernelPort`. These are the contract; write them before impls.
2. **Migration + repositories** — `governance_*` tables, `audit.repository.ts`
   (append-only), `approval-worklock.repository.ts`, `secret.repository.ts`.
3. **Kernel ladder** — `ts-kernel` (always works) → `napi-kernel` → `daemon-kernel`
   → `kernel-ladder` composing them with fail-closed synthetic deny.
   Verify with `kernel-ladder.test.ts`.
4. **Gate + audit chain** — `governance-gate.service.ts` (decide→risk→audit) +
   `audit-chain.service.ts` bridging kernel Merkle tip to the DB. Verify tamper
   detection (`audit-chain.test.ts`) and byte-interop (`governance-interop.golden.test.ts`).
5. **Interop chain + middleware** — `interop-chain.service.ts`,
   `interop.middleware.ts` (+ internal-key gate), `rate-limit`, `ext-authz`.
   Verify fail-closed (`interop.middleware.test.ts`).
6. **Secrets** — `vault.adapter.ts` + `secrets.service.ts` + `secret.repository.ts`;
   verify encryption roundtrip + missing-key → `down` (`secrets.test.ts`).
7. **Locks + approvals** — `work-lock.service.ts`, `approval.service.ts`.
8. **Composer + health** — `governance-module.ts`, `health.ts`, `index.ts` factory.
9. **Edges** — `routes/governance.routes.ts` + `mcp/governance-engine.ts`
   (register via `IN_PROC_SERVERS`/`ENGINE_SERVERS`/`buildInProcEngineRouter`).
10. **Wire into bootstrap** — `createGovernanceModule(deps)` in
    `bootstrap/container.ts`; mount routes via the `edge` route table; contribute
    to `/health` + `/api/agent-os/health`.

**Verification:** `pnpm test:contracts:agent-os`, `pnpm test:evals:agent-os`,
`pnpm check-types`, `cargo test` (recoder-governance golden vectors),
`scripts/verify-byok-e2e.sh` (secrets path).
