/**
 * Better Auth adapter — the backend HOSTS auth in-process.
 *
 * Wraps `@recoder/auth` `createAuth()` (which reads the auth DB directly via its
 * own Prisma layer) and exposes:
 *  - `handler(request)`  — the Web-Fetch handler the `/api/auth/[...all]`
 *    catch-all route pipes express req/res through.
 *  - `verifyToken(raw)`  — the narrow session read `PrincipalService` depends on
 *    (backed by `@recoder/auth` `verifySession`), returning a normalized session.
 *
 * DEGRADE-SAFE: when `BETTER_AUTH_SECRET` / `AUTH_DATABASE_URL` are absent (or
 * `createAuth()` throws for missing env), the adapter reports `down` and every
 * auth route returns `SERVICE_UNAVAILABLE`. It NEVER fakes a 200 and NEVER
 * throws into boot.
 */
import {
  createAuth,
  verifySession,
  extractSessionTokenFromHeader,
  COOKIE_DOMAIN,
  SESSION_COOKIE_NAMES,
  type RecoderAuth,
} from '@recoder/auth';
import type { Logger } from '../../../shared/logger.js';
import type { EngineStatus } from '../../../shared/health-types.js';
import type { IdentityConfig } from '../config.js';

/** A normalized session, mapped into a `kind: 'session'` Principal by the service. */
export interface ResolvedAuthSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly expiresAt: Date;
}

/**
 * The narrow session-read seam `PrincipalService` depends on. Kept separate from
 * the full adapter so the credential resolver can be unit-tested with a fake.
 */
export interface AuthSessionVerifier {
  /** Verify a raw Better Auth session token → normalized session, or `null`. */
  verifyToken(rawToken: string): Promise<ResolvedAuthSession | null>;
  /**
   * Extract the session token from a raw cookie header or a bearer token,
   * applying the Better Auth cookie-name + signature rules. `null` when neither
   * carries a session token.
   */
  extractToken(input: { cookieHeader?: string | null; bearerToken?: string | null }): string | null;
}

/** Email/notify senders the auth engine calls; degrade-safe defaults provided. */
export interface AuthSenders {
  sendMagicLink(params: { email: string; url: string }): Promise<void>;
  sendResetPassword?(params: { user: { email?: string | null }; url: string }): Promise<void>;
  sendVerificationEmail?(params: { user: { email?: string | null }; url: string }): Promise<void>;
}

export interface BetterAuthAdapterDeps {
  readonly config: IdentityConfig;
  readonly logger: Logger;
  /** Optional senders; when omitted, a logging stub is used (never throws). */
  readonly senders?: AuthSenders;
}

/** The public adapter surface. */
export interface BetterAuthAdapter extends AuthSessionVerifier {
  /** True when the Better Auth engine is configured + constructed. */
  isReady(): boolean;
  /** The Web-Fetch handler for `/api/auth/*`; throws only if called while down. */
  handler(request: Request): Promise<Response>;
  /** The cross-subdomain cookie domain in effect. */
  cookieDomain(): string;
  /** Truthful per-engine status for the health aggregate. */
  engineStatus(): EngineStatus;
}

class BetterAuthAdapterImpl implements BetterAuthAdapter {
  private readonly auth: RecoderAuth | null;
  private readonly downReason: string | null;

  constructor(
    private readonly cfg: IdentityConfig,
    private readonly log: Logger,
    senders: AuthSenders,
  ) {
    if (!cfg.betterAuthSecretPresent || !cfg.authDatabaseUrl) {
      this.auth = null;
      this.downReason = !cfg.betterAuthSecretPresent
        ? 'BETTER_AUTH_SECRET not configured'
        : 'AUTH_DATABASE_URL not configured';
      this.log.warn({ reason: this.downReason }, 'better-auth engine down (degrade-safe)');
      return;
    }
    try {
      // `createAuth` reads its own env (secret, base URL, provider keys) and may
      // throw when a required var is missing — treat that as a truthful `down`.
      this.auth = createAuth({
        sendMagicLink: senders.sendMagicLink,
        ...(senders.sendResetPassword ? { sendResetPassword: senders.sendResetPassword } : {}),
        ...(senders.sendVerificationEmail
          ? { sendVerificationEmail: senders.sendVerificationEmail }
          : {}),
      });
      this.downReason = null;
    } catch (err) {
      this.auth = null;
      this.downReason = err instanceof Error ? err.message : String(err);
      this.log.warn({ reason: this.downReason }, 'better-auth createAuth failed (degrade-safe)');
    }
  }

  isReady(): boolean {
    return this.auth !== null;
  }

  async handler(request: Request): Promise<Response> {
    if (!this.auth) {
      throw new Error(`better-auth unavailable: ${this.downReason ?? 'not configured'}`);
    }
    return this.auth.handler(request);
  }

  cookieDomain(): string {
    return this.cfg.cookieDomain ?? COOKIE_DOMAIN;
  }

  extractToken(input: { cookieHeader?: string | null; bearerToken?: string | null }): string | null {
    // A non-`sk_` bearer is already the raw session token.
    const bearer = input.bearerToken ?? null;
    if (bearer && !bearer.startsWith('sk_')) return bearer;
    if (input.cookieHeader) return extractSessionTokenFromHeader(input.cookieHeader);
    return null;
  }

  async verifyToken(rawToken: string): Promise<ResolvedAuthSession | null> {
    if (!rawToken) return null;
    // Auth DB may be unreachable → treat as unauthenticated (null), never throw.
    try {
      const session = await verifySession((name) =>
        (SESSION_COOKIE_NAMES as readonly string[]).includes(name) ? rawToken : null,
      );
      if (!session) return null;
      return {
        sessionId: session.sessionId,
        userId: session.userId,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        expiresAt: session.expiresAt,
      };
    } catch (err) {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'session verify failed (auth DB unreachable?) — treating as unauthenticated',
      );
      return null;
    }
  }

  engineStatus(): EngineStatus {
    if (this.auth) return { name: 'better-auth', status: 'up' };
    return { name: 'better-auth', status: 'down', reason: this.downReason ?? 'not configured' };
  }
}

/**
 * Build a degrade-safe logging stub when no real senders are wired.
 *
 * SECURITY: the `url` handed to each sender embeds a single-use bearer token
 * (magic-link / reset / verification). It is NEVER logged — observability
 * redaction only matches key names like `token`/`secret`/`authorization`, not a
 * `url` that carries the token in its query string, so logging it would leak an
 * account-takeover credential. We log only the recipient email + a
 * delivery-not-wired marker.
 */
export function stubSenders(log: Logger): AuthSenders {
  return {
    async sendMagicLink({ email }) {
      log.warn(
        { email, delivery: 'not-wired' },
        'magic-link email delivery not wired (observability/notify edge pending); token-bearing URL withheld from logs',
      );
    },
    async sendResetPassword({ user }) {
      log.warn(
        { email: user.email, delivery: 'not-wired' },
        'reset-password email delivery not wired; token-bearing URL withheld from logs',
      );
    },
    async sendVerificationEmail({ user }) {
      log.warn(
        { email: user.email, delivery: 'not-wired' },
        'verification email delivery not wired; token-bearing URL withheld from logs',
      );
    },
  };
}

/** Construct the Better Auth adapter (degrade-safe; never throws). */
export function createBetterAuthAdapter(deps: BetterAuthAdapterDeps): BetterAuthAdapter {
  const senders = deps.senders ?? stubSenders(deps.logger);
  return new BetterAuthAdapterImpl(deps.config, deps.logger, senders);
}
