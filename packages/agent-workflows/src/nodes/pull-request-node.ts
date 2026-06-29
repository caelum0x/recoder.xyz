import type { WorkflowNode } from '../workflow-definition';

export type PullRequestNodeConfig = {
  repo: string;
  branch: string;
  baseBranch?: string;
  title: string;
  approvalRequired?: boolean;
  artifactRequired?: boolean;
};

export function pullRequestNode(nodeId: string, config: PullRequestNodeConfig): WorkflowNode {
  return {
    nodeId,
    kind: 'pull-request',
    label: 'Pull Request',
    config: {
      approvalRequired: true,
      artifactRequired: true,
      ...config,
    },
  };
}

/**
 * Alias for {@link pullRequestNode} matching the delivery-pipeline "open-pr"
 * naming (`verify -> approve -> pr -> deploy`). Produces an identical
 * `pull-request` node so existing consumers/handlers stay unchanged.
 */
export const openPrNode = pullRequestNode;
