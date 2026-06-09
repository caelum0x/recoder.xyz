import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';
import { sha256Hex, type LoadedInstructionSource } from '../provenance';

export type BeadsInstructionContext = {
  issueId: string;
  title: string;
  status?: string;
  dependencies?: string[];
  artifactRefs?: string[];
};

export function loadBeadsInstructionSource(context: BeadsInstructionContext): LoadedInstructionSource {
  const content = [
    `Beads issue: ${context.issueId}`,
    `Title: ${context.title}`,
    context.status ? `Status: ${context.status}` : undefined,
    context.dependencies?.length ? `Dependencies: ${context.dependencies.join(', ')}` : undefined,
    context.artifactRefs?.length ? `Artifacts: ${context.artifactRefs.join(', ')}` : undefined,
  ].filter(Boolean).join('\n');

  return {
    ref: {
      ref_id: `beads:${context.issueId}`,
      kind: InstructionSourceKindEnum.Custom,
      title: 'Beads task graph',
      path: `.beads/${context.issueId}`,
      sha: sha256Hex(content),
    },
    content,
  };
}
