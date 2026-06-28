# Subsystem: `packages/distribution`

> **Status (2026-06-29 — verified against the repo).** `@recoder/distribution` (v0.1.0) is built
> and green: **88/88 TypeScript tests pass** (`node --test --import tsx "test/**/*.test.ts"`,
> re-run for this snapshot, 0 fail). It ships **CLI device-flow auth**, a typed
> **`BillingPort`** with a **real Polar (Merchant of Record) HTTP adapter**, **homebrew + desktop
> packaging** renderers, and the **org/seats, SSO/OIDC, usage-metering, and device-registry**
> channels plus a small **gated delivery engine**. The fused Python billing engine
> **`py/recoder-billing`** also exists and is substantially fleshed out (checkout, order, payout,
> subscription, webhook, benefit/license-key entitlements, Stripe integration, metering, models,
> portal, signed IPC).
>
> **Honest gaps (do not read as shipped):**
> - **`py/recoder-billing` tests do not run as-is.** `pyproject.toml` line 52 contains stray XML
>   (`</content></invoke>`) that breaks `pytest` config loading, and `pyjwt` / `pytest-asyncio`
>   are not installed in this environment. ~94 test functions exist across 13 files but were
>   **not executed** here. Treat the Python suite as **written but unverified**.
> - **Live Polar checkout is secret-gated.** A real checkout needs `POLAR_ACCESS_TOKEN` plus real
>   product/price IDs (ops creds). Absent the token the adapter fails safe (`unhealthy`, deny) —
>   it is wired but **not proven against live Polar**.
> - **Several subsystems described in earlier drafts of this doc do not exist yet** — see §2.1
>   ("Not shipped"). This doc has been reconciled to the actual source tree.

The Recoder **Distribution** subsystem is how Recoder *ships* and *monetizes*: CLI distribution +
device-flow auth, billing & entitlements over a typed Polar Merchant-of-Record port, package
publishing (Homebrew formula + signed desktop builds), and enterprise surfaces (org/seats,
SSO/OIDC, usage metering, device registry), driven through a small gated delivery engine.

This is a **first-party** subsystem: everything here is code we own and merge — never a thin
HTTP wrapper. Distribution is an **adapter around Recoder state, not an owner of it.** It consumes
`Artifact`/`Approval`/`RunEvent` from `@recoder/agent-os` and emits events back; canonical
artifact/approval/task/memory state stays in agent-os.

The hard boundary (from `.claude/rules/production.md` and `AGENTS.md`):

- Production deploy, preview deploy, DNS, TLS, WAF, billing, auth, and customer-visible delivery
  changes are **approval-gated**. The engine pauses on `pending_approval` and only proceeds on a
  recorded `Approval`.
- Billing and runtime health **fail safe** when keys/deps are missing (AGENTS.md rule 5): a missing
  `POLAR_ACCESS_TOKEN` / webhook secret / signing key degrades to an explicit error and a truthful
  `unhealthy` health state — never a faked "ok".
- `recoder.xyz` is the **auth source of truth**. CLI device-flow tokens are minted/verified against
  it via `AuthPort`; distribution never becomes a second identity authority.

Two artifacts make up the subsystem:

- **TypeScript package**: `packages/distribution` — the delivery engine, channels, ports, domain.
- **Fused Python billing service**: `py/recoder-billing` — the money/entitlement/license engine,
  reached only over a typed signed-envelope internal port (`INTERNAL_SERVICE_KEY`).

---

## 1. Fused-OSS lineage

### 1.1 Billing — fused from Polar (open-source, Merchant of Record)

**Why Polar (the strategic choice).** Polar is the *seller of record*, which solves
**Turkey / no-Stripe-merchant**: Recoder need not be a merchant in every jurisdiction because the
MoR is. The code fused into `py/recoder-billing` is taken from Polar's Python service
(`checkout`, `product`/`price_set`, `subscription`, `order`, `payout`/`account`, `benefit` +
`license_key` strategies, `meter`/`event` usage, `webhook`, `integrations/stripe`, `kit/{jwt,jwk,
crypto,money,currency}`, ORM `models`). It is **merged and edited as first-party code**, not
HTTP-wrapped. The upstream `ts/polar` checkout was retired (`34b2d4a83`); the fusion was rebuilt
fresh, so `ts/polar/**` paths are the original reference shape, not present code.

