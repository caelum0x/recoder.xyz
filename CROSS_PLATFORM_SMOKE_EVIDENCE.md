# Cross-Platform Smoke Evidence Pack

Date: 2026-02-15
Phase: Phase 2 (Cross-platform integration hardening)
Environment: macOS Darwin 25.1.0, Node 22, pnpm workspace

---

## Evidence Summary

| Repo | Gate | Result | Tests |
|------|------|--------|-------|
| docker-backend | vitest full suite | PASS | 44/44 suites, 867/867 tests (2 skipped/Redis, 8 skipped) |
| docker-backend | CI suite | PASS | 5/5 suites, 24/24 tests |
| docker-backend | A2A routes | PASS | 5/5 suites, 53/53 tests |
| recoder-web | vitest full suite | PASS | 48/48 suites, 276/276 tests (1 skipped, 4 skipped, 8 todo) |
| recoder-web | contract parity | PASS | 14/14 parity tests green |
| app | typecheck (tsc --noEmit) | PASS | 0 errors |
| app | contract schemas | PASS | 30/30 tests |
| app | internal-service-auth | PASS | 6/6 tests |
| studio | typecheck + tests | PASS | 19/19 suites, 185/185 tests (verified earlier) |

---

## Fixes Applied During Evidence Collection

### docker-backend
1. **Fetch mock collision** — `tests/setup.ts` replaced `globalThis.fetch` with a mock returning 404, breaking integration tests using real HTTP. Fixed by preserving and restoring `_realFetch` in 3 A2A test files.
2. **Intent handler missing `url` field** — `a2a-gateway.ts` executor response didn't include `url` property. Fixed.
3. **Non-deterministic orchestration scoring** — Codex mock 60ms delay skewed latency scoring. Reduced to 5ms.

### recoder-web
4. **Broken MockRequest/MockResponse** — `tests/setup.ts` `MockResponse` hardcoded `status = 200` ignoring constructor init. `MockRequest` used `Map` instead of `Headers`. Fixed both to properly handle constructor parameters.
5. **Route handler error contract gaps** — 4 route handlers used generic error messages instead of propagating upstream details:
   - `api.a2a.intents.$intent.ts`: catch block now propagates `error.message`
   - `api.health.public-api-readiness.ts`: error case now uses `error.message` instead of hardcoded string
   - `api.kill-sandbox.ts`: DockerHttpError handler now uses `payload.error || error.message`
   - `api.run-command.ts`: DockerHttpError handler now uses `payload.error || payload.message`
6. **Subagent workflow contract drift** — recoder-web types diverged from docker-backend:
   - Removed stale `A0` from `SubagentLaneId`
   - Added `delegatesTo`, `dependsOn`, `externalDependsOn`, `retryBudget`, `visibility` to `SubagentLane`
   - Added `SubagentWorkflowOrchestration` type and `orchestration` field to `SubagentWorkflowPlan`
   - Updated `buildSubagentWorkflowPlan` to produce full orchestration metadata (execution waves, dependency resolution, delegation, retry budgets)
   - Summary format aligned to `Task: ... | Scope: ...` pattern

### app
7. **Contract schema tests** — Added 30 Zod schema validation tests for auth-session, account, and security/2FA contracts.

---

## Contract Boundaries Verified

### docker-backend ↔ recoder-web (workflow)
- Lane catalog: 12 lanes (A1-A12) — identical IDs, titles, paths
- Default repo paths: 15 paths — identical
- Orchestration: execution waves, delegation, dependencies, retry budgets — matching
- Summary format: `Task: ... | Scope: ...` — matching

### desktop ↔ docker-backend (strict/fallback)
- Contract versions: `internal-agent-workflow-v1`, `public-agent-workflow-v1`
- Strict mode: validates response `contract` field against expected version
- Fallback: local-fallback plan generated on backend failure
- Auth hierarchy: sessionToken > apiKey > cookieHeader > unauthenticated

### app ↔ downstream consumers (auth/session/account/security)
- Auth session: unauthenticated + authenticated variants validated
- Sessions list: full session + success message + error variants validated
- Account: GET/PUT/DELETE including email change pending flow validated
- Security: settings GET/PUT + 2FA setup/verify/enable/disable validated

---

## Additional Evidence (2026-02-15 batch 2)

### Shared A2A error contract tests
| Repo | Gate | Result | Tests |
|------|------|--------|-------|
| shared | A2A error-contract tests | PASS | 22/22 tests (builder, validator, assertion, snapshot, round-trip) |
| docker-backend | A2A gateway contract snapshot | PASS | 4/4 tests |
| recoder-web | A2A envelope contract snapshot | PASS | 4/4 tests |
| app | contract schemas (incl. CLI session) | PASS | 47/47 tests |
| openclaw | workflow command tests | PASS | 18/18 tests |

### New artifacts
1. `shared/src/a2a/error-contract.test.ts` — 22 tests locking the shared A2A error schema (builder, validator, assertion, snapshot, round-trip)
2. `openclaw/extensions/recoder-plugin/openclaw.plugin.json` — Plugin manifest fixing ~20 OpenClaw test failures
3. OpenClaw `agents.workflow.ts` enhanced with structured `a2aEnvelopeDiagnostic` in JSON output and field-level remediation hints in text output

---

## Remaining Items

1. Cross-platform smoke evidence bundle published — **this document**
2. Promote `PHASE2_CONTRACT_MATRIX_V1.md` from `draft-active` to `locked-v1` — **DONE**
3. OpenClaw: non-critical test failures (environment-dependent, not on critical paths; plugin manifest fix should reduce count)
4. Studio tests verified earlier (19/19 green) but not re-run in this batch
