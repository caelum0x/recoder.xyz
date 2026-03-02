# Cross-Surface Auth Inconsistencies (SFA-008)

Updated: 2026-02-24

## Scope

Surfaces reviewed:
- `app` (`recoder.xyz`)
- `recoder-frontend` (`frontend.recoder.xyz`)
- `recoder-agency` (`agency.recoder.xyz`)
- `recoder-studio` (`studio.recoder.xyz`)
- `recoder-pm` (`pm.recoder.xyz`)
- `packages/auth` (shared Better Auth package)

## Findings

1. Session verification logic was duplicated in route handlers.
- Example: `recoder-frontend` read cookie names directly and called `verifySessionToken` manually.
- Risk: drift in cookie-name support and token parsing behavior.

2. Secret fallback chains differ across apps.
- Some flows use `SESSION_SYNC_SECRET || BETTER_AUTH_SECRET || JWT_SECRET`.
- Others hard-require `BETTER_AUTH_SECRET`.
- Risk: inconsistent behavior between local/prod and harder incident debugging.

3. Two parallel auth paths exist by design:
- Web users in Better Auth tables (`user`, `session`, `account`).
- CLI users in app table (`users`).
- This is intentional, but requires strict resolver utilities to avoid wrong-table lookups.

4. Cross-surface sync token (`recoder-session-sync`) is separate from Better Auth session cookie.
- This is expected for propagation across surfaces, but must not be treated as a full auth session replacement.

## Completed in this pass

1. Added explicit shared verification export surface:
- `packages/auth/package.json` now exports `./verify`.
- `packages/auth/src/index.ts` now re-exports verification helpers/types.

2. Migrated `recoder-frontend` API routes to shared verifier:
- `recoder-frontend/src/app/api/auth/session/route.ts`
- `recoder-frontend/src/app/api/user/profile/route.ts`
- Both now call `verifySession(...)` from `@recoder/auth/verify` instead of duplicating cookie/token logic.
3. Migrated server-side session loaders in remaining web surfaces:
- `recoder-agency/apps/agency/lib/auth/server.ts`
- `recoder-studio/lib/auth/server.ts`
- `recoder-pm/packages/backend/auth/server.ts`
- These paths no longer read `SESSION_COOKIE_NAMES` directly and now use `verifySession(...)`.

## Standard Going Forward

1. API/server routes that need authenticated web user must use `@recoder/auth/verify` (`verifySession`).
2. Edge middleware must use edge-safe helpers only (`hasSessionCookie`, `extractSessionToken`) from `@recoder/auth/src/edge` and avoid DB-bound verification.
3. `BETTER_AUTH_SECRET` remains required baseline secret; fallback chains are allowed only for explicit sync/migration paths.
4. Keep CLI auth (`users`) and web auth (`user`/Better Auth) intentionally separate; resolve through shared auth-helper layers.
