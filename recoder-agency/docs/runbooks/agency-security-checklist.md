# Recoder Agency Security Checklist

## Required Secrets Inventory

| Variable | Purpose | Min Length |
|----------|---------|------------|
| `DATABASE_URL` | PostgreSQL connection string | N/A |
| `BETTER_AUTH_SECRET` | Session signing key | 16 chars |
| `COOKIE_SECRET` | Signed cookie encryption | 16 chars |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM OAuth token encryption | 32 bytes (base64) |
| `POLAR_ACCESS_TOKEN` | Polar.sh API access | 16 chars |

## Pre-Deploy Verification

1. Confirm all required env vars are set (the app crashes on startup if `DATABASE_URL` or `BETTER_AUTH_SECRET` are missing).
2. Confirm no secret uses a placeholder value (`changeme`, `xxx`, `placeholder`, etc.) — the app warns on startup.
3. Confirm `BETTER_AUTH_URL` matches the actual public URL (login redirects break otherwise).
4. Confirm social OAuth providers are only registered when both client ID and secret are present.
5. Confirm Sentry is enabled (`SENTRY_ENABLED=true` or `NODE_ENV=production`).

## Secret Rotation Procedure

### Rotating `BETTER_AUTH_SECRET`

1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set the new value in the deploy environment.
3. Redeploy the application.
4. All existing sessions are invalidated — users must re-authenticate.

### Rotating `COOKIE_SECRET`

1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set the new value in the deploy environment.
3. Redeploy. Existing cookies become unreadable; users are logged out.

### Rotating `TOKEN_ENCRYPTION_KEY`

1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Set the new value in the deploy environment.
3. Redeploy. Previously encrypted OAuth tokens cannot be decrypted — users must re-link OAuth providers.

### Rotating `POLAR_ACCESS_TOKEN`

1. Generate a new access token in the Polar.sh Dashboard (Settings > Developers > Personal Access Tokens).
2. Set the new value in the deploy environment.
3. Redeploy. Verify webhook signatures still validate (update `POLAR_WEBHOOK_SECRET` if the endpoint was recreated).

## Credential Rotation Schedule

| Cadence | Secrets |
|---------|---------|
| Every 90 days | `BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `TOKEN_ENCRYPTION_KEY` |
| On compromise | All secrets immediately |
| On team member departure | All secrets within 24 hours |
