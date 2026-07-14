# Domain: Identity & Auth

`backend/src/domains/identity/` — the single identity authority for the comprehensive Recoder backend.

## Overview

Identity is the **first seam** every other domain wires to. It hosts Better Auth
directly against the auth database (no proxy hop), owns the unified identity read
model, mints and validates `sk_` platform keys from Postgres, runs the CLI device
flow, and exposes the one credential-resolution port — `SessionVerifier` — that
turns *any* inbound credential (session cookie, `sk_` key, `INTERNAL_SERVICE_KEY`)
into a canonical `Principal`. The website proxies `/api/auth/*` and
`/internal/identity/*` to this domain; the desktop authenticates with `sk_` keys
and the device flow.

### Boundary (what this domain owns)

- **Better Auth host** — `/api/auth/[...all]` served in-process from `@recoder/auth`
  `createAuth()`, reading the auth DB directly. This backend is the auth origin;
  the website is a proxy.
- **Unified identity read model** over the *physically separate* `user` (Better Auth
  web) and `users` (legacy CLI plural) tables. See the reconciliation note below.
- **`sk_` platform API keys**, DB-backed (hashed at rest), replacing the current
  in-memory `validatePlatformApiKey`.
- **CLI device flow** (RFC 8628 shape): `device_code` / `user_code` grant, browser
  approval, token/`sk_`-key exchange.
- **Sessions + cross-subdomain cookies** on `.recoder.xyz` (reused from `@recoder/auth`).
- **OAuth / social / SSO** — GitHub + Google via Better Auth `socialProviders`
  (account linking already enabled upstream); SSO org-connection hook is stubbed at
  the org layer.
- **Orgs / teams + RBAC** — organizations, teams, memberships, invites, and a
  deterministic role→permission evaluator.
- **Service-to-service auth** — `INTERNAL_SERVICE_KEY` verification (constant-time),
  reused from the `bridge-auth` pattern, surfaced as `requireInternal`.

### Reconciliation note (`user` vs `users`)

The repo's critical rule (`AGENTS.md`, `@recoder/auth/cross-domain.ts`) is: **do
not merge the `user` and `users` models** — `user` = Better Auth web identity,
`users` = legacy CLI plural. The domain brief asks for a "unified identity model."
Both are satisfied by unifying at the **read-model / port level, not the physical
table level**:

- Better Auth keeps owning `user`, `session`, `account`, `verification` (via its own
  Prisma layer in `@recoder/auth`). This domain **does not recreate** those tables.
- A new `user_cli_link` table maps a legacy `users.id` (CLI) to a canonical
  `user.id` (web). `IdentityRepository.resolveIdentity()` returns one `Identity`
  regardless of which table a caller arrived through.
- Migration `0004` **backfills links, never drops** the plural table. The physical
  models stay separate; callers see one identity.

## File tree (36 files under `backend/src/domains/identity/`)

