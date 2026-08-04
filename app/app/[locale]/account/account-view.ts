/**
 * Pure data assembly for the /account page.
 *
 * Kept free of Next.js/prisma imports so the assembly logic is unit-testable
 * and so the token-safety invariant (session/API rows expose a short prefix,
 * NEVER token material) lives in exactly one place.
 */

import {
  resolveEntitlements,
  type EntitlementSubscriptionLike,
  type EntitlementUserLike,
  type ResolvedEntitlements,
} from '@/lib/entitlements';

/** Enough to recognize a token in the desktop/CLI, never enough to replay it. */
export const TOKEN_PREFIX_LENGTH = 10;

/** Redacted display prefix for a CLI access token. */
export function cliTokenPrefix(accessToken: string): string {
  return `${accessToken.slice(0, TOKEN_PREFIX_LENGTH)}…`;
}

export interface AccountCliSessionInput {
  id: string;
  deviceName: string | null;
  deviceType: string;
  accessToken: string;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  isActive: boolean;
}

export interface AccountDeviceRow {
  id: string;
  deviceName: string;
  deviceType: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string;
  revoked: boolean;
  /**
   * Neutral "most recently active" marker — deliberately NOT "current device".
   * The /account viewer is a Better Auth *web* session (cookie, `sessions`
   * table) while these rows are desktop device-flow *cli_sessions*. The two
   * share no join key: the web session carries no deviceId (see
   * lib/auth-helpers.ts getSession, which exposes only user + expires) and
   * `sessions` has no deviceId column, while `cli_sessions.deviceId` is a
   * random UUID minted during device flow (lib/prisma.ts createCLISession).
   * So there is no truthful signal that says "you are ON this device" — the
   * most-recently-used active session is the closest HONEST proxy. A real
   * current-device marker needs the web session to carry a deviceId that
   * matches `cli_sessions.deviceId` (bd follow-up).
   */
  isMostRecent: boolean;
}

export interface AccountApiKeyInput {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  isActive: boolean;
}

export interface AccountApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
}

export interface AccountQuotaInput {
  sessionsPerDay: number;
  sessionsUsedToday: number;
  tokensPerSession: number;
  periodEnd: Date;
}

export interface AccountUsageSection {
  sessionsUsedToday: number;
  sessionsPerDay: number;
  remaining: number;
  tokensPerSession: number;
  periodEnd: string;
  /**
   * Display-only: used/limit as a clamped 0–100 integer for the quiet progress
   * bar. Derived from real counts; 0 when the limit is non-positive so the bar
   * never divides by zero or renders a misleading fill.
   */
  usedPercent: number;
}

/** Top tier sells "unlimited everything" — there is nothing above it to upgrade to. */
export const TOP_TIER_PLAN = 'enterprise';

/**
 * Id of the most-recently-used *non-revoked* CLI session, or null when none
 * are active. This backs the neutral "most recent" chip (see AccountDeviceRow
 * .isMostRecent for why this is NOT a truthful "current device" signal).
 * Revoked sessions are excluded so a fully-revoked list marks nothing, and a
 * strict `>` comparison makes the earliest row win a lastUsedAt tie
 * deterministically without depending on input order.
 */
export function mostRecentActiveDeviceId(
  sessions: readonly AccountCliSessionInput[]
): string | null {
  let winnerId: string | null = null;
  let winnerTime = -Infinity;
  for (const session of sessions) {
    const revoked = Boolean(session.revokedAt) || !session.isActive;
    if (revoked) continue;
    const time = session.lastUsedAt.getTime();
    if (time > winnerTime) {
      winnerTime = time;
      winnerId = session.id;
    }
  }
  return winnerId;
}

export interface AccountView {
  plan: ResolvedEntitlements;
  /** Display-only: show the upgrade CTA only when a higher tier exists. */
  canUpgrade: boolean;
  usage: AccountUsageSection | null;
  devices: AccountDeviceRow[];
  apiKeys: AccountApiKeyRow[];
}

/**
 * Assemble everything the page renders from raw DB rows. Output is plain
 * JSON-serializable data (ISO date strings) so it can cross the RSC → client
 * boundary and be asserted token-free in tests.
 */
export function buildAccountView(input: {
  user: EntitlementUserLike | null;
  subscription: EntitlementSubscriptionLike | null;
  quota: AccountQuotaInput | null;
  cliSessions: AccountCliSessionInput[];
  apiKeys: AccountApiKeyInput[];
}): AccountView {
  const usage: AccountUsageSection | null = input.quota
    ? {
        sessionsUsedToday: input.quota.sessionsUsedToday,
        sessionsPerDay: input.quota.sessionsPerDay,
        remaining: Math.max(0, input.quota.sessionsPerDay - input.quota.sessionsUsedToday),
        tokensPerSession: input.quota.tokensPerSession,
        periodEnd: input.quota.periodEnd.toISOString(),
        usedPercent:
          input.quota.sessionsPerDay > 0
            ? Math.min(
                100,
                Math.round((input.quota.sessionsUsedToday / input.quota.sessionsPerDay) * 100)
              )
            : 0,
      }
    : null;

  const plan = resolveEntitlements(input.user, input.subscription);

  const mostRecentId = mostRecentActiveDeviceId(input.cliSessions);

  return {
    plan,
    canUpgrade: plan.plan !== TOP_TIER_PLAN,
    usage,
    devices: input.cliSessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName || 'Unnamed device',
      deviceType: session.deviceType,
      tokenPrefix: cliTokenPrefix(session.accessToken),
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      revoked: Boolean(session.revokedAt) || !session.isActive,
      isMostRecent: session.id === mostRecentId,
    })),
    apiKeys: input.apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
      isActive: key.isActive,
    })),
  };
}
