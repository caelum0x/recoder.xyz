import { prismaAdapter } from "better-auth/adapters/prisma";
import { authDatabase } from "./database";
import { getAuthEnv } from "./keys";
import { SURFACE_ORIGINS } from "./edge";
import {
  createRecoderAuth,
  type CreateRecoderAuthOptions,
} from "./create-recoder-auth";

export type { AuthEnv } from "./keys";
export { getAuthEnv } from "./keys";
export { authDatabase } from "./database";
export {
  COOKIE_DOMAIN,
  SURFACE_ORIGINS,
  SESSION_COOKIE_NAMES,
  hasSessionCookie,
  extractSessionToken,
  extractSessionTokenFromHeader,
  parseSessionToken,
} from "./edge";
export {
  verifySession,
} from "./verify";
export type { AuthSession } from "./verify";
export {
  verifySessionFromRequest,
  verifySessionFromCookieStore,
  verifySessionFromHeader,
  verifySessionFromGetter,
  hasSessionInRequest,
  extractSessionFromRequest,
  getSessionCookieAttributes,
  getSignOutCookieAttributes,
  isTrustedOrigin,
  AUTH_ORIGIN,
} from "./cross-domain";
export {
  createRecoderAuth,
  buildRecoderAuthOptions,
  RECODER_COOKIE_ADVANCED,
  RECODER_ACCOUNT_LINKING,
} from "./create-recoder-auth";
export type {
  CreateRecoderAuthOptions,
  RecoderAuthInstance,
} from "./create-recoder-auth";

/**
 * Trusted origins for cross-subdomain session sharing.
 * Derived from the canonical SURFACE_ORIGINS map in edge.ts.
 */
const PRODUCTION_ORIGINS = [
  ...Object.values(SURFACE_ORIGINS),
  "https://www.recoder.xyz",
];

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3004",
  "http://localhost:3005",
  "http://localhost:3007",
  "http://localhost:3100",
  "http://localhost:8000",
  "http://localhost:18789",
  ...PRODUCTION_ORIGINS,
];

export interface CreateAuthOptions {
  sendMagicLink: (params: { email: string; url: string }) => Promise<void>;
  sendResetPassword?: (params: { user: { email?: string | null }; url: string }) => Promise<void>;
  sendVerificationEmail?: (params: { user: { email?: string | null }; url: string }) => Promise<void>;
}

/**
 * Build this surface's factory input. Exported so parity tests can diff the
 * resolved options against the main app's without booting Better Auth.
 */
export function buildCreateAuthOptions(
  options: CreateAuthOptions
): CreateRecoderAuthOptions {
  const env = getAuthEnv();

  return {
    adapter: prismaAdapter(authDatabase, {
      provider: "postgresql",
    }),
    modelNames: {
      user: "user",
      account: "account",
      session: "session",
      verification: "verification",
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      // Self-host operators may re-enable local accounts via AUTH_EMAIL_PASSWORD=on;
      // the hosted product is OAuth-only.
      enabled: process.env.AUTH_EMAIL_PASSWORD === "on",
    },
    senders: {
      sendResetPassword: options.sendResetPassword
        ? async ({ user, url }: { user: { email?: string | null }; url: string }) => {
            await options.sendResetPassword!({ user: { email: user.email ?? null }, url });
          }
        : undefined,
      sendVerificationEmail: options.sendVerificationEmail
        ? async ({ user, url }: { user: { email?: string | null }; url: string }) => {
            await options.sendVerificationEmail!({ user: { email: user.email ?? null }, url });
          }
        : undefined,
      sendMagicLink: async ({ email, url }) => {
        await options.sendMagicLink({ email, url });
      },
    },
    socialProviders: {
      ...(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_APP_CLIENT_ID,
              clientSecret: env.GITHUB_APP_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_OAUTH_CLIENT_ID,
              clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
            },
          }
        : {}),
    },
    trustedOrigins:
      process.env.NODE_ENV === "production" ? PRODUCTION_ORIGINS : DEV_ORIGINS,
  };
}

/**
 * Create the shared better-auth instance.
 *
 * Each app calls this once and gets back a fully configured auth handler.
 * The `sendMagicLink` callback must be provided by the consuming app
 * (since email delivery depends on the app's Resend/SMTP setup).
 */
export function createAuth(options: CreateAuthOptions) {
  return createRecoderAuth(buildCreateAuthOptions(options));
}

export type RecoderAuth = ReturnType<typeof createAuth>;
export type BetterAuthSession = ReturnType<typeof createAuth>["$Infer"]["Session"];
