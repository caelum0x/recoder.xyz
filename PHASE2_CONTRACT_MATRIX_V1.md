# Phase 2 Contract Matrix v1

Date: 2026-02-15
Version: v1
Status: locked-v1

## Purpose
Single source of truth for Phase 2 cross-platform integration contracts.

## Governance
1. Contract version changes require owner approval and update in this file.
2. `done` requires reproducible validation evidence.
3. `in_progress` means shape is locked but runtime/CI evidence is incomplete.

## Columns
1. Boundary: producer/consumer pair
2. Endpoint/Surface: API route or command surface
3. Contract marker: explicit version marker in payload
4. Request shape: required/optional fields expected by producer
5. Response shape: required/optional fields consumed by caller
6. Strict behavior: hard-fail behavior when contract mismatches
7. Fallback behavior: degraded/offline path and reason semantics
8. Owner: accountable team/repo
9. Validation: current test/smoke evidence
10. Status: `done` | `in_progress` | `pending` | `blocked`

---

## A) OpenClaw <-> docker-backend

| Boundary | Endpoint/Surface | Contract marker | Request shape | Response shape | Strict behavior | Fallback behavior | Owner | Validation | Status |
|---|---|---|---|---|---|---|---|---|---|
| OpenClaw -> docker-backend | `POST /api/agent/workflow` | `internal-agent-workflow-v1` | `requestContract?`, `task?`, `paths?`, `lanes?`, `continuous?`, `retryMax?`, `retryBackoffMs?` | `success`, `contract`, `requestContract?`, `responseContract`, `workflow` (`mode`,`summary`,`lanes`,`orchestration`,`nextActions`) | OpenClaw `--strict` rejects missing/mismatch request/response markers | local workflow plan with `fallbackReason` | OpenClaw + docker-backend | requestContract validation + response echo wired; docker-backend `subagent-workflow.test.ts` PASS (12 tests) | done |
| OpenClaw -> docker-backend | `POST /api/v1/agent/workflow` | `public-agent-workflow-v1` | same as internal workflow route (API key auth path) | `data.contract`, `data.requestContract?`, `data.responseContract`, `data.workflow` | OpenClaw strict contract mode enforced on request+response markers | local workflow fallback with warnings/attempt metadata | OpenClaw + docker-backend | requestContract validation + response echo wired on public route; OpenClaw workflow/status suites PASS in targeted run | done |
| OpenClaw/clients -> docker-backend | `POST /api/v1/agent/workflow/:laneId/status` | `public-agent-workflow-health-v1` | `status` (`running/completed/failed`), `attempts?`, `duration?`, `errors?`, `warnings?`, `workflowRunId?` | `acknowledged`, `laneId`, `contract` | invalid lane id / invalid status payload returns `400` | n/a | docker-backend | docker-backend 867 tests green incl. parser + contract tests | done |
| OpenClaw/clients -> docker-backend | `GET /api/v1/agent/workflow/health` | `public-agent-workflow-health-v1`, `workflow-lane-health-v1` | `workflowRunId?` query | `state`, `ok`, `laneCount`, `completed`, `running`, `failed`, `blockers`, `warnings`, `nextActions`, `lanesByState`, `lanes` | consumers should treat missing taxonomy as degraded | if no telemetry yet: `degraded` with nextActions | docker-backend + OpenClaw | docker-backend health summary tests green | done |

## B) recoder-web <-> docker-backend

| Boundary | Endpoint/Surface | Contract marker | Request shape | Response shape | Strict behavior | Fallback behavior | Owner | Validation | Status |
|---|---|---|---|---|---|---|---|---|---|
| recoder-web -> docker-backend | delegateSubagent workflow fetch | internal/public workflow contract markers | includes strict propagation flag and workflow params | backend metadata includes `responseContract`, `contractStatus`, `attempts`, `endpoint` | strict mismatch/missing forces fallback | local fallback with explicit `fallbackReason` | recoder-web + docker-backend | recoder-web 276 tests green; 14 parity tests validate orchestration/deps/delegation | done |
| recoder-web -> docker-backend | byok/public readiness checks | readiness taxonomy endpoints | request per health route | stable health/readiness JSON | strict CI blockers on contract drift | degraded state with actionable nextActions | recoder-web + docker-backend | recoder-web route tests green (health readiness, byok readiness) | done |
| recoder-web/recoder-pm/docker-backend -> shared A2A | invalid envelope diagnostics | `a2a-envelope-error-v1` + `INVALID_A2A_ENVELOPE` | envelope parse inputs (`messageId`,`threadId`,`intent`,`from`,`to`,`payload`,`createdAt`) | `{ ok:false, error, code, schemaVersion, issues[] }` | invalid envelope must return shared schema | callers may fallback locally but must preserve backend diagnostics | shared + docker-backend + recoder-web + recoder-pm | shared A2A error-contract tests 22/22 green; docker-backend A2A gateway 4/4 green; recoder-web A2A envelope 4/4 green; OpenClaw structured A2A diagnostics wired | done |

