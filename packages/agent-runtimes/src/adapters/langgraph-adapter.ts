import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createLangGraphAdapter(input?: RuntimeAdapterFactoryInput): ReturnType<typeof createGenericRuntimeAdapter> {
  const options = resolveGenericRuntimeAdapterOptions('custom', 'langgraph', input);

  return createGenericRuntimeAdapter({
    ...options,
    health: options.health ?? {
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      message: 'LangGraph is available only behind the RuntimeAdapter contract.',
    },
  });
}
