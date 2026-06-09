import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createQwenCodeAdapter(input?: RuntimeAdapterFactoryInput) {
  return createGenericRuntimeAdapter(resolveGenericRuntimeAdapterOptions('qwen_code', 'qwen-code', input));
}
