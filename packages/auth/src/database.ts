import { PrismaClient } from "../prisma/auth-client";

const globalForAuthPrisma = globalThis as unknown as {
  authPrisma: PrismaClient;
};

/**
 * Singleton Prisma client for the auth database.
 * Uses AUTH_DATABASE_URL to connect.
 */
function createAuthDatabase(): PrismaClient {
  if (globalForAuthPrisma.authPrisma) {
    return globalForAuthPrisma.authPrisma;
  }

  const client = new PrismaClient({
    datasourceUrl: process.env.AUTH_DATABASE_URL,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForAuthPrisma.authPrisma = client;
  }

  return client;
}

export const authDatabase = createAuthDatabase();
