# S0 Security Hotfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three live vulnerabilities the enterprise-architecture fan-out found on `main` — unauthenticated A2A bridge token, sandbox IDOR (any authed user can operate any sandbox by id), and hardcoded secrets committed in `.mcp.json`.

**Architecture:** Each fix is independent and additive. Extract the bridge-token check into a pure, unit-testable module and require a configured secret with a constant-time compare (fail-closed). Add a per-request ownership guard to the Daytona sandbox routes using the `labels.userId` stamped at creation. Replace the three plaintext tokens in `.mcp.json` with `${ENV}` placeholders (matching the existing `GITHUB_TOKEN` line).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Express, `docker-backend` uses **vitest** (`import { describe, it, expect, vi } from 'vitest'`), `node:crypto` `timingSafeEqual`.

## Global Constraints

- `docker-backend` test runner is **vitest**; run from `docker-backend/`: `pnpm test` or `npx vitest run <path>`.
- Import specifiers inside `docker-backend/src` use the `.js` extension (ESM), e.g. `from './bridge-auth.js'`.
- Error helpers: `sendError(res, createError(ErrorCode.X, msg))` / `sendSuccess(res, data)` from `../errors/index.js`. Valid codes include `SERVICE_UNAVAILABLE`, `AUTHZ_PROJECT_ACCESS_DENIED`, `INTERNAL_ERROR`, `VALIDATION_ERROR` (there is **no** `FORBIDDEN` / `EXTERNAL_SERVICE_ERROR` code).
- Never log secret values. No `console.log`.
- Fail-safe: missing required secret => deny (never allow).
- Rotation of the exposed tokens is an **operator action** (documented in Task 3); the code change alone does not undo prior exposure.

---

### Task 1: A2A bridge-token authentication (fail-closed, constant-time)

**Files:**
- Create: `docker-backend/src/a2a/bridge-auth.ts`
- Create (test): `docker-backend/src/a2a/bridge-auth.test.ts`
- Modify: `docker-backend/src/a2a-gateway.ts:897-902` (`verifyBridgeToken`)

**Interfaces:**
- Produces: `verifyBridgeBearer(bearerToken: string, expectedToken: string | undefined): BridgeAuthResult` and `extractBearerToken(authHeader: string): string`, where `type BridgeAuthResult = { ok: true } | { ok: false; status: number; error: string }`.
- Consumes: existing `verifyBridgeToken(req)` in `a2a-gateway.ts` will call these; its return shape (`{ ok: true } | { ok: false; status; error }`) is unchanged, so all call sites keep working.

- [ ] **Step 1: Write the failing test**

Create `docker-backend/src/a2a/bridge-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractBearerToken, verifyBridgeBearer } from './bridge-auth.js';

describe('extractBearerToken', () => {
  it('extracts the token from a Bearer header (case-insensitive)', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    expect(extractBearerToken('bearer abc123')).toBe('abc123');
  });
  it('returns empty string when no bearer token is present', () => {
    expect(extractBearerToken('')).toBe('');
    expect(extractBearerToken('Basic xyz')).toBe('');
  });
});

describe('verifyBridgeBearer', () => {
  it('denies with 503 when no expected token is configured (fail-closed)', () => {
    expect(verifyBridgeBearer('anything', undefined)).toEqual({
      ok: false, status: 503, error: 'Bridge auth not configured',
    });
    expect(verifyBridgeBearer('anything', '')).toEqual({
      ok: false, status: 503, error: 'Bridge auth not configured',
    });
  });
  it('denies with 401 when the bearer token is empty', () => {
    expect(verifyBridgeBearer('', 'secret')).toEqual({
      ok: false, status: 401, error: 'Unauthorized bridge token',
    });
  });
  it('denies with 401 when the token does not match', () => {
    expect(verifyBridgeBearer('wrong', 'secret')).toEqual({
      ok: false, status: 401, error: 'Unauthorized bridge token',
    });
  });
  it('denies mismatched-length tokens without throwing', () => {
    expect(verifyBridgeBearer('short', 'a-much-longer-secret')).toEqual({
      ok: false, status: 401, error: 'Unauthorized bridge token',
    });
  });
  it('allows an exact match', () => {
    expect(verifyBridgeBearer('secret', 'secret')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd docker-backend && npx vitest run src/a2a/bridge-auth.test.ts`
