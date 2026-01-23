import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

// Determine baseURL based on environment
const getBaseURL = () => {
  // In production, always use the production URL
  if (process.env.NODE_ENV === 'production') {
    return "https://recoder.xyz";
  }
  // In development, use NEXT_PUBLIC_APP_URL or localhost
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
};

export const auth = betterAuth({
  baseURL: getBaseURL(),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  socialProviders: {
    github: {
      clientId: (process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID) as string,
      clientSecret: (process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET) as string,
      scope: ["user:email"], // Request email explicitly from GitHub
      mapProfileToUser: (profile) => {
        return {
          email: profile.email || `${profile.login}@github.user.noreply.github.com`,
          name: profile.name || profile.login,
          image: profile.avatar_url,
        };
      },
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      scope: ["openid", "email", "profile"], // Explicitly request email from Google
    },
  },
  // Note: user fields like subscriptionPlan are already defined in the Prisma schema
  // We don't need to redefine them as additionalFields in Better Auth
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days to match session expiry
    },
  },
  advanced: {
    cookiePrefix: "recoder",
    crossSubDomainCookies: {
      enabled: true,
      domain: process.env.NODE_ENV === 'production' ? '.recoder.xyz' : undefined, // Leading dot for subdomain sharing
    },
    useSecureCookies: process.env.NODE_ENV === 'production',
    // SameSite=None is required for cross-origin requests (web.recoder.xyz -> docker.recoder.xyz)
    // Must be paired with Secure=true (handled by useSecureCookies in production)
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
    generateId: () => crypto.randomUUID(),
  },
  trustedOrigins: process.env.NODE_ENV === 'production'
    ? [
        process.env.NEXT_PUBLIC_APP_URL || "https://recoder.xyz",
        "https://recoder.xyz",
        "https://www.recoder.xyz",
        "https://web.recoder.xyz",
        "https://docker.recoder.xyz", // Docker backend for cross-origin API calls
      ]
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://localhost:8788",
        "https://recoder.xyz",
        "https://www.recoder.xyz",
        "https://web.recoder.xyz",
        "https://docker.recoder.xyz",
      ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
});

export type Session = typeof auth.$Infer.Session;
