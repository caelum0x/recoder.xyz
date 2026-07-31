# Billing, Metering & Plans — Domain Design

Folder prefix: `backend/src/domains/billing/`
Owner boundary: **Money.** The MoR provider clients (Polar/Creem/Paddle/Dodo — never Stripe), plans/entitlements, usage
metering + quotas, billing webhooks, invoicing, plan→capability mapping,
BYOK-vs-platform billing, and **fail-safe health that degrades explicitly when
provider keys are missing (never fakes readiness).**
Serves the **website** (checkout, plan page, invoices) and the **desktop**
(entitlement checks, quota headroom).

---

## 1. Overview

Recoder.xyz is the **plan authority**; the payment providers are **Merchant-of-Record
only** (Polar, Creem, Paddle, Dodo Payments — **never Stripe**, per owner mandate),
selected by `BILLING_PROVIDER` (default `polar`) and each behind the same
single `BillingProviderPort`. The domain never invents entitlement state: the
durable source of a subscription/grant is a webhook-confirmed provider event
projected into Postgres, and the effective plan for a user is
`max(recoder.xyz auth plan, webhook-confirmed provider plan)`.

Three responsibilities, one composer:

1. **Plans & entitlements** — a `PlanCatalog` (free/pro/team/max/enterprise) with
   a plan→capability matrix, and an `EntitlementGate` other domains call to ask
   "may this subject do X?" It reuses `@recoder/distribution`'s
   `createEntitlementResolver` (grant algebra) and adds
   the **BYOK-vs-platform** decision (a BYOK user with `hasOwnApiKey` bypasses
   token-metered quota but still passes feature gates).
2. **Metering & quotas** — durable per-run / per-token / per-engine usage events
   in Postgres, idempotent, batched and flushed to the provider meter feed;
   quota counters with reset windows enforced fail-safe (deny/zero-headroom on
   miss, never inflated). **Shipped (Phase 9):** 7-day dunning grace
   (`withinDunningGrace`, `DUNNING_GRACE_DAYS`) for `past_due` subscriptions,
   plus overage UpgradeHint CTA (encourage plan upgrade when quota exceeded).
3. **Money edges** — checkout, customer portal, invoices, and **signed
   webhooks** (`/webhooks/:provider`, provider ∈ polar|creem|paddle|dodo) that reconcile subscription/grant state.

**Fail-safe law (non-negotiable):** when the active provider's
`*_ACCESS_TOKEN`/`*_API_KEY` / `*_WEBHOOK_SECRET` are absent, the provider adapter reports
`down`, checkout/portal return a truthful `SERVICE_UNAVAILABLE`, quota checks
**deny** (zero headroom), and `health()` is `degraded:true` — never a faked 200.

The subscription-mutating **edges** (`POST /checkout`, `POST /cancel`) pass
through an injected `BillingWriteGate.decide()` (the governance `decide` facet)
for policy + durable audit — **degrade-safe: ungated until bootstrap wires it**
(`setGovernanceGate`), with the authenticated own-subject edge still protecting
them. The durable **usage-ledger append** (`/internal/billing/meter`) is an
idempotent write that is NOT gate-routed; the **webhook reconcile** is trusted by
**raw-body signature verification** (not a session), then idempotently projected
and audit-recorded. (SHIPPED as of Phase 9; the earlier "every write through
`GovernanceGate`" framing was aspirational — metering and webhook writes are
not gate-decided.)

---

## 2. File Tree (35 files, as shipped Phase 9 — `df2fd7f7d`)

