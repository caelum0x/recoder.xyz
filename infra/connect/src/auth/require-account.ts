/**
 * Shared "who is this request from" resolver for every authenticated Connect
 * route (billing + devices). Verifies the Better Auth session cookie via
 * `auth.api.getSession` — there is no "trust a client-supplied userId" path
 * anywhere this is used. Get-or-creates the `connect_accounts` row for the
 * session's Better Auth user (one row per user who has ever touched
 * Connect), so callers always get a stable Connect `accountId` to key their
 * own tables on.
 *
 * Extracted out of routes/billing.ts so routes/devices.ts can share the
 * exact same resolution logic instead of a second, possibly-drifting copy.
 */
import { eq } from 'drizzle-orm';
import { connectAccounts } from '../db/schema.js';
import { connectDb } from '../db/client.js';
import type { ConnectEnv } from '../env.js';
import type { ConnectAuth } from './connect-auth.js';

export interface ConnectAccount {
  readonly accountId: string;
  readonly userId: string;
  readonly email: string;
}

/** Resolves the authenticated Connect account for the current request, or
 * `null` when there is no valid session — callers must 401, never guess. */
export async function requireAccount(
  auth: ConnectAuth,
  request: Request,
  env: ConnectEnv,
): Promise<ConnectAccount | null> {
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
