# Rotate the 3 tokens exposed in git history (operator runbook)

> Context: the 2026-06-30 security audit + S0 hotfixes (see
> `docs/superpowers/plans/2026-07-11-s0-security-hotfixes.md`, Task 3) removed
> the tokens from the working tree, but they remain readable in git history.
> Rotation is the only real remediation. All three are operator actions — they
> need your dashboards/accounts, ~10 minutes total.

## 1. Daytona API key (`DAYTONA_API_KEY`)

Consumers: `docker-backend/src/daytona-client.ts`, `daytona-sdk.ts`,
`daytona-lsp.ts` (sandbox substrate).

1. Open the Daytona control plane (self-hosted dashboard) → API Keys.
2. Create a new key, then **revoke** the exposed one (create first so running
   services can be switched without a gap).
3. Update `DAYTONA_API_KEY` in:
   - the production env for `docker-backend` (Hetzner box, PM2/compose env)
   - your local `docker-backend/.env`
4. Restart `docker-backend`. Verify: create a Daytona-substrate workspace or
   hit the substrates health — `daytona` must report available with the new key.

## 2. Recoder platform API key (`RECODER_API_TOKEN`, the `pk_…:sk_…` pair)

Consumers: MCP servers / CLI (`docs/code/mcp.md` §auth) — routed as `x-api-key`.

1. In the Recoder platform (recoder.xyz account settings → API keys), mint a
   new key pair.
2. Revoke/delete the exposed pair.
3. Update `RECODER_API_TOKEN` wherever it is set: shell profiles, `.mcp.json`
   files, CI-less local scripts. (`grep -r RECODER_API_TOKEN ~/.claude ~/.mcp.json
   ~/.zshrc` to find stragglers — do not commit any of them.)

## 3. Recoder session token (`RECODER_SESSION_TOKEN` / `PLATFORM_TOKEN`)

Consumers: a2a-server MCP tools (bearer for control plane + conductor).

1. Session tokens are Better Auth sessions — invalidate by signing out that
   session on recoder.xyz (or clear the session row in `recoder_main`), then
   sign in again and copy the fresh token.
2. Update `RECODER_SESSION_TOKEN` in the same places as §2 step 3.

## Verification

- Old Daytona key returns 401 against the Daytona API.
- Old `pk_…:sk_…` returns 401 on any `/api/*` route.
- MCP tools still work with the new values (`recoder_list_agents` responds).

## After rotation

- Close/annotate the "secrets in git history" bd issue with the rotation date.
- History scrub (filter-repo/BFG) is optional once all three are dead keys;
  rotation is the load-bearing fix.
