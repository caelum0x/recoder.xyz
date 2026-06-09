import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createOpenCodeAdapter(input?: RuntimeAdapterFactoryInput) {
  return createGenericRuntimeAdapter(resolveGenericRuntimeAdapterOptions('opencode', 'opencode', input));
}
