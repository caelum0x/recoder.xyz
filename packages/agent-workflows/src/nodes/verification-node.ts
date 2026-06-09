import type { WorkflowNode } from '../workflow-definition';

export function verificationNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'verification', label: 'Verification', config };
}
