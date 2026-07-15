/**
 * `BillingProviderPort` — the ONE Merchant-of-Record seam.
 *
 * FROZEN CONTRACT — Phase 9. All four MoR providers (Polar, Creem, Paddle, Dodo
 * Payments) implement exactly this port; the composer selects one via
 * `BILLING_PROVIDER`. There is deliberately NO raw-card-processor member —
 * every provider is a merchant of record with hosted checkout + webhook-driven
 * subscription lifecycle, so the domain never touches a raw card seam.
 *
 * The frozen MoR verb set (do not widen/narrow without a cross-domain migration):
 *
 *   createCheckout  — start a hosted checkout for a plan → a redirect URL.
 *   getSubscription — read a provider subscription by id (null when unknown).
 *   cancel          — cancel a subscription (now or at period end).
 *   verifyWebhook   — HMAC/signature-verify a raw webhook body (bool, no parse).
 *   parseEvent      — verify + normalize a webhook into a {@link ParsedWebhook}
 *                     (null ⇒ bad signature; drop + audit).
 *
 * Every method MUST fail safe: a missing API key or an unreachable provider
 * surfaces as a truthful error / `null` / `down` health — never a faked success.
 */
import type {
  BillingProviderName,
  CancelOptions,
  CheckoutIntent,
  CheckoutResult,
  MeterEvent,
  ParsedWebhook,
  ProviderHealth,
  ProviderSubscription,
} from '../types.js';

export interface BillingProviderPort {
  /** Which MoR provider this adapter fronts. */
  readonly name: BillingProviderName;

  /**
   * Start a hosted checkout for a plan. Fails safe: with no API key it throws a
   * `SERVICE_UNAVAILABLE` AppError (the caller maps to a truthful edge error),
   * never a fabricated URL.
   */
  createCheckout(intent: CheckoutIntent): Promise<CheckoutResult>;

  /**
   * Read a provider subscription by its provider-native id. Returns `null` when
   * the subscription is unknown OR the provider is unconfigured/unreachable
   * (fail safe: the caller treats `null` as "no active grant", never as allow).
   */
  getSubscription(providerSubId: string): Promise<ProviderSubscription | null>;

  /**
   * Cancel a subscription (immediately, or at period end when
   * `opts.atPeriodEnd`). Returns the updated snapshot, or `null` when the
   * provider is unconfigured/unreachable (the reconcile stays truthful).
   */
  cancel(providerSubId: string, opts?: CancelOptions): Promise<ProviderSubscription | null>;

  /**
   * Signature-verify a raw webhook body against the configured webhook secret.
   * Pure boolean — no side effects, no parsing. Returns `false` when the secret
   * is absent (fail closed) or the signature does not match.
   */
  verifyWebhook(rawBody: Buffer, headers: Readonly<Record<string, string>>): boolean;

  /**
   * Verify + normalize a webhook into a {@link ParsedWebhook}. Returns `null`
   * when the signature is invalid (the route drops the event and audit-logs).
   * A valid-but-unrecognized event yields a `ParsedWebhook` with a passthrough
   * `type` so the reconcile loop can no-op it idempotently.
   */
  parseEvent(rawBody: Buffer, headers: Readonly<Record<string, string>>): ParsedWebhook | null;

  /**
   * Push a batch of usage events to the provider meter feed. Optional capability:
   * providers without a meter API implement this as a no-op. Fails safe — a
   * push error leaves the caller's events unflushed for the next tick.
   */
  emitUsage(events: readonly MeterEvent[]): Promise<void>;

  /** Truthful readiness — `configured:false` ⇒ `down`, with a reason. */
  health(): Promise<ProviderHealth>;
}
