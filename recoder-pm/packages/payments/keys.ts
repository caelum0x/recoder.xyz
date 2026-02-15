import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v3";

export const keys = () =>
  createEnv({
    skipValidation: !!process.env.DOCKER,
    server: {
      POLAR_ACCESS_TOKEN: z.string().min(1),
      POLAR_WEBHOOK_SECRET: z.string().min(1),
      POLAR_PRODUCT_PRO_ID: z.string().min(1),
      POLAR_PRODUCT_ENTERPRISE_ID: z.string().min(1),
      POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),
    },
    runtimeEnv: {
      POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
      POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
      POLAR_PRODUCT_PRO_ID: process.env.POLAR_PRODUCT_PRO_ID,
      POLAR_PRODUCT_ENTERPRISE_ID: process.env.POLAR_PRODUCT_ENTERPRISE_ID,
      POLAR_SERVER: process.env.POLAR_SERVER,
    },
  });
