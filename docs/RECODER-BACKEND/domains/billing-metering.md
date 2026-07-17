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
   `createBillingService` (entitlement resolver + MoR benefit fusion) and adds
   the **BYOK-vs-platform** decision (a BYOK user with `hasOwnApiKey` bypasses
   token-metered quota but still passes feature gates).
2. **Metering & quotas** — durable per-run / per-token / per-engine usage events
   in Postgres, idempotent, batched and flushed to the provider meter feed;
   quota counters with reset windows enforced fail-safe (deny/zero-headroom on
   miss, never inflated).
3. **Money edges** — checkout, customer portal, invoices, and **signed
   webhooks** (`/webhooks/:provider`, provider ∈ polar|creem|paddle|dodo) that reconcile subscription/grant state.

**Fail-safe law (non-negotiable):** when the active provider's
`*_ACCESS_TOKEN`/`*_API_KEY` / `*_WEBHOOK_SECRET` are absent, the provider adapter reports
`down`, checkout/portal return a truthful `SERVICE_UNAVAILABLE`, quota checks
**deny** (zero headroom), and `health()` is `degraded:true` — never a faked 200.

Every **write** (checkout create, usage record, plan mutation from a webhook)
flows through `GovernanceGate.decide()`; every **edge + MCP call** passes the
`authorize→risk→policy→audit` interop chain. Webhook routes are authenticated by
**signature verification** (not a session), then still audit-recorded.

---

## 2. File Tree (~28 files)

```
backend/src/domains/billing/
  index.ts                              # factory + the ONE public BillingModule interface
  billing-module.ts                     # composer: fuses distribution + MoR providers + metering + gate
  config.ts                             # typed BillingConfig slice (from AppConfig)
  types.ts                              # domain types (BillingSubject, PlanTier, UsageRecord, Invoice…)
  health.ts                             # truthful per-provider up|down aggregate

  ports/
    billing-provider.port.ts            # BillingProviderPort — the MoR-provider seam (Polar|Creem|Paddle|Dodo)
    metering.repo.port.ts               # MeteringRepository — usage/quota/subscription/invoice data port
    entitlement.port.ts                 # EntitlementGate — exposed to ALL other domains

  adapters/
    distribution-billing.adapter.ts     # wraps @recoder/distribution createBillingService (REUSE)
    polar.adapter.ts                    # Polar (MoR) provider adapter over polar-client (REUSE, moved)
    creem.adapter.ts                    # Creem (MoR) provider adapter (degrade-safe)
    paddle.adapter.ts                   # Paddle (MoR) provider adapter (degrade-safe)
    dodo.adapter.ts                     # Dodo Payments (MoR) provider adapter (degrade-safe)
    shared.ts                           # shared MoR adapter helpers (fetch + signature verify)

  services/
    plan-catalog.service.ts             # free/pro/team/max/enterprise + plan→capability matrix
    entitlement.service.ts              # feature gates + BYOK-vs-platform decision
    quota.service.ts                    # limit resolution, headroom, consume, reset windows
    metering.service.ts                 # record per-run/token/engine usage, idempotent batch flush
    invoice.service.ts                  # invoice list/get (provider + local receipts)
    webhook.service.ts                  # verify + dispatch provider events → reconcile state

  persistence/
    billing.repository.ts               # concrete MeteringRepository over QueryExecutor (:param SQL)

  routes/
    billing.routes.ts                   # HTTP edges (plan/checkout/usage/entitlements/invoices/portal)
    billing-webhooks.routes.ts          # POST webhook edges (raw body + signature verify)

  mcp/
    billing-engine.ts                   # MCP tools: billing.plan.read / usage.read / entitlement.check (REUSE, moved)

  migrations/                           # registered into backend/migrations (canonical runner)
    0001_billing_core.sql               # subscriptions + invoices + webhook_events (idempotency)
    0002_billing_usage.sql              # usage_events + usage_counters

  __tests__/
    quota.service.test.ts
    entitlement.service.test.ts
    webhook.service.test.ts
    mor-adapters.test.ts
    billing.repository.test.ts
    health.test.ts
```

---

## 3. Per-file responsibilities