```
backend/src/domains/billing/
  index.ts                              # factory (createBillingModule) + the public BillingModule interface
  billing-module.ts                     # composer (class BillingComposer): fuses distribution + MoR providers + metering + gate
  config.ts                             # typed BillingConfig slice (AppConfig + provider-key overrides)
  types.ts                              # domain types (BillingSubject, PlanTier, UsageRecord, Invoice…)
  health.ts                             # truthful per-provider up|down aggregate
  provider-registry.ts                  # BILLING_PROVIDER-selected registry over the four MoR adapters
  invoice.service.ts                    # invoice list/get + webhook receipt upsert (provider + local)

  ports/
    billing-provider.port.ts            # BillingProviderPort — the MoR-provider seam (Polar|Creem|Paddle|Dodo)
    metering-repo.port.ts               # MeteringRepository — usage/quota/subscription/invoice data port
    entitlement.port.ts                 # EntitlementGate — exposed to ALL other domains
    governance-gate.port.ts             # BillingWriteGate — the narrow governance `decide` facet billing mutations use

  adapters/
    distribution-billing.adapter.ts     # wraps @recoder/distribution createEntitlementResolver (REUSE)
    polar.adapter.ts                    # Polar (MoR) provider adapter (degrade-safe)
    creem.adapter.ts                    # Creem (MoR) provider adapter (degrade-safe)
    paddle.adapter.ts                   # Paddle (MoR) provider adapter (degrade-safe)
    dodo.adapter.ts                     # Dodo Payments (MoR) provider adapter (degrade-safe)
    shared.ts                           # shared MoR adapter helpers (fetch + signature verify)

  services/
    plan-catalog.service.ts             # free/pro/team/max/enterprise + plan→capability matrix + plan→productId
    entitlement.service.ts              # feature gates + BYOK-vs-platform decision (impl of EntitlementGate)
    quota.service.ts                    # limit resolution, headroom, consume, reset windows
    metering.service.ts                 # record per-run/token/engine usage, idempotent batch flush
    webhook.service.ts                  # verify + dispatch provider events → reconcile projection

  persistence/
    billing.repository.ts               # concrete MeteringRepository over QueryExecutor (:param SQL)

  routes/
    billing.routes.ts                   # session edges (plan/checkout/portal/invoices/cancel)
    billing-webhooks.routes.ts          # POST /webhooks/:provider (raw body + signature verify)
    internal-billing.routes.ts          # POST /meter (INTERNAL_SERVICE_KEY-gated usage ingest)

  mcp/
    billing-engine.ts                   # read-only MCP tools: billing_plan_read / billing_usage_read / billing_provider_status

  __tests__/
    entitlement.service.test.ts
    metering-quota.service.test.ts
    webhook.service.test.ts
    invoice.service.test.ts
    provider-registry.test.ts
    internal-billing.routes.test.ts
    billing-governance-gate.routes.test.ts
    billing-engine.mcp.test.ts
```

Migrations live in the canonical runner dir, NOT under the domain:
`backend/migrations/billing_0001_core.sql` (subscriptions + invoices +
webhook_events idempotency) and `backend/migrations/billing_0002_usage.sql`
(usage_events + usage_counters).

---

## 3. Per-file responsibilities

