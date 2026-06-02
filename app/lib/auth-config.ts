/**
 * Better Auth server instance for the main app surface (recoder.xyz).
 *
 * This is the PRIMARY auth origin. All other surfaces (agency, studio, pm,
 * frontend) share the session cookie set here via cross-subdomain cookies
 * on `.recoder.xyz`.
 *
 * Cookie / session configuration is aligned with `@recoder/auth` (the shared
 * package) so that every surface reads the same `recoder.session_token`
 * cookie with the same domain, prefix, and SameSite settings.
 *
 * The main app keeps its own `betterAuth()` call because:
 *   - It uses the main Prisma client (not authDatabase)
 *   - It hosts the full auth API (`/api/auth/[...all]`)
 *   - It has its own email senders and social-provider config
 */

import { betterAuth } from "better-auth";
import { customPrismaAdapter } from "./custom-prisma-adapter";
import { prisma } from "./prisma";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { COOKIE_DOMAIN, SURFACE_ORIGINS } from "@recoder/auth/edge";

// Determine baseURL based on environment
const getBaseURL = () => {
  if (process.env.NODE_ENV === 'production') {
    return SURFACE_ORIGINS.app; // "https://recoder.xyz"
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
};

/**
 * All trusted origins for cross-surface session sharing.
 * Kept in sync with @recoder/auth PRODUCTION_ORIGINS / DEV_ORIGINS.
 */
const PRODUCTION_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL || SURFACE_ORIGINS.app,
  ...Object.values(SURFACE_ORIGINS),
  "https://www.recoder.xyz",
  "https://*.recoder.xyz",
];

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3004",
  "http://localhost:3005",
  "http://localhost:3007",
  "http://localhost:3100",
  "http://localhost:8000",
  "http://localhost:18789",
  ...PRODUCTION_ORIGINS,
];

// Build social providers only when real credentials are configured.
// In production we require at least one OAuth provider so that misconfigured
// deployments fail fast instead of silently serving a broken sign-in page.
const githubClientId = process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID || '';
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET || '';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

function isRealCredential(val: string): boolean {
  return val.length > 0 && !val.startsWith('placeholder');
}

const skipAuthConfigValidation =
  process.env.SKIP_ENV_VALIDATION === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build';

const hasGithub = isRealCredential(githubClientId) && isRealCredential(githubClientSecret);
const hasGoogle = isRealCredential(googleClientId) && isRealCredential(googleClientSecret);

// Validate: if only one half of a credential pair is set, something is wrong.
if (!skipAuthConfigValidation && isRealCredential(githubClientId) && !isRealCredential(githubClientSecret)) {
  throw new Error(
    'GITHUB_CLIENT_ID (or GITHUB_ID) is set but GITHUB_CLIENT_SECRET (or GITHUB_SECRET) is missing. ' +
    'Both must be provided for GitHub OAuth to work.'
  );
}
if (!skipAuthConfigValidation && !isRealCredential(githubClientId) && isRealCredential(githubClientSecret)) {
  throw new Error(
    'GITHUB_CLIENT_SECRET (or GITHUB_SECRET) is set but GITHUB_CLIENT_ID (or GITHUB_ID) is missing. ' +
    'Both must be provided for GitHub OAuth to work.'
  );
}
if (!skipAuthConfigValidation && isRealCredential(googleClientId) && !isRealCredential(googleClientSecret)) {
  throw new Error(
    'GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is missing. ' +
    'Both must be provided for Google OAuth to work.'
  );
}
if (!skipAuthConfigValidation && !isRealCredential(googleClientId) && isRealCredential(googleClientSecret)) {
  throw new Error(
    'GOOGLE_CLIENT_SECRET is set but GOOGLE_CLIENT_ID is missing. ' +
    'Both must be provided for Google OAuth to work.'
  );
}

// In production, require at least one OAuth provider to be fully configured.
if (!skipAuthConfigValidation && process.env.NODE_ENV === 'production' && !hasGithub && !hasGoogle) {
  throw new Error(
    'No OAuth providers configured. In production at least one of GitHub or Google OAuth ' +
    'must be fully configured (both client ID and secret). Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET ' +
    'and/or GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET.'
  );
}

const socialProviders: Record<string, unknown> = {};
if (hasGithub) {
  socialProviders.github = {
    clientId: githubClientId,
    clientSecret: githubClientSecret,
    scope: ["user:email"],
    mapProfileToUser: (profile: Record<string, string>) => ({
      email: profile.email || `${profile.login}@github.user.noreply.github.com`,
      name: profile.name || profile.login,
      image: profile.avatar_url,
    }),
  };
}
if (hasGoogle) {
  socialProviders.google = {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    scope: ["openid", "email", "profile"],
  };
}

export const auth = betterAuth({
  baseURL: getBaseURL(),
  database: customPrismaAdapter(prisma),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    password: {
      hash: async (password: string) => {
        const bcrypt = await import('bcryptjs');
        return bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        const bcrypt = await import('bcryptjs');
        return bcrypt.compare(password, hash);
      },
    },
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  socialProviders,
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days to match session expiry
    },
  },
  /**
   * Cookie configuration MUST match @recoder/auth exactly so that
   * every surface reads the same `recoder.session_token` cookie.
   */
  advanced: {
    cookiePrefix: "recoder",
    crossSubDomainCookies: {
      enabled: true,
      domain: process.env.NODE_ENV === 'production' ? COOKIE_DOMAIN : undefined,
    },
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
    generateId: () => crypto.randomUUID(),
  },
  trustedOrigins: process.env.NODE_ENV === 'production'
    ? PRODUCTION_ORIGINS
    : DEV_ORIGINS,
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
});

export type Session = typeof auth.$Infer.Session;
