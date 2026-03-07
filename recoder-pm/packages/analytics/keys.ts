import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v3";

export const keys = () =>
  createEnv({
    skipValidation: !!process.env.DOCKER || !!process.env.SKIP_ENV_VALIDATION,
    client: {
      NEXT_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
      NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
      NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    },
  });