**Provider-agnostic by design.** The TS `BillingPort` (`src/ports/billing-port.ts`) is a typed
seam; the Polar specifics live behind `src/channels/billing/adapters/polar-billing-adapter.ts`
(a real typed `fetch` client to Polar's documented HTTP API). Swapping to Dodo / Creem / Paddle is
a one-adapter add without touching the engine. Note: the port's return types (e.g. `CheckoutResult`
is "a hosted Polar checkout URL") still reference Polar by name today.

### 1.2 CLI device-flow + packaging (owned)

Device-flow auth (`src/channels/cli-dist/device-flow/*`) is the contract
`scripts/verify-cli-device-flow-e2e.sh` exercises against `recoder.xyz`. Homebrew formula
rendering/bump (`src/channels/packaging/homebrew/*`) mirrors `homebrew-recoder/Formula/recoder-code.rb`;
desktop signing/notarize/entitlements (`src/channels/packaging/desktop/*`) mirror
`apps/desktop/{build-signed.js,notarize.js,entitlements.mac.plist}` and the desktop-release secret
gate (`DESKTOP_CSC_*`, `DESKTOP_APPLE_*`).

---

## 2. File tree (actual — verified `find packages/distribution/src`)

```text
packages/distribution/
├── package.json            # @recoder/distribution v0.1.0; deps: agent-os, agent-events, auth, vault, zod
├── tsconfig.json           # check-types
├── tsup.config.ts          # multi-entry build (index, domain, ports)
├── README.md
├── src/
│   ├── index.ts                       # public barrel (re-exports domain/ports/errors/channels/distribution)
│   ├── distribution.ts                # createDistribution facade → deliver() + health()
│   ├── result.ts                      # Result<T,E> envelope
│   ├── config/index.ts                # ENV_KEYS, DEFAULT_POLAR_API_BASE, config constants
│   ├── errors/index.ts                # DistributionError, FailSafeError
│   ├── util/                          # (present but EMPTY today)
│   ├── domain/
│   │   ├── index.ts  channel.ts  cli-token.ts  delivery.ts  device-grant.ts
│   │   ├── entitlement.ts  health-state.ts  license-key.ts  package-spec.ts
│   │   ├── quota.ts  semver.ts  subscription-plan.ts  tap-formula.ts
│   ├── ports/
│   │   ├── index.ts  approval-port.ts  auth-port.ts  billing-port.ts
│   │   ├── entitlement-port.ts  event-bus-port.ts  notarize-port.ts
│   │   ├── secret-port.ts  tap-port.ts
│   ├── engine/
│   │   ├── index.ts  distribution-engine.ts  delivery-pipeline.ts
│   │   ├── approval-gate.ts  entitlement-gate.ts  fail-safe.ts
│   │   ├── channel-publisher.ts  receipt-builder.ts
│   └── channels/
│       ├── billing/
│       │   ├── index.ts  billing-service.ts  plan-catalog.ts
│       │   ├── entitlement-resolver.ts  entitlement-cache.ts
│       │   ├── quota-service.ts  quota-enforcer.ts  license-key-service.ts
│       │   ├── adapters/polar-billing-adapter.ts
│       │   ├── health/billing-health.ts
│       │   └── webhook/{billing-webhook-handler,webhook-event,webhook-signature,webhook-to-entitlement,index}.ts
│       ├── cli-dist/device-flow/
│       │   ├── index.ts  device-authorize.ts  device-poll.ts  browser-authorize.ts
│       │   ├── device-grant-store.ts  cli-token-issuer.ts  cli-token-verifier.ts
│       │   ├── token-store.ts  device-flow-config.ts
│       ├── packaging/
│       │   ├── index.ts
│       │   ├── homebrew/{formula-renderer,formula-bump,index}.ts
│       │   └── desktop/{notarize,entitlements,release-secrets,index}.ts
│       ├── org/{organization,seat,seat-service,org-store,index}.ts
│       ├── sso/{oidc-config,oidc-verifier,jwks,saml,index}.ts
│       ├── usage/{usage-event,usage-aggregator,usage-meter-emitter,index}.ts
│       └── device-registry/{device-registration,device-bound-refresh,device-registry-service,device-store,index}.ts
└── test/                              # 12 files, 88 tests (see §6)
    ├── channels/billing/{billing,polar-adapter,webhook}.test.ts
    ├── channels/cli-dist/device-flow/device-flow.test.ts
    ├── channels/device-registry/device-registry.test.ts
    ├── channels/org/seat.test.ts
    ├── channels/packaging/desktop/desktop.test.ts
    ├── channels/packaging/homebrew/formula.test.ts
    ├── channels/sso/oidc.test.ts
    ├── channels/usage/usage.test.ts
    ├── domain/domain.test.ts
    └── engine/delivery-pipeline.test.ts
```

