/**
 * Shared Prisma client singleton for the unified recoder database.
 *
 * All apps should import this client instead of creating their own:
 *   import { db } from "@recoder/database/client";
 *
 * The canonical Prisma schema lives at app/prisma/schema.prisma.
 * Run `pnpm db:generate` from the app/ directory to regenerate the client.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export type { PrismaClient };
export default db;
