/**
 * Next.js Instrumentation Hook
 *
 * Runs once on server startup. Initializes OpenTelemetry distributed tracing
 * when the runtime is Node.js. Edge runtime is excluded to avoid bundling
 * Node-only dependencies.
 *
 * Tracing is opt-in: set OTEL_ENABLED=true or OTEL_EXPORTER_OTLP_ENDPOINT
 * in your environment to activate.
 */
export async function register() {
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