| # | path | lang | kind | responsibility | keyExports |
|---|------|------|------|----------------|------------|
| 1 | `index.ts` | ts | service | Public entrypoint; pure factory, no singletons | `createBillingModule(deps): BillingModule`, `BillingModule`, `BillingModuleDeps` |
| 2 | `billing-module.ts` | ts | service | Composer: builds the MoR providers (Polar/Creem/Paddle/Dodo), distribution entitlement resolver, repo-backed services; exposes `EntitlementGate`; aggregates health; routes checkout/cancel mutations through the injected `BillingWriteGate` | `class BillingComposer` |
| 3 | `config.ts` | ts | config | Zod-typed `BillingConfig` slice read ONLY from `AppConfig` (never `process.env`); provider keys, webhook secrets, meter flush interval, plan→product map | `BillingConfigSchema`, `BillingConfig` |
| 4 | `types.ts` | ts | type | Domain types not in `packages/*`: `BillingSubject`, `PlanTier`, `UsageRecord`, `Invoice`, `EntitlementView`, `MeterBatch`, `WebhookEnvelope`, `PortalIntent` | those types |
| 5 | `health.ts` | ts | service | Compose per-provider + repo health into `HealthReport`; `degraded:true` when any key missing; truthful `engines:[{name,status}]` | `billingHealth(deps): HealthReport` |
| 6 | `ports/billing-provider.port.ts` | ts | port | The MoR-provider seam (Polar\|Creem\|Paddle\|Dodo): checkout, portal, subscription read, meter emit, invoice list, webhook verify+parse, health | `BillingProviderPort`, `CheckoutIntent`, `PortalSession`, `ProviderSubscription`, `ParsedWebhook` |
| 7 | `ports/metering-repo.port.ts` | ts | port | Repository PORT (impl in persistence): usage events, quota counters, subscriptions, invoices, webhook idempotency | `MeteringRepository`, `SubscriptionUpsert`, `UsageEventInput`, `CounterUpsert`, `IdempotentWrite` |
| 7b | `ports/governance-gate.port.ts` | ts | port | The narrow governance `decide` facet billing mutations (checkout/cancel) pass through; injected at bootstrap, degrade-safe until wired | `BillingWriteGate` |
| 8 | `ports/entitlement.port.ts` | ts | port | The gate OTHER domains consume: `resolvePlan`, `check`, `checkFeature`, `checkQuota`, `isBYOK`, `view`, `health` | `EntitlementGate` |
| 9 | `adapters/distribution-billing.adapter.ts` | ts | adapter | Wraps `@recoder/distribution` `createEntitlementResolver` (grant algebra reuse); degrade-safe `configured:false` + deny-on-miss when no `BillingPort` injected | `createDistributionBillingAdapter` |
| 10 | `adapters/polar.adapter.ts` | ts | adapter | `BillingProviderPort` for Polar (MoR) via `fetch`; checkout/subscription/cancel; HMAC webhook verify; degrade-safe when key absent | `createPolarAdapter` |
| 11 | `adapters/{creem,paddle,dodo}.adapter.ts` + `adapters/shared.ts` | ts | adapter | `BillingProviderPort` over each MoR provider's REST (`fetch`, no SDK lock, shared helpers); signature verify; degrades to `down` when that provider's `*_API_KEY`/`*_WEBHOOK_SECRET` absent | `createCreemAdapter`, `createPaddleAdapter`, `createDodoAdapter`; `provider-registry.ts` → `createProviderRegistry` |
| 12 | `services/plan-catalog.service.ts` | ts | service | The tier catalog + `plan→capability` matrix + `plan→productId` map; resolves/`normalize`s a `PlanTier`; deny-by-default floor | `createPlanCatalog`, `PLAN_CAPABILITIES`, `PLAN_QUOTAS` |
| 13 | `services/entitlement.service.ts` | ts | service | Effective-plan resolution (`max(auth, webhook-confirmed)`), feature gates via distribution grant algebra, **BYOK-vs-platform** rule | `createEntitlementService` (impl of `EntitlementGate`) |
| 14 | `services/quota.service.ts` | ts | service | Resolve limits from plan tier, check headroom against counters, atomic consume, window reset; fail-safe deny | `createQuotaService`, `QuotaService` |
| 15 | `services/metering.service.ts` | ts | service | Record per-run/token/engine `UsageRecord` (idempotency key), decrement counter, batch + flush to provider meter; retry-safe | `createMeteringService`, `MeteringService` |
| 16 | `invoice.service.ts` (domain root) | ts | service | List/get invoices merging provider invoices + local receipts; `recordFromWebhook` receipt upsert; fail-safe empty on `down` | `createInvoiceService`, `InvoiceService` |
| 17 | `services/webhook.service.ts` | ts | service | Verify signature via provider adapter, dedupe on `(provider,event_id)` **committed only after a durable projection**, reconcile subscription/invoice; no `RunEvent` bus (not wired) | `createWebhookService`, `WebhookService` |
| 18 | `persistence/billing.repository.ts` | ts | repository | Concrete `MeteringRepository` over injected `QueryExecutor` (`:param` SQL, `WHERE subject_id=:subjectId`); no RLS | `createBillingRepository` |
| 19 | `routes/billing.routes.ts` | ts | route | Session-auth edges (`/plan`,`/checkout`,`/portal`,`/invoices`,`/cancel`); zod-validate; `sendSuccess`/`sendError`; checkout/cancel → `BillingWriteGate` | `buildBillingRouter(deps)` |
| 20 | `routes/billing-webhooks.routes.ts` | ts | route | Raw-body `POST /webhooks/:provider` edges (polar\|creem\|paddle\|dodo); signature-authenticated, not session; hands to `WebhookService` | `buildBillingWebhooksRouter(deps)` |
| 20b | `routes/internal-billing.routes.ts` | ts | route | `POST /meter` behind `requireInternal` (`INTERNAL_SERVICE_KEY`); idempotent usage ingest into the shared ledger | `buildInternalBillingRouter(deps)` |
| 21 | `mcp/billing-engine.ts` | ts | service | READ-ONLY MCP tools on the `EntitlementGate` (`billing_plan_read`/`billing_usage_read`/`billing_provider_status`); subject bound to the host-authorized `McpToolCaller` (own-subject only unless admin/internal) | `buildBillingMcpTools` |
| 22 | `backend/migrations/billing_0001_core.sql` | sql | migration | `billing_subscriptions`, `billing_invoices`, `billing_webhook_events` | tables + indexes |
| 23 | `backend/migrations/billing_0002_usage.sql` | sql | migration | `billing_usage_events`, `billing_usage_counters` | tables + indexes |
| 24 | `__tests__/metering-quota.service.test.ts` | ts | test | Headroom, consume, reset window, unlimited (`limit=0`), fail-safe deny on repo error | — |
| 25 | `__tests__/entitlement.service.test.ts` | ts | test | Effective-plan max, feature gate allow/deny, BYOK bypasses token quota but not feature gate | — |
| 26 | `__tests__/webhook.service.test.ts` | ts | test | Bad signature → reject; duplicate `event_id` → no-op; `subscription.active` → plan upgrade projected | — |
| 27 | `__tests__/provider-registry.test.ts` | ts | test | `BILLING_PROVIDER` selects the active adapter; each adapter `down` when key absent | — |
| 28 | `__tests__/invoice.service.test.ts` | ts | test | Provider+local receipt merge; `recordFromWebhook` idempotent upsert; fail-safe empty | — |
| 29 | `__tests__/internal-billing.routes.test.ts` | ts | test | `requireInternal` gating; idempotent `recorded:false` on duplicate key | — |
| 30 | `__tests__/billing-governance-gate.routes.test.ts` | ts | test | Checkout/cancel routed through `BillingWriteGate`; deny/needs-approval surfaced truthfully | — |
| 31 | `__tests__/billing-engine.mcp.test.ts` | ts | test | Own-subject-only enforcement; admin/internal may name arbitrary subject; absent caller → AUTH_REQUIRED | — |

