/**
 * Better Auth server instance for the main app surface (recoder.xyz).
 *
 * This is the PRIMARY auth origin. All other surfaces (agency, studio, pm,
 * frontend) share the session cookie set here via cross-subdomain cookies
 * on `.recoder.xyz`.
 *
 * Built through the shared `createRecoderAuth()` factory in `@recoder/auth`,
 * so the cookie block (`RECODER_COOKIE_ADVANCED`) and account-linking policy
 * are literally the same objects on every surface and cannot drift.
 *
 * The main app keeps its own factory call because:
 *   - It uses the main Prisma client (not authDatabase)
 *   - It hosts the full auth API (`/api/auth/[...all]`)
 *   - It has its own email senders and social-provider config
 */

import {
  createRecoderAuth,
  type CreateRecoderAuthOptions,
  APPLE_ISSUER_URL,
} from "@recoder/auth";
import { customPrismaAdapter } from "./custom-prisma-adapter";
import { prisma } from "./prisma";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { SURFACE_ORIGINS } from "@recoder/auth/edge";
import {
  resolveAppleClientSecret,
  appleMapProfileToUser,
} from "./auth/apple-secret";
import { isRealCredential } from "./auth/is-real-credential";

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
  // Apple posts the sign-in callback from its own origin (form_post response).
  APPLE_ISSUER_URL,
];

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3004",
  "http://localhost:3005",
  "http://localhost:3007",
  "http://localhost:3100",
  "http://localhost:5173",
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

const skipAuthConfigValidation =
  process.env.SKIP_ENV_VALIDATION === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build';

// Apple: either a pre-minted client secret JWT (APPLE_CLIENT_SECRET) or the
// .p8 signing parts to derive it (APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_PRIVATE_KEY).
const appleClientId = process.env.APPLE_CLIENT_ID || '';
const appleClientSecretDirect = process.env.APPLE_CLIENT_SECRET || '';
const appleTeamId = process.env.APPLE_TEAM_ID || '';
const appleKeyId = process.env.APPLE_KEY_ID || '';
const applePrivateKey = process.env.APPLE_PRIVATE_KEY || '';
const appleBundleId = process.env.APPLE_APP_BUNDLE_IDENTIFIER || '';

const hasGithub = isRealCredential(githubClientId) && isRealCredential(githubClientSecret);
const hasGoogle = isRealCredential(googleClientId) && isRealCredential(googleClientSecret);

const hasAppleSigningParts =
  isRealCredential(appleTeamId) &&
  isRealCredential(appleKeyId) &&
  isRealCredential(applePrivateKey);
// The "secret" half is satisfied by a direct secret OR the derivable parts.
const hasAppleSecretMaterial =
  isRealCredential(appleClientSecretDirect) || hasAppleSigningParts;
const hasApple = isRealCredential(appleClientId) && hasAppleSecretMaterial;

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
if (!skipAuthConfigValidation && isRealCredential(appleClientId) && !hasAppleSecretMaterial) {
  throw new Error(
    'APPLE_CLIENT_ID (Service ID) is set but no Apple client secret material is available. ' +
    'Provide either APPLE_CLIENT_SECRET (a pre-minted JWT) or the signing parts ' +
    'APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_PRIVATE_KEY so the secret can be derived.'
  );
}
if (!skipAuthConfigValidation && !isRealCredential(appleClientId) && hasAppleSecretMaterial) {
  throw new Error(
    'Apple client secret material is set but APPLE_CLIENT_ID (the Apple Service ID) is missing. ' +
    'Both must be provided for Sign in with Apple to work.'
  );
}

// In production, require at least one OAuth provider to be fully configured.
if (!skipAuthConfigValidation && process.env.NODE_ENV === 'production' && !hasGithub && !hasGoogle && !hasApple) {
  throw new Error(
    'No OAuth providers configured. In production at least one of GitHub, Google, or Apple ' +
    'OAuth must be fully configured. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, ' +
    'GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET, and/or APPLE_CLIENT_ID + APPLE_CLIENT_SECRET.'
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
// Apple's client secret is a signed JWT produced at config time — either taken
// directly (APPLE_CLIENT_SECRET) or minted from the .p8 parts. Resolving it is
// async, hence the top-level await (this module has no edge-runtime importers).
const appleClientSecret = hasApple
  ? await resolveAppleClientSecret({
      clientSecret: appleClientSecretDirect || undefined,
      clientId: appleClientId,
      teamId: appleTeamId,
      keyId: appleKeyId,
      privateKey: applePrivateKey,
    })
  : undefined;
if (hasApple && appleClientSecret) {
  socialProviders.apple = {
    clientId: appleClientId,
    clientSecret: appleClientSecret,
    ...(isRealCredential(appleBundleId)
      ? { appBundleIdentifier: appleBundleId }
      : {}),
    // Apple only sends the email on first auth — persist it, and coerce Apple's
    // string-typed email_verified truthfully.
    mapProfileToUser: appleMapProfileToUser,
  };
}

/**
 * Build this surface's factory input. Exported so parity tests can diff the
 * resolved options against @recoder/auth's without booting Better Auth.
 */
export function buildAppAuthOptions(): CreateRecoderAuthOptions {
  return {
    adapter: customPrismaAdapter(prisma),
    baseURL: getBaseURL(),
    emailAndPassword: {
      // Self-host operators may re-enable local accounts via AUTH_EMAIL_PASSWORD=on;
      // the hosted product is OAuth-only.
      enabled: process.env.AUTH_EMAIL_PASSWORD === "on",
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
    },
    senders: {
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail(user.email, url);
      },
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail(user.email, url);
      },
    },
    socialProviders: socialProviders as CreateRecoderAuthOptions["socialProviders"],
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days to match session expiry
      },
    },
    trustedOrigins: process.env.NODE_ENV === 'production'
      ? PRODUCTION_ORIGINS
      : DEV_ORIGINS,
    pages: {
      signIn: "/auth/signin",
      error: "/auth/signin",
    },
  };
}

export const auth = createRecoderAuth(buildAppAuthOptions());

export type Session = typeof auth.$Infer.Session;
