import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createGeminiCliAdapter(input?: RuntimeAdapterFactoryInput) {
  return createGenericRuntimeAdapter(resolveGenericRuntimeAdapterOptions('gemini_cli', 'gemini-cli', input));
}
