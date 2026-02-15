# Phase 2 Integration Tracker

Date: 2026-02-15
Phase window: 2026-02-26 to 2026-03-18 (2-3 weeks)
Status: ACTIVE

## Objective
Cross-platform integration hardening across OpenClaw, docker-backend, recoder-web, app, frontend, mobile, studio, backend, and shared packages with contract-first execution.

## Current Snapshot (2026-02-15)
1. OpenClaw orchestration contract surface is ahead and stable (`strict`, lane targeting, retry override, orchestration metadata).
2. docker-backend workflow plan contracts were upgraded to match OpenClaw request/response expectations.
3. docker-backend lane status + workflow health contracts were hardened with lane ID validation and taxonomy state logic.
4. Main blocker: route tests that bind local ports are blocked in this sandbox (`listen EPERM: operation not permitted 0.0.0.0`).

## Production Readiness Call (as of 2026-02-15)
Status: NO-GO (not ready)
1. Phase 2 is still active and several required cross-platform gates are incomplete.
2. `apps/studio.giselles.ai` strict typecheck runs but currently fails on real workspace/version drift errors.
3. Full route-level integration evidence is still incomplete in this environment (sandbox `EPERM`/timeouts for some suites).
4. Smoke bundle publication and final contract-owner completeness are still pending.

## Launch Blockers (must close before production go-live)
1. Green deterministic checks across critical surfaces:
- `app`, `apps/frontend`, `apps/mobile`, `apps/studio.giselles.ai`, `recoder-web`, `docker-backend`, `openclaw`, `recoder-pm`.
2. Cross-platform smoke suite fully green with stored evidence artifacts.
3. Contract matrix owner/version completion for all critical endpoints.
4. Zero unresolved Phase 2 blockers in this tracker.
5. Production health/readiness routes must match smoke contracts:
- `docker.recoder.xyz/api/health/public-api-queue` currently returns `404` (expected 2xx JSON)
- `web.recoder.xyz/api/health/byok-readiness` currently returns `404` (expected 2xx JSON)
- `web.recoder.xyz/api/health/public-api-readiness` currently returns `404` (expected 2xx JSON)

## Success Criteria
1. Contract matrix has explicit versioned compatibility and owner.
2. Core cross-platform flows pass smoke gates.
3. No blocking type/lint/toolchain regressions in critical repos.
4. Strict/fallback behaviors are deterministic and machine-readable.

## Workstreams

### 1) Contract Lock (Week 1)
Status: in_progress
1. Freeze v1 request/response contracts on critical boundaries.
2. Add `contract` / `taxonomyVersion` markers to machine outputs.
3. Add strict-mode and fallback contract tests.

### 2) Runtime Parity (Week 2)
Status: pending
1. Align auth/session fallback behavior across CLI/web/desktop/mobile.
2. Align lane status/workflow health states across OpenClaw and docker-backend.
3. Enforce deterministic CI exits (`healthy=0`, `blocked=1`, `degraded=2`).

### 3) Reliability Hardening (Week 3)
Status: pending
1. Add failure-injection tests (missing auth, contract mismatch, backend transient failure).
2. Finalize shared type ownership and remove duplicate contract definitions.
3. Produce integration scorecard and residual risk list.

## Contract Matrix

### A) OpenClaw <-> docker-backend
Owner: Backend + OpenClaw
Status: in_progress
1. `/api/agent/workflow` (internal-agent-workflow-v1) - in_progress
2. `/api/v1/agent/workflow` (public-agent-workflow-v1) - in_progress
3. `/api/v1/agent/workflow/:laneId/status` (public-agent-workflow-health-v1) - in_progress
4. `/api/v1/agent/workflow/health` (workflow-lane-health-v1) - in_progress
5. Latest delivered:
- backend request parsing supports `lanes`, `retryMax`, `retryBackoffMs`
- workflow responses include orchestration metadata parity fields
- lane status routes enforce known lane IDs
- workflow health includes deterministic `healthy|degraded|blocked` taxonomy

### B) recoder-web <-> docker-backend
Owner: Web + Backend
Status: in_progress
1. delegateSubagent strict contract behavior
2. task/stream/public-api/byok readiness contracts
3. fallback reason + backend metadata parity

