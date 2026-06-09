import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { AgentVendorSurface, InstructionSourceRef } from '@recoder/a2a-sdk';
import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';

import { sha256Hex, type LoadedInstructionSource } from './provenance';

export interface LoadInstructionSourcesInput {
  repoRoot: string;
  vendorSurface: AgentVendorSurface;
}

function readSource(repoRoot: string, relativePath: string, kind: InstructionSourceRef['kind']): LoadedInstructionSource {
  const absolutePath = path.join(repoRoot, relativePath);
  const content = readFileSync(absolutePath, 'utf8');
  const sha = sha256Hex(content);

  return {
    ref: {
      ref_id: relativePath,
      kind,
      path: relativePath,
      sha,
      title: path.basename(relativePath),
    },
    content,
  };
}

export function loadInstructionSources(
  input: LoadInstructionSourcesInput,
): LoadedInstructionSource[] {
  const sources: LoadedInstructionSource[] = [];

  sources.push(readSource(input.repoRoot, 'AGENTS.md', InstructionSourceKindEnum.AgentsMd));

  if (input.vendorSurface === 'claude_code') {
    sources.push(readSource(input.repoRoot, 'CLAUDE.md', InstructionSourceKindEnum.ClaudeMd));
  }

  if (input.vendorSurface === 'codex') {
    sources.push(
      readSource(input.repoRoot, '.codex/AGENTS.md', InstructionSourceKindEnum.CodexOverride),
    );
  }

  if (input.vendorSurface === 'recoder_code') {
    const claudePath = path.join(input.repoRoot, 'CLAUDE.md');
    try {
      sources.push(readSource(input.repoRoot, 'CLAUDE.md', InstructionSourceKindEnum.ClaudeMd));
    } catch {
      void claudePath;
    }
  }

  return sources;
}
