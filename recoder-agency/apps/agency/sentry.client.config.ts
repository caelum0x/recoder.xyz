// This file configures the initialization of Sentry on the client (browser).
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	release:
		process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

	tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 1.0,

	integrations: [Sentry.replayIntegration()],

	debug: false,
	enabled:
		process.env.SENTRY_ENABLED === "true" ||
		process.env.NEXT_PUBLIC_VERCEL_ENV !== undefined ||
		process.env.NODE_ENV === "production",
});