**Actual `src/` count: 86 TypeScript files.** `src/util/` exists but is empty.

```text
py/recoder-billing/                    # FUSED Polar engine (Python)
├── pyproject.toml                     # ⚠ line 52 has stray XML; breaks pytest config (see §6)
├── README.md
├── config/settings.py
├── kit/{jwt,jwk,crypto,money,currency,utils}.py
├── models/{checkout,subscription,order,product,customer,benefit_grant,license_key}.py
├── billing/
│   ├── checkout/{service,guard,schemas}.py
│   ├── product/{service,price_set,guard}.py
│   ├── subscription/{service,update}.py
│   ├── order/service.py
│   ├── payout/{service,account}.py
│   └── webhook/{service,webhooks}.py
├── entitlements/
│   ├── benefit/{service,grant}.py
│   ├── license_key/service.py
│   └── exceptions.py
├── integrations/stripe/{service,payment}.py
├── metering/{meter/{service,aggregation},event/service}.py
├── portal/{subscription,benefit_grant,downloadables}.py
└── ipc/{internal_api,envelope,operations}.py   # /internal/agent-os/billing/*, INTERNAL_SERVICE_KEY + signed envelope
```

### 2.1 Not shipped (described in earlier drafts of this doc, **absent from source today**)

These directories/modules do **not** exist in `packages/distribution/src` and should be treated as
roadmap, not implemented:

- `channels/artifact-publish/` (published-site, custom-domain, preview, downloadable) — the
  underlying logic still lives in `docker-backend/src/{domain-manager,zrok-preview}.ts`, **not yet
  fused** into distribution.
- `channels/release/` (release orchestrator, changelog, closeout, rollback-plan).
- `channels/telemetry-optin/` (consent, anonymizer, install-ping).
- `channels/cli-dist/byok/` and `channels/cli-dist/update/`.
- `channels/packaging/mobile/` (Expo/EAS/Android).
- Top-level `src/{adapters,persistence,seams,observability}/` — there is no separate adapters
  layer (the only adapter is `channels/billing/adapters/polar-billing-adapter.ts`), no persistence
  layer, no `seams/` directory, and no `observability/` module.
- The `Distribution` facade exposes only `deliver()` and `health()` — there is **no** `release()`
  method, no `channels` registry property, and no `ArtifactPublish` / `createMobileChannel` /
  `createHomebrewChannel` / `createDesktopChannel` factory exports.

---

## 3. What is actually implemented

### 3.1 `engine/` — the gated delivery core

`createDistributionEngine` builds the pipeline `delivery-pipeline.ts`:
`entitlement-gate → approval-gate → channel.publish → receipt-builder`.

- **`entitlement-gate.ts`** resolves the actor's plan/entitlements and **denies** deliveries the
  actor isn't entitled to (fail safe on resolution error).
- **`approval-gate.ts`** is fail-closed: a customer-visible delivery returns `pending_approval`
  and only proceeds on a recorded `Approval{status:'approved'}`; a rejected approval ends the
  delivery as `failed`. (Asserted in `engine/delivery-pipeline.test.ts`.)
- **`fail-safe.ts`** centralizes degrade-on-missing-keys → `FailSafeError` + `unhealthy`.
- **`receipt-builder.ts`** builds the `DeliveryReceipt`. `DeliveryStatus` is
  `completed | failed | pending_approval | denied` (`domain/delivery.ts`).

