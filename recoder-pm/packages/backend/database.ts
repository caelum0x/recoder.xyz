import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { keys } from "./keys";
import { PrismaClient } from "./prisma/client";
import { registerDatabaseMiddleware } from "./prisma/middleware";

const env = keys();

if (!env.POSTGRES_PRISMA_URL) {
  throw new Error("POSTGRES_PRISMA_URL is not set");
}

const url = new URL(env.POSTGRES_PRISMA_URL);

if (process.env.NODE_ENV === "production") {
  const isLocalDb = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  // Patch issue: https://github.com/prisma/prisma/issues/19209#issuecomment-1575711892
  url.searchParams.set("sslmode", isLocalDb ? "disable" : "no-verify");
}

const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
  prismaMiddlewareRegistered?: boolean;
};
const adapter = new PrismaPg({ connectionString: url.toString() });
const client = globalForPrisma.prisma || new PrismaClient({ adapter });
const middlewareCapableClient = client as PrismaClient & {
  $use?: (...args: unknown[]) => unknown;
};

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}

if (
  !globalForPrisma.prismaMiddlewareRegistered &&
  typeof middlewareCapableClient.$use === "function"
) {
  registerDatabaseMiddleware(client);
  globalForPrisma.prismaMiddlewareRegistered = true;
}

export const database = client;

/* Workaround for https://github.com/prisma/prisma/issues/11842 */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const getJsonColumnFromTable = async (
  tableName: string,
  column: string,
  id: string
) => {
  if (!(SAFE_IDENTIFIER.test(tableName) && SAFE_IDENTIFIER.test(column))) {
    throw new Error("Invalid table or column name");
  }
  const result = await client.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT "${column}" FROM "${tableName}" WHERE "id" = $1 LIMIT 1`,
    id
  );

  return (result?.at(0)?.[column] as object | null) ?? null;
};
