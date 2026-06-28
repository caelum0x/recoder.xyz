# Subsystem: `packages/distribution`

> **Status (2026-06-28 — BUILDING): the device-flow + billing facade are BUILT.** `@recoder/distribution`
> exists and is green: **CLI device-flow auth** (`src/channels/cli-dist/device-flow`), a provider-agnostic
> **`BillingPort`** (`src/ports/billing-port.ts`) with a **real Polar Merchant-of-Record adapter**
> (`src/channels/billing/adapters/polar-billing-adapter.ts`), license-key + webhook→entitlement
> (`src/channels/billing/`), org/seat + SSO + device-registry scaffolding (`src/channels/{org,sso,device-registry}`),
> and **homebrew/desktop packaging** (`src/channels/packaging/{homebrew,desktop}`) — **88/88 tests**
> (`node --test`, re-run this snapshot). A first Python fusion slice **`py/recoder-billing`** lands the
> license_key/kit/benefit engine + a **signed internal-api** (`recoder_billing/ipc/`) — **AST-verified**
> (`py_compile` OK; full-tree `ast.parse` OK), **pytest env-gated** (absent Postgres). Commit `f4e1c9382`.
> See BUILD-STATUS §14.
>
> **Polar = Merchant of Record (the strategic choice).** Polar is the seller of record, which **solves
> Turkey / no-Stripe**: Recoder does not need to be a merchant in every jurisdiction because the MoR is.
> The `BillingPort` is **provider-agnostic** — Dodo / Creem / Paddle become a **one-adapter add** without
> touching the delivery engine.
>
> **Honest caveats (in progress / ops-gated):** **enterprise billing wiring** (plumbing seats/SSO/device-registry
> into the running `docker-backend`) is **in progress**; the **deep Polar Python fusion** (the full
> checkout/stripe/webhook/meter plan in §1.1 below) is a **large follow-up** beyond the first
> license_key/kit/benefit slice; and a **live Polar checkout** needs ops/creds. The §1.1 table below is the
> remaining merge plan, not a completed merge.
>
> ---
>
> The Recoder **Distribution** subsystem. It is how Recoder *ships* and *monetizes*:
> the CLI distribution channel + device-flow auth, package/tap publishing (npm + Homebrew +
> signed desktop/mobile builds), billing & entitlements (the fused Polar monetization engine),
> public artifact publishing (signed preview URLs + published sites + downloadables), and
> release orchestration with opt-in telemetry.

This is a **first-party** subsystem. Everything fused here is code we own and merge — we edit
and reshape it, we never thin-HTTP-wrap it. Distribution is an **adapter around Recoder state,
not an owner of it.** Canonical artifact/approval/task/memory state lives in
`@recoder/agent-os`. Distribution *consumes* `Artifact`/`Approval`/`TaskSpec`, *proposes* and
*executes* customer-visible delivery **only under a governance approval gate**, and *emits*
`RunEvent`/`CloudEvent` records back to Recoder with truthful evidence.

The hard boundary (from `.claude/rules/production.md` and `AGENTS.md`):

- Production deploy, preview deploy, DNS, TLS, WAF, billing, auth, and customer-visible
  delivery changes are **approval-gated**. Distribution never bypasses the gate; it pauses on
  `approval_requested` and only proceeds on a recorded `Approval`.
- Billing and runtime health **fail safe** when keys or dependencies are missing (AGENTS.md
  critical rule 5): a missing Stripe/Polar key degrades to an explicit error and a truthful
  `unhealthy` health state — never a faked "ok".
- `recoder.xyz` is the **auth source of truth**. CLI device-flow tokens are minted and verified
  against it; distribution never becomes a second identity authority.
- No hardcoded `localhost`/domains in production paths; all public URLs are built from config.
  Secrets come from env only. Signed preview URLs + explicit preview health are preferred over
  inferred runtime success.

- **TypeScript package**: `packages/distribution` (control-plane facing, Node/Bun) — the
  delivery engine, channels, ports, and seams.
- **Fused Python billing service**: `py/recoder-billing` (the merged Polar engine) — the durable
  money/entitlement/license authority, spoken to over a typed internal port (signed envelope,
  `INTERNAL_SERVICE_KEY`), never as a public HTTP source of task/approval/artifact state.

---

## 1. Fused sources (the merge plan)

> **Status (truthful, updated 2026-06-28):** the `Lands in` targets now **exist** — `packages/distribution`
> is built (88/88) with a real Polar MoR adapter, and `py/recoder-billing` exists with its **first slice**
> landed: **license_key/kit/benefit + signed internal-api** (`f4e1c9382`, AST-verified, pytest env-gated).
> The **full table below remains the remaining merge plan** (deep checkout/stripe/webhook/meter is a large
> follow-up) — it is **not yet a completed merge**. The old `ts/polar` upstream was retired in `34b2d4a83`;
> this fusion was rebuilt fresh rather than re-sourced, so treat the `ts/polar/**` paths as the original
> reference shape, not present code.

### 1.1 Billing & entitlements — fused from Polar (`ts/polar/server/polar/**`, Python/FastAPI; `ts/polar` retired in `34b2d4a83`)

| Upstream source (read at plan time) | What we take | Lands in (planned) |
|---|---|---|
| `ts/polar/server/polar/checkout/{service,endpoints,guard,eventstream,ip_geolocation,repository,schemas}.py` | hosted checkout flow, confirm/Stripe path, product guard | `py/recoder-billing/billing/checkout/*` |
| `ts/polar/server/polar/checkout_link/{service,app,endpoints,schemas}.py` | reusable hosted checkout links | `py/recoder-billing/billing/checkout_link/*` |
| `ts/polar/server/polar/subscription/{service,scheduler,update,tasks,repository}.py` | subscription lifecycle + proration + scheduler | `py/recoder-billing/billing/subscription/*` |
| `ts/polar/server/polar/benefit/{service,registry,repository,grant/*}.py` | benefit (entitlement) grant engine + registry | `py/recoder-billing/entitlements/benefit/*` |
| `ts/polar/server/polar/benefit/strategies/{license_keys,downloadables,feature_flag,custom,discord,github_repository,meter_credit}/{service,properties,schemas}.py` | per-benefit grant strategies | `py/recoder-billing/entitlements/strategies/*` |
| `ts/polar/server/polar/license_key/{service,auth,endpoints,repository,schemas}.py` | license-key issue/validate/activate | `py/recoder-billing/entitlements/license_key/*` |
| `ts/polar/server/polar/meter/{service,aggregation,filter,unit,tasks,repository}.py` | usage meter definition + aggregation | `py/recoder-billing/metering/meter/*` |
| `ts/polar/server/polar/event/{service,system,tinybird_repository,tasks}.py` | usage event ingestion (usage-based billing feed) | `py/recoder-billing/metering/event/*` |
| `ts/polar/server/polar/customer_meter/*`, `customer_seat/{service,sender,tasks}.py` | per-customer usage + org seats | `py/recoder-billing/entitlements/{customer_meter,seat}/*` |
| `ts/polar/server/polar/customer_portal/service/{customer,subscription,benefit_grant,order,downloadables,customer_meter,customer_seat,wallet}.py` | self-serve portal services | `py/recoder-billing/portal/*` |
| `ts/polar/server/polar/product/{service,price_set,guard,repository}.py` | product + price-set catalog | `py/recoder-billing/billing/product/*` |
| `ts/polar/server/polar/order/{service}.py`, `order_item`, `transaction`, `refund`, `dispute`, `payout`, `payout_account`, `account/{service}.py` | orders, ledger, Stripe Connect payouts | `py/recoder-billing/billing/{order,ledger,payout}/*` |
| `ts/polar/server/polar/integrations/stripe/{service,payment,tasks,utils}.py` | Stripe processor integration | `py/recoder-billing/integrations/stripe/*` |
| `ts/polar/server/polar/webhook/{service,webhooks,eventstream,slack,tasks}.py` | outbound + inbound webhook engine | `py/recoder-billing/billing/webhook/*` |
| `ts/polar/server/polar/oauth2/{authorization_server,grants,service,userinfo,metadata,mcp_client}.py` | OAuth2 server (token-issuance reference for CLI) | informs `cli-dist/device-flow/*` |
| `ts/polar/server/polar/cli/{auth,endpoints,listener}.py` | CLI session listener + SSE event bridge | informs `cli-dist/device-flow/*` |
| `ts/polar/server/polar/file/{service,s3,repository,schemas}.py` | S3-backed downloadable file artifacts | `py/recoder-billing/entitlements/downloadable/*` + `artifact-publish/downloadable/*` |
| `ts/polar/server/polar/{personal_access_token,organization_access_token}/{service,schemas}.py` | long-lived programmatic tokens | informs `cli-dist/device-flow/cli-token-*` |
| `ts/polar/server/polar/models/{license_key,benefit_grant,subscription,checkout,order,customer,product,meter_event}.py` | canonical ORM shapes | `py/recoder-billing/models/*` |
| `ts/polar/server/polar/config.py`, `kit/{jwt,jwk,crypto,money,currency,metadata}.py` | settings + money/jwt primitives | `py/recoder-billing/{config,kit}/*` |

### 1.2 CLI distribution + device-flow auth (TypeScript, owned)