---

## 4. DB schema (`backend/migrations/`, raw parameterized SQL)

`billing_0001_core.sql`
```sql
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                   TEXT PRIMARY KEY,
  subject_id           TEXT NOT NULL,              -- user_id or org_id
  subject_kind         TEXT NOT NULL DEFAULT 'user',
  plan                 TEXT NOT NULL,              -- free|pro|team|max|enterprise
  provider             TEXT NOT NULL,              -- polar|creem|paddle|dodo
  provider_customer_id TEXT,
  provider_sub_id      TEXT,
  status               TEXT NOT NULL,              -- active|past_due|canceled|trialing
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_sub_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_sub_subject ON billing_subscriptions(subject_id);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id                 TEXT PRIMARY KEY,
  subject_id         TEXT NOT NULL,
  provider           TEXT NOT NULL,
  provider_invoice_id TEXT NOT NULL,
  amount_cents       INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'usd',
  status             TEXT NOT NULL,               -- paid|open|void|uncollectible
  hosted_url         TEXT,
  pdf_url            TEXT,
  issued_at          TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, provider_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_inv_subject ON billing_invoices(subject_id);

-- webhook idempotency + audit
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  event_id     TEXT NOT NULL,
  provider     TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (provider, event_id)
);
```

`billing_0002_usage.sql`
```sql
CREATE TABLE IF NOT EXISTS billing_usage_events (
  id              TEXT PRIMARY KEY,
  subject_id      TEXT NOT NULL,
  kind            TEXT NOT NULL,                  -- cli_request|agent_run|token|publish|preview|download
  quantity        INTEGER NOT NULL DEFAULT 1,
  run_id          TEXT,                           -- links to agent-os Run
  engine          TEXT,                           -- e.g. tensorzero|claude|codex
  idempotency_key TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  flushed_at      TIMESTAMPTZ,                    -- set when pushed to provider meter
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_usage_subject_kind ON billing_usage_events(subject_id, kind);
CREATE INDEX IF NOT EXISTS idx_usage_unflushed ON billing_usage_events(flushed_at) WHERE flushed_at IS NULL;

-- materialized quota counter per subject/kind/window (fast headroom checks)
CREATE TABLE IF NOT EXISTS billing_usage_counters (
  subject_id   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  usage_limit  INTEGER NOT NULL,                  -- 0 = unlimited
  used         INTEGER NOT NULL DEFAULT 0,
  reset_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (subject_id, kind, window_start)
);
```

