/**
 * Next.js Instrumentation Hook
 *
 * Runs once on server startup. Initializes Sentry error monitoring
 * when NEXT_PUBLIC_SENTRY_DSN is configured.
 */
export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('./sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      await import('./sentry.edge.config');
    }
  }
}
