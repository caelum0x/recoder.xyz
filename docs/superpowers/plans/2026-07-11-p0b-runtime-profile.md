# P0b — RuntimeProfile & Boot Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a single, frozen `RuntimeProfile` descriptor resolved once at boot from environment, so every subsystem reads deployment capabilities from one tested source instead of re-deriving them from scattered `if(process.env.X)` checks. Fails closed to `self_host` (never silently permissive). EMBEDDED needs no Postgres/Redis/SSO — proven by contract test.

**Architecture:** A pure resolver `resolveRuntimeProfile(env)` in `docker-backend/src/runtime-profile.ts` maps environment to a frozen `RuntimeProfile`. A memoized `getRuntimeProfile()` singleton resolves it once at boot. This is `docker-backend`-local (it reads deployment env like `REDIS_URL`); `packages/agent-os` stays runtime-agnostic. Spec: `docs/superpowers/specs/2026-07-11-recoder-desktop-enterprise-architecture-design.md` §6 D3.

**Tech Stack:** TypeScript ESM (`.js` import specifiers), **vitest** (`docker-backend`), pure functions. Reuses existing detectors: `isSoloMode(env)` (`conductor/solo-mode.ts`), `isStrictAuthMode(env)` (`auth-utils.ts`).

## Global Constraints

- `docker-backend` test runner is **vitest**: `cd docker-backend && npx vitest run <path>`.
- ESM `.js` import specifiers inside `docker-backend/src`.
- `resolveRuntimeProfile` MUST be **pure** (takes an env argument; no side effects) and return a **frozen** object (`Object.freeze`, deep-frozen for nested objects).
- **Fail-closed:** absent/ambiguous env resolves to `self_host` strictness — `mode: 'self_host'`, `multiTenant: true`, `requireApprovals: true`. `embedded` mode is entered ONLY when `RECODER_SOLO_MODE` is explicitly truthy.
- EMBEDDED invariant: a profile with only `RECODER_SOLO_MODE=1` set MUST have `distributedState: false`, `quotaBackend: 'in_process'`, `rateLimitBackend: 'in_process'`, `multiTenant: false` — i.e. needs no Postgres/Redis/SSO.
- Do NOT refactor the ~12 existing `if(env)` call sites in this plan — that is deferred incremental work. P0b establishes the descriptor + boot singleton only.
- Reuse existing detectors; do not reimplement solo/strict-auth detection.

---

### Task 1: RuntimeProfile descriptor + pure resolver

**Files:**
- Create: `docker-backend/src/runtime-profile.ts`
- Create (test): `docker-backend/src/runtime-profile.test.ts`

**Interfaces:**
- Consumes: `isSoloMode(env)` from `./conductor/solo-mode.js`; `isStrictAuthMode()` reads `process.env` internally so this resolver derives auth-strictness locally from the passed `env` for purity (see below).
- Produces: `type RuntimeMode = 'embedded' | 'self_host'`; `type StateBackend = 'in_process' | 'redis'`; `interface RuntimeProfile`; `resolveRuntimeProfile(env?: NodeJS.ProcessEnv): RuntimeProfile`.

- [ ] **Step 1: Write the failing test**

Create `docker-backend/src/runtime-profile.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveRuntimeProfile } from './runtime-profile.js';

describe('resolveRuntimeProfile', () => {
  it('enters embedded mode only when RECODER_SOLO_MODE is truthy', () => {
    const p = resolveRuntimeProfile({ RECODER_SOLO_MODE: '1' });
    expect(p.mode).toBe('embedded');
    expect(p.multiTenant).toBe(false);
    expect(p.requireApprovals).toBe(false);
  });

  it('EMBEDDED needs no Postgres/Redis/SSO (the core invariant)', () => {
    const p = resolveRuntimeProfile({ RECODER_SOLO_MODE: 'true' });
    expect(p.distributedState).toBe(false);
    expect(p.quotaBackend).toBe('in_process');
    expect(p.rateLimitBackend).toBe('in_process');
    expect(p.ssoRequired).toBe(false);
  });

  it('fails closed to self_host when nothing is set', () => {
    const p = resolveRuntimeProfile({});
    expect(p.mode).toBe('self_host');
    expect(p.multiTenant).toBe(true);
    expect(p.requireApprovals).toBe(true);
  });

  it('marks distributedState true when a database URL is present', () => {
    expect(resolveRuntimeProfile({ DATABASE_URL: 'postgres://x' }).distributedState).toBe(true);
    expect(resolveRuntimeProfile({ AGENT_OS_DATABASE_URL: 'postgres://y' }).distributedState).toBe(true);
    expect(resolveRuntimeProfile({}).distributedState).toBe(false);
  });

  it('uses redis quota/rate-limit backends when REDIS_URL is present', () => {
    const p = resolveRuntimeProfile({ REDIS_URL: 'redis://x' });
    expect(p.quotaBackend).toBe('redis');
    expect(p.rateLimitBackend).toBe('redis');
    const q = resolveRuntimeProfile({});
    expect(q.quotaBackend).toBe('in_process');
  });

  it('ssoRequired is opt-in via RECODER_SSO_REQUIRED (SSO enforcement lands later)', () => {
    expect(resolveRuntimeProfile({ RECODER_SSO_REQUIRED: 'true' }).ssoRequired).toBe(true);
    expect(resolveRuntimeProfile({}).ssoRequired).toBe(false);
  });

  it('returns a deeply frozen object (resolved once, never mutated)', () => {
    const p = resolveRuntimeProfile({ RECODER_SOLO_MODE: '1' });
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => { (p as unknown as { mode: string }).mode = 'x'; }).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd docker-backend && npx vitest run src/runtime-profile.test.ts`
Expected: FAIL — cannot resolve `./runtime-profile.js`.

