# Core Stabilization Plan (7-10 Days)

Date: 2026-02-15
Scope: Phase 1 only
- OpenClaw (`status` / `doctor` / orchestration)
- CI determinism baseline (`app`, `apps/frontend`)
- Studio deploy-governance stability (`apps/studio.giselles.ai`)

## Objective
Reach a stable control plane with deterministic checks and actionable operator diagnostics.

## Success Criteria (must all pass)
1. OpenClaw focused suites green for status/workflow/doctor auth paths.
2. `app` and `apps/frontend` have deterministic non-interactive check scripts and verified dependency-install paths.
3. Studio deploy governance (canary/simulation gate/diff) remains operational with no known blocking regressions.
4. `status --json --ci` automation state is reliable and documented for blocked/degraded behavior.

## Workstream A: OpenClaw stabilization
Path: `/Users/arhansubasi/recoder.xyz/openclaw`

### Deliverables
1. Stable orchestration telemetry schema in status JSON:
- `orchestration.runtime`
- lane-level health (`runtimeHealth`)
- lane alerts with next actions
2. Automation gating includes orchestration risk signals.
3. Doctor/auth diagnostics provide explicit remediation for OAuth/token/API-key failure cases.
4. Tests covering happy path + fallback + contract mismatch + retry warnings.

### Required checks
1. `pnpm -C openclaw exec vitest run src/commands/status.test.ts src/commands/agents.workflow.test.ts`
2. `pnpm -C openclaw exec vitest run src/commands/doctor-auth.auth-health.test.ts src/commands/doctor-auth.deprecated-cli-profiles.test.ts`

## Workstream B: CI determinism baseline
Paths:
- `/Users/arhansubasi/recoder.xyz/app`
- `/Users/arhansubasi/recoder.xyz/apps/frontend`

### Deliverables
1. Script determinism (`pnpm exec` for tool binaries).
2. `ci:check` and `ci:install-and-check` scripts present and canonical.
3. Non-interactive command behavior documented and used by CI.

### Required checks
1. `pnpm -C app run ci:install-and-check`
2. `pnpm -C apps/frontend run ci:install-and-check`

## Workstream C: Studio deploy-governance stability
Path: `/Users/arhansubasi/recoder.xyz/apps/studio.giselles.ai`

### Deliverables
1. Canary policy controls + persisted metadata correctness.
2. Simulation pass required before `promote_live`.
3. Deployment diff remains visible and accurate.
4. Bootstrap snapshot integrity (no stale pending IDs).

### Required checks
1. `pnpm -C apps/studio.giselles.ai test -- lib/use-cases/deployment.test.ts app/api/use-cases/deploy/route.test.ts`
2. `pnpm -C apps/studio.giselles.ai run check-types` (or equivalent once toolchain is available)

## Day-by-day execution (10-day max)

### Day 1-2
1. Freeze OpenClaw status/orchestration JSON contract for automation consumers.
2. Lock lane-health + lane-alert schema and ensure test assertions are complete.

### Day 3-4
1. Complete doctor/auth diagnostics edge-case handling.
2. Add/verify regression tests for refresh-null and token static-profile guidance.

### Day 5
1. Validate `status --json --ci` gating behavior under blocked/degraded/healthy fixtures.
2. Record exact exit-code contract in docs/plan evidence.

### Day 6-7
1. Execute CI determinism verification in `app` and `apps/frontend` with install-first flows.
2. Resolve any missing binary/dependency assumptions in scripts.

### Day 8
1. Studio deploy-governance regression sweep (API + UI state assumptions).
2. Verify metadata consistency for bootstrap/deploy history.

### Day 9
1. End-to-end dry run:
- OpenClaw status/doctor/workflow-health
- app/frontend CI check commands
- Studio deploy governance checks
2. Produce blocker list if any.

### Day 10 (buffer)
1. Fix remaining blockers.
2. Publish Phase 1 completion evidence and go/no-go note.

## Go/No-Go gates for Phase 1 completion
1. Go:
- all required checks pass
- no P0/P1 open in OpenClaw control-plane paths
- no nondeterministic CI behavior in `app` and `apps/frontend`
2. No-Go:
- failing automation contract tests
- unresolved blocking toolchain gaps for canonical check commands
- deploy-governance regression in Studio

## Out of scope for Phase 1
1. Cross-platform contract matrix completion across all apps.
2. Release runbooks and full smoke-gate rollout across every repo.
3. Broad production scorecard and GA readiness declaration.
