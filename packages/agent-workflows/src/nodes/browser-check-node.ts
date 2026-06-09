import type { WorkflowNode } from '../workflow-definition';

export function browserCheckNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'browser-check', label: 'Browser Check', config };
}
