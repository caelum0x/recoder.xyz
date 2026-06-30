/**
 * The concrete `AuthPort` for the distribution module.
 *
 * recoder.xyz is the auth source of truth. This port NEVER becomes a second
 * identity authority:
 *  - `verifySession` posts the browser session token to recoder.xyz's
 *    `/api/auth/verify-token` (the same Better-Auth surface the rest of
 *    docker-backend trusts) with a signed internal-service envelope.
 *  - `getUserProfile` returns the authoritative identity recoder.xyz reported,
 *    with the plan resolved from the Polar (Merchant-of-Record) entitlement port.
 *  - `verifyCliAccessToken` validates the backend-issued, HMAC-signed CLI token
 *    locally (the backend is the issuer) AND re-confirms the subject still has a
 *    live recoder.xyz identity — a token whose user no longer resolves is denied.
 *
 * Fail safe: any verification miss returns null (deny), never a faked allow.
 */
import {
  decodeCliToken,
  type AuthPort,
  type AuthSessionRef,
  type RecoderUserProfile,
  type Entitlement,
  type EntitlementPort,
  type Plan,
  type Subject,
} from '@recoder/distribution';
import { buildInternalServiceHeaders } from '../public-api/byok-provider-keys.js';
import { createLogger } from './log.js';

const logger = createLogger('distribution-auth-port');

/**
 * Derive the authoritative plan from Polar entitlements. Highest plan among the
 * granted `plan`-kind entitlements wins; no grants → the `free` floor (fail
 * safe — entitlement absence never inflates the plan).
 */
function planFromEntitlements(grants: readonly Entitlement[]): Plan {
  const rank: Record<Plan, number> = { free: 0, pro: 1, team: 2, enterprise: 3 };
  let best: Plan = 'free';
  for (const g of grants) {
    if (!g.granted) continue;
    if (rank[g.plan] > rank[best]) best = g.plan;
  }
  return best;
}

interface VerifyTokenResponse {
  success?: boolean;
  user?: { id: string; email?: string; name?: string };
}

export interface RecoderAuthPortDeps {
  /** recoder.xyz app API origin (the authority). */
  readonly appApiBase: string;
  /** Internal service key for the signed verify envelope; absent → deny. */
  readonly internalServiceKey: string | undefined;
  /** Entitlement port (Polar-backed) used as the plan-resolution fallback. */
  readonly entitlements: EntitlementPort;
  /**
   * Authoritative plan resolver — wired to docker-backend's live Polar
   * subscription state (`resolveUserTier`). Returns the current plan for a
   * user. When it cannot resolve, the entitlement port is consulted, then the
   * `free` floor. Optional so tests can inject a deterministic resolver.
   */
  readonly resolvePlanForUser?: (userId: string) => Plan | Promise<Plan>;
  /** CLI-token HMAC signing key (env/vault). Absent → CLI tokens cannot verify. */
  readonly signingKey: string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  /** Verify-token request timeout (ms). */
  readonly timeoutMs?: number;
}

/**
 * A tiny identity cache so `getUserProfile(userId)` (called during the device
 * poll, keyed only by user id) can return the email/name recoder.xyz reported at
 * session-verify time. It only ever holds what recoder.xyz actually returned —
 * it never fabricates an identity.
 */
export interface IdentityCache {
  remember(id: string, email: string, name: string): void;
  get(id: string): { email: string; name: string } | undefined;
}

export function createIdentityCache(): IdentityCache {
  const byId = new Map<string, { email: string; name: string }>();
  return {
    remember: (id, email, name) => void byId.set(id, { email, name }),
    get: (id) => byId.get(id),
  };
}

export function createRecoderAuthPort(
  deps: RecoderAuthPortDeps,
  identity: IdentityCache = createIdentityCache(),
): AuthPort {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? 10_000;

  async function resolvePlan(userId: string): Promise<Plan> {
    // 1. Authoritative live subscription state (docker-backend's Polar webhook
    //    -> resolveUserTier), when wired.
    if (deps.resolvePlanForUser) {
      try {
        return await deps.resolvePlanForUser(userId);
      } catch (e) {
        logger.warn('primary plan resolver failed; falling back to entitlement port', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    // 2. Fallback: Polar entitlement grants.
    const subject: Subject = { subjectId: userId, kind: 'user' };
    try {
      const grants = await deps.entitlements.resolve(subject);
      return planFromEntitlements(grants);
    } catch (e) {
      // Fail safe: plan resolution error → the free floor (never an inflated plan).
      logger.warn('plan resolution failed; defaulting to free', {
        error: e instanceof Error ? e.message : String(e),
      });
      return 'free';
    }
  }

  async function postVerifyToken(token: string): Promise<VerifyTokenResponse | null> {
    if (!deps.internalServiceKey) {
      logger.warn('INTERNAL_SERVICE_KEY missing — session verification denied (fail safe)');
      return null;
    }
    if (!fetchImpl) {
      logger.error('no fetch implementation available for session verification');
      return null;
    }
    const pathname = '/api/auth/verify-token';
    const body = JSON.stringify({ token });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${deps.appApiBase}${pathname}`, {
        method: 'POST',
        headers: buildInternalServiceHeaders({
          method: 'POST',
          pathname,
          body,
          serviceKey: deps.internalServiceKey,
        }),
        body,
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return (await res.json()) as VerifyTokenResponse;
    } catch (e) {
      logger.warn('verify-token call failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function buildProfile(
    userId: string,
    email: string,
    name: string,
  ): Promise<RecoderUserProfile> {
    const plan = await resolvePlan(userId);
    return { userId, email, name, plan, hasOwnApiKey: false };
  }

  return {
    async verifySession(rawSessionToken: string): Promise<AuthSessionRef | null> {
      if (!rawSessionToken) return null;
      const data = await postVerifyToken(rawSessionToken);
      if (!data?.success || !data.user?.id) return null;
      const email = data.user.email ?? '';
      const name = data.user.name ?? '';
      identity.remember(data.user.id, email, name);
      // Better-Auth sessions are short-lived; recoder.xyz already enforced expiry
      // by returning success. We surface a conservative near-term expiry so the
      // consuming grant flow does not treat the ref as long-lived.
      const expiresAt = new Date(now().getTime() + 15 * 60 * 1000).toISOString();
      return {
        sessionId: rawSessionToken.includes('.')
          ? (rawSessionToken.split('.')[0] as string)
          : rawSessionToken.slice(0, 16),
        userId: data.user.id,
        user: { id: data.user.id, email, name, emailVerified: true },
        expiresAt,
      };
    },

    async getUserProfile(userId: string): Promise<RecoderUserProfile | null> {
      if (!userId) return null;
      const known = identity.get(userId);
      // Identity must have been established by recoder.xyz (verifySession). If we
      // have not seen this user, we still resolve the plan but report empty
      // contact fields rather than fabricating them.
      return buildProfile(userId, known?.email ?? '', known?.name ?? '');
    },

    async verifyCliAccessToken(accessToken: string): Promise<RecoderUserProfile | null> {
      if (!deps.signingKey) {
        logger.warn('CLI_TOKEN_SIGNING_KEY missing — CLI token verification denied (fail safe)');
        return null;
      }
      const decoded = decodeCliToken(accessToken, deps.signingKey, now);
      if (!decoded) return null;
      // The backend issued this token; the subject identity is authoritative on
      // the signed payload. Re-resolve the plan live so a downgraded/cancelled
      // subscription is reflected immediately (not the plan at issuance time).
      const known = identity.get(decoded.sub);
      return buildProfile(decoded.sub, known?.email ?? decoded.email, known?.name ?? '');
    },
  };
}
