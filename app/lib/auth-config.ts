import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    usePlural: true, // Use plural table names (users instead of user)
    generateTables: true, // Automatically generate missing tables
  }),
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
      maxAge: 60 * 5, // 5 minutes
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "https://recoder.xyz",
    "https://www.recoder.xyz",
  ],
  advanced: {
    cookiePrefix: "recoder",
    crossSubDomainCookies: {
      enabled: true,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