`createDistribution(deps)` (`distribution.ts`) wires the engine + billing and exposes
`deliver(req)` and `health()` (the latter merges per-channel health with `billing.health()`).

### 3.2 `channels/billing/` — billing & entitlements (Polar)

`billing-service.ts` is the facade over `BillingPort` → `polar-billing-adapter.ts` (a real typed
Polar HTTP client). `entitlement-resolver.ts` + `entitlement-cache.ts` (deny-on-miss),
`quota-service.ts`/`quota-enforcer.ts`, and `license-key-service.ts` cover the read/enforce path.
`webhook/*` verifies signatures (`webhook-signature.ts`) and projects events to entitlements
(`webhook-to-entitlement.ts`) — the handler **denies when `POLAR_WEBHOOK_SECRET` is absent**
(asserted in `webhook.test.ts`). `health/billing-health.ts` reports truthful provider readiness.

### 3.3 `channels/cli-dist/device-flow/` — CLI auth

`device-authorize.ts` issues a `DeviceAuthGrant` (device_code/user_code/verification_uri/interval);
`browser-authorize.ts` consumes the user_code with the recoder.xyz session; `device-poll.ts` polls
`/api/auth/cli/token`; `cli-token-issuer.ts` mints scoped tokens (**requires a signing key — fail
safe**, asserted in `device-flow.test.ts`); `cli-token-verifier.ts` verifies/refreshes against
`AuthPort`; `token-store.ts` is the `~/.recoder/auth.json` shape.

### 3.4 `channels/packaging/` — homebrew + desktop

`homebrew/formula-renderer.ts` renders the formula and **rejects a malformed sha256** (fail fast,
asserted in `formula.test.ts`); `formula-bump.ts` bumps version+sha. `desktop/release-secrets.ts`
gates on the `DESKTOP_CSC_*` / `DESKTOP_APPLE_*` secret set; `notarize.ts` + `entitlements.ts`
cover macOS notarization/entitlements. (Renderers/secret-gates only — no live signing here.)

### 3.5 Enterprise channels — `org`, `sso`, `usage`, `device-registry`

- **`org/`** — `organization.ts`, `seat.ts`, `seat-service.ts` (**enforces the seat limit**,
  asserted in `seat.test.ts`), `org-store.ts`.
- **`sso/`** — `oidc-config.ts`, `oidc-verifier.ts`, `jwks.ts`, `saml.ts` (OIDC verify covered in
  `oidc.test.ts`).
- **`usage/`** — `usage-event.ts`, `usage-aggregator.ts`, `usage-meter-emitter.ts`
  (`usage.test.ts`).
- **`device-registry/`** — `device-registration.ts`, `device-bound-refresh.ts`,
  `device-registry-service.ts`, `device-store.ts` (`device-registry.test.ts`).

### 3.6 `py/recoder-billing` — the fused Polar engine

Reached only via `ipc/internal_api.py` (mounted at `/internal/agent-os/billing/*`, protected by
`INTERNAL_SERVICE_KEY` + signed envelope `ipc/envelope.py`) — never a public source of
task/approval/artifact state. The tree (§2) is substantially complete, but the suite is currently
**unrunnable as-is** (§6) so its behavior is **not verified in this snapshot**.

---

## 4. Public API surface (`src/index.ts`, actual)

`index.ts` re-exports everything from `domain/`, `ports/`, `errors/`, `result`, `engine/`, and each
channel barrel (`billing`, `cli-dist/device-flow`, `org`, `device-registry`, `sso`, `usage`,
`packaging`), plus contract re-exports `Artifact`/`Approval`/`RunEvent` (from `@recoder/agent-os`)
and `RecoderCloudEvent` (from `@recoder/agent-events`), and the `distribution` facade.

The facade (`distribution.ts`):

```ts
export interface Distribution {
  deliver(req: DeliveryRequest): Promise<DeliveryReceipt>;          // gated pipeline
  health(): Promise<Record<string, ChannelHealth>>;                 // truthful, billing included
}
export function createDistribution(deps: DistributionDeps): Distribution;
```