| Owned source (read & merged) | What we take | Lands in |
|---|---|---|
| `packages/cli/src/services/web-cli-auth-bridge.ts` | `WebAuthSession`/`CLIToken` device-flow bridge (deviceCode/userCode/verificationUri/interval) | `cli-dist/device-flow/{device-authorize,device-poll,browser-authorize}.ts` |
| `packages/cli/src/services/{auth-manager,auth-service,backend-client,unified-session-manager}.ts` | `/auth/cli/token` exchange, refresh, session persistence | `cli-dist/device-flow/{cli-token-issuer,cli-token-verifier,token-store}.ts` |
| `packages/cli/src/commands/auth.ts`, `packages/cli/src/auth/oauth-cli.ts` | CLI auth command + loopback OAuth | `cli-dist/device-flow/*` (control-plane endpoints) |
| `packages/recoder-code/packages/cli/src/services/RecoderAuthService.ts` | `RecoderUser` (`subscription_plan`/`quota`), `~/.recoder/auth.json`, `CLIENT_ID = recoder-code`, loopback `:8080` | `cli-dist/device-flow/token-store.ts`, `domain/cli-token.ts` |
| `packages/recoder-cli-router/src/api/{router-endpoint,providers/*}.ts` | BYOK key gateway + provider routing | `cli-dist/byok/*` |
| `scripts/verify-cli-device-flow-e2e.sh` | the device-flow contract (`/api/auth/cli/token`, browser-authorize, refresh) | the verification plan (§11) |
| `scripts/verify-byok-e2e.sh` | BYOK provider-key CRUD contract | the verification plan (§11) |

### 1.3 Package / tap / native packaging (owned)

| Owned source (read & merged) | What we take | Lands in |
|---|---|---|
| `homebrew-recoder/Formula/recoder-code.rb` | the live formula (npm tgz url + `sha256` + `node@20` dep + version test) | `packaging/homebrew/{tap-publisher,formula-renderer,formula-bump}.ts` |
| `homebrew-recoder/README.md` | tap install/upgrade contract (`brew tap recoder-team/recoder`) | `packaging/homebrew/*` |
| `apps/desktop/{build-signed.js,notarize.js,entitlements.mac.plist,main.js,preload.js}` | electron signed build + macOS notarization + entitlements | `packaging/desktop/{desktop-packager,codesign,notarize,entitlements}.ts` |
| `apps/desktop/scripts/{validate-release-artifacts.js,smoke-production.js}` | release-artifact validation + smoke launch | `packaging/desktop/{artifact-validator,smoke-runner}.ts` |
| `apps/mobile/{app.json,android,BUILD_GUIDE.md}` | Expo/EAS + Android build inputs | `packaging/mobile/{mobile-packager,android-build,store-submit}.ts` |
| `scripts/{check-desktop-release-readiness,verify-desktop-release,desktop-release-closeout,set-desktop-release-secrets}.sh` | desktop release secret gating (`DESKTOP_CSC_LINK`, `DESKTOP_APPLE_*`) + readiness | `packaging/desktop/*` + verification (§11) |
| `scripts/{verify-mobile-release,verify-native-release-closeout}.sh` | native release closeout | verification (§11) |

### 1.4 Public artifact publishing + delivery (owned)

| Owned source (read & merged) | What we take | Lands in |
|---|---|---|
| `docker-backend/src/domain-manager.ts` | published-slug → nginx config, certbot SSL, `getPublishedPath`, DNS verify, `/etc/nginx/conf.d/custom-domains/*.conf` | `artifact-publish/custom-domain/*` + `artifact-publish/published-site/nginx-*.ts` |
| `docker-backend/src/zrok-preview.ts` | signed preview shares (`preview-{token}.recoder.xyz`), reserved names, share-token health | `artifact-publish/preview/{preview-tunnel,preview-url-signer,preview-health}.ts` |
| `nginx/nginx-production.conf` | the live web-surface routing (`web.recoder.xyz/<slug>/` ← `/data/published/<slug>/`) | `artifact-publish/published-site/site-publisher.ts` |
| `site/app/{pricing,download,changelog,enterprise}/page.tsx`, `robots.ts`, `sitemap.ts` | the marketing/pricing/download app surface (delivery target) | `release/changelog.ts`, `channels/* delivery targets` |
| `scripts/{production-external-closeout,a5-release-evidence,p15-tier1-status-autopublish}.sh` | release evidence + closeout (PASS/FAIL/SKIP, truthful health) | `release/{release-evidence,closeout}.ts` + verification (§11) |

### 1.5 Seam contracts consumed (not owned by distribution)

`packages/agent-os/src/domain/{artifact,approval,event,task-run,task-spec}.ts`,
`packages/agent-os/src/ports/{artifact-store,event-bus,policy-engine,memory-store}.ts`,
`packages/agent-events/src/{cloudevent,outbox,run-event-mapper,event-types,postgres-publisher,nats-publisher}.ts`,
`packages/auth/src/{verify,session,cross-domain}.ts` (recoder.xyz auth source of truth),
`packages/vault/*` (env-backed secret access).

`Artifact` (`packages/agent-os/src/domain/artifact.ts`) and `ArtifactStorePort.put/get`
(`packages/agent-os/src/ports/artifact-store.ts`) stay canonical: distribution **publishes**
public copies of an artifact and records the public URL/hash as a `DeliveryReceipt`, but the
artifact record itself is owned by agent-os. `Approval.status` transitions
(`pending → approved|rejected|expired|escalated`, via `decideApproval`) are owned by
agent-os/governance; distribution only waits on them.

---

## 2. File tree