Access control is app-layer only (`WHERE subject_id = :subjectId`); **no
Supabase RLS / `auth.uid()`**. `billing_subscriptions`/`invoices` are projections
of webhook-confirmed provider state — never written from an unauthenticated path.

---

## 5. HTTP / WS edges

Mounted by the `edge` domain route table. All pass the interop chain.

| Method | Path | Auth | Purpose | Write→gov |
|--------|------|------|---------|-----------|
| GET | `/api/billing/plan` | session | Caller's effective entitlement view (plan + features + quotas via `gate.view`) | no |
| GET | `/api/billing/portal` | session | Customer-portal data: active subscription + recent invoices + `canManage` | no |
| GET | `/api/billing/invoices` | session | List invoices (provider + local receipt projection) | no |
| POST | `/api/billing/checkout` | session | Create hosted checkout (active MoR provider) for a plan | **yes** |
| POST | `/api/billing/cancel` | session | Cancel the caller's active subscription (now or at period end) | **yes** |
| POST | `/api/billing/webhooks/:provider` | **signature** | MoR webhook (provider ∈ polar\|creem\|paddle\|dodo) → idempotent reconcile | no¹ |
| POST | `/internal/billing/meter` | `INTERNAL_SERVICE_KEY` (requireInternal self-gates) | Worker/conductor emits a `UsageRecord` (idempotent ledger append) | no¹ |

¹ Webhook reconcile and metering ingest are NOT gate-decided: the webhook is
trusted by raw-body signature verification, the meter append is an idempotent
ledger write behind `INTERNAL_SERVICE_KEY`. Only `POST /checkout` and
`POST /cancel` pass the `BillingWriteGate`. There is no `GET /entitlements`,
`GET /usage`, `POST /portal`, or `GET /api/billing/health` route — the entitlement
view is served off `/plan`, portal read is a `GET`, and health is a module-level
`HealthSource` (not a billing HTTP edge).

Webhook routes need the **raw request body** (before JSON parse) for HMAC
verification — mounted with a raw body-parser ahead of the global `express.json`.

---

## 6. Interfaces (ports)

**Exposed to other domains** (`ports/entitlement.port.ts`) — the load-bearing seam:
```ts
export interface EntitlementGate {
  resolvePlan(subject: BillingSubject): Promise<PlanTier>;                       // max(auth, webhook-confirmed)
  check(principal: Principal, req: EntitlementRequest): Promise<GateDecision>;   // unified feature|quota entrypoint
  checkFeature(subject: BillingSubject, feature: Feature): Promise<EntitlementDecision>;
  checkQuota(subject: BillingSubject, kind: UsageKind, cost?: number): Promise<QuotaDecision>;
  isBYOK(subject: BillingSubject): Promise<boolean>;   // BYOK skips token-metered quota
  view(subject: BillingSubject): Promise<EntitlementView>;   // plan + features + per-kind quotas
  health(): ComponentHealth;
}
```
Consumed by: `conductor` (before dispatching a run — quota + feature gate),
`inference` (token metering emit), `engines` (per-engine usage), `edge`
(checkout UI state), `agent-os` (run gating).