| # | path | lang | kind | responsibility | keyExports |
|---|------|------|------|----------------|------------|
| 1 | `index.ts` | ts | service | Public entrypoint; pure factory, no singletons | `createBillingModule(deps): BillingModule`, `BillingModule`, `BillingModuleDeps` |
| 2 | `billing-module.ts` | ts | service | Composer: builds the MoR providers (Polar/Creem/Paddle/Dodo), distribution BillingService, repo-backed services; exposes `EntitlementGate`; aggregates health; routes writes through governance | `createBillingModuleImpl` |
| 3 | `config.ts` | ts | config | Zod-typed `BillingConfig` slice read ONLY from `AppConfig` (never `process.env`); provider keys, webhook secrets, meter flush interval, plan→product map | `BillingConfigSchema`, `BillingConfig` |
| 4 | `types.ts` | ts | type | Domain types not in `packages/*`: `BillingSubject`, `PlanTier`, `UsageRecord`, `Invoice`, `EntitlementView`, `MeterBatch`, `WebhookEnvelope`, `PortalIntent` | those types |
| 5 | `health.ts` | ts | service | Compose per-provider + repo health into `HealthReport`; `degraded:true` when any key missing; truthful `engines:[{name,status}]` | `billingHealth(deps): HealthReport` |
| 6 | `ports/billing-provider.port.ts` | ts | port | The MoR-provider seam (Polar\|Creem\|Paddle\|Dodo): checkout, portal, subscription read, meter emit, invoice list, webhook verify+parse, health | `BillingProviderPort`, `CheckoutIntent`, `PortalSession`, `ProviderSubscription`, `ParsedWebhook` |
| 7 | `ports/metering.repo.port.ts` | ts | port | Repository PORT (impl in persistence): usage events, quota counters, subscriptions, invoices, webhook idempotency | `MeteringRepository` |
| 8 | `ports/entitlement.port.ts` | ts | port | The gate OTHER domains consume: `checkEntitlement`, `checkQuota`, `resolvePlan`, `isBYOK` | `EntitlementGate`, `EntitlementDecision`, `QuotaDecision` |
| 9 | `adapters/distribution-billing.adapter.ts` | ts | adapter | Wraps `@recoder/distribution` `createBillingService`/`createEntitlementResolver`/`createPolarBillingAdapter`; degrade-safe unhealthy when unconfigured | `createDistributionBillingAdapter` |
| 10 | `adapters/polar.adapter.ts` | ts | adapter | `BillingProviderPort` over the existing `polar-client.ts` (moved in-place); checkout/portal/products/subscriptions; HMAC webhook verify | `createPolarProviderAdapter` |
| 11 | `adapters/{creem,paddle,dodo}.adapter.ts` + `adapters/shared.ts` | ts | adapter | `BillingProviderPort` over each MoR provider's REST (`fetch`, no SDK lock, shared helpers); signature verify; degrades to `down` when that provider's `*_API_KEY`/`*_WEBHOOK_SECRET` absent | `createCreemProviderAdapter`, `createPaddleProviderAdapter`, `createDodoProviderAdapter` |
| 12 | `services/plan-catalog.service.ts` | ts | service | The tier catalog + `plan→capability` matrix + `plan→productId` map; resolves a `PlanTier` from a plan string; deny-by-default floor | `createPlanCatalog`, `PLAN_CAPABILITIES`, `planCapabilities(plan)` |
| 13 | `services/entitlement.service.ts` | ts | service | Effective-plan resolution (`max(auth, webhook-confirmed)`), feature gates via distribution `hasFeature`, **BYOK-vs-platform** rule | `createEntitlementService` (impl of `EntitlementGate`) |
| 14 | `services/quota.service.ts` | ts | service | Resolve limits from plan tier, check headroom against counters, atomic consume, window reset; fail-safe deny | `createQuotaService`, `QuotaService` |
| 15 | `services/metering.service.ts` | ts | service | Record per-run/token/engine `UsageRecord` (idempotency key), decrement counter, batch + flush to provider meter; retry-safe | `createMeteringService`, `MeteringService` |
| 16 | `services/invoice.service.ts` | ts | service | List/get invoices merging provider invoices + local receipts; fail-safe empty on `down` | `createInvoiceService`, `InvoiceService` |
| 17 | `services/webhook.service.ts` | ts | service | Verify signature via provider adapter, dedupe on `event_id`, reconcile subscription/entitlement, emit `RunEvent`; all under governance | `createWebhookService`, `WebhookService` |
| 18 | `persistence/billing.repository.ts` | ts | repository | Concrete `MeteringRepository` over injected `QueryExecutor` (`:param` SQL, `WHERE user_id=:userId`); no RLS | `createBillingRepository` |
| 19 | `routes/billing.routes.ts` | ts | route | Session-auth edges; zod-validate; `sendSuccess`/`sendError`; each write → interop chain + governance | `createBillingRouter(deps)` |
| 20 | `routes/billing-webhooks.routes.ts` | ts | route | Raw-body `POST /webhooks/:provider` edges (polar|creem|paddle|dodo); signature-authenticated, not session; hands to `WebhookService` | `createBillingWebhookRouter(deps)` |
| 21 | `mcp/billing-engine.ts` | ts | service | READ-ONLY MCP tools on the `EntitlementGate`; conforms to `@recoder/agent-mcp` ToolRouter; `registerBillingMcpTools` for the wiring checklist | `createBillingEngine`, `registerBillingMcpTools` |
| 22 | `migrations/0001_billing_core.sql` | sql | migration | `billing_subscriptions`, `billing_invoices`, `billing_webhook_events` | tables + indexes |
| 23 | `migrations/0002_billing_usage.sql` | sql | migration | `billing_usage_events`, `billing_usage_counters` | tables + indexes |
| 24 | `__tests__/quota.service.test.ts` | ts | test | Headroom, consume, reset window, unlimited (`limit=0`), fail-safe deny on repo error | — |
| 25 | `__tests__/entitlement.service.test.ts` | ts | test | Effective-plan max, feature gate allow/deny, BYOK bypasses token quota but not feature gate | — |
| 26 | `__tests__/webhook.service.test.ts` | ts | test | Bad signature → reject; duplicate `event_id` → no-op; `subscription.active` → plan upgrade projected | — |
| 27 | `__tests__/mor-adapters.test.ts` | ts | test | each MoR adapter: `down` when key absent; signature verify golden vector; checkout URL shape | — |
| 28 | `__tests__/billing.repository.test.ts` | ts | test | `:param` binding, idempotency UNIQUE on usage key, `WHERE user_id` scoping | — |
| (29) | `__tests__/health.test.ts` | ts | test | Missing keys → `degraded:true` + per-provider `down`; never fakes `up` | — |

