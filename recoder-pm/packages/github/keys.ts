import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v3";

export const keys = () =>
  createEnv({
    skipValidation: !!process.env.DOCKER || !!process.env.SKIP_ENV_VALIDATION,
    server: {
      GITHUB_APP_ID: z.string().min(1).optional(),
      GITHUB_PRIVATE_KEY: z.string().min(1).optional(),
      GITHUB_APP_SLUG: z.string().min(1).optional(),
    },
    runtimeEnv: {
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_PRIVATE_KEY: process.env.GITHUB_PRIVATE_KEY,
      GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
    },
  });
