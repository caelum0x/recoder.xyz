import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createCrewAIAdapter(input?: RuntimeAdapterFactoryInput): ReturnType<typeof createGenericRuntimeAdapter> {
  const options = resolveGenericRuntimeAdapterOptions('custom', 'crewai', input);

  return createGenericRuntimeAdapter({
    ...options,
    health: options.health ?? {
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      message: 'CrewAI is available only behind the RuntimeAdapter contract.',
    },
  });
}
