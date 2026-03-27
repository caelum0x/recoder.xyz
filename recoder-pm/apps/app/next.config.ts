import { withBackend } from "@repo/backend/next-config";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogtail, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

let nextConfig: NextConfig = withBackend(
  withLogtail({
    ...config,
    ...(process.env.DOCKER === "1" ? { output: "standalone" } : {}),

    typescript: { ignoreBuildErrors: true },

    transpilePackages: ["@sentry/nextjs", "@recoder/auth"],

    // biome-ignore lint/suspicious/useAwait: Next.js expects async redirects.
    async redirects() {
      return [
        {
          source: "/features/groups",
          destination: "/features",
          permanent: true,
        },
        {
          source: "/features/products",
          destination: "/features",
          permanent: true,
        },
        {
          source: "/data",
          destination: "/data/users",
          permanent: false,
        },
        {
          source: "/api/webhooks/:path*",
          destination: "https://pm.recoder.xyz/api/webhooks/:path*",
          permanent: true,
        },
        {
          source: "/select-organization",
          destination: "/setup",
          permanent: true,
        },
        {
          source: "/app",
          destination: "/",
          permanent: false,
        },
      ];
    },
  })
);

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

export default nextConfig;
