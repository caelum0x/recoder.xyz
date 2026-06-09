import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createClaudeCodeAdapter(input?: RuntimeAdapterFactoryInput) {
  return createGenericRuntimeAdapter(resolveGenericRuntimeAdapterOptions('claude_code', 'claude-code', input));
}
