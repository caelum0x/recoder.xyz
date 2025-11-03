import { betterAuth } from "better-auth";
import { customPrismaAdapter } from "./lib/custom-prisma-adapter";
import { prisma } from "./lib/prisma";

export const auth = betterAuth({
  database: customPrismaAdapter(prisma)(),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
    github: {
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    },
  },
});