---

## 4. DB schema (`backend/migrations/`, raw parameterized SQL)

`0001_billing_core.sql`
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

`0002_billing_usage.sql`
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
| GET | `/api/billing/plan` | session | Owner's authoritative plan + effective entitlements | no |
| GET | `/api/billing/entitlements` | session | Full entitlement view (features + quotas) | no |
| GET | `/api/billing/usage` | session | Usage headroom/summary per kind | no |
| GET | `/api/billing/invoices` | session | List invoices (provider + local) | no |
| POST | `/api/billing/checkout` | session | Create hosted checkout (active MoR provider) for a plan | **yes** |
| POST | `/api/billing/portal` | session | Create customer-portal session URL | **yes** |
| GET | `/api/billing/health` | public | Truthful provider readiness (no secrets leaked) | no |
| POST | `/api/billing/webhooks/:provider` | **signature** | MoR webhook (provider ∈ polar\|creem\|paddle\|dodo) → reconcile | **yes** |
| POST | `/internal/billing/meter` | `INTERNAL_SERVICE_KEY` | Worker/conductor emits a `UsageRecord` | **yes** |

Webhook routes need the **raw request body** (before JSON parse) for HMAC
verification — mounted with a raw body-parser ahead of the global `express.json`.

---

## 6. Interfaces (ports)

**Exposed to other domains** (`ports/entitlement.port.ts`) — the load-bearing seam:
```ts
export interface EntitlementGate {
  resolvePlan(subject: BillingSubject): Promise<PlanTier>;
  checkEntitlement(subject: BillingSubject, feature: Feature): Promise<EntitlementDecision>;
  checkQuota(subject: BillingSubject, kind: UsageKind, cost?: number): Promise<QuotaDecision>;
  isBYOK(subject: BillingSubject): Promise<boolean>;   // BYOK skips token-metered quota
  health(): HealthReport;
}
```
Consumed by: `conductor` (before dispatching a run — quota + feature gate),
`inference` (token metering emit), `engines` (per-engine usage), `edge`
(checkout UI state), `agent-os` (run gating).

**Consumed from other domains:**
- `AppConfig` (bootstrap) — provider keys via `config.ts`.
- `Session` (identity) — subject resolution on session edges.
- `QueryExecutor` (persistence) — the repo impl.
- `GovernanceGate.decide()` (governance) — every write.
- `InteropChain` (interop) — every edge + MCP call.
- `RunEvent` bus (`@recoder/agent-events`) — webhook reconcile emits
  `billing.subscription.changed` / `billing.usage.recorded`.
- `@recoder/agent-mcp` ToolRouter — MCP registration.