**Consumed from other domains:**
- `AppConfig` (bootstrap) — provider keys via `config.ts`.
- `Session` (identity) — subject resolution on session edges.
- `QueryExecutor` (persistence) — the repo impl.
- `BillingWriteGate.decide()` (governance) — the `POST /checkout` + `POST /cancel`
  mutations (injected via `setGovernanceGate`; degrade-safe ungated until wired).
- `@recoder/agent-mcp` / the domain-tools MCP bridge — read-only tool registration.

_Not wired (planned, not shipped):_ a `RunEvent` bus emit on webhook reconcile
(`billing.subscription.changed` / `billing.usage.recorded`) — the reconcile loop
projects to Postgres + audit only; no `@recoder/agent-events` emit exists yet. The
per-edge `authorize→risk→policy→audit` interop-chain wrap is likewise not applied
uniformly here — mutations use `BillingWriteGate`, webhooks use signature trust.

**Provider seam** (`ports/billing-provider.port.ts`) — every MoR provider implements:
```ts
export interface BillingProviderPort {
  readonly name: 'polar' | 'creem' | 'paddle' | 'dodo';
  createCheckout(intent: CheckoutIntent): Promise<CheckoutResult>;
  getSubscription(providerSubId: string): Promise<ProviderSubscription | null>;
  cancel(providerSubId: string, opts?: CancelOptions): Promise<ProviderSubscription | null>;
  verifyWebhook(rawBody: Buffer, headers: Record<string,string>): boolean;      // pure sig bool
  parseEvent(rawBody: Buffer, headers: Record<string,string>): ParsedWebhook | null; // null = bad sig
  emitUsage(events: readonly MeterEvent[]): Promise<void>;   // optional meter feed; no-op when unsupported
  health(): Promise<ProviderHealth>;   // configured:false → down, truthful reason
}
```
(No `createPortalSession` / `listInvoices` on the port — the portal edge reads the
durable subscription + invoice projections directly; invoices come from the
`InvoiceService` receipt projection, not a live provider list call.)

---

## 7. Reuse vs New

**REUSE (do not rebuild):**
- `@recoder/distribution` — `createEntitlementResolver` (+ the `BillingPort`,
  `Entitlement`, `Feature`, `Plan`, `Subject` types) is the reused grant algebra;
  `entitlement.service.ts` + `distribution-billing.adapter.ts` wrap it and we do
  NOT redefine plan/quota/entitlement algebra. (SHIPPED reality wires only
  `createEntitlementResolver` — the earlier `createBillingService` /
  `createPolarBillingAdapter` / `createPlanCatalog` reuse never materialized; the
  plan catalog + quota counters are the domain's own, widening distribution with
  the `max` tier + token/engine quota rows.)
- `governance` (the `BillingWriteGate` `decide` facet), identity (`Principal` +
  auth middleware), persistence (`QueryExecutor`), `@recoder/logger`.
- Verification script `scripts/verify-byok-e2e.sh` for the BYOK-vs-platform path.

_Superseded reuse claims (did NOT ship):_ the four MoR adapters are fresh
`fetch`-based `BillingProviderPort`s (Polar included — NOT a move of a
`polar-client.ts`); there are no behavior-preserving `/api/billing/polar/*`
aliases; and the MCP tools (`mcp/billing-engine.ts` → `buildBillingMcpTools`) are
the domain's own read-only surface, not a moved `billingMcpServer`.

