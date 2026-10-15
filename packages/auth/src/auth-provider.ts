/**
 * `AuthProviderPort` — the swappable seam between Better Auth and Clerk.
 *
 * Recoder Connect plan (plans/recoder-connect.md): "An auth-provider
 * interface... with a Better Auth implementation... Clerk itself can stay as
 * a fallback implementation behind the interface, per the plan's own risk
 * note — don't rip it out if that would break things, just add the real
 * alternative behind the abstraction."
 *
 * As of this writing there is NO live `@clerk/*` import anywhere in this
 * repo's desktop/web/mobile clients (`grep -rl "@clerk/" --include="*.ts"
 * --include="*.tsx" .` outside `telos/upstream` and `third_party` returns
 * nothing) — Better Auth (`createRecoderAuth`) is already the sole auth
 * system wired into `app/`. The one hit for the bare string "clerk" is a
 * label in `packages/shared/src/constants.ts` (a comparison-table entry),
 * not an SDK call. So there is nothing to migrate today; this interface is
 * forward-looking plumbing for when a forked client (the not-yet-imported
 * t3code `apps/mobile`/`apps/web`, per docs/RECODER-T3CODE-COMPOSITION.md)
 * does bring a live Clerk dependency with it.
 *
 * Both implementations are degrade-safe (billing-adapter style, see
 * backend/src/domains/billing/adapters/*.adapter.ts): an unconfigured or
 * unreachable provider reports `health().up === false` with a reason and
 * `getIdentity()` returns `null` rather than throwing or faking a session.
 */
import type { RecoderAuthInstance } from './create-recoder-auth.js';

export type AuthProviderName = 'better-auth' | 'clerk';

export interface AuthIdentity {
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly provider: AuthProviderName;
}

export interface AuthProviderHealth {
  readonly up: boolean;
  readonly reason?: string;
}

export interface AuthProviderPort {
  readonly name: AuthProviderName;
  /** Resolve the current identity from an incoming request's headers. `null` = unauthenticated. */
  getIdentity(headers: Headers): Promise<AuthIdentity | null>;
  /** Truthful readiness — never a faked `up`. */
  health(): Promise<AuthProviderHealth>;
}

/**
 * The Better Auth implementation — wraps an already-constructed
 * `RecoderAuthInstance` (from `createRecoderAuth`/`createAuth`). This is the
 * default, live provider.
 */
export function createBetterAuthProvider(auth: RecoderAuthInstance): AuthProviderPort {
  return {
    name: 'better-auth',

    async getIdentity(headers) {
      try {
        const result = await auth.api.getSession({ headers });
        if (!result?.user?.id || !result.user.email) return null;
        return {
          userId: result.user.id,
          email: result.user.email,
          emailVerified: Boolean(result.user.emailVerified),
          provider: 'better-auth',
        };
      } catch {
        // Fail safe: a session-lookup error is "not authenticated", never a
        // faked identity.
        return null;
      }
    },

    async health() {
      return { up: true };
    },
  };
}

export interface ClerkAuthProviderOptions {
  readonly secretKey: string | null | undefined;
}

interface ClerkBackendModule {
  createClerkClient(options: { secretKey: string }): {
    authenticateRequest(request: Request): Promise<{
      isSignedIn: boolean;
      toAuth(): { userId: string | null } | null;
    }>;
    users: {
      getUser(userId: string): Promise<{
        id: string;
        emailAddresses: readonly { emailAddress: string; verification?: { status?: string } | null }[];
        primaryEmailAddressId: string | null;
      }>;
    };
  };
}

/**
 * The Clerk fallback — degrade-safe by construction: `@clerk/backend` is not
 * a dependency of this package (there is no live Clerk usage to justify
 * pulling it in yet), so this dynamically imports it. Absent package or
 * absent `secretKey` ⇒ `health().up === false` and `getIdentity()` always
 * returns `null` — never a faked session. A future client that actually
 * ships `@clerk/backend` gets a real, working provider the moment the
 * package is present; nothing here needs to change.
 */
export function createClerkAuthProvider(options: ClerkAuthProviderOptions): AuthProviderPort {
  let cachedClient: ReturnType<ClerkBackendModule['createClerkClient']> | null = null;
  let loadError: string | null = null;

  async function client(): Promise<ReturnType<ClerkBackendModule['createClerkClient']> | null> {
    if (cachedClient) return cachedClient;
    if (loadError) return null;
    if (!options.secretKey) {
      loadError = 'CLERK_SECRET_KEY not configured';
      return null;
    }
    try {
      // Built from a variable (not a string literal) so TypeScript does not
      // try to resolve `@clerk/backend`'s type declarations at compile time —
      // this package deliberately does not depend on it (see header comment).
      const clerkBackendModuleName = '@clerk/backend';
      const mod = (await import(clerkBackendModuleName)) as unknown as ClerkBackendModule;
      cachedClient = mod.createClerkClient({ secretKey: options.secretKey });
      return cachedClient;
    } catch (error) {
      loadError = error instanceof Error ? error.message : '@clerk/backend is not installed';
      return null;
    }
  }

  return {
    name: 'clerk',

    async getIdentity(headers) {
      const c = await client();
      if (!c) return null;
      try {
        const request = new Request('https://clerk.invalid/', { headers });
        const state = await c.authenticateRequest(request);
        const auth = state.isSignedIn ? state.toAuth() : null;
        if (!auth?.userId) return null;
        const user = await c.users.getUser(auth.userId);
        const primaryEmail = user.emailAddresses.find(
          (addr) => addr.emailAddress && user.primaryEmailAddressId,
        );
        if (!primaryEmail) return null;
        return {
          userId: user.id,
          email: primaryEmail.emailAddress,
          emailVerified: primaryEmail.verification?.status === 'verified',
          provider: 'clerk',
        };
      } catch {
        return null;
      }
    },

    async health() {
      const c = await client();
      return c ? { up: true } : { up: false, reason: loadError ?? 'clerk unavailable' };
    },
  };
}
