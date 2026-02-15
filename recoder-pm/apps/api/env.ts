import { keys as email } from "@repo/email/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as payments } from "@repo/payments/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v3";

export const env = createEnv({
  extends: [core(), observability(), payments(), email()],
  skipValidation: !!process.env.DOCKER,
  server: {
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_TEXT_MODEL: z.string().optional(),
    OPENAI_TRANSCRIPTION_MODEL: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_TEXT_MODEL: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_TEXT_MODEL: z.string().optional(),
    AI_PROVIDER: z.enum(["openai", "openrouter", "anthropic"]).optional(),
    AI_KEY_ENCRYPTION_SECRET: z.string().optional(),
    REDIS_URL: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL,
    OPENAI_TRANSCRIPTION_MODEL: process.env.OPENAI_TRANSCRIPTION_MODEL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_TEXT_MODEL: process.env.ANTHROPIC_TEXT_MODEL,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_KEY_ENCRYPTION_SECRET: process.env.AI_KEY_ENCRYPTION_SECRET,
    REDIS_URL: process.env.REDIS_URL,
  },
});
