import type { WorkflowNode } from '../workflow-definition';

export function toolNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'tool', label: 'Tool', config };
}
