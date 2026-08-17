// Paddle Classic `passthrough` parsing for the webhook handler — extracted as a
// pure module so the checkout↔webhook identity contract is unit-testable.
//
// The checkout (app/api/billing/create-checkout/route.ts) writes
// `passthrough: JSON.stringify({ userId, plan })` (camelCase `userId`). The webhook
// historically read `user_id` (snake_case) → the id was always undefined, so every
// handler bailed with "Invalid passthrough data" and the paid subscription was
// NEVER granted. Read BOTH keys so the current producer works and any legacy /
// in-flight `user_id` passthrough still resolves.

export type JsonObject = Record<string, unknown>;

/** Narrow an unknown to a string, or `''` when it is not one. */
export function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Parse the Paddle `passthrough` field off a webhook payload into the checkout
 * identity `{ userId, plan? }`, or `null` when the passthrough is absent,
 * malformed, or carries no user id. Accepts `userId` (current) or `user_id`
 * (legacy) so a checkout is never silently dropped on a key-name mismatch.
 */
export function parsePassthrough(data: JsonObject): { userId: string; plan?: string } | null {
  const passthrough = getString(data.passthrough);
  if (!passthrough) return null;
  try {
    const parsed = JSON.parse(passthrough);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const userId = getString(record.userId) || getString(record.user_id);
    if (!userId) return null;
    const plan = getString(record.plan) || undefined;
    return { userId, plan };
  } catch {
    return null;
  }
}
