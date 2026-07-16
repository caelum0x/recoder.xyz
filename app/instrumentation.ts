/**
 * Next.js Instrumentation Hook
 *
 * Runs once on server startup. Initializes:
 * - Sentry error monitoring (if NEXT_PUBLIC_SENTRY_DSN is set)
 * - OpenTelemetry distributed tracing (if OTEL_ENABLED=true)
 *
 * Edge runtime is excluded from OTel to avoid bundling Node-only dependencies.
 */
export async function register() {
  // Sentry server-side initialization (works in both nodejs and edge runtimes)
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('./sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      await import('./sentry.edge.config');
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate required configuration in production
    if (process.env.NODE_ENV === 'production') {
      const { validateConfig } = await import('./lib/config');
      const result = validateConfig();
      if (!result.valid) {
        console.error('[startup] Configuration validation failed:');
        result.errors.forEach(e => console.error(`  - ${e}`));
      }
    }

    try {
      // Dynamically import to avoid bundling in edge runtime
      const { setupTracing } = await import('./lib/tracing');
      setupTracing();
    } catch (error) {
      console.warn(
        '[otel] instrumentation bootstrap skipped:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
