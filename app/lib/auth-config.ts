import { betterAuth } from "better-auth";
import { customPrismaAdapter } from "./custom-prisma-adapter";
import { prisma } from "./prisma";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

export const auth = betterAuth({
  database: customPrismaAdapter(prisma),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // ✅ Enable email verification for security
    sendResetPassword: async ({ user, url }) => {
      // Send password reset email with token link
      await sendPasswordResetEmail(user.email, url);
    },
    sendVerificationEmail: async ({ user, url }) => {
      // Send email verification link
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
    },
    useSecureCookies: process.env.NODE_ENV === 'production',
    generateId: () => crypto.randomUUID(),
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5173", // recoder-web local dev (Vite)
    "http://localhost:8788", // recoder-web local dev (Wrangler)
    "https://recoder.xyz",
    "https://www.recoder.xyz",
    "https://web.recoder.xyz", // recoder-web production
  ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
});

export type Session = typeof auth.$Infer.Session;
