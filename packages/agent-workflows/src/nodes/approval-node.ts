import type { WorkflowNode } from '../workflow-definition';

export function approvalNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'approval', label: 'Approval', config };
}
