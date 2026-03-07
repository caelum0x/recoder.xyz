import { vercel } from "@t3-oss/env-core/presets-zod";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v3";

const defaultWebUrl = "http://localhost:3000";
const defaultApiUrl = "http://localhost:3001";
const defaultPortalUrl = "http://localhost:3002";
const defaultAdminOrganizationId = "local-dev-admin-org";

export const keys = () =>
  createEnv({
    extends: [vercel()],
    skipValidation: !!process.env.DOCKER || !!process.env.SKIP_ENV_VALIDATION,
    server: {
      ANALYZE: z.string().optional(),

      // Added by Vercel
      NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

      // URLs
      RECODER_PM_WEB_URL: z.string().url().min(1),
      RECODER_PM_API_URL: z.string().url().min(1),
      RECODER_PM_PORTAL_URL: z.string().url().min(1),
      RECODER_PM_ADMIN_ORGANIZATION_ID: z.string().min(1),

      // Node
      NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    },
    client: {},
    runtimeEnv: {
      ANALYZE: process.env.ANALYZE,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME,
      RECODER_PM_WEB_URL: process.env.RECODER_PM_WEB_URL ?? defaultWebUrl,
      RECODER_PM_ADMIN_ORGANIZATION_ID:
        process.env.RECODER_PM_ADMIN_ORGANIZATION_ID ??
        defaultAdminOrganizationId,
      RECODER_PM_API_URL: process.env.RECODER_PM_API_URL ?? defaultApiUrl,
      RECODER_PM_PORTAL_URL:
        process.env.RECODER_PM_PORTAL_URL ?? defaultPortalUrl,
      NODE_ENV: process.env.NODE_ENV,
    },
  });
