import { defineConfig } from "prisma/config";
import "dotenv/config";

const prismaUrl = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL;

if (!prismaUrl) {
  throw new Error(
    "Missing POSTGRES_PRISMA_URL (or DATABASE_URL) required for Prisma configuration."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: prismaUrl,
  },
});
