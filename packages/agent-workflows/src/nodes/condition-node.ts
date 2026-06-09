import type { WorkflowNode } from '../workflow-definition';

export function conditionNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'condition', label: 'Condition', config };
}
