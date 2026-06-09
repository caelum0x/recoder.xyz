import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';
import { sha256Hex, type LoadedInstructionSource } from '../provenance';

export type MemoryInstructionContext = {
  memoryId: string;
  scope: string;
  title: string;
  body: string;
  evidence?: string;
};

export function loadMemoryInstructionSource(context: MemoryInstructionContext): LoadedInstructionSource {
  const content = [
    `Memory ${context.memoryId}`,
    `Scope: ${context.scope}`,
    `Title: ${context.title}`,
    context.body,
    context.evidence ? `Evidence: ${context.evidence}` : undefined,
  ].filter(Boolean).join('\n');

  return {
    ref: {
      ref_id: `memory:${context.memoryId}`,
      kind: InstructionSourceKindEnum.Memory,
      title: context.title,
      path: `memory/${context.memoryId}`,
      sha: sha256Hex(content),
    },
    content,
  };
}
