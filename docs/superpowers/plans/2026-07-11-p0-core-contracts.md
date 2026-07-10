# P0 — Core Contracts (Tenancy / Principal / Audit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the additive, typed foundation the enterprise roadmap depends on — `TenantContext`, `Principal`, `AuditEnvelope`, `Role`/`Permission`, and residency/entitlement value types — in `packages/agent-os`, plus optional `tenant?`/`principal?` fields on existing domain records and a `resolveTenantContext()` seam. **Zero behavior change:** all new fields are optional; the EMBEDDED desktop path resolves to `LOCAL_TENANT` + `SYSTEM_PRINCIPAL`.

**Architecture:** Follow the established `packages/agent-os` contract pattern exactly — immutable `type` definitions, `*Enum` constants, guard functions, and `transition*`/pure helper functions, exported through barrels. New contracts are pure data + pure functions; no I/O, no runtime coupling. This is P0 of the desktop-first enterprise blueprint (`docs/superpowers/specs/2026-07-11-recoder-desktop-enterprise-architecture-design.md`, §5 Phase 0, §6 D1/D5/D7).

**Tech Stack:** TypeScript ESM, `packages/agent-os` builds with `tsup`, tests use **`node:test` + `tsx`** (`import test from 'node:test'; import assert from 'node:assert/strict'`), strict mode on, `verbatimModuleSyntax: true` (so `import type` for type-only imports).

## Global Constraints

- Test runner for `packages/agent-os`: `cd packages/agent-os && npm test` (= `node --test --import tsx src/**/*.test.ts`). Run a single file: `node --test --import tsx src/domain/<file>.test.ts`.
- `verbatimModuleSyntax: true` — type-only imports MUST use `import type { X }`.
- Contracts are **immutable**: use `type`, spread for updates, never mutate inputs. New fields on existing records are **optional** (`?:`) — no migration, no behavior change.
- Barrel exports: add every new domain file to `packages/agent-os/src/domain/index.ts`.
- Cross-package contract tests live at repo root `tests/contracts/agent-os/*.test.ts`, run with `pnpm test:contracts:agent-os`.
- Sentinels: `LOCAL_TENANT` (embedded single-tenant) and `SYSTEM_PRINCIPAL` (backend/internal actor) are the degrade-safe defaults everywhere.
- Fail-closed default: an unresolved principal is `SYSTEM_PRINCIPAL` only inside trusted internal paths; request-derived resolution that fails must NOT silently become an admin (see `resolveTenantContext` semantics in Task 5).

---

### Task 1: TenantContext + Principal value types

**Files:**
- Create: `packages/agent-os/src/domain/tenant-context.ts`
- Create (test): `packages/agent-os/src/domain/tenant-context.test.ts`
- Modify: `packages/agent-os/src/domain/index.ts`

**Interfaces:**
- Produces: `type TenantContext`, `type Principal`, `type PrincipalKind`, const `LOCAL_TENANT: TenantContext`, const `SYSTEM_PRINCIPAL: Principal`, `isLocalTenant(ctx): boolean`, `withResidency(ctx, region): TenantContext`.

- [ ] **Step 1: Write the failing test**

Create `packages/agent-os/src/domain/tenant-context.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_TENANT,
  SYSTEM_PRINCIPAL,
  isLocalTenant,
  withResidency,
  type TenantContext,
} from './tenant-context';

test('LOCAL_TENANT is the embedded single-tenant sentinel', () => {
  assert.equal(LOCAL_TENANT.tenantId, 'local');
  assert.equal(LOCAL_TENANT.orgId, 'local');
  assert.equal(isLocalTenant(LOCAL_TENANT), true);
});

test('SYSTEM_PRINCIPAL is the internal actor', () => {
  assert.equal(SYSTEM_PRINCIPAL.kind, 'system');
  assert.equal(SYSTEM_PRINCIPAL.principalId, 'system');
});

test('a hosted tenant context is not the local sentinel', () => {
  const ctx: TenantContext = { tenantId: 't1', orgId: 'org-1' };
  assert.equal(isLocalTenant(ctx), false);
});

test('withResidency returns a new context, never mutates', () => {
  const ctx: TenantContext = { tenantId: 't1', orgId: 'org-1' };
  const pinned = withResidency(ctx, 'eu-central-1');
  assert.equal(pinned.residencyRegion, 'eu-central-1');
  assert.equal(ctx.residencyRegion, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-os && node --test --import tsx src/domain/tenant-context.test.ts`
