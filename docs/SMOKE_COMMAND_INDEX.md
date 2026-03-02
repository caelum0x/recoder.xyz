# Smoke Command Index

Last updated: 2026-02-26

This is the single operator index for production smoke coverage.

## Blocking smoke commands
- `pnpm run smoke:phase1`
  - Scope: recoder-web + docker-backend readiness and billing mode sanity.
- `pnpm -C docker-backend run smoke:queue`
  - Scope: public queue backend readiness (`redis` expectation in prod).
- `pnpm -C app run smoke:static`
  - Scope: recoder.xyz static asset integrity and MIME correctness.

## A2A smoke commands
- `pnpm run a2a:smoke:codex-claude`
  - Scope: bridge/http roundtrip between Codex and Claude Code adapters.
  - Required when A2A transport/envelope/orchestration code changes.
- `bash scripts/a2a-workers-hetzner.sh status`
  - Scope: worker fleet process visibility.
- `pnpm run phase16:validate:production-deploy`
  - Scope: Phase 16 deployment validation on Hetzner (local DNS probe + remote repo readiness + remote `a2a-production-smoke.sh` execution).
  - Writes evidence to `logs/phase16-validation/<run-id>-summary.{json,md}`.

## Gate wrappers
- `pnpm run release:evidence`
  - Baseline evidence collector (lint/type/guard checks).
- `pnpm run phase3:gates`
  - Phase 3 composite production gate with summaries in `logs/phase3-gates/`.
- `pnpm run phase3:gates:dry`
  - Non-network dry run of Phase 3 gate logic.
- `pnpm run phase3:gates:dev`
  - Development gate run that defers env/typecheck blockers.
- `pnpm run phase3:assert-ga-ready`
  - Enforces `overall=PASS` + `ga_ready=true` + zero blockers for promotion signoff.
- `pnpm run phase3:evidence-pack`
  - Builds a manifest + tarball bundle from latest Phase 3 artifacts.
- `pnpm run phase3:dispatch-signoff`
  - Dispatches the GitHub `Phase 3 Release Signoff` workflow with current env inputs.
- `pnpm run phase3:closeout`
  - Runs local end-to-end closeout: gates -> GA assertion -> evidence pack.
- `pnpm run phase3:closeout:dev`
  - Runs development closeout with dry-run + deferred blockers.
- `pnpm run phase3:next-blockers`
  - Prints blockers/remediations from latest Phase 3 scorecard.

## Recommended production invocation
```bash
PHASE3_MODE=production \
BILLING_ACTIONS_ENABLED=false \
EXPECTED_QUEUE_BACKEND=redis \
RECODER_WEB_URL=https://web.recoder.xyz \
BACKEND_URL=https://docker.recoder.xyz \
BASE_URL=https://recoder.xyz \
pnpm run phase3:gates
```

## Development invocation (defer env gating)
```bash
SKIP_ENV_GATES=true \
SKIP_TYPECHECK_GATES=true \
PHASE3_MODE=local-dev \
pnpm run phase3:gates
```

## Evidence policy
For every production promotion, attach:
- Phase 3 summary JSON (`overall=PASS`)
- Phase 3 summary Markdown
- Phase 3 scorecard JSON (`ga_ready=true` for final production signoff)
- Phase 3 scorecard Markdown
- Raw gate log

## CI entry points
- GitHub workflow `Phase 3 Gates` for PR/dev safety checks.
- GitHub workflow `Phase 3 Release Signoff` for manual promotion gating.
