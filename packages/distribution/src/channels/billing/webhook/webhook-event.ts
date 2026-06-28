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
 * Resolve the recoder subject id a webhook refers to. We prefer the
 * `external_customer_id` / customer.external_id (which we set to the recoder
 * subject id at checkout) and fall back to the Polar customer id. Returns null
 * when no subject can be determined (the handler then denies the mapping).
 */
export function resolveSubjectId(env: PolarWebhookEnvelope): string | null {
  const d = env.data;
  return (
    d.external_customer_id ??
    d.customer?.external_id ??
    d.customer_id ??
    d.customer?.id ??
    null
  );
}
