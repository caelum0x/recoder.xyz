import { betterAuth } from "better-auth";
import { customPrismaAdapter } from "./custom-prisma-adapter";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: customPrismaAdapter(prisma),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disable email verification temporarily
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
  user: {
    additionalFields: {
      subscriptionPlan: {
        type: "string",
        defaultValue: "free",
      },
      subscriptionStatus: {
        type: "string", 
        defaultValue: "active",
      },
    },
  },
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
    "https://recoder.xyz",
    "https://www.recoder.xyz",
  ],
});

export type Session = typeof auth.$Infer.Session;
