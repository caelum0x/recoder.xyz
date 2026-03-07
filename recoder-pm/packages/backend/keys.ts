import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v3";

/**
 * In Docker, skip T3 env validation for non-critical vars (URL format, etc.)
 * but always enforce that critical auth/database secrets are present at runtime.
 */
const CRITICAL_VARS = [
  "BETTER_AUTH_SECRET",
  "AUTH_DATABASE_URL",
  "DATABASE_URL",
] as const;

if (process.env.DOCKER) {
  for (const key of CRITICAL_VARS) {
    if (!process.env[key]) {
      throw new Error(
        `Missing critical env var ${key}. Cannot start in Docker without it.`
      );
    }
  }
}

export const keys = () =>
  createEnv({
    // WARNING: skipValidation disables ALL T3 schema checks.
    // Critical vars (BETTER_AUTH_SECRET, AUTH_DATABASE_URL, DATABASE_URL)
    // are guarded by the runtime check above even when this is true.
    skipValidation: !!process.env.DOCKER || !!process.env.SKIP_ENV_VALIDATION,
    server: {
      BETTER_AUTH_SECRET: z.string().min(1),
      BETTER_AUTH_URL: z.string().url().min(1),
      AUTH_DATABASE_URL: z.string().url().min(1),
      DATABASE_URL: z.string().url().min(1),
      POSTGRES_URL_NON_POOLING: z.string().url().min(1),
      POSTGRES_PRISMA_URL: z.string().url().min(1),
    },
    client: {},
    runtimeEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      AUTH_DATABASE_URL: process.env.AUTH_DATABASE_URL,
      DATABASE_URL: process.env.DATABASE_URL,
      POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
      POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
    },
  });
