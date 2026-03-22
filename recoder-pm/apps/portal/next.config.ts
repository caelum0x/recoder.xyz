import { withBackend } from "@repo/backend/next-config";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogtail, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

const baseConfig: NextConfig = {
  ...config,
  ...(process.env.DOCKER === "1" ? { output: "standalone" } : {}),
  transpilePackages: [
    ...(config.transpilePackages || []),
    "@recoder/auth",
  ],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

let nextConfig: NextConfig = withBackend(withLogtail(baseConfig));

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

export default nextConfig;
