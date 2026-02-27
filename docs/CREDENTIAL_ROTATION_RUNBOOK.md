# Credential Rotation Runbook (Remaining Manual Work)

Last updated: 2026-02-27

## Goal
Rotate previously exposed credentials in provider dashboards, update production runtime secrets, and verify services stay healthy.

## Scope
1. Database and Redis credentials
2. OAuth client secrets (Google, GitHub, Discord)
3. AI provider API keys (OpenAI, Anthropic, Groq, Google AI, OpenRouter)
4. Payment and webhook secrets (Dodo, Paddle, Polar)
5. App auth/security secrets (Better Auth, NextAuth, session sync, JWT, encryption)
6. Internal service and A2A shared tokens

## Pre-flight
1. Snapshot current runtime key presence (no values):
```bash
bash scripts/credential-rotation-audit.sh remote
```
2. Confirm deploy stack is healthy before rotating.

## Rotation Order (recommended)
1. Add new secrets in providers first (do not remove old yet).
2. Update server-side runtime env values.
3. Redeploy stack (`bash scripts/deploy-all-services.sh`).
4. Verify health (`app/web/backend/openclaw/prometheus/alertmanager`).
5. Remove/revoke old provider secrets only after successful verification.

## Execution Checklist
- [ ] DB credentials rotated and applied
- [ ] Redis password rotated and applied
- [ ] OAuth secrets rotated and applied
- [ ] AI provider keys rotated and applied
- [ ] Payment/webhook secrets rotated and applied
- [ ] Auth/JWT/encryption secrets rotated and applied
- [ ] Internal service + A2A tokens rotated and applied
- [ ] Full deploy completed after rotation
- [ ] Post-rotation audit captured (`scripts/credential-rotation-audit.sh remote`)

## Post-rotation Verification
1. Run unified verifier:
```bash
bash scripts/post-rotation-verify.sh
```
2. Optional monitoring proof (synthetic alert):
```bash
RUN_ALERT_TEST_FIRE=true bash scripts/post-rotation-verify.sh
```

3. Collect generated artifacts from:
- `logs/post-rotation-verify/<run-id>.log`
- `logs/post-rotation-verify/<run-id>-summary.md`
- `logs/post-rotation-verify/<run-id>-summary.json`
- `logs/post-rotation-verify/<run-id>-audit.txt`

## Troubleshooting
- `3/5 Monitoring stack verification` fails and `recoder-alertmanager` restarts:
  - Check `docker logs recoder-alertmanager` for startup-template errors.
  - Ensure `/root/recoder.xyz/scripts/alertmanager-entrypoint.sh` is current and alertmanager is recreated.
- `recoder-redis-exporter` unhealthy with healthcheck exec errors:
  - Ensure `docker-compose.deploy.yml` uses `["CMD", "/redis_exporter", "--version"]` for redis-exporter healthcheck.
  - Recreate service: `docker compose -f docker-compose.deploy.yml up -d --force-recreate redis-exporter`.

## Evidence to keep
- Provider rotation timestamps
- Deploy log for the rotation rollout
- Output of `scripts/credential-rotation-audit.sh remote`
- Service health check outputs
- Post-rotation verifier run artifacts under `logs/post-rotation-verify/`
