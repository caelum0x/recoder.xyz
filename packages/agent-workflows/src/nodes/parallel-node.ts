import type { WorkflowNode } from '../workflow-definition';

export function parallelNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'parallel', label: 'Parallel', config };
}
