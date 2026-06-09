import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createOpenClawAdapter(input?: RuntimeAdapterFactoryInput): ReturnType<typeof createGenericRuntimeAdapter> {
  const options = resolveGenericRuntimeAdapterOptions('custom', 'openclaw', input);

  return createGenericRuntimeAdapter({
    ...options,
    health: options.health ?? {
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      message: 'OpenClaw-derived runtime is adapter-only and does not own Recoder state.',
    },
  });
}