Expected: FAIL — `Failed to resolve import "./bridge-auth.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `docker-backend/src/a2a/bridge-auth.ts`:

```typescript
import { timingSafeEqual } from 'node:crypto';

export type BridgeAuthResult = { ok: true } | { ok: false; status: number; error: string };

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authHeader: string): string {
  const header = String(authHeader || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

/**
 * Verify a bridge bearer token against the configured expected token.
 * Fail-closed: if no expected token is configured, deny (503). Comparison is
 * constant-time and length-safe.
 */
export function verifyBridgeBearer(
  bearerToken: string,
  expectedToken: string | undefined,
): BridgeAuthResult {
  if (!expectedToken) return { ok: false, status: 503, error: 'Bridge auth not configured' };
  if (!bearerToken) return { ok: false, status: 401, error: 'Unauthorized bridge token' };
  const provided = Buffer.from(bearerToken);
  const expected = Buffer.from(expectedToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized bridge token' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd docker-backend && npx vitest run src/a2a/bridge-auth.test.ts`
Expected: PASS (all 8 assertions).

- [ ] **Step 5: Wire the extracted check into the gateway**

In `docker-backend/src/a2a-gateway.ts`, add near the top imports:

```typescript
import { extractBearerToken, verifyBridgeBearer } from './a2a/bridge-auth.js';
```

Replace the body of `verifyBridgeToken` (lines 897-902) with:

```typescript
function verifyBridgeToken(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const bearerToken = extractBearerToken(String(req.header('authorization') || ''));
  return verifyBridgeBearer(bearerToken, process.env.RECODER_A2A_BRIDGE_TOKEN);
}
```

- [ ] **Step 6: Verify types compile**

Run: `cd docker-backend && npx tsc --noEmit 2>&1 | grep -E "a2a-gateway|bridge-auth" || echo "no new type errors in touched files"`
Expected: `no new type errors in touched files`.

- [ ] **Step 7: Document the new env var**

Add to `docker-backend/.env.example` (create the line if the file exists; if not, skip and note in the commit body):

```
# Shared secret A2A bridge workers must present as `Authorization: Bearer <token>`.
# REQUIRED for the bridge to accept any request — unset = fail-closed (503).
RECODER_A2A_BRIDGE_TOKEN=
```

- [ ] **Step 8: Commit**

```bash
git add docker-backend/src/a2a/bridge-auth.ts docker-backend/src/a2a/bridge-auth.test.ts docker-backend/src/a2a-gateway.ts docker-backend/.env.example
git commit -m "fix(a2a): bridge token must match configured secret (fail-closed, constant-time)

verifyBridgeToken previously accepted ANY non-empty bearer token. Now
requires RECODER_A2A_BRIDGE_TOKEN and compares with timingSafeEqual;
unset secret denies (503)."
```

---

### Task 2: Daytona sandbox ownership guard (close the IDOR)

**Files:**
- Modify: `docker-backend/src/routes/daytona-sandbox.routes.ts` (add helper + guard the 9 by-`:sandboxId` handlers)
- Create (test): `docker-backend/src/routes/daytona-sandbox.ownership.test.ts`

**Interfaces:**
- Consumes: `getDaytonaClient().getSandbox(sandboxId): Promise<DaytonaSandboxInfo>` where `DaytonaSandboxInfo.labels?: Record<string,string>`; `createSandbox` already stamps `labels.userId = req.userId` (line 55). `AuthenticatedRequest.userId?: string`.
- Produces: `assertSandboxOwnership(client, sandboxId, userId): Promise<{ ok: true } | { ok: false; status: number; error: string }>`.

**Context:** Every `/:sandboxId...` handler (`get`, `start`, `stop`, `delete`, `exec`, `files/write`, `files/read`, `preview`) currently passes `req.params.sandboxId` straight to the Daytona client with **no ownership check**. The `POST /api/daytona/sandbox` create handler (line 55) stamps `labels: { ...labels, userId: req.userId }`. The guard reads that label back.

- [ ] **Step 1: Write the failing test**

Create `docker-backend/src/routes/daytona-sandbox.ownership.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assertSandboxOwnership } from './daytona-sandbox.routes.js';

function clientReturning(labels: Record<string, string> | undefined) {
  return { getSandbox: async () => ({ id: 'sb1', labels }) } as any;
}

describe('assertSandboxOwnership', () => {
  it('allows when the sandbox userId label matches the caller', async () => {
    const result = await assertSandboxOwnership(clientReturning({ userId: 'u1' }), 'sb1', 'u1');
    expect(result).toEqual({ ok: true });
  });
  it('denies (403) when the sandbox belongs to another user', async () => {
    const result = await assertSandboxOwnership(clientReturning({ userId: 'u2' }), 'sb1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
  it('denies (403) when the sandbox has no userId label (unowned/legacy)', async () => {
    const result = await assertSandboxOwnership(clientReturning(undefined), 'sb1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
  it('denies (401) when the caller has no userId', async () => {
    const result = await assertSandboxOwnership(clientReturning({ userId: 'u1' }), 'sb1', undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd docker-backend && npx vitest run src/routes/daytona-sandbox.ownership.test.ts`
Expected: FAIL — `assertSandboxOwnership` is not exported.

- [ ] **Step 3: Add the ownership helper (exported)**

In `docker-backend/src/routes/daytona-sandbox.routes.ts`, after the imports and before `createDaytonaSandboxRouter`, add:

```typescript
export type OwnershipResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Verify the caller owns the sandbox by comparing the `userId` label stamped at
 * creation. Fail-closed: no caller userId, missing label, or mismatch => deny.
 */
export async function assertSandboxOwnership(
  client: { getSandbox: (id: string) => Promise<{ labels?: Record<string, string> }> },
  sandboxId: string,
  userId: string | undefined,
): Promise<OwnershipResult> {
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };
  let ownerId: string | undefined;
  try {
    const sandbox = await client.getSandbox(sandboxId);
    ownerId = sandbox.labels?.userId;
  } catch {
    return { ok: false, status: 404, error: 'Sandbox not found' };
  }
  if (ownerId !== userId) {
    return { ok: false, status: 403, error: 'You do not have access to this sandbox' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd docker-backend && npx vitest run src/routes/daytona-sandbox.ownership.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Apply the guard to every `/:sandboxId` handler**

For each handler that uses `req.params.sandboxId` (the `get`, `start`, `stop`, `delete`, `exec`, `files/write`, `files/read`, `preview` routes), insert this block immediately after the `isDaytonaConfigured()` check and before the first use of the sandbox id. Example for the `exec` handler (line ~139):

```typescript
    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }
```

Apply the identical block to: `GET /:sandboxId`, `POST /:sandboxId/start`, `POST /:sandboxId/stop`, `DELETE /:sandboxId`, `POST /:sandboxId/exec`, `POST /:sandboxId/files/write`, `GET /:sandboxId/files/read`, `GET /:sandboxId/preview`. (The list `GET /api/daytona/sandbox` and create `POST /api/daytona/sandbox` do **not** take a sandboxId and are unchanged.)

- [ ] **Step 6: Verify types compile**

Run: `cd docker-backend && npx tsc --noEmit 2>&1 | grep "daytona-sandbox.routes" || echo "no new type errors"`
Expected: `no new type errors`.

- [ ] **Step 7: Commit**

```bash
git add docker-backend/src/routes/daytona-sandbox.routes.ts docker-backend/src/routes/daytona-sandbox.ownership.test.ts
git commit -m "fix(sandbox): enforce per-user ownership on Daytona sandbox by-id routes

Any authenticated user could get/exec/delete/read any sandbox by id
(IDOR). Guard every /:sandboxId handler against the userId label stamped
at creation; fail-closed on missing label or caller."
```

---

### Task 3: Remove hardcoded secrets from `.mcp.json`

**Files:**
- Modify: `.mcp.json:41-44`

**Context:** Lines 42-44 contain live plaintext `DAYTONA_API_KEY`, `RECODER_API_TOKEN`, `RECODER_SESSION_TOKEN`. Line 23 already shows the correct pattern: `"GITHUB_TOKEN": "${GITHUB_TOKEN}"`. There is no unit test for a config file; verification is a grep + the repo's secret-scan pre-commit hook.

- [ ] **Step 1: Replace the three plaintext values with env placeholders**

In `.mcp.json`, change lines 42-44 from:

```json
        "DAYTONA_API_KEY": "dyt_8532c63d57a211830b617731b30787d913870bfc0d82479a3ad6ff6e916e1946",
        "RECODER_API_TOKEN": "TW4RckaW72UaCulXixoDHDY6czsECP2u",
        "RECODER_SESSION_TOKEN": "Y6TPCFnShWjnHFMBZPInv3nTOOUoQX3Z"
```

to:

```json
        "DAYTONA_API_KEY": "${DAYTONA_API_KEY}",
        "RECODER_API_TOKEN": "${RECODER_API_TOKEN}",
        "RECODER_SESSION_TOKEN": "${RECODER_SESSION_TOKEN}"
```

- [ ] **Step 2: Verify no plaintext secrets remain**

Run: `grep -nE '"(DAYTONA_API_KEY|RECODER_API_TOKEN|RECODER_SESSION_TOKEN)"\s*:\s*"\$\{' .mcp.json && ! grep -qE 'dyt_[0-9a-f]{16}|TW4RckaW|Y6TPCFn' .mcp.json && echo "CLEAN"`
Expected: prints the three placeholder lines then `CLEAN`.

- [ ] **Step 3: Commit**

```bash
git add .mcp.json
git commit -m "security(mcp): replace hardcoded tokens in .mcp.json with env placeholders

DAYTONA_API_KEY / RECODER_API_TOKEN / RECODER_SESSION_TOKEN were committed
in plaintext. Now sourced from env like GITHUB_TOKEN. NOTE: these tokens are
in git history and MUST be rotated out-of-band (operator action)."
```

- [ ] **Step 4: Operator follow-up (not a code step — record, do not fake)**

Record in the PR/handoff that these three tokens are exposed in git history and **must be rotated** by the operator: Daytona API key (regenerate on the Daytona control plane), `RECODER_API_TOKEN` + `RECODER_SESSION_TOKEN` (reissue). Cross-link the existing "secrets in git history" bd issue. Do not claim the exposure is remediated by the code change alone.

---

## Self-Review

- **Spec coverage:** Task 1 ⇒ S0 vuln #1 (`verifyBridgeToken`); Task 2 ⇒ S0 vuln #2 (sandbox IDOR); Task 3 ⇒ S0 vuln #3 (`.mcp.json` secrets). All three S0 items covered.
- **Placeholder scan:** none — every code step shows real code and exact commands.
- **Type consistency:** `BridgeAuthResult` / `OwnershipResult` shapes match their call sites; `assertSandboxOwnership` signature is identical in test and impl; `ErrorCode` values used all exist per the Global Constraints.
- **Verification full-suite:** after all tasks, run `cd docker-backend && pnpm test` and confirm no regressions in existing a2a/sandbox tests.