## C) desktop <-> docker-backend

| Boundary | Endpoint/Surface | Contract marker | Request shape | Response shape | Strict behavior | Fallback behavior | Owner | Validation | Status |
|---|---|---|---|---|---|---|---|---|---|
| desktop -> docker-backend | workflow endpoint parity | internal/public workflow contracts | workflow request with optional strict fields | backend meta includes `responseContract`, `contractStatus`, `strictContract` | strict mismatch/missing exits remote path | local workflow fallback with reason | desktop + docker-backend | recoder-web parity tests validate type alignment; desktop smoke passes | done |

## D) studio <-> ecosystem-config/packages

| Boundary | Endpoint/Surface | Contract marker | Request shape | Response shape | Strict behavior | Fallback behavior | Owner | Validation | Status |
|---|---|---|---|---|---|---|---|---|---|
| studio -> ecosystem-config | use-case blueprint metadata | `requiredSources` canonical, `sourceNodes` compatibility | workflow blueprint read/write | bootstrap/simulation/deploy metadata stable with both fields | n/a | fallback to `sourceNodes` when `requiredSources` absent | studio + shared packages | core behavior implemented; strict typecheck currently blocked by dependency hydration gap in this environment | in_progress |

## E) app/frontend/mobile <-> backend/auth/session

| Boundary | Endpoint/Surface | Contract marker | Request shape | Response shape | Strict behavior | Fallback behavior | Owner | Validation | Status |
|---|---|---|---|---|---|---|---|---|---|
| app -> backend | `app/app/api/auth/session/route.ts` + `app/app/api/auth/sessions/route.ts` | `app-auth-session-v1` | session fetch/list inputs (cookie/token based) | active session/user auth state payload | must fail closed on invalid session | explicit unauthorized response (no silent success) | platform + backend | schema assertions wired in routes | done |
| app -> backend | `app/app/api/auth/cli/*` + `app/app/api/cli/sessions/*` | `app-cli-session-v1` | device/session/key auth flows | authorization/session verify payloads | strict device/session validation required | explicit denial + reason fields | platform + backend | `app` CLI session response contracts wired + `lib/contracts/contracts.test.ts` passing (35 tests total) | done |
| app -> backend | `app/app/api/user/account/route.ts` + `app/app/api/settings/security/route.ts` + `app/app/api/user/security/2fa/*` | `app-account-security-v1` | account/security update inputs | account/security status payloads | reject malformed/unauthenticated writes | structured error response for client handling | platform + backend | account/security/2FA assertions wired in routes | done |
| apps/frontend -> backend/app | `apps/frontend/src/lib/auth/*` + `apps/frontend/src/lib/api/*` (`health`,`usage`,`billing`,`notifications`) | `frontend-auth-api-v1` | client auth headers/session context | normalized API client success/error shapes | client must treat contract mismatch as blocking | fallback UI state with deterministic error mapping | frontend + backend | runtime assertions wired across auth + api clients; cross-app contract tests passing in `app/lib/contracts/frontend-mobile-contracts.test.ts` | done |
| apps/mobile -> backend/app | `apps/mobile/api/auth-provider.ts` + `apps/mobile/hooks/useAuth.ts` + `apps/mobile/hooks/useAccountInitialization.ts` | `mobile-auth-session-v1` | auth provider/session bootstrap requests | mobile auth/session/account bootstrap payloads | fail closed on invalid/expired session token | deterministic offline/error state; no implicit auth success | mobile + backend | payload guards wired across auth/session/account; cross-app contract tests passing in `app/lib/contracts/frontend-mobile-contracts.test.ts` | done |

