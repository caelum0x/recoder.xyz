import type { WorkflowNode } from '../workflow-definition';

export function deployNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'deploy', label: 'Deploy', config };
}