```
identity/
  index.ts                              # createIdentityModule() factory + public IdentityModule interface
  identity-module.ts                    # composer: fuses better-auth + verifier + keys + device + orgs + rbac
  types.ts                              # Identity, Principal, PlatformApiKey, DeviceGrant, Org, Team, Role, Permission
  config.ts                             # IdentityConfig slice of AppConfig (secrets refs, TTLs, cookie domain)
  health.ts                             # health(): better-auth | auth-db | key-store | device-store | org-store
  ports/
    session-verifier.port.ts            # SessionVerifier — identity→ALL domains (the load-bearing seam)
    identity-repository.port.ts         # IdentityRepository — unified read model over user/users
    api-key-store.port.ts               # ApiKeyStore — sk_ key persistence contract
    device-grant-store.port.ts          # DeviceGrantStore — device/user code persistence contract
    org-store.port.ts                   # OrgStore/TeamStore/MembershipStore + PermissionEvaluator contracts
  adapters/
    better-auth.adapter.ts              # wraps @recoder/auth createAuth() + toNodeHandler; degrade-safe
  api-key.service.ts                    # mint/validate/revoke sk_ keys (sha256+pepper, prefix index, last-used)
  device-flow.service.ts               # RFC-8628 device authorization + rate-limited polling
  principal.service.ts                  # implements SessionVerifier: cookie | sk_ | internal-key → Principal
  org.service.ts                        # orgs/teams/memberships/invites lifecycle (governance-gated writes)
  rbac.service.ts                       # implements PermissionEvaluator: role→permission expansion + can()
  routes/
    auth.routes.ts                       # /api/auth/[...all] (Better Auth) + GET /api/auth/session
    api-keys.routes.ts                  # /api/identity/keys CRUD (session-gated)
    device.routes.ts                    # /api/identity/device/{code,token,approve}
    orgs.routes.ts                      # /api/identity/orgs + teams + members + invites
    internal-identity.routes.ts         # /internal/identity/{resolve,validate-key} (INTERNAL_SERVICE_KEY)
  middleware/
    authenticate.middleware.ts          # authenticate/authenticateMutating/requireAdmin/requireInternal/requirePermission
  mcp/
    identity-engine.ts                  # registerIdentityMcpTools: identity_whoami/key_mint/key_list/key_revoke
  migrations/
    0001-identity-keys.sql              # platform_api_key
    0002-device-grants.sql              # device_grant
    0003-orgs-teams-rbac.sql            # organization, team, org_membership (+ org_permission_override)
    0004-legacy-users-link.sql          # user_cli_link (unify without merge; backfill, never drop)
  __tests__/
    api-key.service.test.ts             # mint/hash/validate/revoke/expiry + timing safety
    device-flow.service.test.ts        # grant lifecycle, poll rate-limit, expiry, approval race
    principal.service.test.ts          # cookie/sk_/internal precedence, anonymous fallback, invalid token
    rbac.service.test.ts               # role expansion, can() allow/deny, org isolation
    internal-identity.routes.test.ts   # INTERNAL_SERVICE_KEY gate (integration: resolve + validate-key)
```

## Per-file responsibilities

