import { z } from 'zod';

/**
 * The Polar webhook event types distribution acts on. Polar emits many more;
 * we explicitly enumerate the ones that change entitlement state so an unknown
 * type is IGNORED (acknowledged, no entitlement change) rather than guessed at.
 */
export type PolarWebhookType =
  | 'order.paid'
  | 'order.refunded'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.active'
  | 'subscription.canceled'
  | 'subscription.revoked'
  | 'benefit_grant.created'
  | 'benefit_grant.revoked';

export const POLAR_WEBHOOK_TYPES: readonly PolarWebhookType[] = [
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.revoked',
  'benefit_grant.created',
  'benefit_grant.revoked',
];

/**
 * The minimal envelope we parse from a Polar webhook body. We do NOT exhaustively
 * model every Polar object — we extract the fields that drive an entitlement
 * decision (type, the customer/subject reference, and the plan/product), and
 * keep the raw `data` for the host. Untyped `type` values pass through as a
 * string and are treated as "ignore".
 */
const PolarCustomerRef = z.object({
  id: z.string().optional(),
  external_id: z.string().nullable().optional(),
  email: z.string().optional(),
});

export const PolarWebhookEnvelopeSchema = z.object({
  type: z.string(),
  data: z
    .object({
      id: z.string().optional(),
      // subscription/order carry a customer; benefit_grant carries customer_id
      customer: PolarCustomerRef.optional(),
      customer_id: z.string().optional(),
      external_customer_id: z.string().nullable().optional(),
      status: z.string().optional(),
      product_id: z.string().optional(),
      product: z.object({ id: z.string().optional() }).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .passthrough(),
});

export type PolarWebhookEnvelope = z.infer<typeof PolarWebhookEnvelopeSchema>;

/** True when this is a type we map to an entitlement change. */
export function isActionableType(type: string): type is PolarWebhookType {
  return (POLAR_WEBHOOK_TYPES as readonly string[]).includes(type);
}

/**
 * Resolve the recoder subject id a webhook refers to.
 *
 * The authoritative anchor is the Polar customer `external_id`, surfaced on the
 * event as `external_customer_id` / `customer.external_id`. The polar adapter
 * sets this to the recoder subject id at checkout (`external_customer_id` on
 * `POST /v1/checkouts/`), so a real order/subscription/benefit_grant webhook
 * carries it directly — this is the primary path.
 *
 * As a redundant, audit-friendly fallback we also accept `metadata.recoder_subject`
 * (the same value we stamp into checkout metadata). We DELIBERATELY do not fall
 * back to the bare Polar customer id (`customer_id` / `customer.id`): that is a
 * Polar-internal id, not a recoder subject, and applying an entitlement change
 * to it would target an unknown subject. Returns null when no recoder subject
 * can be determined (the handler then ignores the event — fail safe).
 */
export function resolveSubjectId(env: PolarWebhookEnvelope): string | null {
  const d = env.data;
  const metaSubject = d.metadata?.["recoder_subject"];
  return (
    d.external_customer_id ??
    d.customer?.external_id ??
    (typeof metaSubject === 'string' && metaSubject ? metaSubject : null)
  );
}
