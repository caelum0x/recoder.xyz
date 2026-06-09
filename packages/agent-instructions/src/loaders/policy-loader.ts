import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';
import { sha256Hex, type LoadedInstructionSource } from '../provenance';

export type PolicyInstructionContext = {
  policyId: string;
  decisions: Array<{
    action: string;
    effect: string;
    reason: string;
  }>;
};

export function loadPolicyInstructionSource(context: PolicyInstructionContext): LoadedInstructionSource {
  const content = [
    `Policy: ${context.policyId}`,
    ...context.decisions.map((decision) => `${decision.effect}: ${decision.action} - ${decision.reason}`),
  ].join('\n');

  return {
    ref: {
      ref_id: `policy:${context.policyId}`,
      kind: InstructionSourceKindEnum.RepoPolicy,
      title: 'Recoder policy decisions',
      path: `policy/${context.policyId}`,
      sha: sha256Hex(content),
    },
    content,
  };
}