```text
packages/distribution/                          # TS control-plane facade (Node/Bun)
├── package.json                                # @recoder/distribution; deps: agent-os, agent-events, auth, vault
├── tsconfig.json                               # extends repo base tsconfig
├── tsup.config.ts                              # multi-entry build (index, channels/*, ports)
├── README.md                                   # package overview + quickstart
├── src/
│   ├── index.ts                                # public barrel: createDistribution + channel factories
│   ├── public-api.ts                           # curated public surface (nothing private leaks)
│   ├── distribution.ts                         # Distribution facade: ties channels+engine+ports
│   ├── distribution-config.ts                  # DistributionConfig type re-export
│   ├── errors.ts                               # error barrel (see errors/)
│   ├── result.ts                               # Result<T,E> envelope (ok/err helpers)
│   │
│   ├── domain/                                 # distribution-local domain types (Zod-backed)
│   │   ├── index.ts                            # barrel
│   │   ├── channel.ts                          # DistributionChannel enum (npm|homebrew|desktop|mobile|web_site|preview|download)
│   │   ├── artifact-ref.ts                     # PublicArtifactRef (mirror agent-os Artifact, never redefined)
│   │   ├── release.ts                          # Release, ReleaseStatus (draft|staged|released|rolled_back)
│   │   ├── release-channel.ts                  # ReleaseChannel (stable|beta|canary) + ordering
│   │   ├── semver.ts                           # SemVer value type + parse/compare
│   │   ├── package-spec.ts                     # PackageSpec (name, version, tarballUrl, sha256)
│   │   ├── tap-formula.ts                      # HomebrewFormula DTO (url, sha256, deps, testBlock)
│   │   ├── native-build.ts                     # NativeBuild (platform, signed, notarized, artifacts)
│   │   ├── device-grant.ts                     # DeviceAuthGrant (deviceCode,userCode,verificationUri,interval,expiresAt)
│   │   ├── cli-token.ts                        # CliToken (access/refresh/expiresAt/scopes/plan) + RecoderUser mirror
│   │   ├── subscription-plan.ts                # Plan (free|pro|enterprise) + feature matrix
│   │   ├── entitlement.ts                      # Entitlement DTO (benefit grant mirror) + EntitlementKind
│   │   ├── quota.ts                            # Quota + UsageCounter (requests_remaining/limit/reset)
│   │   ├── meter-event.ts                      # MeterEvent (usage-based billing event) + idempotency key
│   │   ├── checkout-intent.ts                  # CheckoutIntent + CheckoutResult (hosted-link DTO)
│   │   ├── license-key.ts                      # LicenseKey + LicenseKeyActivation DTO
│   │   ├── preview-share.ts                    # PreviewShare (signedUrl, shareToken, health)
│   │   ├── published-site.ts                   # PublishedSite (slug, rootPath, url, sslStatus)
│   │   ├── custom-domain.ts                    # CustomDomain DTO (mirror domain-manager DomainStatus)
│   │   ├── downloadable.ts                     # Downloadable (s3Key, presignedUrl, entitlementRef)
│   │   ├── delivery-target.ts                  # DeliveryTarget union over channels
│   │   ├── delivery-request.ts                 # DeliveryRequest (artifact + channel + actor + approvalRef)
│   │   ├── delivery-receipt.ts                 # DeliveryReceipt (url, hash, health, approvalRef, evidence)
│   │   ├── consent.ts                          # TelemetryConsent (per-user opt-in state)
│   │   └── health-state.ts                     # ChannelHealth (truthful: ok|degraded|unhealthy + reason)
│   │
│   ├── ports/                                  # typed dependency interfaces (no hard coupling)
│   │   ├── index.ts                            # barrel
│   │   ├── billing-port.ts                     # talk to fused py/recoder-billing (checkout/sub/entitlement)
│   │   ├── entitlement-port.ts                 # resolve entitlements + quota for a subject
│   │   ├── metering-port.ts                    # push usage MeterEvents
│   │   ├── artifact-store-port.ts              # agent-os ArtifactStorePort (canonical artifact)
│   │   ├── approval-port.ts                    # governance/agent-os approval gate (await decision)
│   │   ├── event-bus-port.ts                   # agent-events outbox (RunEvent/CloudEvent)
│   │   ├── auth-port.ts                        # recoder.xyz auth source-of-truth (verify session/user)
│   │   ├── secret-port.ts                      # env/vault secret retrieval (never inline)
│   │   ├── registry-port.ts                    # npm registry client
│   │   ├── tap-port.ts                         # git tap repo writer (homebrew)
│   │   ├── web-server-port.ts                  # published-site web config writer (nginx)
│   │   ├── tunnel-port.ts                      # signed preview tunnel (zrok)
│   │   ├── dns-port.ts                         # DNS verify/purge (cloudflare)
│   │   ├── tls-port.ts                         # SSL cert provisioning (certbot)
│   │   ├── object-store-port.ts                # S3 for downloadable artifacts
│   │   ├── notarize-port.ts                    # apple notarization
│   │   ├── store-submit-port.ts                # app store / play submission
│   │   └── telemetry-port.ts                   # opt-in telemetry sink
│   │
│   ├── engine/                                 # the uniform delivery core (channel-agnostic)
│   │   ├── index.ts                            # barrel
│   │   ├── distribution-engine.ts              # createDistribution(): builds channel registry + engine
│   │   ├── delivery-pipeline.ts               # staged deliver(): entitlement→approval→publish→verify→receipt
│   │   ├── delivery-stage.ts                  # Stage interface ((req,ctx)=>StageResult)
│   │   ├── channel-registry.ts                # register/lookup ChannelPublisher by DistributionChannel
│   │   ├── channel-resolver.ts                # DeliveryTarget → ChannelPublisher
│   │   ├── entitlement-gate.ts                # block delivery if plan/entitlement insufficient (fail safe)
│   │   ├── approval-gate.ts                   # block delivery until governance Approval recorded (never bypass)
│   │   ├── fail-safe.ts                       # degrade safely when keys/deps missing → unhealthy, not faked ok
│   │   ├── preview-health.ts                  # explicit preview/delivery health probe (no inferred success)
│   │   ├── delivery-context.ts               # per-delivery ctx (ids, actor, signal, emit, clock)
│   │   ├── delivery-journal.ts               # append-only journal of delivery events (replay)
│   │   ├── receipt-builder.ts                # build DeliveryReceipt with evidence (url+hash+health)
│   │   ├── run-event-emitter.ts              # emit RunEvent records to agent-os outbox
│   │   ├── idempotency.ts                     # idempotent delivery keys (no double-publish/charge)
│   │   ├── rollback.ts                        # unpublish/rollback on failed verify
│   │   ├── signing.ts                         # sign envelopes + preview URLs (ed25519 when configured)
│   │   └── concurrency.ts                     # per-channel concurrency limiter (serialize SSH; no parallel SSH)
│   │
│   ├── channels/
│   │   │
│   │   ├── cli-dist/                          # CLI distribution + device-flow auth
│   │   │   ├── index.ts                       # barrel + createCliDistChannel
│   │   │   ├── cli-dist-publisher.ts          # ChannelPublisher for the recoder-code CLI
│   │   │   ├── npm-publisher.ts               # publish recoder-code tarball to npm (token from env)
│   │   │   ├── npm-pack.ts                     # build+pack tarball, compute sha256 (feeds homebrew)
│   │   │   ├── npm-dist-tags.ts               # manage latest/beta/canary dist-tags
│   │   │   ├── version-resolver.ts            # next SemVer from ReleaseChannel
│   │   │   ├── device-flow/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── device-authorize.ts        # issue DeviceAuthGrant (device_code + user_code)
│   │   │   │   ├── device-poll.ts             # CLI token poll loop (/api/auth/cli/token, interval/backoff)
│   │   │   │   ├── browser-authorize.ts       # browser approval consumes user_code w/ session cookie
│   │   │   │   ├── device-grant-store.ts      # pending grants (TTL, single-use user_code)
│   │   │   │   ├── cli-token-issuer.ts        # mint scoped CLI access/refresh tokens (+plan)
│   │   │   │   ├── cli-token-verifier.ts      # verify/refresh CLI tokens vs recoder.xyz auth (source of truth)
│   │   │   │   ├── token-store.ts             # ~/.recoder/auth.json shape + server-side record
│   │   │   │   └── device-flow-config.ts      # CLIENT_ID=recoder-code, intervals, TTLs (no secrets)
│   │   │   ├── byok/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── byok-gateway.ts            # BYOK provider-key passthrough for the CLI router
│   │   │   │   ├── provider-key-resolver.ts   # user provider key (vault) vs platform key precedence
│   │   │   │   └── key-redactor.ts            # never log provider keys (redaction)
│   │   │   └── update/
│   │   │       ├── index.ts                    # barrel
│   │   │       ├── update-checker.ts          # CLI self-update check vs release channel
│   │   │       └── update-manifest.ts         # version manifest served to CLI
│   │   │
│   │   ├── packaging/                         # package/tap publishing + native app packaging
│   │   │   ├── index.ts                       # barrel
│   │   │   ├── checksums.ts                   # sha256 manifest across packaged artifacts
│   │   │   ├── sbom.ts                        # software bill of materials per package
│   │   │   ├── homebrew/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── tap-publisher.ts           # write+commit Formula/recoder-code.rb (approval-gated)
│   │   │   │   ├── formula-renderer.ts        # render formula (url, sha256, node@20 dep, test block)
│   │   │   │   ├── formula-bump.ts            # bump version+sha256 on new npm release
│   │   │   │   └── tap-repo.ts                # git clone/commit/push tap repo (via tap-port)
│   │   │   ├── desktop/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── desktop-packager.ts        # orchestrate electron-builder signed build
│   │   │   │   ├── codesign.ts                # macOS codesign (fuses build-signed.js)
│   │   │   │   ├── notarize.ts                # apple notarization (fuses notarize.js)
│   │   │   │   ├── entitlements.ts            # mac entitlements plist management
│   │   │   │   ├── artifact-validator.ts      # validate-release-artifacts (dmg/exe/AppImage hashes)
│   │   │   │   ├── smoke-runner.ts            # smoke-production launch check (truthful)
│   │   │   │   └── release-secrets.ts         # DESKTOP_CSC_*/APPLE_* presence gate (fail fast if missing)
│   │   │   └── mobile/
│   │   │       ├── index.ts                    # barrel
│   │   │       ├── mobile-packager.ts         # Expo/EAS build orchestration
│   │   │       ├── android-build.ts           # android aab/apk build
│   │   │       └── store-submit.ts            # app store / play submission (approval-gated)
│   │   │
│   │   ├── billing/                           # billing + entitlements (TS view of fused Polar)
│   │   │   ├── index.ts                       # barrel
│   │   │   ├── billing-service.ts             # facade over billing-port → py/recoder-billing
│   │   │   ├── plan-catalog.ts                # Recoder plan catalog (free/pro/enterprise) ↔ Polar products
│   │   │   ├── checkout/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── checkout-service.ts        # start checkout (port to Polar checkout)
│   │   │   │   ├── checkout-link.ts           # hosted checkout link resolution
│   │   │   │   └── checkout-result.ts         # confirm/finalize result mapping
│   │   │   ├── subscription/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── subscription-service.ts    # subscription lifecycle (port)
│   │   │   │   ├── subscription-sync.ts       # sync subscription state → entitlements
│   │   │   │   └── seat-service.ts            # org seats (Polar customer_seat)
│   │   │   ├── entitlements/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── entitlement-resolver.ts    # effective entitlements for user/org
│   │   │   │   ├── entitlement-cache.ts       # short-TTL cache; deny on miss (fail safe)
│   │   │   │   ├── quota-service.ts           # usage quota counters
│   │   │   │   ├── quota-enforcer.ts          # gate CLI/agent usage by quota (fail safe)
│   │   │   │   ├── feature-flags.ts           # entitlement-derived flags (Polar feature_flag benefit)
│   │   │   │   └── license-key-service.ts     # issue/validate/activate license keys (Polar license_key)
│   │   │   ├── metering/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── meter-event-emitter.ts     # emit usage MeterEvents (Polar event ingestion)
│   │   │   │   ├── usage-aggregator.ts        # aggregate per-window usage (Polar meter aggregation)
│   │   │   │   └── usage-report.ts            # usage report for cost dashboard
│   │   │   ├── webhook/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── billing-webhook-handler.ts # consume Polar webhooks (order.paid, subscription.updated)
│   │   │   │   ├── webhook-verifier.ts        # verify webhook signatures (never trust the wire)
│   │   │   │   └── webhook-to-entitlement.ts  # webhook → entitlement change → event
│   │   │   └── health/
│   │   │       ├── index.ts                    # barrel
│   │   │       └── billing-health.ts          # truthful provider readiness (degrade if keys missing)
│   │   │
│   │   ├── artifact-publish/                  # public artifact publishing + signed previews + sites
│   │   │   ├── index.ts                       # barrel
│   │   │   ├── artifact-publisher.ts          # ChannelPublisher: publish a built artifact publicly
│   │   │   ├── artifact-signer.ts             # sign/hash public artifacts (provenance)
│   │   │   ├── published-site/
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── site-publisher.ts          # copy build output → /data/published/<slug> (config path)
│   │   │   │   ├── slug-allocator.ts          # allocate/validate published slug
│   │   │   │   ├── nginx-writer.ts            # write per-slug nginx config (web.recoder.xyz/<slug>/)
│   │   │   │   ├── nginx-reload.ts            # graceful nginx reload (best-effort, truthful)
│   │   │   │   └── publish-store.ts           # published-site records (persistence)
│   │   │   ├── custom-domain/                 # fuses docker-backend/src/domain-manager.ts
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── domain-service.ts          # add/remove custom domain (approval-gated)
│   │   │   │   ├── dns-verifier.ts            # DNS TXT/CNAME verification
│   │   │   │   ├── tls-provisioner.ts         # certbot SSL provisioning
│   │   │   │   ├── domain-nginx-writer.ts     # per-domain nginx server block (conf.d/custom-domains)
│   │   │   │   └── domain-store.ts            # domain records (DomainStatus)
│   │   │   ├── preview/                       # fuses docker-backend/src/zrok-preview.ts
│   │   │   │   ├── index.ts                    # barrel
│   │   │   │   ├── preview-publisher.ts       # create signed preview share
│   │   │   │   ├── preview-tunnel.ts          # zrok share create/reserve
│   │   │   │   ├── preview-url-signer.ts      # signed URL builder (preview-{token}.recoder.xyz)
│   │   │   │   ├── preview-health.ts          # explicit preview health probe (no inferred success)
│   │   │   │   └── preview-store.ts           # preview share records
│   │   │   └── downloadable/
│   │   │       ├── index.ts                    # barrel
│   │   │       ├── downloadable-publisher.ts  # publish downloadable artifact (Polar file/S3 benefit)
│   │   │       ├── s3-uploader.ts             # upload to object store (presigned)
│   │   │       └── download-grant.ts          # entitlement-gated download grant
│   │   │
│   │   ├── release/                           # release orchestration across channels
│   │   │   ├── index.ts                       # barrel
│   │   │   ├── release-orchestrator.ts        # orchestrate a multi-channel release under approval
│   │   │   ├── release-plan.ts                # compile ReleasePlan (channels, versions, order)
│   │   │   ├── release-channel-policy.ts      # stable/beta/canary gating
│   │   │   ├── changelog.ts                   # render changelog (site/app/changelog)
│   │   │   ├── release-notes.ts               # release notes builder
│   │   │   ├── release-evidence.ts            # collect release evidence (a5-release-evidence)
│   │   │   ├── closeout.ts                    # production-external-closeout integration (PASS/FAIL/SKIP)
│   │   │   ├── rollback-plan.ts               # per-channel rollback plan
│   │   │   └── release-store.ts               # release records (persistence)
│   │   │
│   │   └── telemetry-optin/                   # opt-in telemetry (consent-gated)
│   │       ├── index.ts                       # barrel
│   │       ├── telemetry-service.ts           # opt-in telemetry collection (consent-gated)
│   │       ├── consent-store.ts               # per-user consent records
│   │       ├── event-anonymizer.ts            # strip PII before emit
│   │       ├── telemetry-sink.ts              # push anonymized events (no secrets)
│   │       └── install-ping.ts                # anonymous install/version ping
│   │
│   ├── adapters/                              # concrete port implementations (external systems)
│   │   ├── index.ts                           # barrel + buildAdapters(config)
│   │   ├── npm-registry-adapter.ts            # npm registry HTTP client (NPM_TOKEN from env)
│   │   ├── git-tap-adapter.ts                 # git clone/commit/push homebrew tap
│   │   ├── nginx-adapter.ts                   # write configs + nginx -s reload (execFile)
│   │   ├── certbot-adapter.ts                 # certbot exec (Let's Encrypt)
│   │   ├── cloudflare-dns-adapter.ts          # Cloudflare API DNS verify/purge (env creds)
│   │   ├── zrok-tunnel-adapter.ts             # zrok CLI exec (signed preview shares)
│   │   ├── s3-adapter.ts                      # S3 object store client (downloadables)
│   │   ├── polar-billing-adapter.ts           # internal client → py/recoder-billing (signed envelope)
│   │   ├── stripe-connect-adapter.ts          # Stripe Connect payout via Polar account service
│   │   ├── apple-notary-adapter.ts            # apple notarytool client
│   │   ├── eas-adapter.ts                     # Expo EAS build client
│   │   ├── recoder-auth-adapter.ts            # recoder.xyz auth verify (source of truth)
│   │   ├── vault-adapter.ts                   # secret retrieval (env/vault, fail fast if required missing)
│   │   └── ssh-deploy-adapter.ts              # sequential SSH deploy (BatchMode; no parallel SSH)
│   │
│   ├── persistence/                          # durable distribution records
│   │   ├── index.ts                           # barrel
│   │   ├── store-port.ts                      # generic repository interface
│   │   ├── release-repository.ts
│   │   ├── delivery-repository.ts
│   │   ├── device-grant-repository.ts
│   │   ├── cli-token-repository.ts
│   │   ├── entitlement-repository.ts
│   │   ├── published-site-repository.ts
│   │   ├── custom-domain-repository.ts
│   │   ├── preview-repository.ts
│   │   ├── consent-repository.ts
│   │   ├── postgres-store.ts                  # Postgres-backed impl (prod)
│   │   ├── json-store.ts                      # JSON-file impl (dev/local, mirrors persistence.ts)
│   │   └── store-factory.ts                   # choose store from config
│   │
│   ├── seams/                                 # explicit ports to OTHER subsystems
│   │   ├── index.ts                           # barrel
│   │   ├── agent-os-port.ts                   # read canonical Artifact/Approval; write RunEvent
│   │   ├── governance-port.ts                 # request/await approval gate (never bypass)
│   │   ├── events-port.ts                     # publish CloudEvents to agent-events outbox
│   │   ├── runtime-port.ts                    # receive built artifacts from runtime evidence
│   │   ├── coordination-port.ts               # release handoff / A2A
│   │   ├── brain-port.ts                      # pricing/plan recommendation hints (optional)
│   │   └── memory-port.ts                     # emit delivery memory candidates (never durable)
│   │
│   ├── observability/
│   │   ├── index.ts                           # barrel
│   │   ├── logger.ts                          # structured logger (redacts secrets/keys/tokens)
│   │   ├── metrics.ts                         # counters (publishes, checkouts, grants, quota denials)
│   │   ├── tracing.ts                         # OTEL spans (deliver/publish/checkout/preview)
│   │   ├── health.ts                          # truthful aggregate health (billing/registry/tunnel/tls)
│   │   └── audit.ts                           # delivery audit hook → governance audit chain
│   │
│   ├── errors/
│   │   ├── index.ts                           # barrel
│   │   ├── distribution-error.ts              # base error hierarchy
│   │   ├── error-codes.ts                     # entitlement_denied|approval_required|registry_failed|...
│   │   ├── error-to-event.ts                  # error → failed RunEvent (data.code)
│   │   └── fail-safe-error.ts                 # degraded-mode error (keys/deps missing)
│   │
│   ├── config/
│   │   ├── index.ts                           # barrel
│   │   ├── distribution-config.ts             # Zod schema (channels, base domains, paths)
│   │   ├── env-keys.ts                        # documented env var names (NO secrets inlined)
│   │   ├── channel-config.ts                  # per-channel config
│   │   ├── domains.ts                         # base domain config (no hardcoded localhost)
│   │   └── defaults.ts                        # default TTLs/intervals/paths
│   │
│   └── util/
│       ├── index.ts                           # barrel
│       ├── semver.ts                          # semver parse/compare
│       ├── hash.ts                            # sha256 helpers (provenance)
│       ├── tarball.ts                         # pack/unpack + size
│       ├── url-builder.ts                     # build public URLs from config (no hardcoded domains)
│       ├── retry.ts                           # bounded retry
│       ├── backoff.ts                         # exponential backoff (device-poll, registry)
│       └── glob.ts                            # path glob matcher
│
├── test/                                      # mirrors src/ (see §10)
│   └── ...
│
py/recoder-billing/                            # FUSED Polar billing engine (Python/FastAPI)
├── pyproject.toml
├── README.md
├── config/
│   ├── __init__.py
│   └── settings.py                            # merged polar/config.py (env-only secrets)
├── kit/
│   ├── __init__.py
│   ├── jwt.py                                 # merged polar/kit/jwt.py
│   ├── jwk.py                                 # merged polar/kit/jwk.py
│   ├── crypto.py                              # merged polar/kit/crypto.py
│   ├── money.py                               # merged polar/kit/money.py
│   ├── currency.py                            # merged polar/kit/currency.py
│   └── metadata.py                            # merged polar/kit/metadata.py
├── models/
│   ├── __init__.py
│   ├── checkout.py                            # merged polar/models/checkout.py
│   ├── subscription.py                        # merged polar/models/subscription.py
│   ├── order.py                               # merged polar/models/order.py
│   ├── product.py                             # merged polar/models/product.py
│   ├── customer.py                            # merged polar/models/customer.py
│   ├── benefit_grant.py                       # merged polar/models/benefit_grant.py
│   ├── license_key.py                         # merged polar/models/license_key.py
│   └── meter_event.py                         # merged polar/models/meter_event.py
├── billing/
│   ├── __init__.py
│   ├── checkout/
│   │   ├── __init__.py
│   │   ├── service.py                         # merged polar/checkout/service.py
│   │   ├── guard.py                           # merged polar/checkout/guard.py
│   │   └── schemas.py                         # merged polar/checkout/schemas.py
│   ├── checkout_link/
│   │   ├── __init__.py
│   │   └── service.py                         # merged polar/checkout_link/service.py
│   ├── product/
│   │   ├── __init__.py
│   │   ├── service.py                         # merged polar/product/service.py
│   │   └── price_set.py                       # merged polar/product/price_set.py
│   ├── subscription/
│   │   ├── __init__.py
│   │   ├── service.py                         # merged polar/subscription/service.py
│   │   ├── scheduler.py                       # merged polar/subscription/scheduler.py
│   │   └── update.py                          # merged polar/subscription/update.py
│   ├── order/
│   │   ├── __init__.py
│   │   └── service.py                         # merged polar/order/service.py
│   ├── ledger/
│   │   ├── __init__.py
│   │   ├── transaction.py                     # merged polar/transaction/*
│   │   └── refund.py                          # merged polar/refund/*
│   ├── payout/
│   │   ├── __init__.py
│   │   └── account.py                         # merged polar/account/service.py (Stripe Connect)
│   └── webhook/
│       ├── __init__.py
│       ├── service.py                         # merged polar/webhook/service.py
│       └── webhooks.py                        # merged polar/webhook/webhooks.py
├── entitlements/
│   ├── __init__.py
│   ├── benefit/
│   │   ├── __init__.py
│   │   ├── service.py                         # merged polar/benefit/service.py
│   │   ├── registry.py                        # merged polar/benefit/registry.py
│   │   └── grant.py                           # merged polar/benefit/grant/service.py
│   ├── strategies/
│   │   ├── __init__.py
│   │   ├── license_keys.py                    # merged benefit/strategies/license_keys/service.py
│   │   ├── downloadables.py                   # merged benefit/strategies/downloadables/service.py
│   │   ├── feature_flag.py                    # merged benefit/strategies/feature_flag/*
│   │   └── meter_credit.py                    # merged benefit/strategies/meter_credit/*
│   ├── license_key/
│   │   ├── __init__.py
│   │   └── service.py                         # merged polar/license_key/service.py
│   ├── seat/
│   │   ├── __init__.py
│   │   └── service.py                         # merged polar/customer_seat/service.py
│   └── downloadable/
│       ├── __init__.py
│       └── s3.py                              # merged polar/file/s3.py
├── metering/
│   ├── __init__.py
│   ├── meter/
│   │   ├── __init__.py
│   │   ├── service.py                         # merged polar/meter/service.py
│   │   └── aggregation.py                     # merged polar/meter/aggregation.py
│   └── event/
│       ├── __init__.py
│       ├── service.py                         # merged polar/event/service.py
│       └── system.py                          # merged polar/event/system.py
├── portal/
│   ├── __init__.py
│   ├── subscription.py                        # merged customer_portal/service/subscription.py
│   ├── benefit_grant.py                       # merged customer_portal/service/benefit_grant.py
│   └── downloadables.py                       # merged customer_portal/service/downloadables.py
├── integrations/
│   ├── __init__.py
│   └── stripe/
│       ├── __init__.py
│       ├── service.py                         # merged polar/integrations/stripe/service.py
│       └── payment.py                         # merged polar/integrations/stripe/payment.py
├── ipc/
│   ├── __init__.py
│   ├── internal_api.py                        # /internal/agent-os/billing/* (INTERNAL_SERVICE_KEY)
│   └── envelope.py                            # signed-envelope verify (never trust the wire)
└── tests/
    ├── test_checkout_service.py
    ├── test_subscription_lifecycle.py
    ├── test_benefit_grant.py
    ├── test_license_key.py
    ├── test_meter_aggregation.py
    ├── test_webhook_verifier.py
    └── test_internal_api_auth.py
```

