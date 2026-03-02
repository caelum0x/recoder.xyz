/**
 * OpenTelemetry Distributed Tracing Setup
 *
 * Environment-gated: tracing activates only when OTEL_ENABLED=true
 * or OTEL_EXPORTER_OTLP_ENDPOINT is set.
 *
 * Important: keep OpenTelemetry imports lazy to avoid hard startup failures
 * when optional instrumentation peer deps are absent in production images.
 */

declare global {
  // eslint-disable-next-line no-var
  var __recoderOtelInitialized: boolean | undefined;
}

const OTEL_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function shouldEnableTracing(): boolean {
  const explicitFlag = (process.env.OTEL_ENABLED || '').toLowerCase().trim();
  if (OTEL_ENABLED_VALUES.has(explicitFlag)) {
    return true;
  }
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

export function setupTracing(): void {
  if (globalThis.__recoderOtelInitialized) {
    return;
  }

  if (!shouldEnableTracing()) {
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'recoder-app';
  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

  void (async () => {
    try {
      const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] =
        await Promise.all([
          import('@opentelemetry/sdk-node'),
          import('@opentelemetry/exporter-trace-otlp-http'),
          import('@opentelemetry/auto-instrumentations-node'),
        ]);

      const traceExporter = new OTLPTraceExporter({ url: otlpEndpoint });
      const sdk = new NodeSDK({
        serviceName,
        // Workspace currently has mixed OTel minor lines; runtime is compatible,
        // but TypeScript sees incompatible exporter interfaces.
        traceExporter: traceExporter as any,
        instrumentations: [getNodeAutoInstrumentations()],
      });

      await sdk.start();
      globalThis.__recoderOtelInitialized = true;

      console.log(
        `[otel] tracing initialized (service=${serviceName}, endpoint=${otlpEndpoint})`
      );

      const shutdown = async () => {
        try {
          await sdk.shutdown();
          console.log('[otel] tracing shut down successfully');
        } catch (err) {
          console.error('[otel] error shutting down tracing:', err);
        }
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } catch (error) {
      console.warn(
        '[otel] tracing disabled due to initialization error:',
        error instanceof Error ? error.message : String(error)
      );
    }
  })();
}