| Path | Lang | Kind | Responsibility | Key exports |
|------|------|------|----------------|-------------|
| `index.ts` | ts | service | Pure factory + the ONE public interface for the domain. | `createIdentityModule(deps)`, `interface IdentityModule` |
| `identity-module.ts` | ts | service | Composer that fuses every engine/service behind `IdentityModule`; wires the governance gate around all writes; owns `health()`. | `class IdentityModuleImpl` |
| `types.ts` | ts | type | Canonical domain types. `Principal` is the cross-domain shape. | `Identity`, `Principal`, `PrincipalKind`, `PlatformApiKey`, `DeviceGrant`, `Org`, `Team`, `Membership`, `Role`, `Permission` |
| `config.ts` | ts | config | Typed `IdentityConfig` slice taken from `AppConfig` (never reads `process.env`). Fails SAFE: missing secret → engine reports `down`. | `IdentityConfig`, `sliceIdentityConfig(appConfig)` |
| `health.ts` | ts | service | Aggregates per-engine `up\|down` (better-auth secret present? auth-db reachable? stores reachable?). Truthful, `degraded` flagged. | `buildIdentityHealth(deps): HealthReport` |
| `ports/session-verifier.port.ts` | ts | port | **The identity→ALL seam.** Resolve any credential to a `Principal`. | `interface SessionVerifier { verify(cred): Promise<Principal \| null> }` |
| `ports/identity-repository.port.ts` | ts | port | Unified read model over `user`/`users`; link + resolve. | `interface IdentityRepository { resolveIdentity, findUserById, resolveCliUser, linkLegacyUser }` |
| `ports/api-key-store.port.ts` | ts | port | `sk_` key persistence contract (business logic depends on this, not on pg). | `interface ApiKeyStore { insert, findByPrefix, listForUser, revoke, touchLastUsed }` |
| `ports/device-grant-store.port.ts` | ts | port | Device/user-code persistence contract. | `interface DeviceGrantStore { create, findByDeviceCodeHash, findByUserCode, approve, consume, expireStale }` |
| `ports/org-store.port.ts` | ts | port | Org/team/membership persistence + the `PermissionEvaluator` interface RBAC implements. | `interface OrgStore`, `interface MembershipStore`, `interface PermissionEvaluator { can(principal, action, resource) }` |
| `adapters/better-auth.adapter.ts` | ts | client | Wraps `@recoder/auth` `createAuth()`, exposes the Node handler for the catch-all route; supplies `sendMagicLink`/`sendResetPassword` bound to the observability/notify edge; degrades to `down` when `BETTER_AUTH_SECRET`/`AUTH_DATABASE_URL` missing (never fakes a 200). | `createBetterAuthAdapter(cfg)`, `BetterAuthAdapter` |
| `api-key.service.ts` | ts | service | Mint `sk_<base62>` keys; store only `sha256(pepper + key)` + a lookup prefix; validate in constant time; enforce expiry/revocation; update `last_used_at` async. Every mint/revoke passes `GovernanceGate.decide()`. | `class ApiKeyService { mint, validate, list, revoke }` |
| `device-flow.service.ts` | ts | service | RFC-8628 shape: `requestGrant()` returns `device_code`+`user_code`; `approve(userCode, principal)` binds it to a user; `exchange(deviceCode)` mints an `sk_` key and consumes the grant; `slow_down`/`authorization_pending`/`expired_token` polling semantics with interval rate-limit. | `class DeviceFlowService { requestGrant, approve, exchange, pollStatus }` |
| `principal.service.ts` | ts | service | **Implements `SessionVerifier`.** Resolution precedence: `INTERNAL_SERVICE_KEY` → `sk_` platform key → Better Auth session cookie/bearer → anonymous fallback (policy-controlled by `STRICT_AUTH`). Reuses `@recoder/auth` `verifySessionToken` + `ApiKeyService.validate` + constant-time internal-key check. | `class PrincipalService implements SessionVerifier`, `resolveInternalServiceSession`, `getAnonymousFallbackIdentity` |
| `org.service.ts` | ts | service | Create orgs, teams, memberships, invites; enforce single-owner + slug uniqueness; SSO-connection hook stub. Writes governance-gated. | `class OrgService { createOrg, addTeam, invite, acceptInvite, listForUser }` |
| `rbac.service.ts` | ts | service | **Implements `PermissionEvaluator`.** Expand `role` → permission set (`owner⊃admin⊃member⊃viewer`), consult `@recoder/agent-policy` for deterministic decisions, enforce org isolation (`WHERE org_id = principal.orgId`). | `class RbacService implements PermissionEvaluator`, `ROLE_PERMISSIONS`, `can()` |
| `routes/auth.routes.ts` | ts | route | Mount the Better Auth Node handler at `/api/auth/*` (catch-all), plus `GET /api/auth/session` returning the resolved `Principal`. Public edge; still passes the interop chain for audit. | `buildAuthRouter(module, deps)` |
| `routes/api-keys.routes.ts` | ts | route | `GET/POST /api/identity/keys`, `DELETE /api/identity/keys/:id`. Session-gated; zod body validation; `sendSuccess`/`sendError`. | `buildApiKeysRouter(module, deps)` |
| `routes/device.routes.ts` | ts | route | `POST /api/identity/device/code` (start), `POST /api/identity/device/token` (poll/exchange), `POST /api/identity/device/approve` (browser, session-gated). | `buildDeviceRouter(module, deps)` |
| `routes/orgs.routes.ts` | ts | route | Orgs/teams/members/invites CRUD; `requirePermission` per action. | `buildOrgsRouter(module, deps)` |
| `routes/internal-identity.routes.ts` | ts | route | `POST /internal/identity/resolve` (cookie/key → Principal for the website proxy), `POST /internal/identity/validate-key`. `INTERNAL_SERVICE_KEY`-gated via `requireInternal`. | `buildInternalIdentityRouter(module, deps)` |
| `middleware/authenticate.middleware.ts` | ts | middleware | Express factories built on `SessionVerifier`: `authenticate`, `authenticateMutating`, `requireAdmin` (`ADMIN_USER_IDS`), `requireInternal` (constant-time), `requirePermission(action)`, `verifyOrgAccess`. Moves the `server.ts` auth block behind the composer. | `createAuthMiddleware(module): { authenticate, authenticateMutating, requireAdmin, requireInternal, requirePermission, verifyOrgAccess }` |
| `mcp/identity-engine.ts` | ts | service | MCP tools conforming to `@recoder/agent-mcp` ToolRouter: `identity_whoami`, `identity_key_mint`, `identity_key_list`, `identity_key_revoke`. Each passes `authorize→risk→policy→audit`. | `registerIdentityMcpTools(router, module)` |
| `migrations/0001-identity-keys.sql` | sql | migration | `platform_api_key` table + indexes on `key_prefix`, `user_id`. | — |
| `migrations/0002-device-grants.sql` | sql | migration | `device_grant` table + unique `user_code`, index on `device_code_hash`, `expires_at`. | — |
| `migrations/0003-orgs-teams-rbac.sql` | sql | migration | `organization`, `team`, `org_membership`, `org_permission_override`. | — |
| `migrations/0004-legacy-users-link.sql` | sql | migration | `user_cli_link` (auth_user_id ↔ legacy_users_id) + backfill; **no DROP** of `users`. | — |
| `__tests__/api-key.service.test.ts` | ts | test | Mint format, hash-at-rest (raw key never stored), constant-time validate, expiry/revocation, prefix collision. | — |
| `__tests__/device-flow.service.test.ts` | ts | test | Grant lifecycle, poll `authorization_pending`/`slow_down`, expiry, double-consume race, approval binds correct user. | — |
| `__tests__/principal.service.test.ts` | ts | test | Credential precedence, anonymous fallback under `STRICT_AUTH` on/off, invalid/expired token → null. | — |
| `__tests__/rbac.service.test.ts` | ts | test | Role expansion, `can()` allow/deny matrix, cross-org isolation denial. | — |
| `__tests__/internal-identity.routes.test.ts` | ts | test (integration) | `INTERNAL_SERVICE_KEY` gate: valid key resolves, missing/short/placeholder key → 401/503; resolve + validate-key round-trip. | — |

