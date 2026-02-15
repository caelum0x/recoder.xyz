import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = createEnv({
  extends: [core(), observability()],
  skipValidation: !!process.env.DOCKER,
  server: {},
  client: {},
  runtimeEnv: {},
});
