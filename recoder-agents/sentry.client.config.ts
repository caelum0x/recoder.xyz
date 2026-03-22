// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Only initialize Sentry if a DSN is provided
if (dsn) {
  Sentry.init({
    dsn,

    // Disable performance monitoring to stay within free tier limits
    tracesSampleRate: 0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // No session replay — keep bundle size small and stay within free tier
    // No additional integrations needed — default error capture is sufficient

    // Environment and release
    environment: process.env.NODE_ENV || "development",
    release: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",

    // Ignore common noise errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "originalCreateNotification",
      "canvas.contentDocument",
      "MyApp_RemoveAllHighlights",
      "fb_xd_fragment",
      // ISP "optimizing" proxies
      "bmi_SafeAddOnload",
      "EBCallBackMessageReceived",
      "conduitPage",
      // Network errors
      "NetworkError",
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      "AbortError",
      // ResizeObserver noise
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],

    // Filter sensitive data before sending
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }

      return event;
    },
  });
}
