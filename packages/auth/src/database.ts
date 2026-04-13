import { PrismaClient } from "../prisma/auth-client";

const globalForAuthPrisma = globalThis as unknown as {
  authPrisma?: PrismaClient;
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

  // Reuse a single Prisma auth client for the whole process in every
  // environment. Production PM/Agency host runtimes were creating
  // additional auth clients under module re-evaluation, which can exhaust
  // PostgreSQL connections during session/profile lookups.
  globalForAuthPrisma.authPrisma = client;

  return client;
}

export const authDatabase = createAuthDatabase();
