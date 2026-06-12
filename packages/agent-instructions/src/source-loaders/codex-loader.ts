import { loadInstructionSources, type LoadInstructionSourcesInput } from '../source-loader';

export function loadCodexInstructions(input: Omit<LoadInstructionSourcesInput, 'vendorSurface'>) {
  return loadInstructionSources({ ...input, vendorSurface: 'codex' }).filter(
    (source) => typeof source.ref.path === 'string' && source.ref.path.startsWith('.codex/'),
  );
}
