import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { authDatabase } from "./database";
import { getAuthEnv } from "./keys";

export type { AuthEnv } from "./keys";
export { getAuthEnv } from "./keys";
export { authDatabase } from "./database";

/**
 * Trusted origins for cross-subdomain session sharing.
 */
const PRODUCTION_ORIGINS = [
  "https://recoder.xyz",
  "https://www.recoder.xyz",
  "https://pm.recoder.xyz",
  "https://agency.recoder.xyz",
  "https://app.recoder.xyz",
  "https://ide.recoder.xyz",
];

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:5173",
  "http://localhost:8000",
  ...PRODUCTION_ORIGINS,
];

/**
 * Create the shared better-auth instance.
 *
 * Each app calls this once and gets back a fully configured auth handler.
 * The `sendMagicLink` callback must be provided by the consuming app
 * (since email delivery depends on the app's Resend/SMTP setup).
 */
export function createAuth(options: {
  sendMagicLink: (params: { email: string; url: string }) => Promise<void>;
  sendResetPassword?: (params: { user: { email?: string | null }; url: string }) => Promise<void>;
  sendVerificationEmail?: (params: { user: { email?: string | null }; url: string }) => Promise<void>;
}) {
  const env = getAuthEnv();

  return betterAuth({
    database: prismaAdapter(authDatabase, {
      provider: "postgresql",
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      sendResetPassword: options.sendResetPassword
        ? async ({ user, url }) => {
            await options.sendResetPassword!({ user: { email: user.email ?? null }, url });
          }
        : undefined,
      sendVerificationEmail: options.sendVerificationEmail
        ? async ({ user, url }) => {
            await options.sendVerificationEmail!({ user: { email: user.email ?? null }, url });
          }
        : undefined,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await options.sendMagicLink({ email, url });
        },
      }),
    ],
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
    advanced: {
      cookiePrefix: "recoder",
      crossSubDomainCookies: {
        enabled: true,
        domain:
          process.env.NODE_ENV === "production" ? ".recoder.xyz" : undefined,
      },
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: {
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
      generateId: () => crypto.randomUUID(),
    },
    trustedOrigins:
      process.env.NODE_ENV === "production" ? PRODUCTION_ORIGINS : DEV_ORIGINS,
    user: {
      modelName: "user",
    },
    account: {
      modelName: "account",
    },
    session: {
      modelName: "session",
    },
    verification: {
      modelName: "verification",
    },
  });
}

export type RecoderAuth = ReturnType<typeof createAuth>;
export type BetterAuthSession = ReturnType<typeof createAuth>["$Infer"]["Session"];
