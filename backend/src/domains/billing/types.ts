/**
 * Billing domain types — the shapes not already owned by `@recoder/distribution`.
 *
 * The plan/quota/entitlement ALGEBRA is reused verbatim from
 * `@recoder/distribution` (`Plan`, `Feature`, `UsageKind`, `Quota`,
 * `quotaHasHeadroom`, …) — this domain must NOT redefine it. What lives here is
 * the widened tier (`max`), the Merchant-of-Record provider vocabulary
 * (Polar/Creem/Paddle/Dodo — all MoR, never a raw card processor), the durable
 * Postgres projections (subscription/invoice/usage/counter), and the decision
 * envelopes the `EntitlementGate` returns to the rest of the backend.
 *
 * FROZEN NOTE: `BillingSubject`, `PlanTier`, and the `EntitlementGate` port
 * (ports/entitlement.port.ts) are the load-bearing cross-domain seams. Widening
 * them is a cross-domain migration, not a local edit.
 */
import type {
  Feature as DistributionFeature,
  UsageKind as DistributionUsageKind,
} from '@recoder/distribution';
import type { HealthStatus } from '../../shared/health-types.js';

// --- Reused distribution algebra (re-exported as the domain vocabulary) ---

/**
 * Binary capability features. Reused verbatim from distribution — the domain
 * does NOT invent a parallel feature enum. Token/engine metering is modelled as
 * {@link UsageKind} quota rows, not as new binary features.
 */
export type Feature = DistributionFeature;

/**
 * Metered usage kinds. Extends distribution's set with `token` (per-token
 * inference metering) which the inference domain emits. All other kinds are the
 * distribution vocabulary so a CLI token and a billing counter agree.
 */
export type UsageKind = DistributionUsageKind | 'token';

/** Every meterable kind, for iteration (catalog/health/tests). */
export const USAGE_KINDS: readonly UsageKind[] = [
  'cli_request',
  'agent_run',
  'token',
  'publish',
  'preview',
  'download',
] as const;

/** Token-metered kinds a BYOK subject bypasses (they pay their own provider). */
export const BYOK_BYPASS_KINDS: readonly UsageKind[] = ['token', 'agent_run'] as const;

// --- Plan tiers (widens distribution's 4 tiers with `max`) ---

/**
 * The Recoder plan tiers. `max` is the individual power tier between `team` and
 * `enterprise` (doc §7 — "widens distribution's matrix with the max tier"). The
 * plan-catalog owns the tier→capability + tier→product mapping; distribution's
 * 4-tier algebra is reused for the shared tiers via `toDistributionPlan`.
 */
export type PlanTier = 'free' | 'pro' | 'team' | 'max' | 'enterprise';

/** All tiers, lowest→highest (deny-by-default floor is `free`). */
export const PLAN_TIERS: readonly PlanTier[] = ['free', 'pro', 'team', 'max', 'enterprise'] as const;

// --- Provider vocabulary (Merchant-of-Record ONLY — never a raw card seam) ---

/**
 * The four supported Merchant-of-Record providers. ALL are MoR SaaS/digital-goods
 * billing with hosted checkout + webhook-driven subscription lifecycle. There is
 * deliberately NO raw-card-processor member — the domain never touches a raw
 * card seam; the provider is always the merchant of record.
 */
export type BillingProviderName = 'polar' | 'creem' | 'paddle' | 'dodo';

export const BILLING_PROVIDERS: readonly BillingProviderName[] = [
  'polar',
  'creem',
  'paddle',
  'dodo',
] as const;

// --- Subject ---

/**
 * The subject entitlements/quota resolve for. `subjectId` is a `user_id` OR an
 * `org_id` (never both); `hasOwnApiKey` marks a BYOK subject (skips token-metered
 * quota but still passes feature gates).
 */
export interface BillingSubject {
  readonly subjectId: string;
  readonly kind: 'user' | 'org';
  /** BYOK marker: the subject brings its own AI provider key. */
  readonly hasOwnApiKey?: boolean;
}

// --- Durable Postgres projections (webhook-confirmed, never guessed) ---

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

/** A subscription row — a projection of a webhook-confirmed provider grant. */
export interface BillingSubscription {
  readonly id: string;
  readonly subjectId: string;
  readonly subjectKind: 'user' | 'org';
  readonly plan: PlanTier;
  readonly provider: BillingProviderName;
  readonly providerCustomerId?: string | null;
  readonly providerSubId?: string | null;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd?: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly updatedAt: string;
}

export type InvoiceStatus = 'paid' | 'open' | 'void' | 'uncollectible';

/** An invoice row (provider invoice + local receipt merge). */
export interface Invoice {
  readonly id: string;
  readonly subjectId: string;
  readonly provider: BillingProviderName;
  readonly providerInvoiceId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: InvoiceStatus;
  readonly hostedUrl?: string | null;
  readonly pdfUrl?: string | null;
  readonly issuedAt: string;
}

/** A durable, idempotent usage event (per-run / per-token / per-engine). */
export interface UsageRecord {
  readonly id: string;
  readonly subjectId: string;
  readonly kind: UsageKind;
  readonly quantity: number;
  readonly runId?: string | null;
  readonly engine?: string | null;
  /** Idempotency key — a retried emit with the same key is a no-op. */
  readonly idempotencyKey: string;
  readonly occurredAt: string;
  /** Set when pushed to the provider meter feed; `null` = unflushed. */
  readonly flushedAt?: string | null;
}

/** A materialized quota counter for fast, fail-safe headroom checks. */
export interface UsageCounter {
  readonly subjectId: string;
  readonly kind: UsageKind;
  readonly windowStart: string;
  /** `0` = unlimited (no metering). */
  readonly usageLimit: number;
  readonly used: number;
  readonly resetAt: string;
}

