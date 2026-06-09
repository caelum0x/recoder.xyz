import { loadInstructionSources, type LoadInstructionSourcesInput } from '../source-loader';

export function loadCodexInstructions(input: Omit<LoadInstructionSourcesInput, 'vendorSurface'>) {
  return loadInstructionSources({ ...input, vendorSurface: 'codex' }).filter((source) => source.ref.path.startsWith('.codex/'));
}
