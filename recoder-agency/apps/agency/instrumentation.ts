import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { validateEnv, checkSecretHygiene } = await import(
			"./lib/env-validation"
		);
		validateEnv();
		checkSecretHygiene();

		await import("./sentry.server.config");
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("./sentry.edge.config");
	}

	process.env.LANGFUSE_TRACING_ENVIRONMENT =
		process.env.VERCEL_ENV || process.env.DEPLOY_ENV || "development";
}
export const onRequestError = Sentry.captureRequestError;
