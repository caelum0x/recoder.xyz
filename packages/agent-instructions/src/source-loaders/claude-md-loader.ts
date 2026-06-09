import { loadInstructionSources, type LoadInstructionSourcesInput } from '../source-loader';

export function loadClaudeMd(input: Omit<LoadInstructionSourcesInput, 'vendorSurface'>) {
  return loadInstructionSources({ ...input, vendorSurface: 'claude_code' }).filter((source) => source.ref.path === 'CLAUDE.md');
}