**NEW (write):**
- `adapters/{creem,paddle,dodo}.adapter.ts` + `adapters/shared.ts` — distribution ships only Polar;
  the other three MoR providers are new degrade-safe `BillingProviderPort`s (fetch-based, per-provider sig verify). **No Stripe.**
- Durable **Postgres metering** (`persistence/billing.repository.ts` +
  migrations) — distribution's quota is provider-fed/in-memory; we need
  auditable per-run/token/engine records + idempotency + reset windows.
- `services/webhook.service.ts` — signature-verified, idempotent reconcile →
  Postgres subscription/invoice projection (dedup committed only after a durable
  apply). (No `RunEvent` emit shipped — that remains planned.)
- `services/plan-catalog.service.ts` — free/**pro**/team/**max**/enterprise +
  `plan→capability` + `plan→productId` map (widens distribution's matrix with
  the `max` tier and the token/engine capability rows).
- `services/metering.service.ts` batch-flush loop, `services/invoice.service.ts`,
  `billing-module.ts` composer, `health.ts`, `config.ts`, ports, tests.

**CUT (do not restore):** the old `backend/src/enterprise/billing.*` and the
~47 dangling `server.ts` billing/enterprise imports — reintroduced ONLY
DB-backed here.

---

## 8. Degrade-safe & fail-safe behavior

- No provider key → adapter `health()` `configured:false`, `down`; module
  `degraded:true`. Checkout/portal → `sendError(SERVICE_UNAVAILABLE)`.
- Quota check with unreachable repo → **deny** (`QuotaDecision{allowed:false,
  reason:'metering_unavailable'}`), never allow-by-default.
- BYOK subject (`hasOwnApiKey`) → `token`/`agent_run` token-metered quota is
  skipped, but **feature** gates still apply (a free BYOK user can't publish).
- Webhook bad signature → `401`-equivalent reject, event dropped, audit-logged.
- Duplicate `event_id` → no-op (idempotent), returns `200` so provider stops
  retrying.
- Metering flush failure → events stay `flushed_at IS NULL`, retried next tick;
  usage is still counted locally (quota stays truthful even if provider lags).

---

## 9. Implementation order

1. **Contracts first:** `types.ts`, `config.ts`, the three `ports/*`. (compiles, no logic)
2. **Persistence:** `backend/migrations/billing_0001_core.sql`,
   `billing_0002_usage.sql`, `persistence/billing.repository.ts`
   (pg-backed, `:param`, idempotency UNIQUE).
3. **Catalog + entitlement:** `plan-catalog.service.ts`,
   `distribution-billing.adapter.ts`, `entitlement.service.ts`
   (+ `entitlement.service.test.ts`) — this yields a working `EntitlementGate`
   other domains can wire before any provider exists.
4. **Quota + metering:** `quota.service.ts`, `metering.service.ts`
   (+ `quota.service.test.ts`). Fail-safe deny path first.
5. **Providers:** `polar.adapter.ts` + `{creem,paddle,dodo}.adapter.ts` + `shared.ts`
   + `provider-registry.ts` (+ `provider-registry.test.ts`), `invoice.service.ts`.
6. **Webhooks:** `webhook.service.ts` (+ `webhook.service.test.ts`),
   `routes/billing-webhooks.routes.ts` (raw body), `routes/internal-billing.routes.ts`.
7. **Edges + MCP:** `routes/billing.routes.ts`, `mcp/billing-engine.ts`
   (`buildBillingMcpTools`), registered through the domain-tools MCP bridge.
8. **Compose + health:** `billing-module.ts`, `index.ts`, `health.ts`
   (+ `health.test.ts`). Wire into `bootstrap/container.ts` + `/health`.
9. **Verify:** `pnpm check-types`, `pnpm test` (domain), `pnpm
   test:contracts:agent-os`, `scripts/verify-byok-e2e.sh`.

No engine daemons/crates/py sidecars — billing is pure TS spine work; the only
external transports are HTTPS to the MoR providers (Polar/Creem/Paddle/Dodo, fetch) behind the provider port.
