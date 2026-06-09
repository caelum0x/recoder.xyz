import type { WorkflowNode } from '../workflow-definition';

export function agentNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'agent', label: 'Agent', config };
}
