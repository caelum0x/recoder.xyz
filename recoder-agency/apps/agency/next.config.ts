import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import createBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const moduleRequire = createRequire(import.meta.url);
const projectDir = fileURLToPath(new URL(".", import.meta.url));

const pdfiumWasmPath = moduleRequire.resolve("@embedpdf/pdfium/pdfium.wasm");

export const serverExternalPackages = [
	"@embedpdf/pdfium",
	"pino",
	"pino-pretty",
	"happy-dom",
	"@supabase/supabase-js",
	"@supabase/realtime-js",
	"@prisma/client",
	"@recoder/auth",
];
const pdfiumWasmInclude = relative(projectDir, pdfiumWasmPath).replace(
	/\\/g,
	"/",
);

const pdfiumTracingConfig = {
	outputFileTracingIncludes: {
		"/api/vector-stores/document/[documentVectorStoreId]/documents": [
			pdfiumWasmInclude,
		],
		"/api/vector-stores/cron/document/ingest": [pdfiumWasmInclude],
	},
};

const nextConfig: NextConfig = {
	output: "standalone",
	turbopack: {
		root: join(projectDir, "../../"),
	},
	serverExternalPackages,
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			...(process.env.NEXT_PUBLIC_SUPABASE_URL
				? [
						{
							protocol: "https" as const,
							hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
						},
					]
				: []),
		],
	},
	// biome-ignore lint/suspicious/useAwait: Next.js specification
	async redirects() {
		return [
			{
				source: "/",
				destination: "/dashboard",
				permanent: false,
			},
		];
	},
	// biome-ignore lint/suspicious/useAwait: Next.js specification
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "X-DNS-Prefetch-Control",
						value: "on",
					},
					{
						key: "X-XSS-Protection",
						value: "1; mode=block",
					},
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "Referrer-Policy",
						value: "origin-when-cross-origin",
					},
					{
						key: "Strict-Transport-Security",
						value: "max-age=63072000; includeSubDomains; preload",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
					{
						key: "Content-Security-Policy",
						value: [
							"default-src 'self'",
							"script-src 'self' 'unsafe-inline'",
							"style-src 'self' 'unsafe-inline'",
							"img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
							"font-src 'self'",
							"connect-src 'self' https://*.ingest.us.sentry.io https://*.posthog.com https://*.supabase.co wss://*.supabase.co",
							"frame-ancestors 'none'",
							"base-uri 'self'",
							"form-action 'self'",
						].join("; "),
					},
				],
			},
		];
	},
	experimental: {
		typedEnv: true,
		webpackMemoryOptimizations: true,
		webpackBuildWorker: true,
	},
	...pdfiumTracingConfig,
};

const withAnalyzer = createBundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});
export default async function () {
	return withAnalyzer(nextConfig);
}
