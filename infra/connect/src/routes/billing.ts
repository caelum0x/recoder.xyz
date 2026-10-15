/**
 * Billing routes: checkout, Dodo webhook, entitlements — the real,
 * database-backed paths (not stubs). Every route that needs identity calls
 * `requireAccount`, which verifies the Better Auth session cookie and fails
 * with 401 on anything else — there is no "trust a client-supplied userId"
 * path anywhere in this file.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { ConnectEnv } from '../env.js';
import { dodoCredential, dodoProducts } from '../env.js';
import { connectDb } from '../db/client.js';
import { connectAccounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createDodoCheckout, DodoNotConfiguredError, parseDodoEvent, verifyDodoWebhook } from '../billing/dodo.js';
import { applyDodoEvent, entitlementToken, getEntitlement } from '../billing/entitlements.js';
import { recordWebhookEvent, markWebhookEventProcessed } from '../billing/webhook-events.js';
import type { ConnectAuth } from '../auth/connect-auth.js';

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

const checkoutBodySchema = z.object({
  plan: z.enum(['pro', 'team']),
  interval: z.enum(['monthly', 'annual']),
  successUrl: z.string().url(),
});

export interface BillingRouteDeps {
  readonly auth: ConnectAuth;
}

/** Resolves the authenticated Connect account for the current request, or
 * `null` when there is no valid session — callers must 401, never guess. */
async function requireAccount(
  auth: ConnectAuth,
  request: Request,
  env: ConnectEnv,
): Promise<{ accountId: string; userId: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id || !session.user.email) return null;
  const db = connectDb(env);
  const [existing] = await db
    .select()
    .from(connectAccounts)
    .where(eq(connectAccounts.userId, session.user.id))
    .limit(1);
  if (existing) return { accountId: existing.id, userId: session.user.id, email: session.user.email };

  const id = crypto.randomUUID();
  await db.insert(connectAccounts).values({ id, userId: session.user.id, email: session.user.email });
  return { accountId: id, userId: session.user.id, email: session.user.email };
}

export function billingRoutes(deps: BillingRouteDeps) {
  const app = new Hono<{ Bindings: ConnectEnv }>();

  app.post('/checkout', async (c) => {
    const account = await requireAccount(deps.auth, c.req.raw, c.env);
    if (!account) return c.json({ error: 'auth_required' }, 401);

    const parsed = checkoutBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', details: parsed.error.issues[0]?.message }, 400);
    }

    try {
      const result = await createDodoCheckout(dodoCredential(c.env), dodoProducts(c.env), {
        plan: parsed.data.plan,
        interval: parsed.data.interval,
        customerEmail: account.email,
        accountId: account.accountId,
        successUrl: parsed.data.successUrl,
      });
      return c.json({ checkoutUrl: result.checkoutUrl }, 201);
    } catch (error) {
      if (error instanceof DodoNotConfiguredError) {
        return c.json({ error: 'billing_not_configured', detail: error.message }, 503);
      }
      return c.json({ error: 'checkout_failed', detail: error instanceof Error ? error.message : String(error) }, 502);
    }
  });

  app.get('/entitlements/me', async (c) => {
    const account = await requireAccount(deps.auth, c.req.raw, c.env);
    if (!account) return c.json({ error: 'auth_required' }, 401);
    const entitlement = await getEntitlement(connectDb(c.env), account.accountId);
    return c.json(entitlementToken(entitlement));
  });

  app.post('/webhooks/dodo', async (c) => {
    const id = c.req.header('webhook-id') ?? '';
    const timestamp = c.req.header('webhook-timestamp') ?? '';
    const signature = c.req.header('webhook-signature') ?? '';
    const contentLength = Number(c.req.header('content-length') ?? '0');
    if (contentLength > MAX_WEBHOOK_BODY_BYTES) return c.json({ error: 'payload_too_large' }, 413);
    if (!id || !timestamp || !signature) return c.json({ error: 'missing_signature_headers' }, 400);

    const rawBody = await c.req.text();
    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) return c.json({ error: 'payload_too_large' }, 413);

    const credential = dodoCredential(c.env);
    if (!credential.webhookSecretPresent || !credential.webhookSecret) {
      return c.json({ error: 'webhook_not_configured' }, 503);
    }
    const verified = await verifyDodoWebhook(rawBody, { id, timestamp, signature }, credential.webhookSecret);
    if (!verified) return c.json({ error: 'invalid_signature' }, 401);

    const event = parseDodoEvent(id, rawBody);
    const db = connectDb(c.env);
    const record = await recordWebhookEvent(db, event.eventId, event.type, event.accountId, rawBody);
    if (record.alreadyProcessed) return c.json({ received: true, deduped: true });

    if (event.accountId && event.subscription) {
      await applyDodoEvent(db, dodoProducts(c.env), event.accountId, event.type, event.subscription);
    }
    await markWebhookEventProcessed(db, event.eventId);
    return c.json({ received: true });
  });

  return app;
}
