# Recoder Project Context for AI Agents

This file is the root operating context for Claude/Codex-style assistants in this repo.

## Project Snapshot

- Monorepo for the Recoder platform (`recoder.xyz`) with multiple deployed surfaces.
- Core production surfaces:
  - `app/` -> `https://recoder.xyz` (auth source of truth, billing, core APIs)
  - `recoder-agents/` -> `https://agents.recoder.xyz`
  - `recoder-agency/` -> `https://agency.recoder.xyz`
  - `recoder-studio/` -> `https://studio.recoder.xyz`
  - `recoder-pm/` -> `https://pm.recoder.xyz`
  - `recoder-web/` -> `https://web.recoder.xyz`
  - `backend/` and `docker-backend/` for service runtime
- Infra is Hetzner + Cloudflare, with PM2-first app runtime and Docker for supporting services.

## Critical Architecture Rules

1. Auth source of truth is `recoder.xyz` (Better Auth).
2. Keep `user` (Better Auth/web identity) and `users` (app/CLI identity) as separate models.
3. Cross-subdomain auth behavior must be validated with scripts before claiming completion.
4. Never hardcode localhost for production links or callbacks.
5. Billing must fail safe when provider keys are missing (truthful health status, no fake success).

## Engineering Standards

1. Prefer minimal, targeted changes over broad rewrites.
2. Verify behavior with focused tests/scripts for touched logic.
3. Update `plan.md` and `tasks/todo.md` when task status changes.
4. Record durable operational lessons in `tasks/lessons.md`.
5. Avoid introducing new env var drift; keep naming consistent across services.

## Preferred Verification Scripts

- `scripts/verify-phase14-runtime.sh`
- `scripts/sso-logout-matrix.sh`
- `scripts/verify-auth-email-reset-e2e.sh`
- `scripts/verify-byok-e2e.sh`
- `scripts/verify-cli-device-flow-e2e.sh`
- `scripts/production-external-closeout.sh`

## Persona Routing (Operational)

- `/architect`: use for ADRs, system boundaries, risk analysis.
- `/builder`: use for implementation and refactors.
- `/product-manager`: use for PRDs, acceptance criteria, delivery scope.
- `/swarm-plan`: parallel exploration and strategy.
- `/swarm-execute`: parallelized implementation execution.
- `/swarm-review`: adversarial review from multiple perspectives.
- `/code-check`: SOLID/DRY/consistency and regression audit.

## AITimeMachine Hooks

- Before file changes: `before_action({ action: "description" })`
- After changes: `after_action({ action: "what was done", success: true })`

## gstack

Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /design-shotgun, /review, /ship, /land-and-deploy, /canary, /benchmark,
/browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy,
/retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard,
/unfreeze, /gstack-upgrade.