Expected: FAIL — cannot find module `./tenant-context`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent-os/src/domain/tenant-context.ts`:

```typescript
/**
 * TenantContext — the tenancy + residency dimension carried through every
 * control-plane operation. In EMBEDDED (desktop solo) mode this resolves to
 * LOCAL_TENANT; in SELF_HOST mode it is derived from the tenant-scoped JWT.
 */
export type TenantContext = {
  tenantId: string;
  orgId: string;
  /** Region the tenant's data must stay in (data residency). */
  residencyRegion?: string;
  /** Optional data-classification hint for DLP/retention. */
  dataClassification?: string;
};

export type PrincipalKind = 'user' | 'agent' | 'service' | 'system';

/**
 * Principal — the authenticated actor performing an action. Never invented by a
 * runtime; derived from verified claims (SELF_HOST) or the local operator
 * (EMBEDDED). `scopes` are backend-decided; the desktop only reflects them.
 */
export type Principal = {
  principalId: string;
  kind: PrincipalKind;
  /** Org the principal is acting within (matches TenantContext.orgId). */
  orgId: string;
  /** Backend-decided permission scopes; empty = no privileges. */
  scopes: readonly string[];
  displayName?: string;
};

/** Embedded single-tenant sentinel — no external identity required. */
export const LOCAL_TENANT: TenantContext = { tenantId: 'local', orgId: 'local' };

/** Internal/backend actor for system-initiated operations. */
export const SYSTEM_PRINCIPAL: Principal = {
  principalId: 'system',
  kind: 'system',
  orgId: 'local',
  scopes: [],
};

export function isLocalTenant(ctx: TenantContext): boolean {
  return ctx.tenantId === LOCAL_TENANT.tenantId && ctx.orgId === LOCAL_TENANT.orgId;
}

/** Return a new context pinned to a residency region. Immutable. */
export function withResidency(ctx: TenantContext, region: string): TenantContext {
  return { ...ctx, residencyRegion: region };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-os && node --test --import tsx src/domain/tenant-context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add barrel export**

In `packages/agent-os/src/domain/index.ts`, add (alphabetical with the other `export *` lines):

```typescript
export * from './tenant-context';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-os/src/domain/tenant-context.ts packages/agent-os/src/domain/tenant-context.test.ts packages/agent-os/src/domain/index.ts
git commit -m "feat(agent-os): TenantContext + Principal value types with LOCAL_TENANT/SYSTEM_PRINCIPAL sentinels"
```

---

### Task 2: RBAC — Role / Permission with deny-by-default matrix

**Files:**
- Create: `packages/agent-os/src/domain/rbac.ts`
- Create (test): `packages/agent-os/src/domain/rbac.test.ts`
- Modify: `packages/agent-os/src/domain/index.ts`

**Interfaces:**
- Consumes: `Principal` from `./tenant-context`.
- Produces: `type Role` (`'owner' | 'admin' | 'member' | 'viewer'`), const `RoleEnum`, `type Permission` (string union), `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>`, `permissionsForRoles(roles): Set<Permission>`, `principalCan(principal, permission): boolean`.

**Context (§6 D5):** This is the ONE canonical role model; the divergent `enterprise/organization.ts` and `distribution/channels/org` models become adapters in a later task. Deny-by-default: a permission not granted by any role is denied.

- [ ] **Step 1: Write the failing test**

Create `packages/agent-os/src/domain/rbac.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { principalCan, permissionsForRoles, ROLE_PERMISSIONS, RoleEnum } from './rbac';
import type { Principal } from './tenant-context';

function principal(scopes: string[]): Principal {
  return { principalId: 'u1', kind: 'user', orgId: 'org-1', scopes };
}

test('owner has every permission an admin has (superset)', () => {
  const owner = permissionsForRoles([RoleEnum.Owner]);
  for (const p of ROLE_PERMISSIONS[RoleEnum.Admin]) assert.equal(owner.has(p), true);
});

test('viewer cannot approve — deny by default', () => {
  const viewer = permissionsForRoles([RoleEnum.Viewer]);
  assert.equal(viewer.has('approval.decide'), false);
});

test('principalCan reads scopes directly (backend-decided)', () => {
  assert.equal(principalCan(principal(['approval.decide']), 'approval.decide'), true);
  assert.equal(principalCan(principal([]), 'approval.decide'), false);
});

test('an unknown permission is always denied', () => {
  const admin = permissionsForRoles([RoleEnum.Admin]);
  assert.equal(admin.has('nonexistent.permission' as never), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-os && node --test --import tsx src/domain/rbac.test.ts`
Expected: FAIL — cannot find module `./rbac`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent-os/src/domain/rbac.ts`:

```typescript
import type { Principal } from './tenant-context';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const RoleEnum = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
  Viewer: 'viewer',
} as const satisfies Record<string, Role>;