**Planned functional file count: 268** (TS: 210 `src` + ~58 `test`; Python: 58 `py/recoder-billing`
src + 7 tests; excludes manifests/READMEs). The TS `src/` tree alone is **210 functional files**.

---

## 3. Module responsibilities (deep dive)

### 3.1 `engine/` — the uniform delivery core

The engine is the part that is identical no matter which channel ships. `deliver(req)` runs the
canonical ordered pipeline (`delivery-pipeline.ts`):

```
entitlement-gate → approval-gate → idempotency → channel.publish
  → preview-health/verify → receipt-builder → run-event-emitter → (rollback on failure)
```

- **`entitlement-gate.ts`** resolves the actor's plan/entitlements (`ports/entitlement-port.ts`)
  and refuses delivery the actor isn't entitled to (e.g. a free-plan org trying to publish a
  custom domain). On entitlement-resolution failure it **fails safe** — deny, never silently
  allow.
- **`approval-gate.ts`** is the hard production rule. Any customer-visible delivery (npm publish,
  tap commit, DNS/TLS change, prod site publish, store submission) **pauses** on an
  `approval_requested` and only proceeds when `approval-port.ts` reports a recorded
  `Approval{status:'approved'}`. A `rejected`/`expired` approval ends the delivery as `failed`.
  Distribution **executes under** the gate; it never opens it.