## DB schema (owned by this domain; runner in `domains/persistence`)

> Better Auth tables (`user`, `session`, `account`, `verification`) are owned by
> `@recoder/auth` and are **not** redefined here. Legacy CLI `users` is pre-existing;
> this domain only *links* to it.

```sql
-- 0001 platform_api_key : sk_ keys, DB-backed, hashed at rest
CREATE TABLE platform_api_key (
  id           TEXT PRIMARY KEY,               -- uuid
  user_id      TEXT NOT NULL,                  -- owning identity (canonical user.id)
  org_id       TEXT,                           -- optional org scoping
  name         TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,                  -- first ~12 chars, indexed lookup (e.g. sk_live_ab12)
  key_hash     TEXT NOT NULL,                  -- sha256(pepper || raw_key); raw NEVER stored
  scopes       JSONB NOT NULL DEFAULT '[]',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pak_prefix ON platform_api_key (key_prefix);
CREATE INDEX idx_pak_user   ON platform_api_key (user_id);

-- 0002 device_grant : RFC-8628 CLI device flow
CREATE TABLE device_grant (
  id                TEXT PRIMARY KEY,
  device_code_hash  TEXT NOT NULL,             -- sha256 of the device_code
  user_code         TEXT NOT NULL UNIQUE,      -- short human code (e.g. WDJB-MJHT)
  user_id           TEXT,                      -- set on approval
  status            TEXT NOT NULL DEFAULT 'pending', -- pending|approved|consumed|expired
  scopes            JSONB NOT NULL DEFAULT '[]',
  client_id         TEXT NOT NULL,
  interval_seconds  INT  NOT NULL DEFAULT 5,
  last_polled_at    TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dg_devicehash ON device_grant (device_code_hash);
CREATE INDEX idx_dg_expires    ON device_grant (expires_at);

-- 0003 orgs / teams / rbac
CREATE TABLE organization (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  sso_connection JSONB,                        -- optional SSO/SAML config hook
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE team (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organization(id),
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE TABLE org_membership (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organization(id),
  user_id    TEXT NOT NULL,
  team_id    TEXT REFERENCES team(id),
  role       TEXT NOT NULL DEFAULT 'member',  -- owner|admin|member|viewer
  status     TEXT NOT NULL DEFAULT 'invited', -- invited|active
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE TABLE org_permission_override (       -- optional per-membership grants/denies
  id            TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES org_membership(id),
  permission    TEXT NOT NULL,
  effect        TEXT NOT NULL DEFAULT 'allow' -- allow|deny
);

-- 0004 legacy link : unify user/users WITHOUT merging (backfill, never drop)
CREATE TABLE user_cli_link (
  auth_user_id   TEXT NOT NULL,               -- canonical user.id (Better Auth)
  legacy_users_id TEXT NOT NULL,              -- legacy users.id (CLI plural)
  linked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, legacy_users_id)
);
```

