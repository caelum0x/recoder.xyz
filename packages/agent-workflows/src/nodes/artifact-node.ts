import type { WorkflowNode } from '../workflow-definition';

export function artifactNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'artifact', label: 'Artifact', config };
}