- **`fail-safe.ts`** centralizes the "degrade safely when keys/deps are missing" rule: a missing
  `NPM_TOKEN`, Polar key, `CLOUDFLARE_API_TOKEN`, or absent `certbot` produces a
  `FailSafeError` and an `unhealthy` `ChannelHealth` with a reason — surfaced as environment
  evidence, never a green-washed success.
- **`preview-health.ts`** + **`receipt-builder.ts`** enforce "signed preview URL + explicit
  health over inferred success": a publish is only `completed` after the published URL actually
  responds healthy; the `DeliveryReceipt` carries `{ url, sha256, health, approvalRef }`.
- **`idempotency.ts`** keys deliveries so a retried publish never double-charges or double-pushes.
- **`signing.ts`** signs delivery envelopes and preview URLs; **`concurrency.ts`** serializes
  SSH-bound deliveries (memory rule: *no parallel SSH* — it maxes connections).

### 3.2 `channels/cli-dist/` — CLI distribution + device-flow auth

The recoder-code CLI is the primary distributed binary. Two concerns merge here.

**Publishing** (`npm-publisher.ts` + `npm-pack.ts` + `npm-dist-tags.ts`): pack the CLI into an
npm tarball, compute its `sha256`, publish to the registry, and set the dist-tag for the release
channel. The computed `sha256` is the **same value** `packaging/homebrew/formula-bump.ts`
stamps into `Formula/recoder-code.rb` — one provenance hash, two channels.

**Device-flow auth** (`device-flow/*`) is the merge of `packages/cli/src/services/web-cli-auth-bridge.ts`
and `packages/recoder-code/.../RecoderAuthService.ts`. It is the exact contract that
`scripts/verify-cli-device-flow-e2e.sh` exercises against `https://recoder.xyz`:

1. `device-authorize.ts` issues a `DeviceAuthGrant` (`deviceCode`, `userCode`,
   `verificationUri`, `interval`, `expiresAt`) and stores it in `device-grant-store.ts` (TTL,
   single-use `user_code`).
2. The CLI opens `verificationUriComplete`; `browser-authorize.ts` consumes the `user_code`
   **with the user's recoder.xyz session cookie** — recoder.xyz remains the auth source of truth.
3. `device-poll.ts` polls `/api/auth/cli/token` (with backoff/`interval`) until approved.
4. `cli-token-issuer.ts` mints a scoped `CliToken` (access + refresh + `scopes` + `plan`);
   `cli-token-verifier.ts` verifies/refreshes it against `auth-port.ts`.
5. `token-store.ts` persists the `~/.recoder/auth.json` shape (`RecoderAuthData` with
   `RecoderUser.subscription_plan` + `quota`) client-side and the server record.

`device-flow-config.ts` holds `CLIENT_ID = recoder-code`, intervals, and TTLs — **no secrets**.
`byok/*` is the BYOK gateway (fused from `packages/recoder-cli-router`): `provider-key-resolver.ts`
prefers the user's own provider key (from `vault`) over a platform key; `key-redactor.ts`
guarantees provider keys never reach logs (the `verify-byok-e2e.sh` contract).

### 3.3 `channels/packaging/` — package/tap + native packaging

- **`homebrew/`** is the merge of `homebrew-recoder/Formula/recoder-code.rb`.
  `formula-renderer.ts` renders the formula (npm tgz `url`, `sha256`, `depends_on "node@20"`,
  `--version` test); `formula-bump.ts` bumps version+sha on a new npm release; `tap-publisher.ts`
  commits it to the tap repo **through the approval gate** (it is a customer-visible change).
- **`desktop/`** merges `apps/desktop/{build-signed.js,notarize.js,entitlements.mac.plist}` and the
  release scripts: `codesign.ts` + `notarize.ts` + `entitlements.ts` produce signed, notarized
  builds; `release-secrets.ts` enforces the `check-desktop-release-readiness.sh` secret set
  (`DESKTOP_CSC_LINK`, `DESKTOP_CSC_KEY_PASSWORD`, `DESKTOP_APPLE_ID`,
  `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD`, `DESKTOP_APPLE_TEAM_ID`) — **fail fast** if any required
  secret is missing. `artifact-validator.ts` + `smoke-runner.ts` fuse
  `validate-release-artifacts.js`/`smoke-production.js`.
- **`mobile/`** merges `apps/mobile` (Expo/EAS + Android); `store-submit.ts` is approval-gated.
- **`checksums.ts`** + **`sbom.ts`** attach a provenance manifest to every packaged artifact.

### 3.4 `channels/billing/` — billing & entitlements (TS view of fused Polar)

The TS `billing/*` modules are a thin, typed control-plane *view*; the durable money/entitlement
logic lives in the fused Polar service `py/recoder-billing` and is reached only through
`ports/billing-port.ts` (→ `adapters/polar-billing-adapter.ts`, a signed-envelope internal client).

- **`checkout/`** maps to Polar's `checkout`/`checkout_link` services (hosted checkout, Stripe
  confirm). `plan-catalog.ts` maps Recoder plans (`free`/`pro`/`enterprise`) onto Polar products.
- **`subscription/`** drives Polar subscription lifecycle and `subscription-sync.ts` projects the
  result into Recoder entitlements; `seat-service.ts` covers org seats (Polar `customer_seat`).
- **`entitlements/`** is the read path the rest of the platform hits constantly:
  `entitlement-resolver.ts` computes effective entitlements (Polar benefit grants);
  `entitlement-cache.ts` is a short-TTL cache that **denies on miss** (fail safe);
  `quota-enforcer.ts` gates CLI/agent usage by quota; `feature-flags.ts` derives flags from the
  Polar `feature_flag` benefit; `license-key-service.ts` issues/validates/activates license keys
  (Polar `license_key`).
- **`metering/`** emits usage `MeterEvent`s (Polar `event` ingestion) and aggregates them (Polar
  `meter` aggregation) for usage-based billing and the cost dashboard.
