import type { Entitlement, Subject } from '../domain/entitlement';
import type { Quota, UsageKind } from '../domain/quota';
import type { LicenseKeyActivation } from '../domain/license-key';
import type { ChannelHealth } from '../domain/health-state';

/** Intent to start a hosted checkout for a plan. */
export interface CheckoutIntent {
  readonly subjectId: string;
  readonly productId: string;
  readonly successUrl: string;
  readonly customerEmail?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** The result of starting a checkout — a hosted Polar checkout URL. */
export interface CheckoutResult {
  readonly checkoutId: string;
  readonly url: string;
  readonly clientSecret?: string;
}

/** A usage event pushed to the metering feed (Polar event ingestion). */
export interface MeterEvent {
  readonly subjectId: string;
  readonly kind: UsageKind;
  readonly quantity: number;
  /** Idempotency key so a retried emit is not double-counted. */
  readonly idempotencyKey: string;
  readonly timestamp: string;
}

/**
 * The port distribution talks to the fused Polar (Merchant of Record) engine
 * through. The TS billing channel is a typed view; the durable money/grant
 * authority lives behind this port. Every implementation MUST fail safe:
 * resolution failure or a missing provider key surfaces as deny + unhealthy,
 * never a faked allow.
 */
export interface BillingPort {
  startCheckout(intent: CheckoutIntent): Promise<CheckoutResult>;
  /**
   * Resolve effective entitlements for a subject. An empty array means "no
   * grants found" — callers must treat that as deny (fail safe), not allow.
   */
  resolveEntitlements(subject: Subject): Promise<Entitlement[]>;
  getQuota(subject: Subject, kind: UsageKind): Promise<Quota>;
  emitUsage(event: MeterEvent): Promise<void>;
  validateLicenseKey(key: string): Promise<LicenseKeyActivation>;
  /** Truthful provider readiness — unhealthy when the access token is absent. */
  health(): Promise<ChannelHealth>;
}
