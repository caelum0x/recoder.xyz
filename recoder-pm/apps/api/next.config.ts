import { withBackend } from "@repo/backend/next-config";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogtail, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

let nextConfig: NextConfig = withBackend(
  withLogtail({
    ...config,
    ...(process.env.DOCKER === "1" ? { output: "standalone" } : {}),

    // The @recoder/a2a-sdk "./ingress" export resolves to raw TS source
    // (src/ingress-contract/index.ts), so it must be transpiled by the app.
    transpilePackages: [...(config.transpilePackages || []), "@recoder/a2a-sdk"],

    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: true },

    // biome-ignore lint/suspicious/useAwait: "redirects is async"
    async redirects() {
      return [];
    },

    devIndicators: false,

    // biome-ignore lint/suspicious/useAwait: "headers is async"
    async headers() {
      const allowOrigin =
        process.env.NODE_ENV === "production" ? "https://pm.recoder.xyz" : "*";
      return [
        {
          source: "/(.*)",
          headers: [
            { key: "Access-Control-Allow-Origin", value: allowOrigin },
            {
              key: "Access-Control-Allow-Methods",
              value: "GET, POST, PUT, DELETE, OPTIONS",
            },
            {
              key: "Access-Control-Allow-Headers",
              value: "Content-Type, Authorization",
            },
            ...(process.env.NODE_ENV === "production"
              ? [
                  {
                    key: "Access-Control-Allow-Credentials",
                    value: "true",
                  },
                ]
              : []),
          ],
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
