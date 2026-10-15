/**
 * Webhook idempotency inbox. The Standard-Webhooks `webhook-id` header is the
 * natural dedupe key: a redelivery of an id already in `dodo_webhook_events`
 * is accepted (200, so Dodo stops retrying) but produces NO second
 * entitlement write — recorded here before `applyDodoEvent` runs, and the
 * insert's primary-key conflict is the actual dedupe mechanism (race-safe
 * under concurrent delivery, not just a read-then-write check).
 */
import { eq } from 'drizzle-orm';
import { dodoWebhookEvents } from '../db/schema.js';
import type { ConnectDb } from '../db/client.js';

export type RecordResult = { readonly alreadyProcessed: true } | { readonly alreadyProcessed: false };

/** Inserts the inbox row; returns `alreadyProcessed: true` without throwing
 * when the id already exists (ON CONFLICT DO NOTHING + a follow-up read,
 * since drizzle-orm's node-postgres driver surfaces a thrown unique-violation
 * otherwise — callers must not treat that throw as a real failure). */
export async function recordWebhookEvent(
  db: ConnectDb,
  id: string,
  type: string,
  accountId: string | undefined,
  rawBody: string,
): Promise<RecordResult> {
  const existing = await db
    .select({ id: dodoWebhookEvents.id })
    .from(dodoWebhookEvents)
    .where(eq(dodoWebhookEvents.id, id))
    .limit(1);
  if (existing.length > 0) return { alreadyProcessed: true };

  try {
    await db.insert(dodoWebhookEvents).values({
      id,
      type,
      accountId: accountId ?? null,
      payload: rawBody,
    });
    return { alreadyProcessed: false };
  } catch (error) {
    // A unique-violation here means a concurrent delivery won the race —
    // truthfully "already processed", not an error to surface as a 500.
    if (isUniqueViolation(error)) return { alreadyProcessed: true };
    throw error;
  }
}

export async function markWebhookEventProcessed(db: ConnectDb, id: string): Promise<void> {
  await db.update(dodoWebhookEvents).set({ processedAt: new Date() }).where(eq(dodoWebhookEvents.id, id));
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');
}
