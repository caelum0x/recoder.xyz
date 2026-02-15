// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
	environment:
		process.env.VERCEL_ENV || process.env.DEPLOY_ENV || "development",

	// Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
	tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

	// Setting this option to true will print useful information to the console while you're setting up Sentry.
	debug: false,
	enabled:
		process.env.SENTRY_ENABLED === "true" ||
		process.env.NEXT_PUBLIC_VERCEL_ENV !== undefined ||
		process.env.NODE_ENV === "production",
});