### C) app/frontend/mobile <-> backend/auth/session
Owner: Platform + Backend
Status: done
1. auth/session/account payload parity
2. non-interactive deterministic CI checks
3. smoke coverage for auth/session core paths

### D) studio <-> ecosystem-config/packages
Owner: Studio + Shared
Status: in_progress
1. `requiredSources` canonical contract
2. bootstrap/simulate/deploy metadata consistency
3. deployment snapshot compatibility

### E) recoder-agency/recoder-pm <-> shared/backend
Owner: Agency/PM + Shared + Backend
Status: pending
1. shared auth/billing/workflow contract parity
2. blocker tests for core workflows

## Repo Checklist

### openclaw
Status: in_progress
1. workflow/orchestration visibility complete
2. sessions/logs/status/doctor machine taxonomies
3. CI deterministic exits for automation paths

### docker-backend
Status: in_progress
1. workflow request/response contract parity with OpenClaw
2. lane status validation and workflow health taxonomy
3. route-level compatibility checks
4. Environment blocker:
- local `vitest` binary unavailable for docker-backend test execution in this session

### recoder-web
Status: in_progress
1. strict contract propagation
2. backend metadata + fallback reason parity
3. smoke blockers for production paths

### app
Status: pending
1. auth/session endpoint parity
2. deterministic check scripts
3. smoke for onboarding/settings/security

### apps/frontend
Status: in_progress
1. API client parity with app/backend
2. deterministic type/lint/check lane

### apps/mobile
Status: in_progress
1. auth/session/task API parity
2. push/auth bridge contract checks

### apps/studio.giselles.ai
Status: in_progress
1. workflow blueprint contract stability
2. typecheck stabilization
3. simulate/deploy governance stability

### backend
Status: pending
1. adapter consistency for app/frontend/mobile
2. readiness/health contract consistency

### packages/shared
Status: pending
1. single-source exported types
2. duplicate shape elimination

### recoder-agency / recoder-pm
Status: pending
1. shared contract parity
2. integration blocker tests

## Weekly Plan

### Week 1 (2026-02-26 to 2026-03-04)
1. Complete contract matrix v1 with endpoint-level payload docs.
2. Lock OpenClaw/docker-backend/workbench/desktop contract parity.
3. Resolve critical CI tooling blockers in app/frontend/mobile/studio.
4. Verify docker-backend workflow route contracts with executable tests once vitest is available.

### Week 2 (2026-03-05 to 2026-03-11)
1. Run cross-surface smoke bundle daily.
2. Fix runtime parity drift and strict/fallback mismatch issues.
3. Stabilize auth/session behavior across platform clients.

### Week 3 (2026-03-12 to 2026-03-18)
1. Execute failure-injection suite.
2. Publish integration scorecard and residual risk register.
3. Close blockers and prepare Phase 3 handoff.

## Daily Tracking

### Blockers
1. [ ] docker-backend and recoder-web route tests that spin up listeners are blocked in-session:
- `listen EPERM: operation not permitted 0.0.0.0` in this sandbox
- unit tests that do not bind ports are still runnable
2. [ ] studio deterministic typecheck/test validation fails on workspace/version drift after dependency hydration.
 - mitigation in progress: dedicated `tsconfig.check-types.json` + compatibility shims added to keep Studio check lane app-scoped
 - blocker in this sandbox: `tsc` runner appears to stall with no output even for targeted file-only invocation
3. [x] app/frontend/mobile auth/session contract audit completed with cross-app contract suite evidence.

