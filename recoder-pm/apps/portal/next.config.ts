import { withBackend } from "@repo/backend/next-config";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogtail, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

let nextConfig: NextConfig = withBackend(
  withLogtail({
    ...config,
    ...(process.env.DOCKER === "1" ? { output: "standalone" } : {}),

    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: true },
  })
);

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

export default nextConfig;
