import {
  createGenericRuntimeAdapter,
  resolveGenericRuntimeAdapterOptions,
  type RuntimeAdapterFactoryInput,
} from './generic-adapter';

export function createRecoderCodeAdapter(input?: RuntimeAdapterFactoryInput) {
  return createGenericRuntimeAdapter(resolveGenericRuntimeAdapterOptions('recoder_code', 'recoder-code', input));
}
