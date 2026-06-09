import { loadInstructionSources, type LoadInstructionSourcesInput } from '../source-loader';

export function loadAgentsMd(input: Omit<LoadInstructionSourcesInput, 'vendorSurface'>) {
  return loadInstructionSources({ ...input, vendorSurface: 'custom' }).filter((source) => source.ref.path === 'AGENTS.md');
}
