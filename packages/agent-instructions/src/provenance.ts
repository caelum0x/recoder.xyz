import { createHash } from 'node:crypto';

import type {
  InstructionBundleProvenance,
  InstructionSourceRef,
} from '@recoder/a2a-sdk';

export interface LoadedInstructionSource {
  ref: InstructionSourceRef;
  content: string;
}

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function buildInstructionProvenance(input: {
  compilerVersion: string;
  sources: LoadedInstructionSource[];
  compiledAt?: string;
}): InstructionBundleProvenance {
  return {
    source_files: input.sources
      .filter((source) => typeof source.ref.path === 'string' && source.ref.path.length > 0)
      .map((source) => ({
        path: source.ref.path!,
        sha: source.ref.sha ?? sha256Hex(source.content),
      })),
    compiled_at: input.compiledAt ?? new Date().toISOString(),
    compiler_version: input.compilerVersion,
  };
}
