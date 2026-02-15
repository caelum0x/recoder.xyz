# Recoder Agency Release Promotion Runbook

## Purpose

Promote a staging-validated ref to production with a manual approval gate.

Workflow:
- `.github/workflows/promote-staging-to-production.yml`

## Prerequisites

1. `Deploy Gate` is green for the candidate ref.
2. GitHub environment `production-promotion` exists with required reviewers.
3. Secret `PRODUCTION_DEPLOY_WEBHOOK_URL` is set.

## Promotion steps

1. Open GitHub Actions and run `Promote Staging To Production`.
2. Set `candidate_ref` (branch/tag/SHA).
3. Set `dry_run=true` for rehearsal, `false` for real deploy.
4. Approve the environment gate when prompted.
5. Confirm deploy webhook succeeded.

## Verification

1. Check production `/api/health` returns `200`.
2. Check key admin and client routes load.
3. Confirm no new high/critical findings in `Security Container Scan`.

## Rollback

1. Redeploy previous stable ref through the same workflow.
2. If needed, execute DB rollback snippets from:
   - `docs/runbooks/agency-delivery-rollback-snippets.sql`
