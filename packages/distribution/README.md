# @recoder/distribution

The Recoder **Distribution** subsystem (buildable TypeScript slice). It is how
Recoder *ships* and *monetizes*: the CLI distribution channel + device-flow
auth, package/tap publishing (npm + Homebrew + signed desktop builds),
billing & entitlements over a typed Polar (Merchant of Record) port, and a gated
delivery engine.

> Distribution is an **adapter around Recoder state, not an owner of it.**
> Canonical artifact/approval/task/memory state lives in `@recoder/agent-os`.
> Distribution *consumes* `Artifact`/`Approval`, *executes* customer-visible
> delivery **only under a governance approval gate**, and *emits* `RunEvent`
> records back to Recoder with truthful evidence.

This package is the control-plane–facing TS slice of the distribution subsystem. The
durable Python billing engine (`py/recoder-billing`, the fused Polar money/
entitlement authority) is a separate deliverable reached over a typed port.

## Hard rules (enforced, not just documented)

- **Fail safe.** A missing key (`POLAR_ACCESS_TOKEN`, signing keys, `NPM_TOKEN`,
  desktop release secrets) degrades to an explicit `unhealthy` health state and
  a **deny** — never a faked allow / faked "ok". See `engine/fail-safe.ts`,
  `polar-billing-adapter.ts`, `billing-health.ts`, `release-secrets.ts`.
- **recoder.xyz is the auth source of truth.** Device-flow approval, CLI token
  issuance, verification, and refresh all defer to the `AuthPort` (backed by
  recoder.xyz). Distribution never becomes a second identity authority.
- **Approval gate is fail-closed.** Customer-visible deliveries (npm, homebrew,
  desktop, mobile, web_site) **pause** on `approval_requested` and only proceed
  on a recorded `Approval{status:'approved'}`. Distribution cannot self-approve.
- **No hardcoded localhost/domains.** All public URLs are built from config;
  secrets come from env/vault only (`config/env-keys` documents names, not
  values).

## Layout

```
src/
├── domain/                 # Zod-backed value types + DTOs
│   ├── semver, subscription-plan (+ feature matrix), entitlement, quota,
│   ├── device-grant, cli-token (+ RecoderAuthData), license-key,
│   ├── package-spec, tap-formula, channel, health-state, delivery
├── ports/                  # typed dependency interfaces
│   ├── auth-port (recoder.xyz verify), secret-port, billing-port,
│   ├── entitlement-port, approval-port, event-bus-port, tap-port, notarize-port
├── engine/                 # the uniform gated delivery core
│   ├── delivery-pipeline (entitlement → approval → publish → verify → receipt),
│   ├── entitlement-gate, approval-gate, fail-safe, receipt-builder,
│   ├── channel-publisher, distribution-engine
├── channels/
│   ├── cli-dist/device-flow/   # FUSED web-cli-auth-bridge + RecoderAuthService
│   │   ├── device-authorize, browser-authorize, device-poll,
│   │   ├── cli-token-issuer, cli-token-verifier, token-store, device-grant-store
│   ├── billing/                # TS view of fused Polar (Merchant of Record)
│   │   ├── billing-service, entitlement-resolver (deny-on-miss),
│   │   ├── entitlement-cache, quota-service, quota-enforcer, license-key-service,
│   │   ├── plan-catalog, health/billing-health,
│   │   ├── adapters/polar-billing-adapter  # REAL typed fetch client to Polar
│   │   └── webhook/                # Polar webhook → entitlement change
│   │       ├── webhook-signature (Standard-Webhooks HMAC verify, replay guard),
│   │       ├── webhook-event, webhook-to-entitlement, billing-webhook-handler
│   ├── org/                    # ENTERPRISE: org + seat domain
│   │   ├── organization (+ per-plan seat limits), seat, org-store,
│   │   └── seat-service (assign/revoke, seat caps, org-scoped entitlements)
│   ├── device-registry/        # ENTERPRISE: device registration + revoke
│   │   ├── device-registration (SHA-256 fingerprint hash), device-store,
│   │   ├── device-registry-service (register/list/revoke),
│   │   └── device-bound-refresh  # a revoked device cannot refresh a CLI token
│   ├── sso/                    # ENTERPRISE: org SSO
│   │   ├── oidc-config, jwks (JWKS fetch + JWK import + cache),
│   │   ├── oidc-verifier (REAL RS*/ES* id-token verify: sig + iss/aud/exp),
│   │   └── saml (SamlPort contract + BLOCKED note — explicit deny, never faked)
│   ├── usage/                  # ENTERPRISE: usage-priced add-ons (NOT token resale)
│   │   ├── usage-event (idempotent), usage-meter-emitter (→ billing-port → Polar),
│   │   └── usage-aggregator (per-window rollups, deduped)
│   └── packaging/
│       ├── homebrew/ (formula-renderer, formula-bump)  # FUSED recoder-code.rb
│       └── desktop/ (notarize, entitlements, release-secrets)  # FUSED notarize.js
├── config/, errors/, result.ts, distribution.ts (facade), index.ts
test/                        # mirrors src/ — node:test + tsx
```

