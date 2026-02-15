# Phase 3 Production Hardening Pack

Last updated: 2026-02-15

## Why this exists
Recoder is no longer a single app deployment. It is a coordinated ecosystem (web, backend, PM, agency, A2A bridge, worker fleet). Phase 3 is the point where release quality is enforced by reproducible evidence, not by confidence.

## Who this targets
- Platform operators running production promotions on Hetzner and managed hosts.
- Engineering leads approving production releases across multiple repos/services.
- Incident responders who need deterministic rollback and health verification.

## Core functionality
- One gate command that produces auditable evidence artifacts.
- One smoke index that maps each critical surface to an executable command.
- One runbook path for promotion, rollback, and incident triage.
- Optional A2A interop checks for Codex and Claude Code collaboration.

## Canonical gate command
```bash
pnpm run phase3:gates
```

Local dry validation:
```bash
pnpm run phase3:gates:dry
```

Development mode (skip env/typecheck gates until final secrets/tooling cutover):
```bash
pnpm run phase3:gates:dev
```

Production with A2A interop smoke enabled:
```bash
PHASE3_MODE=production \
BILLING_ACTIONS_ENABLED=false \
ENABLE_A2A_INTEROP_SMOKE=true \
pnpm run phase3:gates
```

Final signoff assertion:
```bash
pnpm run phase3:assert-ga-ready
```

Bundle release evidence:
```bash
pnpm run phase3:evidence-pack
```

Local closeout chain (single command):
```bash
pnpm run phase3:closeout
```

Development closeout chain:
```bash
pnpm run phase3:closeout:dev
```

Current blocker summary:
```bash
pnpm run phase3:next-blockers
```

Dispatch GitHub release-signoff workflow:
```bash
pnpm run phase3:dispatch-signoff
```

## Required evidence artifacts
Each gate run must produce:
- `logs/phase3-gates/<run-id>.log`
- `logs/phase3-gates/<run-id>-summary.md`
- `logs/phase3-gates/<run-id>-summary.json`
- `logs/phase3-gates/<run-id>-scorecard.md`
- `logs/phase3-gates/<run-id>-scorecard.json`

Release approval requires the summary JSON `overall` to be `PASS`.

## Promotion policy
- No promotion if any required gate step fails.
- No promotion if required runbook references are missing.
- A2A interop smoke is mandatory for releases that change A2A envelope, routing, workers, bridge, or orchestration behavior.

## Incident and rollback references
- Primary runbook: `PRODUCTION_RUNBOOK.md`
- Static asset incident runbook: `docs/STATIC_ASSET_DEPLOY_RUNBOOK.md`
- Smoke command inventory: `docs/SMOKE_COMMAND_INDEX.md`

## Acceptance criteria
- Gate run is deterministic and non-interactive.
- Evidence artifacts are attached to every production promotion.
- Smoke coverage includes auth, queue/backend readiness, static assets, and optional A2A interop.

## CI workflows
- `Phase 3 Gates` (PR-safe/dev mode): deterministic dry run, evidence artifact publishing.
- `Phase 3 Release Signoff` (manual dispatch): full configurable run, GA assertion, evidence bundle publishing.