/** A webhook event row (idempotency + audit). */
export interface WebhookEventRow {
  readonly eventId: string;
  readonly provider: BillingProviderName;
  readonly type: string;
  readonly payloadHash: string;
  readonly receivedAt: string;
  readonly processedAt?: string | null;
}

// --- Provider-port value shapes (the MoR seam) ---

/** Intent to start a hosted checkout for a plan tier. */
export interface CheckoutIntent {
  readonly subject: BillingSubject;
  readonly plan: PlanTier;
  /** Resolved provider product id for the plan (from the plan catalog). */
  readonly productId: string;
  readonly successUrl: string;
  readonly cancelUrl?: string;
  readonly customerEmail?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** The result of starting a checkout — a hosted provider checkout URL. */
export interface CheckoutResult {
  readonly checkoutId: string;
  readonly url: string;
  readonly provider: BillingProviderName;
}

/** Options for cancelling a subscription. */
export interface CancelOptions {
  /** When true, cancel at period end instead of immediately. */
  readonly atPeriodEnd?: boolean;
}

/** Provider-native subscription read (normalized to the domain shape). */
export interface ProviderSubscription {
  readonly provider: BillingProviderName;
  readonly providerSubId: string;
  readonly providerCustomerId?: string;
  readonly status: SubscriptionStatus;
  readonly plan?: PlanTier;
  readonly currentPeriodEnd?: string;
  readonly cancelAtPeriodEnd: boolean;
}

/**
 * A parsed, signature-verified webhook. `verifyWebhook` gates the signature;
 * `parseEvent` normalizes the payload into this envelope. A `null` from
 * `parseEvent` means the signature was invalid (drop + audit).
 */
export interface ParsedWebhook {
  readonly provider: BillingProviderName;
  /** Stable provider event id (idempotency key). */
  readonly eventId: string;
  /** Normalized event type, e.g. `subscription.active`, `subscription.canceled`. */
  readonly type: string;
  /** The subject the event pertains to, when resolvable from the payload. */
  readonly subjectId?: string;
  /** The normalized subscription snapshot, when the event carries one. */
  readonly subscription?: ProviderSubscription;
  /** The raw (already-verified) payload for downstream reconcile detail. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** A usage event pushed to a provider meter feed. */
export interface MeterEvent {
  readonly subjectId: string;
  readonly kind: UsageKind;
  readonly quantity: number;
  readonly idempotencyKey: string;
  readonly timestamp: string;
}

/** Truthful per-provider readiness — `configured:false` ⇒ `down` (never faked). */
export interface ProviderHealth {
  readonly name: BillingProviderName;
  readonly configured: boolean;
  readonly status: HealthStatus;
  readonly reason?: string;
}

// --- Entitlement decision envelopes (what the gate returns) ---

/** Why a feature/quota decision came out as it did (truthful, evidence-style). */
export type EntitlementDenyReason =
  | 'billing_unconfigured'
  | 'feature_not_in_plan'
  | 'no_grant'
  | 'quota_exceeded'
  | 'metering_unavailable';

/** A feature-gate decision. */
export interface EntitlementDecision {
  readonly allowed: boolean;
  readonly plan: PlanTier;
  readonly feature: Feature;
  readonly reason?: EntitlementDenyReason;
  readonly message?: string;
}

/**
 * An actionable "upgrade to continue" affordance carried on a `quota_exceeded`
 * decision (#30). Instead of an opaque hard-deny, the gate names the subject's
 * current tier and the lowest tier that lifts the exhausted limit — so the UI can
 * render an upgrade CTA rather than a dead end. Absent when no higher tier lifts
 * the limit (e.g. already at the top tier).
 */
export interface UpgradeHint {
  /** The subject's current effective tier (the one that ran out of headroom). */
  readonly currentTier: PlanTier;
  /** The lowest tier above `currentTier` that raises (or removes) this quota. */
  readonly suggestedTier: PlanTier;
}

/** A quota decision — carries the resolved headroom view. */
export interface QuotaDecision {
  readonly allowed: boolean;
  readonly plan: PlanTier;
  readonly kind: UsageKind;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
  /** True when the token-metered quota was skipped because the subject is BYOK. */
  readonly byokBypass: boolean;
  readonly reason?: EntitlementDenyReason;
  readonly message?: string;
  /**
   * Present only on a `quota_exceeded` deny: the structured upgrade CTA (#30).
   * Lets the caller surface "upgrade to continue" instead of an opaque deny.
   */
  readonly upgrade?: UpgradeHint;
}

/** The full entitlement view surfaced to the UI (plan + features + quotas). */
export interface EntitlementView {
  readonly plan: PlanTier;
  readonly features: readonly Feature[];
  readonly quotas: readonly QuotaDecision[];
}

/**
 * A unified gate request — either a feature check OR a quota check. This is the
 * discriminated union `EntitlementGate.check(principal, req)` dispatches on.
 */
export type EntitlementRequest =
  | { readonly feature: Feature }
  | { readonly quota: UsageKind; readonly cost?: number };

/** The unified allow|deny envelope `EntitlementGate.check` returns. */
export interface GateDecision {
  readonly allowed: boolean;
  readonly plan: PlanTier;
  readonly reason?: EntitlementDenyReason;
  readonly message?: string;
  /**
   * The upgrade CTA hoisted from a `quota_exceeded` quota decision (#30), so a
   * caller branching on the envelope alone can render "upgrade to continue".
   */
  readonly upgrade?: UpgradeHint;
  /** The detailed feature decision when the request was a feature check. */
  readonly feature?: EntitlementDecision;
  /** The detailed quota decision when the request was a quota check. */
  readonly quota?: QuotaDecision;
}