- **`webhook/`** consumes Polar webhooks; `webhook-verifier.ts` validates signatures (**never
  trust the wire**) and `webhook-to-entitlement.ts` projects `order.paid`/`subscription.updated`
  into entitlement changes + CloudEvents.
- **`health/billing-health.ts`** reports **truthful** provider readiness — if the Stripe/Polar key
  is absent it returns `unhealthy` with a reason (AGENTS.md rule 5; tech-strategy §2.3).

### 3.5 `channels/artifact-publish/` — public artifact publishing

This is distribution's PUBLIC artifact surface (canonical artifact records stay in agent-os).

- **`published-site/`** fuses the `web.recoder.xyz/<slug>/` flow: `site-publisher.ts` copies a
  container build output to `/data/published/<slug>` (path from config, never hardcoded);
  `nginx-writer.ts`/`nginx-reload.ts` write the per-slug server block and reload nginx (graceful,
  best-effort, truthfully reported).
- **`custom-domain/`** fuses `docker-backend/src/domain-manager.ts` verbatim in shape:
  `DomainStatus` (`pending_dns|dns_verified|pending_ssl|active|error|removed`), `dns-verifier.ts`
  (TXT/CNAME), `tls-provisioner.ts` (certbot Let's Encrypt), `domain-nginx-writer.ts`
  (`/etc/nginx/conf.d/custom-domains/*.conf`). All custom-domain/DNS/TLS changes are
  **approval-gated** (production rule).
- **`preview/`** fuses `docker-backend/src/zrok-preview.ts`: `preview-tunnel.ts` creates/reserves a
  zrok share; `preview-url-signer.ts` builds the signed `preview-{token}.recoder.xyz` URL (under
  `*.recoder.xyz` so Cloudflare Universal SSL covers it); `preview-health.ts` is the explicit
  health probe that gates "preview ready" (no inferred success).
- **`downloadable/`** publishes entitlement-gated downloadable artifacts to S3 (Polar `file`/`s3`
  benefit); `download-grant.ts` checks the benefit grant before issuing a presigned URL.

### 3.6 `channels/release/` — release orchestration

`release-orchestrator.ts` compiles a `ReleasePlan` (which channels, which versions, in what
order) and drives each channel's `deliver()` **under one umbrella approval**. `changelog.ts`
renders the changelog consumed by `site/app/changelog`; `release-evidence.ts` + `closeout.ts`
fuse `a5-release-evidence.sh` and `production-external-closeout.sh` (PASS/FAIL/SKIP, truthful
health, environment evidence). `rollback-plan.ts` defines per-channel rollback (yank dist-tag,
revert formula, unpublish slug).

### 3.7 `channels/telemetry-optin/` — opt-in telemetry

Strictly consent-gated. `consent-store.ts` records per-user opt-in; `event-anonymizer.ts` strips
PII; `telemetry-sink.ts` pushes anonymized events with **no secrets**; `install-ping.ts` is an
anonymous install/version ping used only with consent.

### 3.8 `adapters/`, `persistence/`, `ports/`, `seams/`

`adapters/*` are the only place external CLIs/APIs are touched (npm, git, nginx, certbot,
Cloudflare, zrok, S3, Stripe-via-Polar, apple notary, EAS, recoder-auth, vault, ssh). Each reads
secrets from env/vault and fails fast if a required secret is missing. `persistence/*` keeps
durable records behind a repository seam (`postgres-store.ts` prod, `json-store.ts` dev — mirroring
the existing `docker-backend/src/persistence.ts` JSON pattern). `seams/*` are the typed boundaries
to other subsystems (§7); `ports/*` are the dependency interfaces the engine/channels program
against.

### 3.9 `py/recoder-billing` — the fused Polar engine

Polar is a large Python/FastAPI monetization platform; we **merge and edit** it (not HTTP-wrap)
into `py/recoder-billing`, keeping its proven money primitives: `checkout`, `checkout_link`,
`product`/`price_set`, `subscription` (+ `scheduler`/`update`), `order`/ledger,
`payout`/`account` (Stripe Connect), `benefit` grant engine + per-benefit `strategies`
(`license_keys`, `downloadables`, `feature_flag`, `meter_credit`), `license_key`, `meter` +
`event` (usage), `customer_portal`, `webhook`, and `integrations/stripe`. The **only** surface
distribution talks to is `ipc/internal_api.py` mounted at `/internal/agent-os/billing/*`,
protected by `INTERNAL_SERVICE_KEY` and a signed envelope (`ipc/envelope.py`) — not a public
source of task/approval/artifact state (`.claude/rules/api.md`).

---

## 4. Public API surface (`src/public-api.ts` / `index.ts`)

```ts
// Engine entry
export function createDistribution(config: DistributionConfig): Distribution;
export interface Distribution {
  deliver(req: DeliveryRequest): Promise<DeliveryReceipt>;     // the gated delivery pipeline
  channels: ChannelRegistry;
  release(plan: ReleasePlan): Promise<ReleaseResult>;          // multi-channel under approval
  health(): Promise<Record<DistributionChannel, ChannelHealth>>; // truthful, never faked
}

// CLI distribution + device-flow
export function createCliDistChannel(opts?): ChannelPublisher;
export interface DeviceFlow {
  authorize(input: DeviceAuthorizeInput): Promise<DeviceAuthGrant>;     // device_code + user_code
  pollToken(deviceCode: string): Promise<CliToken | { pending: true; interval: number }>;
  browserApprove(userCode: string, session: AuthSession): Promise<void>; // recoder.xyz cookie
  refresh(refreshToken: string): Promise<CliToken>;
}

// Billing + entitlements (TS view of fused Polar)
export interface Billing {
  startCheckout(intent: CheckoutIntent): Promise<CheckoutResult>;       // hosted link
  resolveEntitlements(subject: Subject): Promise<Entitlement[]>;         // fail safe on miss
  checkQuota(subject: Subject, kind: UsageKind): Promise<Quota>;
  emitUsage(event: MeterEvent): Promise<void>;
  validateLicenseKey(key: string): Promise<LicenseKeyActivation>;
  handleWebhook(raw: Buffer, sig: string): Promise<void>;               // signature-verified
  health(): Promise<ChannelHealth>;                                     // truthful provider readiness
}

// Artifact publishing
export interface ArtifactPublish {
  publishSite(input: PublishSiteInput): Promise<PublishedSite>;         // approval-gated
  addCustomDomain(input: CustomDomainInput): Promise<CustomDomain>;     // approval-gated (DNS/TLS)
  createPreview(input: PreviewInput): Promise<PreviewShare>;            // signed url + explicit health
  publishDownloadable(input: DownloadableInput): Promise<Downloadable>;// entitlement-gated
}

// Packaging
export function createHomebrewChannel(opts?): ChannelPublisher;          // tap commit (approval-gated)
export function createDesktopChannel(opts?): ChannelPublisher;           // signed + notarized
export function createMobileChannel(opts?): ChannelPublisher;            // EAS + store submit

// Contract re-exports (kept canonical)
export type { Artifact } from '@recoder/agent-os';                       // never redefined
export type { Approval } from '@recoder/agent-os';
export type { CloudEvent } from '@recoder/agent-events';

// Ports (for host wiring)
export type { BillingPort, EntitlementPort, ApprovalPort, EventBusPort, RegistryPort } from './ports';
```

The key compatibility promise: distribution **publishes** an existing agent-os `Artifact` and
returns a `DeliveryReceipt` whose `{url, sha256, health, approvalRef}` is recorded back as a
`RunEvent` — agent-os stays the artifact/approval state-of-record.

---

## 5. Data flow (end to end)

### 5.1 CLI device-flow login

```
recoder-code CLI                                  [packages/recoder-code]
  │ POST device authorize (CLIENT_ID=recoder-code)
  ▼
cli-dist/device-flow/device-authorize → DeviceAuthGrant{device_code,user_code,verification_uri,interval}
  │ CLI opens verification_uri_complete in browser
  ▼
browser-authorize (recoder.xyz session cookie)    [auth source of truth]
  │ user approves user_code  → grant marked approved
  ▼
device-poll  ──► /api/auth/cli/token  (interval/backoff)
  ▼
cli-token-issuer → CliToken{access,refresh,scopes,plan}  (verified by cli-token-verifier)
  ▼
token-store → ~/.recoder/auth.json (RecoderAuthData{user.subscription_plan, quota})
```

### 5.2 Subscription → entitlement → quota

```
site/app/pricing  →  Billing.startCheckout(intent)
  ▼
billing-port → polar-billing-adapter ── signed envelope ──► py/recoder-billing /internal/.../checkout
  │ Polar checkout/service.py → Stripe → order.paid
  ▼
Polar webhook ──► billing/webhook/billing-webhook-handler (signature-verified)
  → webhook-to-entitlement → benefit grant → Entitlement + CloudEvent(outbox)
  ▼
entitlements/entitlement-resolver (cache, deny-on-miss)  → effective plan/features
  ▼
quota-enforcer gates CLI/agent usage; meter-event-emitter feeds usage-based billing
```

### 5.3 Public delivery (gated)

```
runtime evidence: built Artifact                 [packages/runtime → agent-os ArtifactStore]
  │ DeliveryRequest{ artifact, channel, actor }
  ▼
engine/delivery-pipeline
  ├─ entitlement-gate        (actor entitled to this channel? else deny, fail safe)
  ├─ approval-gate           (customer-visible? → approval_requested; PAUSE until Approval)
  │     governance/agent-os records Approval{status:'approved'} ──┐
  ├─ idempotency             (no double-publish)                  │
  ├─ channel.publish:                                             │
  │     npm        → npm-publisher (+ dist-tag)                   │
  │     homebrew   → tap-publisher (commit Formula/recoder-code.rb)
  │     web_site   → site-publisher → /data/published/<slug> + nginx-writer
  │     preview    → preview-tunnel → preview-{token}.recoder.xyz (signed)
  │     download   → s3-uploader (entitlement-gated presigned)
  ├─ preview-health / verify (URL responds healthy? else rollback)
  ├─ receipt-builder         → DeliveryReceipt{url,sha256,health,approvalRef}
  └─ run-event-emitter       → RunEvent → agent-events outbox → agent-os
        (on failure: rollback + failed RunEvent, never faked completed)
```

**Fail-safe path:** if a required key/dep is missing (`NPM_TOKEN`, Polar key,
`CLOUDFLARE_API_TOKEN`, absent `certbot`), the stage raises `FailSafeError`, the channel reports
`unhealthy{reason}`, and the delivery ends `failed` with environment evidence — never green-washed.

---

## 6. Fusion map (where each real file lands)

> **Status:** planned mapping. The `ts/polar/**` sources were read at plan time but `ts/polar`
> was retired in `34b2d4a83`; the `py/recoder-billing` destinations are not yet created. See §1.

| # | Source file (read at plan time) | Merged destination (planned) | Notes |
|---|---|---|---|
| 1 | `ts/polar/server/polar/checkout/service.py` | `py/recoder-billing/billing/checkout/service.py` | hosted checkout + Stripe confirm kept |
| 2 | `ts/polar/server/polar/checkout_link/service.py` | `py/recoder-billing/billing/checkout_link/service.py` | reusable links kept |
| 3 | `ts/polar/server/polar/subscription/{service,scheduler,update}.py` | `py/recoder-billing/billing/subscription/*` | lifecycle + proration kept |
| 4 | `ts/polar/server/polar/benefit/{service,registry}.py`, `benefit/grant/service.py` | `py/recoder-billing/entitlements/benefit/*` | grant engine + registry kept |
| 5 | `ts/polar/server/polar/benefit/strategies/{license_keys,downloadables,feature_flag,meter_credit}/service.py` | `py/recoder-billing/entitlements/strategies/*` | per-benefit strategies kept |
| 6 | `ts/polar/server/polar/license_key/service.py` | `py/recoder-billing/entitlements/license_key/service.py` | issue/validate/activate kept |
| 7 | `ts/polar/server/polar/meter/{service,aggregation}.py` | `py/recoder-billing/metering/meter/*` | usage aggregation kept |
| 8 | `ts/polar/server/polar/event/{service,system}.py` | `py/recoder-billing/metering/event/*` | usage ingestion kept |
| 9 | `ts/polar/server/polar/customer_seat/service.py` | `py/recoder-billing/entitlements/seat/service.py` | org seats kept |
| 10 | `ts/polar/server/polar/customer_portal/service/{subscription,benefit_grant,downloadables}.py` | `py/recoder-billing/portal/*` | self-serve portal kept |
| 11 | `ts/polar/server/polar/product/{service,price_set}.py` | `py/recoder-billing/billing/product/*` | catalog kept |
| 12 | `ts/polar/server/polar/order/service.py`, `transaction`, `refund`, `account/service.py` | `py/recoder-billing/billing/{order,ledger,payout}/*` | ledger + Stripe Connect kept |
| 13 | `ts/polar/server/polar/integrations/stripe/{service,payment}.py` | `py/recoder-billing/integrations/stripe/*` | processor kept |
| 14 | `ts/polar/server/polar/webhook/{service,webhooks}.py` | `py/recoder-billing/billing/webhook/*` | webhook engine kept |
| 15 | `ts/polar/server/polar/file/s3.py` | `py/recoder-billing/entitlements/downloadable/s3.py` | S3 downloadables kept |
| 16 | `ts/polar/server/polar/{config.py,kit/{jwt,jwk,crypto,money,currency}.py}` | `py/recoder-billing/{config,kit}/*` | settings + money/jwt kept |
| 17 | `ts/polar/server/polar/models/{checkout,subscription,order,benefit_grant,license_key,meter_event,...}.py` | `py/recoder-billing/models/*` | ORM shapes kept |
| 18 | `packages/cli/src/services/web-cli-auth-bridge.ts` | `cli-dist/device-flow/{device-authorize,device-poll,browser-authorize}.ts` | device-flow bridge kept |
| 19 | `packages/cli/src/services/{auth-manager,auth-service,backend-client}.ts` | `cli-dist/device-flow/{cli-token-issuer,cli-token-verifier,token-store}.ts` | `/auth/cli/token` exchange kept |
| 20 | `packages/recoder-code/.../RecoderAuthService.ts` | `cli-dist/device-flow/token-store.ts`, `domain/cli-token.ts` | `~/.recoder/auth.json`, RecoderUser kept |
| 21 | `packages/recoder-cli-router/src/api/{router-endpoint,providers/*}.ts` | `cli-dist/byok/*` | BYOK gateway kept |
| 22 | `homebrew-recoder/Formula/recoder-code.rb` | `packaging/homebrew/{formula-renderer,formula-bump,tap-publisher}.ts` | url/sha256/node@20/test kept |
| 23 | `apps/desktop/{build-signed.js,notarize.js,entitlements.mac.plist}` | `packaging/desktop/{codesign,notarize,entitlements}.ts` | signed+notarized build kept |
| 24 | `apps/desktop/scripts/{validate-release-artifacts,smoke-production}.js` | `packaging/desktop/{artifact-validator,smoke-runner}.ts` | release validation kept |
| 25 | `apps/mobile/{app.json,android,BUILD_GUIDE.md}` | `packaging/mobile/*` | Expo/EAS + Android kept |
| 26 | `docker-backend/src/domain-manager.ts` | `artifact-publish/custom-domain/*` + `published-site/nginx-*.ts` | DomainStatus, certbot, nginx kept |
| 27 | `docker-backend/src/zrok-preview.ts` | `artifact-publish/preview/*` | signed share + health kept |
| 28 | `nginx/nginx-production.conf` | `artifact-publish/published-site/site-publisher.ts` | `web.recoder.xyz/<slug>/` routing kept |
| 29 | `site/app/{pricing,download,changelog}/page.tsx` | `release/changelog.ts` + delivery targets | marketing/pricing surface kept |
| 30 | `scripts/{a5-release-evidence,production-external-closeout}.sh` | `release/{release-evidence,closeout}.ts` | PASS/FAIL/SKIP evidence kept |

**Seam contracts consumed (not owned):** `packages/agent-os/src/domain/{artifact,approval,event}.ts`,
`packages/agent-os/src/ports/{artifact-store,event-bus}.ts`,
`packages/agent-events/src/{cloudevent,outbox,run-event-mapper}.ts`,
`packages/auth/src/{verify,session,cross-domain}.ts`.

---

## 7. Seams to other subsystems

| Subsystem | Seam file | Direction | Contract |
|---|---|---|---|
| **agent-os** (state of record) | `seams/agent-os-port.ts` | in: `Artifact`,`Approval`; out: `RunEvent` | publishes public copies; never owns artifact/approval state |
| **governance** (approval/policy) | `seams/governance-port.ts` | out: `approval_requested`; in: `Approval` decision | every customer-visible delivery pauses on the gate; distribution never bypasses |
| **agent-events** (outbox) | `seams/events-port.ts` | out: `CloudEvent`/`RunEvent` | delivery receipts + entitlement changes → transactional outbox |
| **runtime** (build evidence) | `seams/runtime-port.ts` | in: built `Artifact` | runtime produces the artifact; distribution ships it |
| **coordination** (A2A) | `seams/coordination-port.ts` | out: release handoff | release approval/handoff to humans/reviewers |
| **brain** (planner) | `seams/brain-port.ts` | in: pricing/plan hints | optional plan-recommendation hints |
| **memory** | `seams/memory-port.ts` | out: delivery memory *candidate* | never writes durable memory |
| **auth** (recoder.xyz) | `ports/auth-port.ts` | in: session/user verify | recoder.xyz is the sole auth authority for CLI tokens |
| **vault** | `ports/secret-port.ts` | in: env/vault secrets | secrets only from env; fail fast if required+missing |
| **billing engine** | `ports/billing-port.ts` | bidir over signed envelope | `py/recoder-billing` via `/internal/agent-os/billing/*` |

All canonical state stays in Recoder contracts; distribution only emits `RunEvent`s back. The
fused Polar engine owns *money/entitlement* state behind an internal port, never task/approval/
artifact/memory state.

---

## 8. Error handling

- **TS**: `errors/distribution-error.ts` hierarchy + `result.ts` `Result<T,E>` envelope. Codes
  (`error-codes.ts`): `entitlement_denied`, `approval_required`, `approval_rejected`,
  `registry_failed`, `tap_push_failed`, `sign_failed`, `notarize_failed`, `dns_unverified`,
  `tls_failed`, `preview_unhealthy`, `publish_failed`, `key_missing`, `quota_exceeded`,
  `webhook_untrusted`. Each maps to a `failed` `RunEvent` via `error-to-event.ts`.
- **Fail-safe by construction** (`fail-safe-error.ts`): missing keys/deps → `key_missing` +
  `unhealthy` health + environment evidence; **never** a faked `completed`/`ok`.
- **Approval is fail-closed**: a missing/expired/rejected `Approval` for a customer-visible
  delivery yields `approval_required`/`approval_rejected` and stops — distribution cannot open
  its own gate.
- **No double-effect**: `engine/idempotency.ts` guarantees a retried delivery never double-pushes
  a tarball, double-commits a formula, or double-charges a checkout. `engine/rollback.ts` reverts
  a partially-applied publish on a failed verify.
- **Wire trust**: Polar webhooks (`webhook-verifier.ts`) and the internal billing envelope
  (`ipc/envelope.py`) are signature-verified; an untrusted payload is rejected
  (`webhook_untrusted`), never processed.
- **No secret leakage**: `observability/logger.ts` and `cli-dist/byok/key-redactor.ts` redact
  secret-shaped tokens, provider keys, and CLI tokens from all logs.
- **Python**: typed exceptions per Polar service (kept from the merged sources); the internal API
  is fail-closed (auth/signature failure → reject; missing processor key → explicit `unhealthy`).

---

## 9. Config

- **TS** (`config/distribution-config.ts`, Zod): channel toggles, base domains
  (`config/domains.ts` — `recoder.xyz`, `web.recoder.xyz`, `preview` base; **no hardcoded
  localhost**), published root path (`/data/published`), nginx custom-domains dir, device-flow
  intervals/TTLs, release-channel policy, telemetry default (off). `config/env-keys.ts`
  documents every env var name (`NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`, `ZROK_*`, `INTERNAL_SERVICE_KEY`,
  `DESKTOP_CSC_*`, `DESKTOP_APPLE_*`, `POLAR_*`/`STRIPE_*`, `AWS_*` for S3) — **no secret values
  inlined**, all read at runtime from env/vault.
- **Python** (`py/recoder-billing/config/settings.py`, merged `polar/config.py`): Stripe/Polar
  keys, DB URL, signing keys — all `#[serde-style] env` with **fail-fast** validation when a
  required key is missing (AGENTS.md rule 5; tech-strategy §2.2 production-safe DB URL).
- Secrets are never committed (memory landmine: broad `*secret*`/`*token*` globs once hid source —
  env-only is the rule, `env-keys.ts` documents names not values).

---

## 10. Observability

- `observability/metrics.ts`: counters/histograms — publishes per channel, checkout starts/conversions,
  device grants issued/approved/expired, CLI token mints/refreshes, quota denials, webhook
  receipts, preview shares + health pass rate, tap/registry push latency, fail-safe (degraded) rate.
- `observability/tracing.ts`: OTEL spans `distribution.deliver`, `.publish.<channel>`,
  `.billing.checkout`, `.entitlement.resolve`, `.preview.create`, `.approval.wait`.
- `observability/health.ts`: a **truthful** aggregate — each channel reports `ok|degraded|unhealthy`
  with a reason; billing health reflects real Stripe/Polar readiness (never inferred). `verify_audit`
  of delivery receipts feeds a scheduled integrity check.
- `observability/audit.ts`: every gated delivery (approval ref, actor, url, hash) is pushed to the
  governance audit chain so customer-visible delivery is part of the tamper-evident trail.

---

## 11. Tests tree (mirrors `src/`)

```text
packages/distribution/test
├── unit
│   ├── engine/{delivery-pipeline,entitlement-gate,approval-gate,fail-safe,
│   │           preview-health,idempotency,rollback,receipt-builder,signing}.test.ts
│   ├── domain/{semver,cli-token,entitlement,preview-share,delivery-receipt}.test.ts
│   ├── cli-dist/device-flow/{device-authorize,device-poll,browser-authorize,
│   │           cli-token-issuer,cli-token-verifier,token-store}.test.ts
│   ├── cli-dist/{npm-pack,npm-dist-tags,version-resolver}.test.ts
│   ├── cli-dist/byok/{provider-key-resolver,key-redactor}.test.ts
│   ├── packaging/homebrew/{formula-renderer,formula-bump,tap-publisher}.test.ts
│   ├── packaging/desktop/{codesign,notarize,artifact-validator,release-secrets}.test.ts
│   ├── billing/checkout/{checkout-service,checkout-link}.test.ts
│   ├── billing/entitlements/{entitlement-resolver,entitlement-cache,quota-enforcer,
│   │           license-key-service,feature-flags}.test.ts
│   ├── billing/metering/{meter-event-emitter,usage-aggregator}.test.ts
│   ├── billing/webhook/{webhook-verifier,webhook-to-entitlement}.test.ts
│   ├── billing/health/billing-health.test.ts
│   ├── artifact-publish/published-site/{site-publisher,slug-allocator,nginx-writer}.test.ts
│   ├── artifact-publish/custom-domain/{domain-service,dns-verifier,tls-provisioner}.test.ts
│   ├── artifact-publish/preview/{preview-url-signer,preview-health,preview-tunnel}.test.ts
│   ├── artifact-publish/downloadable/{download-grant,s3-uploader}.test.ts
│   ├── release/{release-orchestrator,release-channel-policy,closeout,rollback-plan}.test.ts
│   ├── telemetry-optin/{consent-store,event-anonymizer}.test.ts
│   ├── errors/{error-to-event,fail-safe-error}.test.ts
│   └── config/{distribution-config,domains}.test.ts
├── contract
│   ├── artifact-ref-shape.test.ts          # PublicArtifactRef matches agent-os Artifact
│   ├── approval-gate.test.ts               # never proceeds without recorded Approval
│   ├── run-event-shape.test.ts             # DeliveryReceipt → RunEvent matches agent-os
│   ├── billing-port.test.ts                # signed-envelope internal contract
│   └── device-flow-contract.test.ts        # matches scripts/verify-cli-device-flow-e2e.sh
├── integration
│   ├── device-flow.fixture.test.ts         # authorize→browser-approve→poll→token (faux auth)
│   ├── checkout-webhook.fixture.test.ts    # checkout → order.paid webhook → entitlement
│   ├── publish-site.test.ts                # site-publisher + nginx-writer against tmp root
│   ├── preview-signed-url.test.ts          # signed preview URL + health gate
│   ├── homebrew-bump.test.ts               # npm sha256 → formula bump round-trip
│   └── fail-safe-missing-keys.test.ts      # missing NPM_TOKEN/Polar key → unhealthy, not faked
└── fixtures
    ├── polar-webhooks/*.json
    ├── device-grants/*.json
    └── formulae/recoder-code.rb

py/recoder-billing/tests
├── test_checkout_service.py                # ported Polar checkout tests
├── test_subscription_lifecycle.py
├── test_benefit_grant.py
├── test_license_key.py
├── test_meter_aggregation.py
├── test_webhook_verifier.py
└── test_internal_api_auth.py               # INTERNAL_SERVICE_KEY + signed envelope
```

---

## 12. Verification plan

Per `.claude/rules/testing.md` (narrowest checks that prove behavior) and `AGENTS.md`
verification defaults:

```bash
# TypeScript package
pnpm --filter @recoder/distribution test            # unit + contract + integration
pnpm --filter @recoder/distribution check-types
pnpm --filter @recoder/distribution build           # tsup multi-entry must succeed

# Fused Polar billing engine
pytest py/recoder-billing/tests --cov=recoder_billing

# Existing deterministic E2E contracts this subsystem must keep green
scripts/verify-cli-device-flow-e2e.sh               # device authorize → /api/auth/cli/token → refresh
scripts/verify-byok-e2e.sh                          # BYOK provider-key CRUD
scripts/check-desktop-release-readiness.sh          # DESKTOP_CSC_*/APPLE_* secret gating
scripts/production-external-closeout.sh             # PASS/FAIL/SKIP closeout (truthful health)

# Agent OS contract gate (artifact/approval/event shapes still satisfied)
pnpm test:contracts:agent-os
```

Integration tests run **offline** against recorded fixtures (`test/fixtures/*`) and a faux auth /
faux billing provider — no real charges, no real publishes, no network — so they are deterministic
and CI-safe. Any test that would touch a real registry, real DNS/TLS, real Stripe, or real SSH is
**gated** behind an env flag and a present-secret probe; when a required secret is absent it
**skips with a truthful reason** (never green-washes). A delivery attempted with a missing key or
an absent/expired approval producing `unhealthy`/`approval_required` is the **expected** safe
behavior and is asserted in `fail-safe-missing-keys.test.ts` and `approval-gate.test.ts`.

---

## 13. Migration / rollout

1. Scaffold `packages/distribution` depending on `@recoder/agent-os` (contracts) + `@recoder/agent-events`
   + `@recoder/auth` + `@recoder/vault`. Land `domain/`, `ports/`, `errors/`, `config/` first.
2. Build `engine/` (pipeline + gates + fail-safe + receipt) with tests first — these encode the
   production rules (approval gate, fail safe, signed preview health) before any channel exists.
3. Land `channels/artifact-publish/` by lifting `docker-backend/src/{domain-manager,zrok-preview}.ts`
   into `custom-domain/*` + `preview/*` (behavior identical; tests against tmp roots) — fully
   testable offline, no external CLI required.
4. Land `channels/cli-dist/device-flow/*` as the real implementation behind
   `scripts/verify-cli-device-flow-e2e.sh`; re-point `packages/cli` + `packages/recoder-code` auth
   services to consume it. recoder.xyz stays the auth source of truth.
5. Land `channels/packaging/homebrew/*` (formula bump from npm sha256) and `desktop/*` (signed +
   notarized) behind the desktop-release secret gate.
6. Stand up `py/recoder-billing` by merging Polar service-by-service (tests ported alongside);
   expose only `/internal/agent-os/billing/*` behind `INTERNAL_SERVICE_KEY` + signed envelope.
   Wire `channels/billing/*` through `ports/billing-port.ts` → `polar-billing-adapter.ts`.
7. Wire `seams/events-port.ts` to `@recoder/agent-events`; wire `seams/agent-os-port.ts` to the
   artifact/approval services; wire `seams/governance-port.ts` to the approval gate.
8. Run all verification gates; file `bd` follow-ups for any deferred work (e.g. store submission,
   payout/Connect closeout) and keep health/approval/verification status truthful throughout.
```