/**
 * Permission — a coarse capability string. Kept small in P0; extended as
 * subsystems land. Deny-by-default: anything not listed under a role is denied.
 */
export type Permission =
  | 'workspace.read'
  | 'workspace.write'
  | 'run.start'
  | 'approval.decide'
  | 'memory.write'
  | 'billing.manage'
  | 'org.manage'
  | 'audit.read';

const VIEWER: readonly Permission[] = ['workspace.read', 'audit.read'];
const MEMBER: readonly Permission[] = [...VIEWER, 'workspace.write', 'run.start', 'memory.write'];
const ADMIN: readonly Permission[] = [...MEMBER, 'approval.decide', 'org.manage'];
const OWNER: readonly Permission[] = [...ADMIN, 'billing.manage'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: OWNER,
  admin: ADMIN,
  member: MEMBER,
  viewer: VIEWER,
};

/** Union of all permissions granted by the given roles. */
export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) out.add(p);
  return out;
}

/** Whether a principal's backend-decided scopes include the permission. */
export function principalCan(principal: Principal, permission: Permission): boolean {
  return principal.scopes.includes(permission);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-os && node --test --import tsx src/domain/rbac.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add barrel export**

In `packages/agent-os/src/domain/index.ts` add:

```typescript
export * from './rbac';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-os/src/domain/rbac.ts packages/agent-os/src/domain/rbac.test.ts packages/agent-os/src/domain/index.ts
git commit -m "feat(agent-os): canonical Role/Permission model with deny-by-default matrix"
```

---

### Task 3: AuditEnvelope + wrapAudited helper

**Files:**
- Create: `packages/agent-os/src/domain/audit-envelope.ts`
- Create (test): `packages/agent-os/src/domain/audit-envelope.test.ts`
- Modify: `packages/agent-os/src/domain/index.ts`

**Interfaces:**
- Consumes: `TenantContext`, `Principal` from `./tenant-context`.
- Produces: `type AuditEnvelope`, `makeAuditEnvelope(input): AuditEnvelope`, `type Audited<T>` = `{ next: T; audit: AuditEnvelope }`, `withAudit<T>(next, audit): Audited<T>`.

**Context (§3.3):** Audit is intrinsic — the same helper that computes a state change emits its envelope. The hash-chain (prevHash/seq/signature) is added in Phase 3; P0 defines the envelope shape + a deterministic constructor (no `Date.now()` inside the pure core — caller passes `now`).

- [ ] **Step 1: Write the failing test**

Create `packages/agent-os/src/domain/audit-envelope.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { makeAuditEnvelope, withAudit } from './audit-envelope';
import { LOCAL_TENANT, SYSTEM_PRINCIPAL } from './tenant-context';

test('makeAuditEnvelope captures actor, tenant, action and target', () => {
  const env = makeAuditEnvelope({
    tenant: LOCAL_TENANT,
    principal: SYSTEM_PRINCIPAL,
    action: 'workspace.transition',
    targetId: 'ws-1',
    now: '2026-07-11T00:00:00.000Z',
    outcome: 'allowed',
  });
  assert.equal(env.action, 'workspace.transition');
  assert.equal(env.targetId, 'ws-1');
  assert.equal(env.orgId, 'local');
  assert.equal(env.principalId, 'system');
  assert.equal(env.outcome, 'allowed');
  assert.equal(env.recordedAt, '2026-07-11T00:00:00.000Z');
});

test('withAudit pairs a new state with its envelope', () => {
  const env = makeAuditEnvelope({
    tenant: LOCAL_TENANT, principal: SYSTEM_PRINCIPAL,
    action: 'x', targetId: 't', now: '2026-07-11T00:00:00.000Z', outcome: 'allowed',
  });
  const result = withAudit({ id: 't', state: 'ready' }, env);
  assert.deepEqual(result.next, { id: 't', state: 'ready' });
  assert.equal(result.audit, env);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-os && node --test --import tsx src/domain/audit-envelope.test.ts`
Expected: FAIL — cannot find module `./audit-envelope`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent-os/src/domain/audit-envelope.ts`:

```typescript
import type { Principal, TenantContext } from './tenant-context';

export type AuditOutcome = 'allowed' | 'denied' | 'error';

/**
 * AuditEnvelope — the tamper-evident record of one control-plane mutation.
 * P0 defines the shape + a deterministic constructor; the hash-chain fields
 * (prevHash/seq/signature) are populated by the ledger in Phase 3.
 */
export type AuditEnvelope = {
  tenantId: string;
  orgId: string;
  principalId: string;
  principalKind: Principal['kind'];
  action: string;
  targetId: string;
  outcome: AuditOutcome;
  recordedAt: string;
  /** Hash of the operation payload (never raw secret values). Filled in Phase 3. */
  payloadHash?: string;
  metadata?: Record<string, unknown>;
};

export type MakeAuditEnvelopeInput = {
  tenant: TenantContext;
  principal: Principal;
  action: string;
  targetId: string;
  outcome: AuditOutcome;
  /** Caller-supplied timestamp — keeps the core pure/deterministic. */
  now: string;
  payloadHash?: string;
  metadata?: Record<string, unknown>;
};

export function makeAuditEnvelope(input: MakeAuditEnvelopeInput): AuditEnvelope {
  return {
    tenantId: input.tenant.tenantId,
    orgId: input.tenant.orgId,
    principalId: input.principal.principalId,
    principalKind: input.principal.kind,
    action: input.action,
    targetId: input.targetId,
    outcome: input.outcome,
    recordedAt: input.now,
    payloadHash: input.payloadHash,
    metadata: input.metadata,
  };
}

export type Audited<T> = { next: T; audit: AuditEnvelope };

/** Pair a computed next-state with its audit envelope. */
export function withAudit<T>(next: T, audit: AuditEnvelope): Audited<T> {
  return { next, audit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-os && node --test --import tsx src/domain/audit-envelope.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add barrel export**

In `packages/agent-os/src/domain/index.ts` add:

```typescript
export * from './audit-envelope';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-os/src/domain/audit-envelope.ts packages/agent-os/src/domain/audit-envelope.test.ts packages/agent-os/src/domain/index.ts
git commit -m "feat(agent-os): AuditEnvelope contract + deterministic makeAuditEnvelope/withAudit"
```

---

### Task 4: Optional tenant/principal on Workspace + resolveTenantContext seam

**Files:**
- Modify: `packages/agent-os/src/domain/workspace.ts` (add optional `tenant?`, `principalId?`)
- Create: `packages/agent-os/src/domain/resolve-tenant-context.ts`
- Create (test): `packages/agent-os/src/domain/resolve-tenant-context.test.ts`
- Modify: `packages/agent-os/src/domain/index.ts`

**Interfaces:**
- Consumes: `TenantContext`, `LOCAL_TENANT` from `./tenant-context`.
- Produces: `resolveTenantContext(input?): TenantContext`. Adds optional `tenant?: TenantContext` to the `Workspace` type (additive; existing records omit it and remain valid).

**Context (§6 D3):** `resolveTenantContext` is the single seam every subsystem uses. Fail-closed: if given a partial/invalid input it returns `LOCAL_TENANT` ONLY when explicitly in embedded mode; otherwise it throws so a SELF_HOST caller can never silently fall back to the local tenant.

- [ ] **Step 1: Write the failing test**

Create `packages/agent-os/src/domain/resolve-tenant-context.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTenantContext } from './resolve-tenant-context';
import { LOCAL_TENANT } from './tenant-context';

test('embedded mode with no claims resolves to LOCAL_TENANT', () => {
  assert.deepEqual(resolveTenantContext({ mode: 'embedded' }), LOCAL_TENANT);
});

test('self-host mode with valid claims resolves the tenant', () => {
  const ctx = resolveTenantContext({ mode: 'self_host', orgId: 'org-9', tenantId: 't-9' });
  assert.equal(ctx.orgId, 'org-9');
  assert.equal(ctx.tenantId, 't-9');
});

test('self-host mode WITHOUT an orgId throws (never silently falls back to local)', () => {
  assert.throws(() => resolveTenantContext({ mode: 'self_host' }), /orgId is required/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-os && node --test --import tsx src/domain/resolve-tenant-context.test.ts`
Expected: FAIL — cannot find module `./resolve-tenant-context`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent-os/src/domain/resolve-tenant-context.ts`:

```typescript
import { LOCAL_TENANT, type TenantContext } from './tenant-context';

export type ResolveTenantInput = {
  mode: 'embedded' | 'self_host';
  orgId?: string;
  tenantId?: string;
  residencyRegion?: string;
};

/**
 * The single seam every subsystem uses to obtain a TenantContext.
 * - embedded  -> LOCAL_TENANT (single operator, no external identity)
 * - self_host -> derived from verified claims; MISSING orgId is a hard error
 *   (fail-closed: a self-host request must never silently become the local tenant).
 */
export function resolveTenantContext(input?: ResolveTenantInput): TenantContext {
  if (!input || input.mode === 'embedded') return LOCAL_TENANT;
  if (!input.orgId) throw new Error('resolveTenantContext: orgId is required in self_host mode');
  return {
    tenantId: input.tenantId ?? input.orgId,
    orgId: input.orgId,
    residencyRegion: input.residencyRegion,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-os && node --test --import tsx src/domain/resolve-tenant-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the optional field to Workspace (additive)**

In `packages/agent-os/src/domain/workspace.ts`, add an import at the top:

```typescript
import type { TenantContext } from './tenant-context';
```

Then inside the `Workspace` type, add one optional field (e.g. after `metadata?`):

```typescript
  /** Tenancy binding. Absent on legacy/embedded records (resolves to LOCAL_TENANT). */
  tenant?: TenantContext;
```

`transitionWorkspace` already spreads `...workspace`, so `tenant` is preserved automatically — no logic change.

- [ ] **Step 6: Add a preservation test to the existing workspace behavior**

Append to `packages/agent-os/src/domain/workspace.test.ts` (create the file if it does not exist, with the standard header):

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import { transitionWorkspace, type Workspace } from './workspace';

test('transitionWorkspace preserves the optional tenant binding', () => {
  const ws: Workspace = {
    workspaceId: 'w1', spaceId: 's1', projectId: 'p1', taskId: 't1',
    runtimeId: 'claude_code', substrate: 'tmux_worktree', branch: 'b', baseRef: 'main',
    state: 'created', createdBy: 'u1', createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    tenant: { tenantId: 't-9', orgId: 'org-9' },
  };
  const next = transitionWorkspace(ws, 'setting_up', { now: '2026-07-11T00:01:00.000Z' });
  assert.deepEqual(next.tenant, { tenantId: 't-9', orgId: 'org-9' });
});
```

- [ ] **Step 7: Run the workspace + resolve tests**

Run: `cd packages/agent-os && node --test --import tsx src/domain/workspace.test.ts src/domain/resolve-tenant-context.test.ts`
Expected: PASS.

- [ ] **Step 8: Add barrel export + commit**

In `packages/agent-os/src/domain/index.ts` add `export * from './resolve-tenant-context';`, then:

```bash
git add packages/agent-os/src/domain/workspace.ts packages/agent-os/src/domain/workspace.test.ts packages/agent-os/src/domain/resolve-tenant-context.ts packages/agent-os/src/domain/resolve-tenant-context.test.ts packages/agent-os/src/domain/index.ts
git commit -m "feat(agent-os): resolveTenantContext seam + optional tenant binding on Workspace"
```

---

### Task 5: Cross-package contract test + type-check gate

**Files:**
- Create: `tests/contracts/agent-os/tenancy-audit.contract.test.ts`

**Interfaces:**
- Consumes the public barrel: `import { LOCAL_TENANT, SYSTEM_PRINCIPAL, makeAuditEnvelope, principalCan, resolveTenantContext, RoleEnum, permissionsForRoles } from '@recoder/agent-os'`.

**Context:** Root contract tests (`pnpm test:contracts:agent-os`) prove the new contracts are exported from the package entrypoint and compose. This is the release-gate check the spec's Phase 0 exit criteria references.

- [ ] **Step 1: Write the contract test**

Create `tests/contracts/agent-os/tenancy-audit.contract.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_TENANT,
  SYSTEM_PRINCIPAL,
  makeAuditEnvelope,
  permissionsForRoles,
  principalCan,
  resolveTenantContext,
  RoleEnum,
} from '@recoder/agent-os';

test('contract: enterprise core contracts are exported from the package entrypoint', () => {
  assert.equal(LOCAL_TENANT.orgId, 'local');
  assert.equal(SYSTEM_PRINCIPAL.kind, 'system');
  assert.equal(typeof resolveTenantContext, 'function');
  assert.equal(typeof principalCan, 'function');
});

test('contract: EMBEDDED resolution needs no org/SSO/DB and yields the local tenant', () => {
  assert.deepEqual(resolveTenantContext({ mode: 'embedded' }), LOCAL_TENANT);
});

test('contract: an owner role grants billing.manage; a viewer does not', () => {
  assert.equal(permissionsForRoles([RoleEnum.Owner]).has('billing.manage'), true);
  assert.equal(permissionsForRoles([RoleEnum.Viewer]).has('billing.manage'), false);
});

test('contract: an audit envelope is produced deterministically from tenant+principal', () => {
  const env = makeAuditEnvelope({
    tenant: LOCAL_TENANT, principal: SYSTEM_PRINCIPAL,
    action: 'run.start', targetId: 'r1', outcome: 'allowed', now: '2026-07-11T00:00:00.000Z',
  });
  assert.equal(env.orgId, 'local');
  assert.equal(env.recordedAt, '2026-07-11T00:00:00.000Z');
});
```

- [ ] **Step 2: Build the package so the entrypoint resolves**

Run: `cd packages/agent-os && npm run build`
Expected: `tsup` emits `dist/` with no errors.

- [ ] **Step 3: Run the contract test**

Run (from repo root): `pnpm test:contracts:agent-os`
Expected: PASS, including the four new `tenancy-audit.contract` tests.

- [ ] **Step 4: Type-check the package**

Run: `cd packages/agent-os && npm run check-types`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/contracts/agent-os/tenancy-audit.contract.test.ts
git commit -m "test(contracts): agent-os enterprise core contracts export + compose gate"
```

---

## Self-Review

- **Spec coverage:** Task 1 ⇒ TenantContext/Principal + sentinels (§5 P0 Core Contracts); Task 2 ⇒ RBAC one-model deny-by-default (§6 D5); Task 3 ⇒ AuditEnvelope (§3.3); Task 4 ⇒ optional tenant field + `resolveTenantContext` seam (§6 D3, fail-closed); Task 5 ⇒ contract-test release gate (P0 exit criteria). Entitlement/residency full value types and the Identity org-model promotion are intentionally deferred to the follow-on P0 plans (see below) to keep this plan one shippable, testable unit.
- **Placeholder scan:** none — every step has real code and exact commands.
- **Type consistency:** `Principal.scopes` typed `readonly string[]`; `principalCan` takes `Permission`; `RoleEnum` satisfies `Record<string, Role>`; `resolveTenantContext` input `mode` union matches the test. Barrel additions listed for every new file.
- **Behavior safety:** all new record fields optional; `transitionWorkspace` unchanged (spread preserves `tenant`); EMBEDDED path resolves with zero external deps — the Phase 0 invariant.

## Follow-on P0 plans (sequenced after this one)

Each is its own plan producing working, testable software:
1. **P0b — RuntimeProfile & boot switch** (`docker-backend`): frozen `RuntimeProfile` descriptor resolved once at boot, fails closed to SELF_HOST; route existing `if(env)` deployment checks through it; contract test asserting EMBEDDED needs no Postgres/Redis/SSO.
2. **P0c — Identity contract promotion** (`packages/agent-os`): promote Org/Membership/Seat/License/SsoConfig/ScimResource contracts; make `enterprise/organization.ts` + `distribution/channels/org` compile as adapters over the canonical `rbac.ts` model.
3. **P0d — Desktop Managed-Policy schema + key-custody runbook** (`apps/desktop` + docs): signed Managed Policy schema, ed25519 release-manifest/provenance format, and the KMS/HSM key-custody + rotation + compromise-recovery runbook (PD3) that gates Phase 1 signing.
