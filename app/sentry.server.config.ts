// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Only initialize Sentry if a DSN is provided — completely no-op otherwise
if (dsn) {
  Sentry.init({
    dsn,

    // Disable performance monitoring to stay within free tier limits
    tracesSampleRate: 0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Environment and release
    environment: process.env.NODE_ENV || "development",
    release: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",

    // Filter sensitive data before sending
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }

      // Remove user IP
      if (event.user?.ip_address) {
        delete event.user.ip_address;
      }

      return event;
    },
  });
}