> There is **no** `release(plan)`, no `channels` registry property, and no per-channel
> `create*Channel()` factory in the shipped facade — those appeared in earlier drafts only.

---

## 5. Seams to other subsystems (via `ports/`)

| Port (`src/ports/*`) | Direction | Contract |
|---|---|---|
| `auth-port.ts` | in: verify session/user | recoder.xyz is the sole auth authority for CLI tokens |
| `billing-port.ts` | bidir | `py/recoder-billing` via Polar adapter; checkout/entitlement/quota/usage/license |
| `entitlement-port.ts` | in: resolve entitlements/quota | read path for gating |
| `approval-port.ts` | out: request; in: decision | every customer-visible delivery pauses on the gate |
| `event-bus-port.ts` | out: events | delivery/entitlement events back to agent-events |
| `secret-port.ts` | in: env/vault secrets | secrets only from env; fail fast if required+missing |
| `tap-port.ts` | out: git tap writer | homebrew formula commit (packaging) |
| `notarize-port.ts` | out: apple notarization | desktop packaging |

> There is **no** `src/seams/` directory. The boundaries are the `ports/*` interfaces above plus
> the agent-os/agent-events contract re-exports in `index.ts`.

---

## 6. Verification (what was actually run)

**TypeScript — verified green for this snapshot:**

```bash
cd packages/distribution
node --test --import tsx "test/**/*.test.ts"
# → tests 88 / pass 88 / fail 0
```

Test distribution (12 files, 88 cases): billing 6 + polar-adapter 5 + webhook 9; device-flow 11;
device-registry 9; org/seat 7; desktop 6; homebrew/formula 4; sso/oidc 8; usage 10; domain 6;
delivery-pipeline 7. The suite is offline/deterministic (faux auth + faux billing, no real charges,
no network). Also available: `pnpm --filter @recoder/distribution check-types` / `build`.

**Python — written but NOT executed here (honest gap):**

```bash
pytest py/recoder-billing/tests        # ✗ FAILS TO COLLECT
# pyproject.toml line 52: stray "</content></invoke>" breaks [tool.pytest.ini_options];
# pyjwt and pytest-asyncio are also not installed in this environment.
```

~94 `def test_*` functions exist across 13 test files (checkout, subscription proration/service,
order, license-key, benefit grant, webhook engine, kit jwt/crypto/money, config, IPC
envelope/internal-api/operations), but **none were run** for this snapshot. The Python suite is
**unverified**; the corrupt `pyproject.toml` is a real source bug (out of scope for this docs pass,
flagged here for follow-up).

**Secret-gated / not proven:**

- Live Polar checkout needs `POLAR_ACCESS_TOKEN` + real product/price IDs. Without the token the
  adapter fails safe (`unhealthy` + deny). The live checkout path is **wired but unverified**.
- `scripts/verify-cli-device-flow-e2e.sh`, `scripts/verify-byok-e2e.sh`,
  `scripts/check-desktop-release-readiness.sh` are the existing E2E/secret-gate contracts this
  subsystem is meant to keep green; they require live recoder.xyz / desktop secrets and were not
  run here.

---

## 7. Honest gaps summary

1. **`py/recoder-billing` tests unrunnable** — corrupt `pyproject.toml` line 52 + missing
   `pyjwt`/`pytest-asyncio`. Python behavior **unverified** in this snapshot.
2. **Live Polar checkout secret-gated** — wired, fail-safe without `POLAR_ACCESS_TOKEN` + real
   product/price IDs; not proven against live Polar.
3. **Public-artifact publishing (sites/custom-domains/previews/downloadables) not fused** — still
   lives in `docker-backend/src/{domain-manager,zrok-preview}.ts`; the `channels/artifact-publish/`
   directory does not exist.
4. **Release orchestration, telemetry-optin, BYOK gateway, CLI self-update, mobile packaging not
   shipped** — roadmap, not implemented (§2.1).
5. **`src/util/` is empty** and the facade is `deliver()` + `health()` only (no `release()` /
   channel registry) — narrower than earlier drafts implied.