**Provider seam** (`ports/billing-provider.port.ts`) — every MoR provider implements:
```ts
export interface BillingProviderPort {
  readonly name: 'polar' | 'creem' | 'paddle' | 'dodo';
  startCheckout(i: CheckoutIntent): Promise<CheckoutResult>;
  createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession>;
  getSubscription(subId: string): Promise<ProviderSubscription | null>;
  listInvoices(customerId: string): Promise<Invoice[]>;
  emitUsage(events: MeterEvent[]): Promise<void>;
  verifyWebhook(rawBody: Buffer, headers: Record<string,string>): ParsedWebhook | null; // null = bad sig
  health(): Promise<ChannelHealth>;   // configured:false → down, truthful reason
}
```

---

## 7. Reuse vs New

**REUSE (do not rebuild):**
- `@recoder/distribution` — `createBillingService`, `createEntitlementResolver`,
  `createPolarBillingAdapter`, `createPlanCatalog`, and the `domain/*`
  (`Plan`, `Feature`, `FEATURE_MATRIX`, `planSatisfies`, `Quota`,
  `quotaHasHeadroom`, `consumeQuota`, `Entitlement`, `Subject`, `UsageKind`).
  This is the **core** — `entitlement.service.ts` + `distribution-billing.adapter.ts`
  wrap it; we do NOT redefine plan/quota/entitlement algebra.
- `backend/src/engines/polar-client.ts` → moved behind `adapters/polar.adapter.ts`
  (no 4th copy; the composer owns it).
- `backend/src/routes/billing-polar.routes.ts` → folded into `routes/billing.routes.ts`
  (behavior-preserving; `/api/billing/polar/*` paths kept as aliases).
- `backend/src/agent-os/mcp/billing-engine.ts` (+ `.test.ts`) → moved to
  `mcp/billing-engine.ts`; already conforms to `@recoder/agent-mcp` `billingMcpServer`.
- `@recoder/agent-events` (`RunEvent`, outbox), `@recoder/governance` (gate),
  `@recoder/interop` (chain), `@recoder/auth` (`Session`), `@recoder/agent-schemas`
  (zod boundary validation), `@recoder/logger`.
- Verification script `scripts/verify-byok-e2e.sh` for the BYOK-vs-platform path.

**NEW (write):**
- `adapters/{creem,paddle,dodo}.adapter.ts` + `adapters/shared.ts` — distribution ships only Polar;
  the other three MoR providers are new degrade-safe `BillingProviderPort`s (fetch-based, per-provider sig verify). **No Stripe.**
- Durable **Postgres metering** (`persistence/billing.repository.ts` +
  migrations) — distribution's quota is provider-fed/in-memory; we need
  auditable per-run/token/engine records + idempotency + reset windows.
- `services/webhook.service.ts` — signature-verified reconcile → Postgres
  projection + `RunEvent` (distribution has ports but no host webhook loop).
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
2. **Persistence:** `migrations/0001`, `0002`, `persistence/billing.repository.ts`
   + `billing.repository.test.ts` (pg-backed, `:param`, idempotency UNIQUE).
3. **Catalog + entitlement:** `plan-catalog.service.ts`,
   `distribution-billing.adapter.ts`, `entitlement.service.ts`
   (+ `entitlement.service.test.ts`) — this yields a working `EntitlementGate`
   other domains can wire before any provider exists.
4. **Quota + metering:** `quota.service.ts`, `metering.service.ts`
   (+ `quota.service.test.ts`). Fail-safe deny path first.
5. **Providers:** `polar.adapter.ts` (move existing), `{creem,paddle,dodo}.adapter.ts` + `shared.ts`
   (+ `mor-adapters.test.ts`), `invoice.service.ts`.
6. **Webhooks:** `webhook.service.ts` (+ `webhook.service.test.ts`),
   `routes/billing-webhooks.routes.ts` (raw body).
7. **Edges + MCP:** `routes/billing.routes.ts`, `mcp/billing-engine.ts` (move),
   register via the wiring checklist (`IN_PROC_SERVERS` + `ENGINE_SERVERS` +
   `registerBillingMcpTools` in `buildInProcEngineRouter`).
8. **Compose + health:** `billing-module.ts`, `index.ts`, `health.ts`
   (+ `health.test.ts`). Wire into `bootstrap/container.ts` + `/health`.
9. **Verify:** `pnpm check-types`, `pnpm test` (domain), `pnpm
   test:contracts:agent-os`, `scripts/verify-byok-e2e.sh`.

No engine daemons/crates/py sidecars — billing is pure TS spine work; the only
external transports are HTTPS to the MoR providers (Polar/Creem/Paddle/Dodo, fetch) behind the provider port.