- [ ] **Step 3: Write minimal implementation**

Create `docker-backend/src/runtime-profile.ts`:

```typescript
import { isSoloMode } from './conductor/solo-mode.js';

/** Deployment mode. `embedded` = desktop single-operator; `self_host` = team/VPC. */
export type RuntimeMode = 'embedded' | 'self_host';

/** Where quota + rate-limit state lives. */
export type StateBackend = 'in_process' | 'redis';

/**
 * RuntimeProfile — the single boot-time descriptor of deployment capabilities.
 * Every subsystem reads this instead of re-deriving deployment intent from
 * scattered `if(process.env.X)` checks. Fails closed to self_host strictness.
 * Frozen: resolved once at boot, never mutated. (Spec §6 D3.)
 */
export interface RuntimeProfile {
  mode: RuntimeMode;
  /** self_host is multi-tenant; embedded is single-tenant. */
  multiTenant: boolean;
  /** A durable/shared state store (Postgres) is available. Gates HA/leader-lease. */
  distributedState: boolean;
  /** Approvals are enforced (self_host); embedded permits solo auto-approval. */
  requireApprovals: boolean;
  /** SSO must be present. Opt-in until SSO enforcement lands (Phase 3). */
  ssoRequired: boolean;
  quotaBackend: StateBackend;
  rateLimitBackend: StateBackend;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Resolve the RuntimeProfile from an environment. Pure + fail-closed:
 * `embedded` is entered ONLY when RECODER_SOLO_MODE is explicitly truthy;
 * everything else defaults to self_host strictness.
 */
export function resolveRuntimeProfile(env: NodeJS.ProcessEnv = process.env): RuntimeProfile {
  const embedded = isSoloMode(env);
  const mode: RuntimeMode = embedded ? 'embedded' : 'self_host';
  const hasDatabase = Boolean(env.AGENT_OS_DATABASE_URL || env.DATABASE_URL);
  const hasRedis = Boolean(env.REDIS_URL || env.RECODER_A2A_REDIS_URL);
  const backend: StateBackend = hasRedis ? 'redis' : 'in_process';

  return Object.freeze({
    mode,
    multiTenant: !embedded,
    distributedState: hasDatabase,
    requireApprovals: !embedded,
    ssoRequired: isTruthy(env.RECODER_SSO_REQUIRED),
    quotaBackend: backend,
    rateLimitBackend: backend,
  });
}
```

- [ ] **Step 4: Confirm `isSoloMode` accepts an env arg**

