import type { TaskSpec } from '@recoder/agent-os';

export type WorkflowNodeKind =
  | 'agent'
  | 'tool'
  | 'condition'
  | 'parallel'
  | 'approval'
  | 'verification'
  | 'memory'
  | 'artifact'
  | 'pull-request'
  | 'deploy'
  | 'browser-check';

export type WorkflowNode = {
  nodeId: string;
  kind: WorkflowNodeKind;
  label: string;
  dependsOn?: string[];
  config: Record<string, unknown>;
};

export type WorkflowDefinition = {
  workflowId: string;
  name: string;
  version: string;
  taskIntent?: TaskSpec['intent'];
  nodes: WorkflowNode[];
  metadata?: Record<string, unknown>;
};

export function validateWorkflowDefinition(definition: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const nodeIds = new Set<string>();

  if (!definition.workflowId.trim()) errors.push('workflowId is required');
  if (!definition.name.trim()) errors.push('name is required');
  if (definition.nodes.length === 0) errors.push('at least one node is required');

  for (const node of definition.nodes) {
    if (!node.nodeId.trim()) errors.push('nodeId is required');
    if (nodeIds.has(node.nodeId)) errors.push(`duplicate nodeId: ${node.nodeId}`);
    nodeIds.add(node.nodeId);
  }

  for (const node of definition.nodes) {
    for (const dependency of node.dependsOn ?? []) {
      if (!nodeIds.has(dependency)) {
        errors.push(`node ${node.nodeId} depends on missing node ${dependency}`);
      }
    }
  }

  return errors;
}
