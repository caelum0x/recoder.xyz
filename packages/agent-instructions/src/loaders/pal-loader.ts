import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';
import { sha256Hex, type LoadedInstructionSource } from '../provenance';

export type PALInstructionContext = {
  taskId: string;
  primaryRuntime: string;
  reviewerRuntime?: string;
  skills: string[];
  mcpTools: string[];
  risk: string;
};

export function loadPALInstructionSource(context: PALInstructionContext): LoadedInstructionSource {
  const content = [
    `PAL plan for task ${context.taskId}`,
    `Primary runtime: ${context.primaryRuntime}`,
    context.reviewerRuntime ? `Reviewer runtime: ${context.reviewerRuntime}` : undefined,
    `Skills: ${context.skills.join(', ') || 'none'}`,
    `MCP tools: ${context.mcpTools.join(', ') || 'none'}`,
    `Risk: ${context.risk}`,
  ].filter(Boolean).join('\n');

  return {
    ref: {
      ref_id: `pal:${context.taskId}`,
      kind: InstructionSourceKindEnum.Custom,
      title: 'PAL plan',
      path: `pal/${context.taskId}`,
      sha: sha256Hex(content),
    },
    content,
  };
}