## Quickstart

```ts
import {
  createDistribution,
  loadDistributionConfig,
  createEnvSecretPort,
} from '@recoder/distribution';

const config = loadDistributionConfig(process.env); // fails fast w/o RECODER_BASE_URL
const distribution = createDistribution({
  config,
  auth,        // AuthPort backed by recoder.xyz (source of truth)
  approvals,   // ApprovalPort backed by agent-os/governance
  events,      // EventBusPort backed by @recoder/agent-events outbox
  secrets: createEnvSecretPort(), // POLAR_ACCESS_TOKEN etc. from env only
});

// Truthful health — billing is `unhealthy` when POLAR_ACCESS_TOKEN is absent.
const health = await distribution.health();

// A gated delivery: web_site is customer-visible → pauses on the approval gate.
const receipt = await distribution.deliver(req); // never a faked completion
```

### CLI device flow (recoder.xyz is the authority)

```ts
import {
  buildDeviceFlowConfig,
  createInMemoryDeviceGrantStore,
  deviceAuthorize,
  browserAuthorize,
  pollDeviceToken,
} from '@recoder/distribution';

const cfg = buildDeviceFlowConfig({ recoderBaseUrl: config.recoderBaseUrl });
const grants = createInMemoryDeviceGrantStore();

const grant = deviceAuthorize(cfg, grants);                 // device_code + user_code
await browserAuthorize(auth, grants, { userCode: grant.userCode, sessionToken }); // recoder.xyz cookie
const result = await pollDeviceToken(cfg, grants, {         // /api/auth/cli/token
  deviceCode: grant.deviceCode,
  getProfile: (id) => auth.getUserProfile(id),              // authoritative plan
  signingKey: process.env.CLI_TOKEN_SIGNING_KEY!,           // env only
});
```

This is the contract `scripts/verify-cli-device-flow-e2e.sh` exercises against
`https://recoder.xyz`.

### Enterprise: orgs, seats, device revoke, SSO, usage, webhooks

```ts
import {
  createSeatService, createInMemoryOrgStore, createInMemorySeatStore,
  createDeviceRegistryService, createInMemoryDeviceStore, deviceBoundRefresh,
  createOidcVerifier, createUsageMeterEmitter, createBillingWebhookHandler,
} from '@recoder/distribution';

// Seats: assign/revoke under a per-plan cap; org grants only flow to seated users.
const seats = createSeatService({ orgs, seats: seatStore, billing });
await seats.assignSeat({ orgId, userId, assignedBy }); // denied once seatLimit hit

// Device registry: a REVOKED device cannot refresh a CLI token (kill-switch).
const registry = createDeviceRegistryService({ devices: createInMemoryDeviceStore() });
registry.register({ userId, rawFingerprint, name: 'Laptop' });
await deviceBoundRefresh(cfg, auth, registry, { refreshToken, userId, rawFingerprint }, key);

// Org SSO: REAL OIDC id-token verification (JWKS + signature + iss/aud/exp).
const sso = createOidcVerifier({ config: oidcConfig });
const identity = await sso.verifyIdToken(idToken); // Result — deny on any miss

// Usage add-ons: emit metered usage → billing port → Polar (idempotent).
const meter = createUsageMeterEmitter({ billing });
await meter.emit({ subjectId: orgId, subjectKind: 'org', kind: 'agent_run', quantity: 1, /* … */ });

// Polar webhooks: verify the signature (never trust the wire) → entitlement event.
const webhooks = createBillingWebhookHandler({ secrets, events, taskId });
await webhooks.process({ rawBody, headers }); // deny w/o POLAR_WEBHOOK_SECRET or bad sig
```

## Verify

```bash
pnpm -F @recoder/distribution check-types   # tsc --noEmit (0 errors)
pnpm -F @recoder/distribution test          # node:test + tsx (88 tests)
pnpm -F @recoder/distribution build         # tsup multi-entry (cjs+esm+dts)
```

## Deferred (honest blocked list)

- `py/recoder-billing` — the deep Python/FastAPI Polar fusion (checkout,
  subscription, benefit grants, license_key, metering, webhook, Stripe Connect)
  and its signed-envelope internal API. Separate agent; this TS slice speaks to
  it through `BillingPort`.
- Live-credential paths: real Polar charges, real Apple notarization, real npm
  publish, real DNS/TLS — gated behind present-secret probes and env flags; they
  skip with a truthful reason when secrets are absent.
- Remaining channels from the blueprint (`artifact-publish/*` site/preview/
  custom-domain, `release/*` orchestration, `telemetry-optin/*`, BYOK gateway,
  mobile packaging) — domain + port seams are in place; channel publishers land
  incrementally.
- **SAML 2.0 SSO** (`sso/saml.ts`) — the `SamlPort` contract is defined and the
  placeholder adapter returns an **explicit `provider_unavailable` deny** (never
  a faked allow). A correct verifier needs vetted XML-DSig + exclusive-c14n + XSW
  hardening, which Node's stdlib cannot do safely; it lands as a single adapter
  behind the existing contract once that dependency is wired. OIDC SSO is fully
  implemented and tested now.