All access is app-layer scoped (`WHERE user_id = :user_id` / `WHERE org_id = :org_id`),
parameterized `:param` SQL via the persistence `QueryExecutor`. **No Supabase RLS.**

## HTTP / WS edges

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| ALL | `/api/auth/[...all]` | public (Better Auth) | sign-in/up, social, magic-link, reset, session mgmt |
| GET | `/api/auth/session` | cookie/bearer | resolve current `Principal` |
| GET | `/api/identity/keys` | session | list caller's `sk_` keys (masked) |
| POST | `/api/identity/keys` | session | mint `sk_` key (returns raw once) — governance write |
| DELETE | `/api/identity/keys/:id` | session | revoke key — governance write |
| POST | `/api/identity/device/code` | public (client_id) | start device flow → `device_code`+`user_code` |
| POST | `/api/identity/device/token` | device_code | poll/exchange → `sk_` key or `authorization_pending`/`slow_down` |
| POST | `/api/identity/device/approve` | session | browser approves a `user_code` |
| GET/POST | `/api/identity/orgs` | session + `requirePermission` | list/create orgs |
| POST | `/api/identity/orgs/:id/{teams,members,invites}` | session + `requirePermission` | org management |
| POST | `/internal/identity/resolve` | `INTERNAL_SERVICE_KEY` | website proxy: credential → `Principal` |
| POST | `/internal/identity/validate-key` | `INTERNAL_SERVICE_KEY` | validate an `sk_` key for another service |

Routes are mounted by the **`edge`** domain's route-mount table; every edge + MCP
call passes the `@recoder/interop` `authorize→risk→policy→audit` chain.

## Interfaces

**Exposes (identity → other domains):**

- `SessionVerifier.verify(cred): Promise<Principal | null>` — the load-bearing seam;
  consumed by the `edge`/`http` layer and any domain guarding a request.
- `Principal` type — `{ userId, orgId?, sessionId, kind: 'user'|'apikey'|'internal'|'anonymous', scopes, isAnonymous }`.
- `PermissionEvaluator.can(principal, action, resource)` — consumed by any domain
  doing authorization (agent-os approvals, billing, governance).
- `ApiKeyStore` / `IdentityRepository` — for domains that must resolve a user (billing, conductor).
- MCP tools via `identity-engine.ts` (`identity_whoami` etc.).

**Consumes (other domains → identity):**

- `QueryExecutor` / `Repository` (persistence) — all DB access.
- `GovernanceGate.decide()` (governance) — every write (key mint/revoke, org mutation).
- `InteropChain` (interop) — every edge + MCP call.
- `AppConfig` slice (bootstrap) — secrets, cookie domain, TTLs.
- `@recoder/auth` — Better Auth engine, session verify, cross-subdomain cookie helpers.
- `@recoder/agent-policy` — deterministic RBAC decisions.
- `@recoder/agent-mcp` — ToolRouter shape.
- `@recoder/logger` — child logger tagged `identity`.

## Reuse vs new

**REUSE (do not rebuild):**

