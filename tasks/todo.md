# Current Pass Todo (Phase 14 Continuation)

## Scope
- [ ] Fix `web.recoder.xyz` static fallback so removed favicon paths return real `404` (not HTML `200` fallback).
- [ ] Validate GitHub OAuth callback flow on production.
- [ ] Validate Google OAuth callback flow on production.
- [ ] Update `plan.md` checkboxes for OAuth verification items completed in this pass.

## Progress Notes
- Nginx root cause identified for `web.recoder.xyz`: generic `location /` proxy causes missing favicon paths to fall through to Remix HTML response.
- Planned fix: explicit allowlist locations for current favicon/icon files + fallback rule returning `404` for unknown favicon/icon/logo variants.

## Review
- Pending.

---

## Follow-up Pass (2026-03-06) — Task 9 Localhost Hardcoding

### Scope
- [x] Replace hardcoded localhost fallbacks in Task 9 target files with env/runtime-resolved values.
- [x] Preserve local development behavior while blocking localhost leakage in production paths.
- [x] Verify Task 9 target files for remaining localhost hardcoding.
- [x] Run targeted validation for touched services.
- [x] Update `plan.md` Task 9 status with completion notes.

### Progress Notes
- Updated `docker-backend/src/server.ts` auth middleware to allow localhost-origin migration bypass only when not in production.
- Updated `recoder-agents/src/app/auth/actions.ts` to use `resolveAgentsSiteUrl()` instead of hardcoded `http://localhost` for password sign-in redirect normalization.
- Verified target Task 9 files for localhost fallbacks:
  - `app/lib/email.ts` uses production URL defaults / env values; no localhost templates.
  - `recoder-agents/src/app/auth/callback/route.ts` has no localhost fallback.
  - `recoder-agents/src/app/api/integrations/*/callback` has no localhost:8000 hardcoding.
  - SSH terminal component currently resides at `recoder-agents/src/components/thread/recoder-computer/components/SSHTerminal.tsx` and uses `resolveBackendApiUrl()`.
- Added root ignore rules for `**/.xcode.env`, `**/__pycache__/`, and `*.pyc` to prevent future commit blocks.
- Unstaged blocked artifacts from user commit attempt:
  - `apps/mobile/ios/.xcode.env`
  - `recoder-agency/apps/agency/__pycache__/start.cpython-314.pyc`

### Review
- `pnpm -C recoder-agents exec tsc --noEmit` passed.
- `pnpm -C docker-backend exec tsc --noEmit` failed due pre-existing unrelated A2A/shared-type errors.
