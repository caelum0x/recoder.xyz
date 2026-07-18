/**
 * `AuthPlanReader` — the plan-read seam over the recoder.xyz website auth/product
 * database. This is the MISSING half of the billing entitlement `max(...)`: the
 * backend already fuses the Polar webhook projection + distribution grants, but a
 * plan a user purchased through the website (stored in the website's Prisma DB,
 * `users.subscriptionPlan`) never elevated the backend control-plane entitlement
 * because no plan read existed here.
 *
 * Bootstrap wires {@link AuthPlanReader.readPlan} as the billing
 * `resolveAuthPlan(subject)` seam, so backend entitlement becomes
 * `max(authPlan, webhookPlan, distributionGrant)` — the website purchase now
 * grants the elevated tier immediately, without waiting for a Polar webhook.
 *
 * Reconciliation rule (AGENTS.md): this reads the SEPARATE website DB through the
 * `@recoder/auth` Prisma client (which connects to `AUTH_DATABASE_URL` — the
 * `recoder_main` database that also carries the product `users` rows); it does
 * NOT touch the control-plane executor and never hand-couples the two.
 *
 * DEGRADE-SAFE (fail-safe law §37): every read is wrapped so an unreachable auth
 * DB, an ungenerated Prisma client, a subject with no row, or a non-active
 * subscription all resolve to `null` — the entitlement gate then falls back to
 * the webhook/distribution plan (never a fabricated elevation, never a thrown
 * 500). Only an ACTIVE/TRIALING subscription with a non-empty plan returns a plan.
 */
import type { Logger } from '../../../shared/logger.js';

/** Website subscription-status values that make a stored plan effective. */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** The raw plan row read from the website `users` table (all fields optional). */
export interface AuthPlanRow {
  /** The website plan string (`free`/`pro`/`team`/…); normalized downstream. */
  readonly plan: string | null;
  /** The subscription status; a plan is only effective when active/trialing. */
  readonly status: string | null;
}

/** A degrade-safe query over the website `users` row for a subject id. */
export type AuthPlanQuery = (userId: string) => Promise<AuthPlanRow | null>;

/**
 * Reads a subject's effective website plan. `readPlan` returns the raw plan
 * string (the billing catalog normalizes it) or `null` when the subject has no
 * active website subscription / the source is unreachable.
 */
export interface AuthPlanReader {
  readPlan(userId: string): Promise<string | null>;
}

/**
 * Build an {@link AuthPlanReader} over an injected, degrade-safe {@link AuthPlanQuery}.
 * The status gate + null-collapse live here so both the real Prisma-backed reader
 * and unit tests share ONE truthful decision path.
 */
export function createAuthPlanReader(query: AuthPlanQuery, logger: Logger): AuthPlanReader {
  return {
    async readPlan(userId: string): Promise<string | null> {
      const id = (userId ?? '').trim();
      if (!id) return null;
      let row: AuthPlanRow | null;
      try {
        row = await query(id);
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), userId: id },
          'auth-plan read failed (website DB unreachable) — treated as no elevation',
        );
        return null;
      }
      if (!row) return null;
      const plan = (row.plan ?? '').trim();
      if (!plan) return null;
      // A stored plan only elevates while the subscription is active/trialing.
      const status = (row.status ?? '').trim().toLowerCase();
      if (status && !ACTIVE_STATUSES.has(status)) return null;
      return plan;
    },
  };
}

/**
 * The default {@link AuthPlanReader} backed by `@recoder/auth`'s Better Auth
 * Prisma client. The import is LAZY (dynamic) so merely importing this module
 * never eagerly constructs the Prisma client — tests inject a fake query and stay
 * DB-less, and a missing generated client degrades to `null` reads (no boot crash).
 *
 * The `users` table is not modeled by the auth Prisma schema (it carries only the
 * Better Auth `user`/`session`/`account` models), so we read it with a positional
 * parameterized `$queryRawUnsafe` (injection-safe — `$1` is bound, never
 * interpolated) against the SAME connected database.
 */
export function createBetterAuthPlanReader(logger: Logger): AuthPlanReader {
  const query: AuthPlanQuery = async (userId: string): Promise<AuthPlanRow | null> => {
    const { authDatabase } = (await import('@recoder/auth')) as unknown as {
      authDatabase: {
        $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
      };
    };
    const rows = await authDatabase.$queryRawUnsafe<
      Array<{ subscriptionPlan: string | null; subscriptionStatus: string | null }>
    >(
      'SELECT "subscriptionPlan", "subscriptionStatus" FROM "users" WHERE "id" = $1 LIMIT 1',
      userId,
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return null;
    return { plan: row.subscriptionPlan ?? null, status: row.subscriptionStatus ?? null };
  };
  return createAuthPlanReader(query, logger);
}
