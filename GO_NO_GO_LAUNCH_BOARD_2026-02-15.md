# Recoder GO/NO-GO Launch Board (2026-02-15)

## Decision Scope
In-scope release wave:
1. `docker-backend`
2. `recoder-web`
3. `app`
4. `apps/frontend`
5. `apps/mobile`
6. `openclaw`

Deferred from this wave:
1. `apps/studio.giselles.ai`
2. `apps/desktop`
3. `backend`
4. `recoder-agency`
5. `recoder-pm`
6. `packages`
7. `shared`

## GO/NO-GO Matrix
| Repo | Current | Required Gate Commands | Latest Evidence | Decision |
|---|---|---|---|---|
| `docker-backend` | On production | `pnpm -C docker-backend exec vitest run src/subagent-workflow.test.ts` and `BACKEND_URL=https://docker.recoder.xyz EXPECTED_QUEUE_BACKEND=redis bash docker-backend/scripts/smoke-public-queue.sh` | Unit tests PASS (12), live smoke FAIL (`/api/health/public-api-queue` -> 404) | NO-GO (prod route mismatch) |
| `recoder-web` | On production | `pnpm -C recoder-web run smoke:prod-blockers` and live probes | Smoke/probes FAIL (readiness routes 404, `web.recoder.xyz/auth/verify` -> 401) | NO-GO (prod readiness endpoints missing/misaligned) |
| `app` | Near-ready | `pnpm -C app run ci:preflight` and `pnpm -C app run ci:check` and `pnpm -C app exec vitest run lib/contracts/contracts.test.ts lib/contracts/frontend-mobile-contracts.test.ts` | PASS preflight + ci:check (typecheck) in current cycle; contract tests previously PASS | GO-CANDIDATE (lint migration tracked separately) |
| `apps/frontend` | Near-ready | `pnpm -C apps/frontend run ci:preflight` and `pnpm -C apps/frontend run ci:check` | PASS in current cycle (typecheck + lint with warnings only) | GO-CANDIDATE |
| `apps/mobile` | Near-ready | `pnpm -C apps/mobile run ci:preflight` and `pnpm -C apps/mobile run ci:check` | PASS in current cycle (typecheck lane) | GO-CANDIDATE |
| `openclaw` | Release-candidate | `pnpm -C openclaw exec vitest run src/commands/agents.workflow.test.ts src/commands/status.test.ts` | PASS in current cycle (26 tests) | GO-CANDIDATE |
| `apps/studio.giselles.ai` | Blocked | `pnpm -C apps/studio.giselles.ai run check-types` | Blocked by workspace/type drift + sandbox tsc stall | NO-GO |
| `apps/desktop` | Not signed off | `pnpm -C apps/desktop run smoke:prod` | Pending full parity/smoke matrix | NO-GO |
| `backend` | Not signed off | `make -C backend check-dbconnection` and `make -C backend check-supabase-imports` | Pending explicit integration evidence | NO-GO |
| `recoder-agency` | Not signed off | `pnpm -C recoder-agency/apps/agency run check` | Pending full hardening closure | NO-GO |
| `recoder-pm` | Not signed off | `pnpm -C recoder-pm check` | Pending full hardening closure | NO-GO |

## Release Order (Strict)
1. Deploy `docker-backend`.
2. Run production probe set:
- `curl -sS https://docker.recoder.xyz/health`
- `curl -sS https://docker.recoder.xyz/api/health/public-api-queue`
- `curl -sS https://docker.recoder.xyz/api/health/byok-readiness`
3. Deploy `recoder-web`.
4. Run production probe set:
- `curl -sS https://recoder.xyz/api/health/public-api-readiness`
- `curl -sS https://recoder.xyz/api/health/byok-readiness`
- `curl -sS https://recoder.xyz/auth/verify`
5. Promote `app`.
6. Promote `apps/frontend`.
7. Promote `apps/mobile`.
8. Release `openclaw`.

## Hard Block Rules
1. Any failed gate command changes repo decision to NO-GO.
2. Any contract mismatch on workflow endpoints (`requestContract` or `responseContract`) blocks promotion.
3. Missing rollback command for a target blocks promotion.

## Owner Actions (Now)
1. Backend owner: expose/fix production health routes (`/api/health/public-api-queue`, `/api/health/byok-readiness`) on `docker.recoder.xyz`, then rerun smoke.
2. Web owner: expose/fix production readiness routes (`/api/health/byok-readiness`, `/api/health/public-api-readiness`) and verify `/auth/verify` auth behavior contract.
3. Platform owner: app/frontend/mobile noninteractive gates are green in this cycle; keep rerunning per release candidate.
4. CLI owner: OpenClaw targeted tests are green in this cycle; attach CI artifact for release evidence pack.