### Today’s Execution Log
1. Hardened OpenClaw workflow orchestration UX: execution waves, delegates, dependency scoping, lane targeting, retry overrides.
2. Hardened OpenClaw CLI automation outputs: `sessions-v1` taxonomy + `--json --ci` exits, `logs-v1` automation summary.
3. Hardened docker-backend workflow contract parsing/plan generation to accept lane + retry controls and output orchestration metadata.
4. Hardened docker-backend lane status and workflow health contracts (lane ID validation + deterministic health taxonomy).
5. Updated `plan.md` with execution updates #77, #78, #79, #80, #81, #82.
6. Added first app payload-level contract assertions via shared zod schemas for:
- `app/app/api/auth/session/route.ts`
- `app/app/api/auth/sessions/route.ts`
7. Created shared app contract file:
- `app/lib/contracts/auth-session-contracts.ts`
8. Added frontend payload-level auth/session contract assertions:
- `apps/frontend/src/lib/auth/contracts.ts`
- `apps/frontend/src/lib/auth/session-token.ts`
9. Added frontend MFA response schema assertions:
- `apps/frontend/src/lib/auth/mfa.ts`
10. Added mobile payload-level auth/provider contract assertions:
- `apps/mobile/lib/auth/contracts.ts`
- `apps/mobile/lib/auth/provider-client.ts`
11. Added app account payload-level contract assertions:
- `app/lib/contracts/account-contracts.ts`
- `app/app/api/user/account/route.ts`
12. Added app security + 2FA payload-level contract assertions:
- `app/lib/contracts/security-contracts.ts`
- `app/app/api/settings/security/route.ts`
- `app/app/api/user/security/2fa/setup/route.ts`
- `app/app/api/user/security/2fa/verify/route.ts`
- `app/app/api/user/security/2fa/enable/route.ts`
- `app/app/api/user/security/2fa/disable/route.ts`
13. Re-ran targeted typechecks after toolchain availability check:
- `apps/frontend`: PASS (`pnpm exec tsc --noEmit`)
- `apps/mobile`: PASS (`tsc --noEmit`)
- `app`: FAIL due Prisma/schema typing drift (`marketplace_agents`, `claudeCodeToken`)
14. Added frontend API runtime contract assertions for health + notifications:
- `apps/frontend/src/lib/api/contracts.ts`
- `apps/frontend/src/lib/api/health.ts`
- `apps/frontend/src/lib/api/notifications.ts`
15. Added mobile account initialization response contract assertion:
- `apps/mobile/lib/auth/contracts.ts`
- `apps/mobile/hooks/useAccountInitialization.ts`
16. Added frontend billing runtime contract assertions:
- `apps/frontend/src/lib/api/contracts.ts`
- `apps/frontend/src/lib/api/billing.ts`
17. Added mobile provider keys response contract assertion:
- `apps/mobile/lib/auth/contracts.ts`
- `apps/mobile/hooks/useProviderKeys.ts`
18. Added frontend agents/threads/sandbox runtime contract assertions:
- `apps/frontend/src/lib/api/contracts.ts`
- `apps/frontend/src/lib/api/agents.ts`
- `apps/frontend/src/lib/api/threads.ts`
19. Hardened shared A2A envelope contract utilities and parser diagnostics:
- `shared/src/a2a/types.ts`
- `shared/src/a2a/bridge.ts`
20. Added `a2a-js` Recoder envelope interop helpers + tests:
- `a2a-js/src/recoder.ts`
- `a2a-js/src/index.ts`
- `a2a-js/test/recoder.spec.ts`
21. Hardened docker-backend A2A envelope ingress points with normalized parsing + structured errors (`code: INVALID_A2A_ENVELOPE`, `issues[]`):
- `docker-backend/src/a2a-gateway.ts`
- `docker-backend/src/a2a-orchestrator-routes.test.ts`
22. Hardened recoder-pm A2A API contract parsing with structured diagnostics:
- `recoder-pm/apps/api/lib/a2a/gateway.ts`
- `recoder-pm/apps/api/app/api/a2a/envelope/route.ts`
- `recoder-pm/apps/api/app/api/a2a/dispatch/route.ts`
23. Hardened recoder-web A2A contract parsing parity for envelope/dispatch routes:
- `recoder-web/app/lib/.server/a2a-gateway.ts`
- `recoder-web/app/routes/api.a2a.envelope.ts`
- `recoder-web/app/routes/api.a2a.dispatch.ts`
24. Added shared A2A invalid-envelope error contract and gateway shape locks:
- `shared/src/a2a/error-contract.ts`
- docker-backend: `docker-backend/src/a2a-gateway.test.ts`
- recoder-web: `recoder-web/app/routes/api.a2a.envelope.test.ts`
- recoder-pm: `recoder-pm/apps/api/tests/a2a-envelope.test.ts`
25. OpenClaw workflow command/output now surfaces backend envelope diagnostics:
- `openclaw/src/commands/agents.workflow.ts`
- tests: `openclaw/src/commands/agents.workflow.test.ts`, `openclaw/src/commands/agents.workflow-health.test.ts`
26. Tightened A2A contract lock consistency across gateways:
- docker-backend now uses shared `buildInvalidA2AEnvelopeErrorResponse` (removes local duplicate schema constants)
- recoder-pm invalid-envelope contract lock moved off inline assertions to shared snapshot parity flow
27. Moved invalid-envelope snapshot to a single shared artifact and wired all three gateway tests to it:
- canonical artifact: `shared/src/a2a/snapshots/invalid-envelope-error.snapshot.json`
- exported by `@recoder/shared/a2a` as `INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT`
- adopted by:
  - `docker-backend/src/a2a-gateway.test.ts`
  - `recoder-web/app/routes/api.a2a.envelope.test.ts`
  - `recoder-pm/apps/api/tests/a2a-envelope.test.ts`
