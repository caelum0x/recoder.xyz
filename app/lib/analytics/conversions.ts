/**
 * Conversion event emitters (degrade-truthful).
 *
 * Thin, typed wrappers over the existing `tracker.ts` so payment/checkout call
 * sites stay clean AND cannot record fabricated conversions. Every field must
 * come from a real, verified source (a signed webhook payload, a real plan the
 * user clicked). Undefined/empty fields are dropped rather than persisted as
 * placeholders, and a subscription conversion is never emitted without a real
 * subscriber `userId`.
 *
 * These reuse the already-defined taxonomy in `events.ts` — no new vendor, no
 * new event names. The underlying emitters no-op when their transport is
 * absent (`trackEvent` when `window.gtag` is unavailable, `trackServerEvent`
 * when there is no `ANALYTICS_INGEST_URL` sink — it still emits a structured
 * log line but never invents a delivery).
 */

import { AnalyticsEvents } from './events';
import type { BillingEventProperties } from './events';
import { trackServerEvent, trackEvent } from './tracker';

/**
 * Build a billing-property object that contains ONLY the fields that are
 * genuinely present. Never inject a default/placeholder value — an absent
 * amount or currency must stay absent so the recorded event is truthful.
 */
function cleanBillingProps(props: BillingEventProperties): BillingEventProperties {
  const clean: BillingEventProperties = {};
  if (props.userId) clean.userId = props.userId;
  if (props.planId) clean.planId = props.planId;
  if (typeof props.priceAmount === 'number' && Number.isFinite(props.priceAmount)) {
    clean.priceAmount = props.priceAmount;
  }
  if (props.currency) clean.currency = props.currency;
  if (props.provider) clean.provider = props.provider;
  if (props.plan) clean.plan = props.plan;
  if (props.source) clean.source = props.source;
  return clean;
}

/**
 * Emit `SUBSCRIPTION_CREATED` from a payment webhook.
 *
 * MUST be called only AFTER the webhook signature has been verified and the
 * subscription persisted, with fields parsed from the verified payload. If no
 * real subscriber `userId` is resolvable the call is a no-op — we never record
 * an anonymous or placeholder conversion.
 *
 * @returns `true` when a real event was emitted, `false` when it was skipped as
 *          untruthful (no `userId`). Callers may ignore the return value.
 */
export function emitSubscriptionCreated(props: BillingEventProperties): boolean {
  const clean = cleanBillingProps(props);
  if (!clean.userId) return false;
  trackServerEvent(AnalyticsEvents.SUBSCRIPTION_CREATED, clean);
  return true;
}

/**
 * Emit `CHECKOUT_STARTED` from a client-side checkout CTA.
 *
 * No-ops (via `trackEvent`) when GA4 `gtag` is not loaded — never fabricates a
 * checkout intent. Fields should reflect the real plan the user selected.
 */
export function emitCheckoutStarted(props: BillingEventProperties): void {
  trackEvent(AnalyticsEvents.CHECKOUT_STARTED, cleanBillingProps(props));
}
