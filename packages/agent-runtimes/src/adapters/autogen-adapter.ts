import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createAutoGenAdapter(input?: RuntimeAdapterFactoryInput): ReturnType<typeof createGenericRuntimeAdapter> {
  const options = resolveGenericRuntimeAdapterOptions('custom', 'autogen', input);

  return createGenericRuntimeAdapter({
    ...options,
    health: options.health ?? {
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      message: 'AutoGen is available only behind the RuntimeAdapter contract.',
    },
  });
}