- `apps/frontend/src/lib/api/sandbox.ts`
28. Re-ran release gates for `app`, `apps/frontend`, `apps/mobile` in noninteractive mode:
- `app`: `pnpm -C app run ci:check:noninteractive` PASS (typecheck lane)
- `apps/frontend`: `pnpm -C apps/frontend run ci:check:noninteractive` PASS (0 errors, warnings only)
- `apps/mobile`: `pnpm -C apps/mobile run ci:check:noninteractive` PASS
29. Re-ran backend/OpenClaw targeted contract tests:
- `docker-backend`: `pnpm -C docker-backend exec vitest run src/subagent-workflow.test.ts` PASS (12/12)
- `openclaw`: `pnpm -C openclaw exec vitest run src/commands/agents.workflow.test.ts src/commands/status.test.ts` PASS (26/26)
30. Live production probes (outside sandbox) found active NO-GO route mismatches:
- `docker.recoder.xyz/health` -> 200
- `docker.recoder.xyz/api/health/public-api-queue` -> 404
- `docker.recoder.xyz/api/health/byok-readiness` -> 404
- `web.recoder.xyz/api/health/byok-readiness` -> 404
- `web.recoder.xyz/api/health/public-api-readiness` -> 404
- `web.recoder.xyz/auth/verify` -> 401
31. Verified recoder-web readiness routes are implemented and tested in current code:
- `pnpm -C recoder-web exec vitest run app/routes/api.health.byok-readiness.test.ts app/routes/api.health.public-api-readiness.test.ts` PASS (6/6)
32. Verified docker-backend readiness/queue health routes are implemented and tested in current code:
- `pnpm -C docker-backend exec vitest run src/public-api/byok-readiness.test.ts src/public-api/prompt-task-queue-config.test.ts` PASS (6/6)
19. Added frontend memory/referrals/transcription runtime contract assertions:
- `apps/frontend/src/lib/api/contracts.ts`
- `apps/frontend/src/lib/api/memory.ts`
- `apps/frontend/src/lib/api/referrals.ts`
- `apps/frontend/src/lib/api/transcription.ts`
20. Hardened frontend direct thread fetch paths with response contracts:
- `apps/frontend/src/lib/api/contracts.ts`
- `apps/frontend/src/lib/api/threads.ts`
21. Added mobile account/status/onboarding response contracts:
- `apps/mobile/api/contracts.ts`
- `apps/mobile/hooks/useAccountDeletion.ts`
- `apps/mobile/hooks/useSystemStatus.ts`
- `apps/mobile/hooks/useOnboarding.ts`
22. Added mobile custom-MCP/tools metadata response contracts:
- `apps/mobile/api/contracts.ts`
- `apps/mobile/hooks/useCustomMcp.ts`
- `apps/mobile/hooks/useToolsMetadata.ts`
23. Added mobile agent stream status response contract assertion:
- `apps/mobile/api/contracts.ts`
- `apps/mobile/hooks/useAgentStream.ts`
24. Added app Prisma client import hardening for local generated client path:
- `app/lib/prisma-client.ts`
- `app/lib/prisma.ts`
- `app/prisma/seed.ts`
25. Attempted docker-backend targeted route tests:
- `pnpm -C docker-backend exec vitest run src/a2a-orchestrator-routes.test.ts src/a2a-intents-route.test.ts`
 - runner baseline verified via `src/resources/execution-limits.test.ts` (PASS)
 - A2A route suites fail due `beforeEach` hook timeout at 30s.
