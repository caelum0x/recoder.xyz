/**
 * The ONE Better Auth factory for every Recoder auth surface.
 *
 * Both hand-synced configs (`app/lib/auth-config.ts` on the main Prisma client
 * and `createAuth()` here on `authDatabase`) build their options through
 * `buildRecoderAuthOptions()` so the shared pieces — the advanced cookie block
 * and account-linking policy — literally cannot drift.
 *
 * Each caller still owns what genuinely differs per surface: its database
 * adapter, base URL, env-key names + credential validation for social
 * providers, email senders, and trusted origins.
 */

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { COOKIE_DOMAIN } from "./edge";
import { createOAuthAccountLinkGuard } from "./oauth-link-guard";

type EmailAndPasswordOptions = NonNullable<BetterAuthOptions["emailAndPassword"]>;

/**
 * Shared cookie configuration. MUST be identical on every surface so all
 * subdomains read the same `recoder.session_token` cookie with the same
 * domain, prefix, and SameSite settings.
 */
export const RECODER_COOKIE_ADVANCED = {
  cookiePrefix: "recoder",
  crossSubDomainCookies: {
    enabled: true,
    domain: process.env.NODE_ENV === "production" ? COOKIE_DOMAIN : undefined,
  },
  useSecureCookies: process.env.NODE_ENV === "production",
  defaultCookieAttributes: {
    sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as
      | "none"
      | "lax",
  },
  generateId: () => crypto.randomUUID(),
};

/**
 * Shared account-linking policy: trust the verified-email OAuth providers to
 * link into an existing account with the same email. Without this, signing in
 * with Google/GitHub when an account already exists for that email fails with
 * `account_not_linked`.
 *
 * SECURITY: `trustedProviders` makes Better Auth's guard skip the incoming
 * `userInfo.emailVerified` check, and it never inspects the *existing* user's
 * verification state — so an OAuth sign-in would auto-link into a squatted,
 * UNVERIFIED local account (account takeover). The `databaseHooks` guard wired
 * in `buildRecoderAuthOptions` (see ./oauth-link-guard) closes that hole by
 * denying links into a pre-existing unverified user, so this policy stays as-is
 * and verified-user linking UX is preserved.
 */
export const RECODER_ACCOUNT_LINKING = {
  enabled: true,
  trustedProviders: ["github", "google"],
};

export interface CreateRecoderAuthOptions {
  /** Database adapter — each surface owns its Prisma client + adapter flavor. */
  adapter: BetterAuthOptions["database"];
  /** Explicit table names (surfaces on the shared auth DB pass these). */
  modelNames?: {
    user?: string;
    account?: string;
    session?: string;
    verification?: string;
  };
  /** Omit to let better-auth read BETTER_AUTH_SECRET from the environment. */
  secret?: string;
  baseURL: string;
  emailAndPassword: {
    /** Callers resolve their env gate (AUTH_EMAIL_PASSWORD) to a boolean. */
    enabled: boolean;
    requireEmailVerification?: boolean;
    password?: EmailAndPasswordOptions["password"];
  };
  senders: {
    sendResetPassword?: EmailAndPasswordOptions["sendResetPassword"];
    sendVerificationEmail?: (params: {
      user: { email: string };
      url: string;
    }) => Promise<void>;
    /** When provided, the magic-link plugin is enabled. */
    sendMagicLink?: (params: { email: string; url: string }) => Promise<void>;
  };
  /** Prebuilt provider map — each caller keeps its own env-key names + validation. */
  socialProviders: BetterAuthOptions["socialProviders"];
  session?: BetterAuthOptions["session"];
  trustedOrigins: string[];
  pages?: { signIn: string; error: string };
}

/**
 * The resolved options shape handed to `betterAuth()`.
 *
 * `emailAndPassword.sendVerificationEmail` and `pages` are carried over from
 * the two pre-factory configs verbatim (better-auth itself ignores both keys;
 * kept so this refactor is byte-for-byte behavior-preserving).
 */
export type RecoderBuiltAuthOptions = Omit<
  BetterAuthOptions,
  "emailAndPassword"
> & {
  emailAndPassword: EmailAndPasswordOptions & {
    sendVerificationEmail?: CreateRecoderAuthOptions["senders"]["sendVerificationEmail"];
  };
  advanced: typeof RECODER_COOKIE_ADVANCED;
  pages?: { signIn: string; error: string };
};

/**
 * Build the exact options object handed to `betterAuth()`.
 *
 * Exported separately from `createRecoderAuth` so parity tests can diff the
 * resolved options of every surface without booting Better Auth.
 */
export function buildRecoderAuthOptions(
  opts: CreateRecoderAuthOptions
): RecoderBuiltAuthOptions {
  const { modelNames } = opts;
  const socialProviderIds = Object.keys(opts.socialProviders ?? {});
  return {
    database: opts.adapter,
    ...(opts.secret !== undefined ? { secret: opts.secret } : {}),
    baseURL: opts.baseURL,
    emailAndPassword: {
      enabled: opts.emailAndPassword.enabled,
      ...(opts.emailAndPassword.requireEmailVerification !== undefined
        ? {
            requireEmailVerification:
              opts.emailAndPassword.requireEmailVerification,
          }
        : {}),
      ...(opts.emailAndPassword.password !== undefined
        ? { password: opts.emailAndPassword.password }
        : {}),
      sendResetPassword: opts.senders.sendResetPassword,
      sendVerificationEmail: opts.senders.sendVerificationEmail,
    },
    ...(opts.senders.sendMagicLink
      ? {
          plugins: [
            magicLink({ sendMagicLink: opts.senders.sendMagicLink }),
          ],
        }
      : {}),
    socialProviders: opts.socialProviders,
    ...(modelNames?.user ? { user: { modelName: modelNames.user } } : {}),
    account: {
      ...(modelNames?.account ? { modelName: modelNames.account } : {}),
      accountLinking: RECODER_ACCOUNT_LINKING,
    },
    databaseHooks: {
      account: {
        create: {
          before: createOAuthAccountLinkGuard(socialProviderIds),
        },
      },
    },
    session: {
      ...(modelNames?.session ? { modelName: modelNames.session } : {}),
      ...(opts.session ?? {}),
    },
    ...(modelNames?.verification
      ? { verification: { modelName: modelNames.verification } }
      : {}),
    advanced: RECODER_COOKIE_ADVANCED,
    trustedOrigins: opts.trustedOrigins,
    ...(opts.pages ? { pages: opts.pages } : {}),
  };
}

/** Create a Better Auth instance from the shared Recoder factory. */
export function createRecoderAuth(opts: CreateRecoderAuthOptions) {
  return betterAuth(buildRecoderAuthOptions(opts));
}

export type RecoderAuthInstance = ReturnType<typeof createRecoderAuth>;