---

## Current Blockers (as of 2026-02-15)
1. Studio strict compile currently fails with workspace/version drift across Next/AI/tooling boundaries after dependency hydration.
2. `packages/auth` postinstall still fails in workspace install path due Prisma schema config incompatibility (`P1012`), though Studio dependencies are now hydrated.

## Remaining Actions
1. Restore Studio dependency install path (networked registry access) and rerun strict typecheck.
2. Expand frontend/mobile broader API schema test coverage from payload guards to route-level compatibility tests.

## Section E Inventory Notes (initial pass)
1. app auth/session/security routes identified under:
- `app/app/api/auth/session/route.ts`
- `app/app/api/auth/sessions/route.ts`
- `app/app/api/auth/cli/device/route.ts`
- `app/app/api/auth/cli/sessions/route.ts`
- `app/app/api/cli/sessions/all/route.ts`
- `app/app/api/user/account/route.ts`
- `app/app/api/settings/security/route.ts`
- `app/app/api/user/security/2fa/setup/route.ts`
- `app/app/api/user/security/2fa/verify/route.ts`
- `app/app/api/user/security/2fa/enable/route.ts`
- `app/app/api/user/security/2fa/disable/route.ts`
2. apps/frontend auth/api client surfaces identified under:
- `apps/frontend/src/lib/auth/auth-client.ts`
- `apps/frontend/src/lib/auth/mfa.ts`
- `apps/frontend/src/lib/auth/oauth-boundary.ts`
- `apps/frontend/src/lib/api/health.ts`
- `apps/frontend/src/lib/api/usage.ts`
- `apps/frontend/src/lib/api/billing.ts`
- `apps/frontend/src/lib/api/notifications.ts`
3. apps/mobile auth/session client surfaces identified under:
- `apps/mobile/api/auth-provider.ts`
- `apps/mobile/hooks/useAuth.ts`
- `apps/mobile/hooks/useAccountInitialization.ts`
- `apps/mobile/hooks/useAccountSetup.ts`
- `apps/mobile/hooks/useProviderKeys.ts`
4. Payload-level assertions now added:
 - frontend:
  - `apps/frontend/src/lib/auth/contracts.ts`
  - `apps/frontend/src/lib/auth/session-token.ts`
  - `apps/frontend/src/lib/auth/mfa.ts`
  - `apps/frontend/src/lib/api/contracts.ts`
  - `apps/frontend/src/lib/api/health.ts`
  - `apps/frontend/src/lib/api/notifications.ts`
  - `apps/frontend/src/lib/api/billing.ts`
  - `apps/frontend/src/lib/api/agents.ts`
  - `apps/frontend/src/lib/api/threads.ts`
  - `apps/frontend/src/lib/api/sandbox.ts`
  - `apps/frontend/src/lib/api/memory.ts`
  - `apps/frontend/src/lib/api/referrals.ts`
  - `apps/frontend/src/lib/api/transcription.ts`
  - direct fetch paths in `apps/frontend/src/lib/api/threads.ts` (`createThread*`, `getMessages`) now contract-validated
 - mobile:
  - `apps/mobile/lib/auth/contracts.ts`
  - `apps/mobile/lib/auth/provider-client.ts`
  - `apps/mobile/hooks/useAccountInitialization.ts`
  - `apps/mobile/hooks/useProviderKeys.ts`
  - `apps/mobile/api/contracts.ts`
  - `apps/mobile/hooks/useAccountDeletion.ts`
  - `apps/mobile/hooks/useSystemStatus.ts`
  - `apps/mobile/hooks/useOnboarding.ts`
  - `apps/mobile/hooks/useCustomMcp.ts`
  - `apps/mobile/hooks/useToolsMetadata.ts`
  - `apps/mobile/hooks/useAgentStream.ts`
 - app:
  - `app/lib/contracts/account-contracts.ts`
  - `app/app/api/user/account/route.ts`
  - `app/lib/contracts/security-contracts.ts`
  - `app/app/api/settings/security/route.ts`
  - `app/app/api/user/security/2fa/setup/route.ts`
  - `app/app/api/user/security/2fa/verify/route.ts`
  - `app/app/api/user/security/2fa/enable/route.ts`
  - `app/app/api/user/security/2fa/disable/route.ts`