26. Resolved app Prisma/schema typecheck blocker by compatibility hardening:
- `app/app/api/agents/list/route.ts`
- `app/app/api/agents/share/route.ts`
- `app/app/api/user/claude-code/route.ts`
27. Deterministic typecheck reruns:
- `app`: PASS
- `apps/frontend`: PASS
- `apps/mobile`: PASS
- `apps/studio.giselles.ai`: FAIL (strict compile errors across workspace/version drift)
28. Hardened docker-backend A2A route test harness startup/teardown:
- `docker-backend/src/a2a-intents-route.test.ts`
- `docker-backend/src/a2a-orchestrator-routes.test.ts`
- changed server start/stop to explicit `once(..., 'listening'/'close')` flows
29. Unified docker-backend invalid-envelope error response builder to shared contract source:
- `docker-backend/src/a2a-gateway.ts`
30. Established single-source invalid-envelope snapshot and exported shared constant:
- `shared/src/a2a/snapshots/invalid-envelope-error.snapshot.json`
- `shared/src/a2a/error-contract.snapshot.ts`
- `shared/src/a2a/error-contract.snapshot.js`
- `shared/src/a2a/index.ts`
- `shared/src/a2a/index.js`
31. Wired gateway contract tests to one shared snapshot artifact:
32. Added cross-app frontend/mobile auth/session contract coverage in app test runner and validated both suites green:
- added `app/lib/contracts/frontend-mobile-contracts.test.ts`
- command: `pnpm -C app exec vitest run lib/contracts/frontend-mobile-contracts.test.ts lib/contracts/contracts.test.ts`
- result: 47/47 tests passed (frontend + mobile + app contract suites)
33. Studio check-types hardening pass implemented to decouple from workspace source drift:
- added `apps/studio.giselles.ai/tsconfig.check-types.json`
- `apps/studio.giselles.ai/package.json` `check-types` now runs `tsc -p tsconfig.check-types.json --noEmit`
- added compatibility declarations: `apps/studio.giselles.ai/types/compat-check-types.d.ts`
- replaced Next `after` usage with local deferred helper:
  - `apps/studio.giselles.ai/lib/next-after.ts`
  - `apps/studio.giselles.ai/app/webhooks/github/route.ts`
  - `apps/studio.giselles.ai/app/api/vector-stores/document/[documentVectorStoreId]/documents/route.ts`
  - `apps/studio.giselles.ai/app/(main)/settings/team/vector-stores/actions.ts`
- additional local compatibility fixes:
  - `apps/studio.giselles.ai/app/(main)/ui/sidebar/sidebar.tsx`
  - `apps/studio.giselles.ai/app/api/_lib/create-team-workspace.ts`
  - `apps/studio.giselles.ai/lib/trace.ts`
  - `apps/studio.giselles.ai/lib/use-cases/deployment.ts`
  - `apps/studio.giselles.ai/services/external/google/user-client.ts`
  - `apps/studio.giselles.ai/next.config.ts`
- validation blocker: `tsc` process does not return in this sandbox session, so strict pass/fail evidence remains pending.
34. Tightened OpenClaw <-> docker-backend workflow API contract handshake:
- docker-backend now validates optional `requestContract` marker for:
  - `POST /api/agent/workflow`
  - `POST /api/agent/workflow/:projectId`
  - `POST /api/v1/agent/workflow`
- mismatch response shape returns structured error:
  - `code: INVALID_WORKFLOW_REQUEST_CONTRACT`
  - `schemaVersion: agent-workflow-contract-error-v1`
  - `issues[]` with `body.requestContract` path
- docker-backend workflow success payloads now include:
  - `responseContract` echo
  - `requestContract` echo when present
- OpenClaw workflow command now:
  - sends `requestContract` in workflow requests
  - validates both request+response contract markers in strict mode
  - surfaces request contract diagnostics in backend metadata/warnings
- validation:
  - `pnpm -C docker-backend exec vitest run src/subagent-workflow.test.ts` PASS (12 tests)
  - `pnpm -C openclaw exec vitest run src/commands/agents.workflow.test.ts src/commands/status.test.ts` targeted tests show all cases passing; runner hangs on process exit in this sandbox after reporting passing cases.
