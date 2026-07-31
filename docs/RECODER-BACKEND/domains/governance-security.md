# Domain: Governance & Security

> Folder prefix: `backend/src/domains/governance/`
> Native engine (reused in place): `backend/engines/rust/recoder-governance` (9-crate cargo workspace)
> Owner interface: `GovernanceModule` (the gate + audit chain + secrets + locks + approvals; the `InteropChain` is a port here, impl in `domains/interop`)

## 1. Overview

Governance & Security is **the moat**: the one place every mutation in the whole
backend must pass before it happens, and the tamper-evident record of what
happened.

**SHIPPED (2026-07-31):** Multi-tenant IDOR sweep COMPLETE. All 8 original domains
audited; the last two (interop + edge, 2026-07-31) now enforce ed25519 signer-bound
ownership + /internal/* self-gating. **FIXED (bd recoder-xiqj):**
approval-clearance is now principal-bound — `resolveApprovalClearance` requires
`requestedBy === principal.userId`, so an approval clears only for the actor that
requested it (no cross-actor approval reuse). Legit same-actor flow preserved.

It owns four load-bearing seams the other 14 domains wire to:

1. **`GovernanceGate.decide()`** — the `decide() → risk → audit` pipeline every
   WRITE flows through. Byte-interoperable with the Rust kernel
   (`recoder-governance`) via a strict degrade ladder: **napi `.node` (in-proc,
   default) → UDS daemon → deny-biased pure-TS fallback**. Never a silent allow.
2. **`InteropChain` (`authorize → risk → policy → audit`)** — the edge chain every
   HTTP route + MCP tool call passes before the handler runs. Fail-closed.
   Governance owns the **port** (`ports/interop.port.ts`); the concrete chain +
   its Express middleware ship in `domains/interop` (Phase-3 conflict #1: one
   impl, living in `interop`, calling governance's gate).
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

> **Shipped note.** The interop chain, its Express middleware, and the ed25519
> signed-envelope helpers do **not** live under `governance/` — they shipped in
> `domains/interop` (and `domains/interop-wire`). Governance declares the
> `InteropChain` port; interop owns the impl (Phase-3 conflict #1). The tree below
> reflects the shipped `governance/` folder.

```
backend/src/domains/governance/
  index.ts                              # async factory (probes kernel ladder) + public GovernanceModule interface
  governance-module.ts                  # GovernanceComposer: fuses kernel + secrets + locks + approvals + audit
  config.ts                             # GovernanceConfig slice (zod): napiEnabled, daemonSocketPath, vaultMasterKey
  types.ts                              # GateVerdict, RiskTier, GovernanceEffect, GateTarget, AuditEntry, …
  health.ts                             # 3-engine truthful health: kernel:<rung> / audit(DB) / vault

  ports/
    gate.port.ts                        # GovernanceGate (decide/enforceTool/route/recordAudit/verifyAudit)
    interop.port.ts                     # InteropChain PORT (authorize→risk→policy→audit) — impl lives in domains/interop
    kernel.port.ts                      # GovernanceKernelPort (the Rust engine seam)
    secrets.port.ts                     # SecretsPort (get/set/rotate/delete/list) + SecretRepository persistence contract
    audit-repo.port.ts                  # AuditRepository (append/tip/range/verifyChain)
    approval-repo.port.ts               # ApprovalRepository
    worklock-repo.port.ts               # WorkLockRepository

  adapters/
    napi-kernel.adapter.ts              # loads recoder-governance-napi .node in-proc (degrade→undefined)
    daemon-kernel.adapter.ts            # spawn/connect UDS governance daemon (degrade→undefined)
    ts-kernel.adapter.ts                # pure-TS deny-biased floor over @recoder/governance
    governance-kernel.ts                # shared GovernanceKernelPort wrapper (stamps the rung: napi|daemon|ts)
    governance-request.mapper.ts        # maps domain KernelRequest ↔ @recoder/governance GovernanceRequest (deny-biased actor)
    kernel-ladder.adapter.ts            # composes napi→daemon→ts into one GovernanceKernelPort
    vault.adapter.ts                    # @recoder/vault node-crypto store (degrade→noop→down)

  services/
    governance-gate.service.ts          # GovernanceGate impl (decide→risk→audit) — the WRITE seam
    audit-chain.service.ts              # Merkle writer+verifier, persists tip via AuditRepository
    secrets.service.ts                  # SecretsPort impl: envelope encryption + rotation
    work-lock.service.ts                # path/work-lock acquire/release/check
    approval.service.ts                 # approval-gate lifecycle (request/decide/lookup)

  repositories/
    audit.repository.ts                 # concrete AuditRepository (pg, parameterized :param)
    approval-worklock.repository.ts     # concrete ApprovalRepository + WorkLockRepository (pg)
    secret.repository.ts                # concrete SecretRepository (pg, ciphertext only)

  routes/
    governance-approvals.routes.ts      # HTTP edges under /api/agent-os: approvals + locks
    governance-secrets.routes.ts        # HTTP edges under /api/agent-os: secrets (get/set/rotate/delete/list)

  mcp/
    governance-engine.ts                # read MCP tools: kernel_status, audit_verify, locks_list (+ composes write tools)
    governance-write-tools.ts           # write MCP tools: decide, request_approval, approval_decide, acquire/release_lock, secret_set

  __tests__/
    governance-gate.service.test.ts     # decide→risk→audit + fail-closed on kernel throw
    kernel-ladder.adapter.test.ts       # degrade napi→daemon→ts; synthetic deny on total failure
    audit-chain.service.test.ts         # Merkle append + verify + tamper detection
    secrets.service.test.ts             # encrypt/decrypt roundtrip + missing key → down (no fake)
    approval.service.test.ts            # approval lifecycle; ties to needs_approval verdicts
    work-lock.service.test.ts           # acquire/release/check + conflict detection
    health.test.ts                      # 3-engine truthful up/degraded/down
    governance-read-tools.test.ts       # read MCP tools (subject-bound at the edge)
    governance-write-tools.test.ts      # write MCP tools (subject-bound at the edge)
    governance-golden-vectors.test.ts   # byte-interop golden vectors vs Rust kernel
    _fakes.ts                           # shared test doubles

backend/engines/rust/recoder-governance/            # REUSED IN PLACE (never copied)
  recoder-governance-kernel/                         # decide() core
  recoder-governance-permission/                     # deny-biased permission enforcement
  recoder-governance-policy (routing/approval/audit) # policy + routing + approval + SHA-256 Merkle audit
  recoder-governance-napi/src/lib.rs                 # napi .node facade (in-proc, default)
  recoder-governance-daemon/src/main.rs              # UDS daemon binary (INTERNAL_SERVICE_KEY fail-closed)
  recoder-governance-ipc / -types                    # wire + shared types (golden vectors pinned here)

backend/migrations/
  governance_0001.sql                                # 4 tables + indexes + append-only rules (see §4)
```

## 3. Per-file Responsibilities

| Path | lang | kind | Responsibility | Key exports |
|---|---|---|---|---|
| `index.ts` | ts | service | Pure **async** factory (probes the kernel ladder) + the one public interface; no top-level singletons. | `createGovernanceModule(deps)`, `GovernanceModule` |
| `governance-module.ts` | ts | service | Composer: builds kernel ladder, gate, audit chain, secrets, locks, approvals behind `GovernanceModule`; mounts approvals+locks and secrets routers; owns `health()`. | `GovernanceComposer` |
| `config.ts` | ts | config | Zod schema for the `governance` slice of `AppConfig`: `napiEnabled`, `daemonSocketPath`, `vaultMasterKey`. Fail-safe: missing vault key → secrets report `down`; no daemon → kernel degrades to the pure-TS rung. | `GovernanceConfig`, `GovernanceConfigOverrides`, `sliceGovernanceConfig` |
| `types.ts` | ts | type | Domain types not owned by `packages/*`: `GateVerdict`, `RiskTier`, `GovernanceEffect`, `GateTarget`, `AuditEntry`, `EngineStatus`, … | those types |
| `health.ts` | ts | service | Reports 3 truthful engines — `kernel:<rung>` (napi=up, daemon/ts=degraded, synthetic=down), `audit` (DB reachability), `vault` (master key present) — degraded when non-native / DB-less / vault-less. | `buildGovernanceHealth(deps)` |
| `ports/gate.port.ts` | ts | port | The WRITE seam every domain consumes: `decide`, `enforceTool`, `route`, `recordAudit`, `verifyAudit`. | `GovernanceGate` |
| `ports/interop.port.ts` | ts | port | The EDGE seam PORT: `run(ctx): InteropDecision` = `authorize→risk→policy→audit`. **Concrete impl + middleware live in `domains/interop`** (conflict #1). | `InteropChain`, `InteropContext`, `InteropDecision` |
| `ports/kernel.port.ts` | ts | port | Engine seam over Rust: `decide`, `enforceTool`, `route`, `auditTip`, `verifyAudit`, `status()`. | `GovernanceKernelPort` |
| `ports/secrets.port.ts` | ts | port | Consumed by identity/billing/inference/interop: `get`, `set`, `rotate`, `delete`, `list`. Also declares the `SecretRepository` persistence contract (ciphertext only). Values never logged. | `SecretsPort`, `SecretRepository`, `SecretCipherRow` |
| `ports/audit-repo.port.ts` | ts | port | Persistence contract for the Merkle chain: `append(entry)`, `tip()`, `range(from,to)`, `verifyChain()`. | `AuditRepository` |
| `ports/approval-repo.port.ts` | ts | port | Persistence contract for approval records. | `ApprovalRepository` |
| `ports/worklock-repo.port.ts` | ts | port | Persistence contract for work locks (acquire/release/check; active-lock constraint per path). | `WorkLockRepository` |
| `adapters/napi-kernel.adapter.ts` | ts | client | Load `recoder-governance-napi` `.node` in-proc; return `undefined` when absent (degrade), never throw at load. | `createNapiKernelAdapter()` |
| `adapters/daemon-kernel.adapter.ts` | ts | client | Spawn/connect the prebuilt UDS daemon (ported from `conductor/governance-daemon.ts`); passes `INTERNAL_SERVICE_KEY`; never builds the crate. | `createDaemonKernelAdapter()` |
| `adapters/ts-kernel.adapter.ts` | ts | client | Pure-TS deny-biased kernel wrapping `@recoder/governance` `Governance` — always available, always real governance. | `createTsKernelAdapter()` |
| `adapters/governance-kernel.ts` | ts | client | Shared `GovernanceKernelPort` wrapper around a `@recoder/governance` `Governance` instance, stamped with the ladder rung (`napi`/`daemon`/`ts`) that owns it. All three rungs wrap the SAME facade. | `GovernanceBackedKernel` |
| `adapters/governance-request.mapper.ts` | ts | client | Maps the domain `KernelRequest`/`KernelVerdict` ↔ the package's `GovernanceRequest`/`GovernanceVerdict`; builds a **deny-biased synthetic actor** so unaided risky actions surface as `needs_approval`/`deny`. | request/verdict mappers |
| `adapters/kernel-ladder.adapter.ts` | ts | client | Compose napi→daemon→ts into one `GovernanceKernelPort`; per-call fault → next rung; total failure → synthetic DENY. | `createKernelLadder(cfg)` |
| `adapters/vault.adapter.ts` | ts | client | Wrap `@recoder/vault` `node-crypto` encrypted store; degrade to `noop-vault` → status `down` when master key absent (never fakes storage). | `createVaultAdapter(cfg)` |
| `services/governance-gate.service.ts` | ts | service | `GovernanceGate` impl: builds the kernel request, runs kernel ladder, seals audit entry, returns `GateVerdict`; fails CLOSED. Ported from `conductor/governance-gate.ts`, widened to all writes. | `GovernanceGateService` |
| `services/audit-chain.service.ts` | ts | service | Bridges kernel Merkle tip to `AuditRepository` (durable prev/entry hash); `verify()` re-walks chain, cross-checks kernel tip vs DB tip. | `AuditChainService` |
| `services/secrets.service.ts` | ts | service | `SecretsPort` impl: envelope-encrypt via vault, store ciphertext via `SecretRepository`, key-version rotation, app-layer `WHERE owner_user_id`. | `createSecretsService`, `SecretsService` |
| `services/work-lock.service.ts` | ts | service | Path/work-lock acquire/release/check over `WorkLockRepository`; TTL expiry; conflict detection before writes. | `createWorkLockService`, `WorkLockService` |
| `services/approval.service.ts` | ts | service | Approval-gate lifecycle speaking the `@recoder/agent-os` `Approval` contract; request/decide/lookup; ties to gate `needs_approval` verdicts. | `createApprovalService`, `ApprovalService` |
| `repositories/audit.repository.ts` | ts | repository | Concrete `AuditRepository` (pg, `:param` SQL); append is append-only (no update/delete); `verifyChain()` walks `prev_hash`/`entry_hash`. | `createAuditRepository(qe)` |
| `repositories/approval-worklock.repository.ts` | ts | repository | Concrete `ApprovalRepository` + `WorkLockRepository` (pg); unique active-lock constraint per path. | `createApprovalRepository(qe)`, `createWorkLockRepository(qe)` |
| `repositories/secret.repository.ts` | ts | repository | Concrete `SecretRepository` (pg); stores ciphertext/nonce/key_version only — never plaintext; `WHERE owner_user_id`. | `createSecretRepository(qe)` |
| `routes/governance-approvals.routes.ts` | ts | route | HTTP edges (§5) for approvals + locks, mounted under `/api/agent-os`; auth-guarded; zod-validates inbound. | `buildGovernanceApprovalsRouter(deps)` |
| `routes/governance-secrets.routes.ts` | ts | route | HTTP edges (§5) for the secret store (list/get/set/rotate/delete), mounted under `/api/agent-os`. | `buildGovernanceSecretsRouter(deps)` |
| `mcp/governance-engine.ts` | ts | service | Composes the governance MCP tool set (`@recoder/agent-mcp` shape): READ tools `governance_kernel_status`, `governance_audit_verify`, `governance_locks_list` + the write tools. | `buildGovernanceMcpTools(module)`, `buildGovernanceReadTools(...)` |
| `mcp/governance-write-tools.ts` | ts | service | WRITE MCP tools: `governance_decide`, `governance_request_approval`, `governance_approval_decide`, `governance_acquire_lock`, `governance_release_lock`, `governance_secret_set`. Each subject-bound to the host-authorized caller at the MCP edge. | `buildGovernanceWriteTools(...)` |
| `__tests__/governance-gate.service.test.ts` | ts | test | decide→risk→audit happy path; kernel throw → synthetic DENY (fail closed); `needs_approval` requires an Approval record. | — |
| `__tests__/kernel-ladder.adapter.test.ts` | ts | test | napi present → used; napi absent+daemon up → daemon; both down → ts; all fault → synthetic deny; `degraded` flag truthful. | — |
| `__tests__/audit-chain.service.test.ts` | ts | test | append N entries, `verify()` passes; mutate a DB row → `verify()` fails at that seq; kernel-tip vs DB-tip mismatch surfaces. | — |
| `__tests__/secrets.service.test.ts` | ts | test | set→get roundtrip; rotate bumps key_version and re-encrypts; missing master key → `down` + `SERVICE_UNAVAILABLE` (no fake write). | — |
| `__tests__/approval.service.test.ts` | ts | test | approval request/decide/lookup lifecycle; clears `needs_approval`. | — |
| `__tests__/work-lock.service.test.ts` | ts | test | acquire/release/check; conflict detection; TTL expiry. | — |
| `__tests__/health.test.ts` | ts | test | 3-engine truthful up/degraded/down (kernel rung, audit DB, vault key). | — |
| `__tests__/governance-read-tools.test.ts` | ts | test | read MCP tools; caller/subject bound at the edge. | — |
| `__tests__/governance-write-tools.test.ts` | ts | test | write MCP tools; caller/subject bound at the edge (cross-tenant class closed). | — |
| `__tests__/governance-golden-vectors.test.ts` | ts | test | Pinned golden vectors: TS facade verdict + Merkle hash bytes equal the Rust kernel's for the same request (byte-interop guarantee). | — |
| `backend/migrations/governance_0001.sql` | sql | migration | Creates the 4 tables + indexes + append-only **rules** on the audit chain. | — |

## 4. Database Schema

All access is app-layer (`WHERE owner_user_id = :user_id`); **no** Supabase RLS.
Owned by `domains/persistence`'s `QueryExecutor`; this domain declares the ports,
persistence provides the driver.

> **Shipped note.** The audit table is named `governance_audit` (not
> `governance_audit_chain`), and append-only is enforced with `ON UPDATE/DELETE
> DO INSTEAD NOTHING` **rules**, not a `plpgsql` trigger — the persistence
> migration runner splits on top-level `;` and is not dollar-quote aware, so a
> raising trigger body can't be used. Approvals also carry a `requested_by`
> index; secrets are indexed on `(owner_user_id, ref)`.

```sql
-- governance_audit: append-only SHA-256 Merkle chain (tamper-evident)
CREATE TABLE governance_audit (
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
CREATE INDEX idx_governance_audit_actor  ON governance_audit(actor_id, created_at DESC);
CREATE UNIQUE INDEX idx_governance_audit_seq ON governance_audit(seq);
-- append-only: ON UPDATE/DELETE DO INSTEAD NOTHING rules keep the chain immutable

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

Edges are auth-guarded and the interop chain / rate-limit / ext-authz middleware
(owned by `domains/interop`) run at the mounted-router seam. Writes also flow
through the gate `decide()`.

The shipped `governance/` folder mounts **approvals + locks + secrets** under
`/api/agent-os`. `decide` and `audit verify` are exposed as **MCP tools**, not
HTTP routes (there is no `/api/agent-os/policies/decide`, `/api/agent-os/audit*`,
or `/internal/governance/audit/append` route in this domain).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/agent-os/approvals` | session | Request an approval for a risky action. |
| GET | `/api/agent-os/approvals` | session | List approvals (scoped). |
| GET | `/api/agent-os/approvals/:id` | session | Fetch approval status. |
| POST | `/api/agent-os/approvals/:id/decide` | session (approver) | Approve/deny an approval record. |
| POST | `/api/agent-os/locks` | session | Acquire a work lock on a path. |
| GET | `/api/agent-os/locks` | session | List active locks (task/agent scoped). |
| DELETE | `/api/agent-os/locks/:id` | session | Release a held lock. |
| GET | `/api/agent-os/secrets` | session | List secret refs (owner-scoped, no ciphertext). |
| GET | `/api/agent-os/secrets/:ref` | session | Fetch/decrypt a secret value (owner-scoped). |
| POST | `/api/agent-os/secrets` | session | Set a secret (envelope-encrypted). |
| POST | `/api/agent-os/secrets/:ref/rotate` | session | Rotate a secret's key version. |
| DELETE | `/api/agent-os/secrets/:ref` | session | Delete a secret. |
| GET | `/api/agent-os/health` (contribution) | none | Governance engines up/down + degraded flag. |

**MCP tools** (`mcp/governance-engine.ts` + `mcp/governance-write-tools.ts`,
registered via the in-proc engine wiring checklist). Every write/subject-bearing
tool is bound to the host-authorized `McpToolCaller` at the MCP edge:
- READ: `governance_kernel_status`, `governance_audit_verify`, `governance_locks_list`.
- WRITE: `governance_decide`, `governance_request_approval`,
  `governance_approval_decide`, `governance_acquire_lock`,
  `governance_release_lock`, `governance_secret_set`.

## 6. Interfaces

**Exposes to other domains** (via `backend/src/shared` re-export or `packages/*`):

- `GovernanceGate` — `ports/gate.port.ts`. **Every stateful domain consumes this
  for writes.** `decide(req) → GateVerdict`, `enforceTool`, `route`,
  `recordAudit`, `verifyAudit`.
- `InteropChain` (**port only**) — `ports/interop.port.ts`. Every edge + MCP tool
  consumes the chain, but the concrete impl + its `interopGuard` /
  `internalServiceGuard` / rate-limit / ext-authz middleware ship in
  `domains/interop` (Phase-3 conflict #1). `run(ctx) → InteropDecision`.
- `SecretsPort` — `ports/secrets.port.ts`. Consumed by `identity` (sk_ keys),
  `billing`, `inference` (BYOK keys resolved into the delivery path), `interop`
  (connector creds).
- `WorkLockService` / `ApprovalService` — consumed by `conductor` + `agent-os`.

> The interop chain + its Express middleware (`interopGuard`,
> `internalServiceGuard`, `createRateLimitMiddleware`, `extAuthzGuard`) and the
> ed25519 signed-envelope helpers are exposed by `domains/interop` /
> `domains/interop-wire`, not this domain.

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
  a2a/mcp chain. The interop chain + signed-envelope helpers build on this, but
  live in `domains/interop` / `domains/interop-wire` (governance declares only
  the `InteropChain` port).
- `packages/vault` — `node-crypto`, `noop-vault`, `wave-secret-store`. The vault
  adapter wraps these.
- **Ported (moved behind the composer, not rewritten):**
  `conductor/governance-gate.ts` → `services/governance-gate.service.ts`;
  `conductor/governance-daemon.ts` → `adapters/daemon-kernel.adapter.ts`;
  `network/governance-ports.ts` → folded into `ts-kernel`/`interop` wiring;
  `a2a/rate-limiter.service.ts` → `domains/interop/middleware/rate-limit.middleware.ts`
  (the rate-limit/ext-authz/interop middleware landed in `domains/interop`);
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

1. **Ports first** (`ports/*`) — lock the seams the other 14 domains wire to:
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
5. **Interop chain + middleware** — declared here as the `InteropChain` port; the
   concrete chain + `interop.middleware.ts` (+ internal-key gate) + `rate-limit` +
   `ext-authz` shipped in `domains/interop` (conflict #1). Verify fail-closed
   there (`domains/interop/__tests__/interop-chain.service.test.ts`).
6. **Secrets** — `vault.adapter.ts` + `secrets.service.ts` + `secret.repository.ts`;
   verify encryption roundtrip + missing-key → `down` (`secrets.test.ts`).
7. **Locks + approvals** — `work-lock.service.ts`, `approval.service.ts`.
8. **Composer + health** — `governance-module.ts`, `health.ts`, `index.ts` factory.
9. **Edges** — `routes/governance-approvals.routes.ts` +
   `routes/governance-secrets.routes.ts` + `mcp/governance-engine.ts` (+
   `mcp/governance-write-tools.ts`), registered via the in-proc engine wiring
   checklist and mounted under `/api/agent-os`.
10. **Wire into bootstrap** — `createGovernanceModule(deps)` in
    `bootstrap/container.ts`; mount routes via the `edge` route table; contribute
    to `/health` + `/api/agent-os/health`.

**Verification:** `pnpm test:contracts:agent-os`, `pnpm test:evals:agent-os`,
`pnpm check-types`, `cargo test` (recoder-governance golden vectors),
`scripts/verify-byok-e2e.sh` (secrets path).
