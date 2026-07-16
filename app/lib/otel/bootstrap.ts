declare global {
  // eslint-disable-next-line no-var
  var __recoderOtelInitialized: boolean | undefined;
}

export async function initOpenTelemetry() {
  if (globalThis.__recoderOtelInitialized) {
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'recoder-app';

  try {
    const [{ NodeSDK }, { getNodeAutoInstrumentations }] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/auto-instrumentations-node'),
    ]);

    const sdk = new NodeSDK({
      serviceName,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    await sdk.start();
    globalThis.__recoderOtelInitialized = true;
    console.log(`[otel] initialized (service=${serviceName})`);
  } catch (error) {
    console.warn(
      '[otel] dependencies missing or failed to initialize:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

export {};
