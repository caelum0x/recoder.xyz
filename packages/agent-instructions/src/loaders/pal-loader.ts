import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';
import { sha256Hex, type LoadedInstructionSource } from '../provenance';

export type PALInstructionContext = {
  taskId: string;
  primaryRuntime: string;
  reviewerRuntime?: string;
  skills: string[];
  mcpTools: string[];
  mcpToolGrants?: Array<{
    serverId: string;
    toolName: string;
    mode?: string;
    reason?: string;
  }>;
  risk: string;
};

export function loadPALInstructionSource(context: PALInstructionContext): LoadedInstructionSource {
  const grantLines = (context.mcpToolGrants ?? []).map((grant) => {
    const mode = grant.mode ? ` (${grant.mode})` : '';
    const reason = grant.reason ? `: ${grant.reason}` : '';
    return `- ${grant.serverId}/${grant.toolName}${mode}${reason}`;
  });
  const content = [
    `PAL plan for task ${context.taskId}`,
    `Primary runtime: ${context.primaryRuntime}`,
    context.reviewerRuntime ? `Reviewer runtime: ${context.reviewerRuntime}` : undefined,
    `Skills: ${context.skills.join(', ') || 'none'}`,
    `MCP tools: ${context.mcpTools.join(', ') || 'none'}`,
    grantLines.length > 0 ? ['MCP tool grants:', ...grantLines].join('\n') : 'MCP tool grants: none',
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