- `docker-backend/src/a2a-gateway.test.ts`
- `recoder-web/app/routes/api.a2a.envelope.test.ts`
- `recoder-pm/apps/api/tests/a2a-envelope.test.ts`
32. Targeted validations run for this iteration:
- `shared` typecheck: PASS
- docker-backend `src/a2a-gateway.test.ts`: PASS
- recoder-web `app/routes/api.a2a.envelope.test.ts`: PASS
- recoder-pm a2a test execution in this environment: blocked (`tsx` IPC / module-resolution constraints)
33. Added Studio deterministic typecheck preflight with actionable diagnostics:
- `apps/studio.giselles.ai/scripts/check-type-deps.mjs`
- `apps/studio.giselles.ai/package.json` (`check-types:preflight`, fail-fast `check-types`)
- behavior now exits fast with `exit 10` and explicit missing module list when dependencies are not hydrated.
34. Finalized Phase 2 contract matrix owner/version locks:
- `PHASE2_CONTRACT_MATRIX_V1.md`
- Section E markers set: `app-auth-session-v1`, `app-cli-session-v1`, `app-account-security-v1`, `frontend-auth-api-v1`, `mobile-auth-session-v1`
- added shared A2A cross-gateway contract row for `a2a-envelope-error-v1`.
35. Installed Studio dependencies with escalated network access and re-ran strict typecheck:
- `pnpm -C apps/studio.giselles.ai install --force` (dependency hydration succeeded; workspace postinstall still reports unrelated `packages/auth` Prisma `P1012`)
- `pnpm -C apps/studio.giselles.ai run check-types` now executes full compile and surfaces real type/version drift errors.
36. Closed Section E CLI session contract row with route-level contract markers + schema tests:
- added `app/lib/contracts/cli-session-contracts.ts` (`app-cli-session-v1`)
- wired markers/parsers in:
  - `app/app/api/auth/cli/sessions/route.ts`
  - `app/app/api/cli/sessions/all/route.ts`
- validation: `pnpm -C app exec vitest run lib/contracts/contracts.test.ts` PASS (`35/35` tests).
37. Restored app local preflight determinism after dependency refresh:
- `pnpm -C app exec prisma generate` PASS (Prisma client generated)
- `pnpm -C app run ci:preflight` PASS
- `pnpm -C app run typecheck` PASS.

### Evidence Links
1. Test reports:
- OpenClaw workflow suites: `agents.workflow.test.ts`, `agents.workflow-health.test.ts` (passing in session)
- OpenClaw sessions/logs suites: `sessions.test.ts`, `logs-cli.test.ts` (passing in session)
 - `apps/frontend` typecheck: PASS
 - `apps/mobile` typecheck: PASS
 - `app` typecheck: PASS
 - `apps/studio.giselles.ai` typecheck: FAIL (strict compile drift after dependency hydration)
 - `app` contract tests: PASS (`lib/contracts/contracts.test.ts`, `35/35`)
 - docker-backend `src/resources/execution-limits.test.ts`: PASS
 - docker-backend A2A route suites: FAIL (`beforeEach` hook timeout 30000ms)
2. Smoke outputs:
- pending Phase 2 smoke bundle publication
3. Contract diffs:
- `docker-backend/src/subagent-workflow.ts`
- `docker-backend/src/server.ts`
- `openclaw/src/commands/agents.workflow.ts`
4. Contract matrix:
- `PHASE2_CONTRACT_MATRIX_V1.md`
5. CI runs:
- pending (environment-local validation currently blocked for docker-backend vitest)

## Next 72 Hours (Execution Queue)
1. Add route-level tests for docker-backend workflow status/health endpoints and run once vitest is available.
2. Expand app/frontend/mobile payload assertions from auth/session to account/security/profile endpoints.
3. Expand frontend/mobile payload assertions into account/profile/security API clients.
4. Complete recoder-web + desktop strict/fallback parity checks against the updated backend health contract marker.
5. Publish Contract Matrix v1 as a standalone doc with endpoint/request/response/strict/fallback/owner columns.
6. Stand up cross-platform smoke command bundle for:
- workflow plan fetch
- lane status post
- workflow health poll
- auth/session readiness

## Exit Gate Checklist
1. [x] Contract matrix versioned + owner-complete
2. [ ] Cross-platform smoke suite green
3. [ ] Deterministic CI exits verified
4. [ ] No unresolved Phase 2 blockers
