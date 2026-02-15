# Deploy Smoke: BYOK + Internal Auth

This verifies the deployed chain:
- `recoder-web /auth/verify` -> `app /api/auth/verify-token` (signed internal auth)
- `recoder-web /api/public/projects/prompt`
- `recoder-web /api/public/projects/task`
- `recoder-web /api/public/projects/task-stream`

## Prerequisites

- Deployed `app`, `recoder-web`, `docker-backend`
- Shared `INTERNAL_SERVICE_KEY` configured and matching between services
- A valid user session token for `recoder-web`
- A valid BYOK provider API key for prompt execution
- An existing `projectId`

## Required env vars

```bash
export RECODER_WEB_URL="https://your-recoder-web.example.com"
export AUTH_VERIFY_TOKEN="token-to-verify"
export USER_SESSION_TOKEN="session-token-value"
export PROJECT_ID="your-project-id"
export PUBLIC_API_KEY="your-byok-provider-key"
```

Optional:

```bash
export SESSION_COOKIE_NAME="recoder.session_token"
export MODEL_NAME="openai/gpt-4o-mini"
export TASK_POLL_ATTEMPTS="20"
export TASK_POLL_SLEEP_SECONDS="2"
export PROMPT_TEXT="Create a tiny hello-world update and report done."
```

## Run

```bash
pnpm -C recoder-web smoke:byok
```

## Section 2 Blockers (one command)

For the full Recoder Web + Docker backend blocker checklist (readiness + queue + billing decision + optional full BYOK smoke):

```bash
export RECODER_WEB_URL="https://web.recoder.xyz"
export BACKEND_URL="https://docker.recoder.xyz"
export BILLING_ACTIONS_ENABLED="false"   # or "true"
pnpm -C recoder-web smoke:prod-blockers
```

Root-level wrapper (recommended):

```bash
export BILLING_ACTIONS_ENABLED="false"   # or "true"
pnpm run smoke:phase1
```

Local preflight only (no network calls):

```bash
export BILLING_ACTIONS_ENABLED="false"
pnpm run check:phase1-env
```

If preflight reports INTERNAL_SERVICE_KEY mismatch, align keys:

```bash
pnpm run sync:internal-service-key
```

The wrapper runs:
- `GET /api/health/byok-readiness` on `recoder-web`
- `GET /api/health/public-api-readiness` on `recoder-web`
- `docker-backend/scripts/smoke-public-queue.sh`
- billing decision validation (`BILLING_ACTIONS_ENABLED=true|false`)
- optional `smoke:byok` if BYOK secret env vars are present

## CI Workflow

This repo includes `.github/workflows/byok-internal-auth-smoke.yml` for manual and post-deploy smoke runs.
It probes `GET /api/health/byok-readiness` first (non-blocking) and then runs full smoke when required secrets are available.

Recommended repository secrets:

- `SMOKE_RECODER_WEB_URL` (optional, default `https://web.recoder.xyz`)
- `SMOKE_MAIN_SITE_URL` (optional, default `https://recoder.xyz`)
- `SMOKE_PROJECT_ID` (required)
- `SMOKE_PUBLIC_API_KEY` (required)
- `SMOKE_USER_SESSION_TOKEN` (required)
- `SMOKE_AUTH_VERIFY_TOKEN` (optional; defaults to `SMOKE_USER_SESSION_TOKEN`)
- `SMOKE_SESSION_COOKIE_NAME` (optional; defaults to `__Secure-recoder.session_token`)
- `SMOKE_INTERNAL_SERVICE_KEY` (optional; enables signed direct-app preflight)

If required secrets are missing, the CI workflow reports a skipped smoke run (non-failing) with setup hints in the job summary.

## Pass criteria

- `/auth/verify` returns non-4xx/5xx
- prompt enqueue returns 2xx with `taskId`
- task polling reaches terminal status
- task stream returns SSE frames (`event:` or `data:` lines)