- `@recoder/auth` — `createAuth()`, `verifySessionToken`, `parseSessionToken`,
  `COOKIE_DOMAIN`, `SURFACE_ORIGINS`, cross-domain helpers, magic-link/social config.
  This domain is the *host* of that engine, not a reimplementation.
- `backend/src/a2a/bridge-auth.ts` pattern (`verifyBridgeBearer`, constant-time
  `timingSafeEqual`) → generalized into `requireInternal`.
- `server.ts` auth block (`authenticateRequest`, `authenticateMutating`,
  `requireAdmin`, `verifyProjectOwnership`, `resolvePlatformApiKeySession`,
  `resolveInternalServiceSession`, `getAnonymousFallbackIdentity`, `STRICT_AUTH`
  gating) → **moved behind** `principal.service.ts` + `authenticate.middleware.ts`
  (no 4th copy; the server.ts inline versions are deleted once mounted).
- `agent-os/service-container.ts` factory pattern → `createIdentityModule(deps)`.
- `agent-os/middleware/schema-guard.middleware.ts` degrade-safe validation pattern.
- `database/query-executor.ts` parameterized-SQL pattern (now provided by the
  `persistence` domain as `QueryExecutor`).
- Verification scripts: `scripts/sso-logout-matrix.sh`,
  `verify-auth-email-reset-e2e.sh`, `verify-cli-device-flow-e2e.sh`,
  `verify-byok-e2e.sh`.

**NEW (write from scratch):**

- DB-backed `sk_` key store + `api-key.service.ts` (today `validatePlatformApiKey`
  is in-memory only — memory note: "sk_ keys → Postgres in identity").
- `device-flow.service.ts` + `device_grant` table (no device flow exists in backend today).
- Orgs/teams/RBAC (`org.service.ts`, `rbac.service.ts`, migration `0003`).
- `user_cli_link` unification (migration `0004`) + `IdentityRepository.resolveIdentity`.
- The `SessionVerifier` / `PermissionEvaluator` ports and the composer.

## Implementation order

1. **Ports + types + config** (`ports/*`, `types.ts`, `config.ts`) — freeze the
   `SessionVerifier`/`Principal` seam first; the other 13 domains compile against it.
2. **better-auth adapter + auth.routes** — host `/api/auth/*` reading the DB directly;
   verify with `sso-logout-matrix.sh`.
3. **principal.service** (implements `SessionVerifier`) + **authenticate.middleware** —
   move the server.ts auth block behind the composer; internal-key + anonymous paths.
4. **api-key.service + store + migration 0001 + api-keys.routes** — DB-backed `sk_`;
   verify with `verify-byok-e2e.sh` shape.
5. **device-flow.service + store + migration 0002 + device.routes** — verify with
   `verify-cli-device-flow-e2e.sh`.
6. **orgs + rbac + migrations 0003** — org.service, rbac.service, requirePermission.
7. **migration 0004 + IdentityRepository unification** — backfill `user_cli_link`.
8. **internal-identity.routes + mcp/identity-engine + health.ts** — wire MCP via the
   checklist (IN_PROC_SERVERS + ENGINE_SERVERS + registerIdentityMcpTools), aggregate health.
9. **Tests throughout** (co-located), then `pnpm check-types` + `pnpm test:contracts:agent-os`.

## Degrade-safe behavior

- Missing `BETTER_AUTH_SECRET`/`AUTH_DATABASE_URL` → better-auth engine `down`, auth
  routes return `SERVICE_UNAVAILABLE`, health truthful. **Never a faked 200.**
- Missing `INTERNAL_SERVICE_KEY` → `requireInternal` fail-closed (503), per bridge-auth.
- Auth DB unreachable → `SessionVerifier` returns null (not throw); edges 401/503; `STRICT_AUTH`
  decides whether anonymous fallback is permitted (prod = strict).
- Error envelope: `sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE|AUTH_REQUIRED|AUTHZ_PROJECT_ACCESS_DENIED, msg))`.
  No `FORBIDDEN`/`EXTERNAL_SERVICE_ERROR` codes.