Run: `grep -n "export function isSoloMode" docker-backend/src/conductor/solo-mode.ts`
Expected: a signature taking an env parameter (e.g. `isSoloMode(env: NodeJS.ProcessEnv = process.env)`). If it takes no argument, call it without one and instead derive `embedded` locally: `const embedded = isTruthy(env.RECODER_SOLO_MODE);` — report the deviation. (The detector was confirmed to read `RECODER_SOLO_MODE`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd docker-backend && npx vitest run src/runtime-profile.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add docker-backend/src/runtime-profile.ts docker-backend/src/runtime-profile.test.ts
git commit -m "feat(runtime): RuntimeProfile descriptor + pure fail-closed resolver

Single boot-time source of deployment capabilities (mode, multiTenant,
distributedState, requireApprovals, ssoRequired, quota/rateLimit backend).
Fails closed to self_host; EMBEDDED needs no Postgres/Redis/SSO. Frozen."
```

---

### Task 2: Boot-time memoized singleton + wiring

**Files:**
- Modify: `docker-backend/src/runtime-profile.ts` (add memoized `getRuntimeProfile()` + `resetRuntimeProfileForTest()`)
- Modify: `docker-backend/src/runtime-profile.test.ts` (add singleton tests)
- Modify: `docker-backend/src/server.ts` (resolve once at boot + log the mode)

**Interfaces:**
- Consumes: `resolveRuntimeProfile` from Task 1.
- Produces: `getRuntimeProfile(): RuntimeProfile` (memoized against `process.env`, resolved once); `resetRuntimeProfileForTest(): void` (test-only cache reset).

- [ ] **Step 1: Write the failing test**

Append to `docker-backend/src/runtime-profile.test.ts`:

```typescript
import { getRuntimeProfile, resetRuntimeProfileForTest } from './runtime-profile.js';

describe('getRuntimeProfile (boot singleton)', () => {
  it('resolves once and returns the same frozen instance', () => {
    resetRuntimeProfileForTest();
    const a = getRuntimeProfile();
    const b = getRuntimeProfile();
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('resetRuntimeProfileForTest forces re-resolution', () => {
    resetRuntimeProfileForTest();
    const a = getRuntimeProfile();
    resetRuntimeProfileForTest();
    const b = getRuntimeProfile();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd docker-backend && npx vitest run src/runtime-profile.test.ts`
Expected: FAIL — `getRuntimeProfile` / `resetRuntimeProfileForTest` not exported.

- [ ] **Step 3: Add the singleton to runtime-profile.ts**

Append to `docker-backend/src/runtime-profile.ts`:

```typescript
let cachedProfile: RuntimeProfile | null = null;

/** The boot-time RuntimeProfile, resolved once from process.env and memoized. */
export function getRuntimeProfile(): RuntimeProfile {
  if (cachedProfile === null) {
    cachedProfile = resolveRuntimeProfile(process.env);
  }
  return cachedProfile;
}

/** Test-only: clear the memoized profile so the next getRuntimeProfile re-resolves. */
export function resetRuntimeProfileForTest(): void {
  cachedProfile = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd docker-backend && npx vitest run src/runtime-profile.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Resolve once at boot and log the mode**

In `docker-backend/src/server.ts`, add the import near the other top-of-file imports:

```typescript
import { getRuntimeProfile } from './runtime-profile.js';
```

Then, inside the existing `validateEnvironment()` function (server.ts ~line 299-360) — at its end, before it returns — add a boot log so the resolved mode is visible and the profile is resolved once at startup:

```typescript
  const runtimeProfile = getRuntimeProfile();
  logger.info(
    {
      mode: runtimeProfile.mode,
      multiTenant: runtimeProfile.multiTenant,
      distributedState: runtimeProfile.distributedState,
      quotaBackend: runtimeProfile.quotaBackend,
    },
    'Resolved RuntimeProfile at boot',
  );
```

(Use the existing `logger` in server.ts. If `validateEnvironment` is not the boot entry, place the two statements at the top of the bootstrap/startup function instead — locate it with `grep -n "function validateEnvironment\|app.listen(" docker-backend/src/server.ts` and put the log in whichever runs at startup. Do NOT refactor the existing env checks in this task.)

- [ ] **Step 6: Verify types + no regression**

Run: `cd docker-backend && npx tsc --noEmit 2>&1 | grep -E "runtime-profile|server.ts" || echo "no new type errors in touched files"`
Expected: `no new type errors in touched files`.
Run: `cd docker-backend && npx vitest run src/runtime-profile.test.ts src/conductor/solo-mode.test.ts`
Expected: PASS (runtime-profile 9 + existing solo-mode tests all green).

- [ ] **Step 7: Commit**

```bash
git add docker-backend/src/runtime-profile.ts docker-backend/src/runtime-profile.test.ts docker-backend/src/server.ts
git commit -m "feat(runtime): resolve RuntimeProfile once at boot (memoized singleton) + log mode"
```

---

## Self-Review

- **Spec coverage:** Task 1 ⇒ the frozen fail-closed descriptor + resolver with all D3 fields (mode, multiTenant, distributedState, requireApprovals, ssoRequired, quota/rateLimit backend) and the EMBEDDED-needs-nothing invariant; Task 2 ⇒ resolved-once boot singleton + startup wiring. Refactoring the 12 existing `if(env)` call sites is explicitly deferred (spec's "no big-bang", incremental follow-up).
- **Placeholder scan:** none — real code + exact commands; Step 4/Step 5 include a concrete fallback + locate command for the two integration points that depend on existing signatures.
- **Type consistency:** `RuntimeMode`/`StateBackend`/`RuntimeProfile` used identically across resolver, singleton, and tests; `getRuntimeProfile`/`resetRuntimeProfileForTest` signatures match test usage.
- **Fail-closed:** default (empty env) → self_host + multiTenant + requireApprovals; embedded only on explicit `RECODER_SOLO_MODE`. Matches Global Constraints.

## Follow-on (deferred, tracked separately)

- **P0b-2 (incremental):** migrate the 12 mapped `if(env)` decision points (service-container Postgres driver, server.ts Redis A2A init, auth strict mode, Daytona gating, A2A consumer) to read `getRuntimeProfile()` — one consumer per PR, behind existing tests.
