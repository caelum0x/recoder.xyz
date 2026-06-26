import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';
import { sha256Hex, type LoadedInstructionSource } from '../provenance';

export type RecoderGitInstructionContext = {
  taskId: string;
  impactedPackages: string[];
  relatedTests: string[];
  riskSummary?: string;
};

export function loadRecoderGitInstructionSource(context: RecoderGitInstructionContext): LoadedInstructionSource {
  const content = [
    `Git Nexus context for task ${context.taskId}`,
    `Impacted packages: ${context.impactedPackages.join(', ') || 'none declared'}`,
    `Related tests: ${context.relatedTests.join(', ') || 'none declared'}`,
    context.riskSummary ? `Risk: ${context.riskSummary}` : undefined,
  ].filter(Boolean).join('\n');

  return {
    ref: {
      ref_id: `git_nexus:${context.taskId}`,
      kind: InstructionSourceKindEnum.Custom,
      title: 'Git Nexus context pack',
      path: `git-nexus/${context.taskId}`,
      sha: sha256Hex(content),
    },
    content,
  };
}
