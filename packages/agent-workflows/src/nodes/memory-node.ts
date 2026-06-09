import type { WorkflowNode } from '../workflow-definition';

export function memoryNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'memory', label: 'Memory', config };
}
