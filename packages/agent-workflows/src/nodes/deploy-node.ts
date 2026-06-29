import type { WorkflowNode } from '../workflow-definition';

/**
 * Config for a `deploy` node in the delivery pipeline.
 *
 * A deploy node is the terminal step of `verify -> approve -> pr -> deploy`. It is
 * intentionally degrade-safe at the contract level: every field is optional so an
 * orchestrator can express "deploy whatever the run produced" with `deployNode(id, {})`
 * while still allowing a fully-specified target. Production/customer-visible deploys
 * remain approval-gated by policy — set `requireApproval` (default true) so the runner
 * refuses to deploy when no approval has been recorded upstream.
 */
export type DeployNodeConfig = {
  /** Logical environment to deploy to (e.g. `preview`, `staging`, `production`). */
  environment?: string;
  /** Provider/target identifier (e.g. `vercel`, `pm2`, `docker`). */
  target?: string;
  /** Project/app slug the deploy belongs to. */
  project?: string;
  /** Git ref (branch/tag/sha) to deploy. */
  ref?: string;
  /**
   * Whether an upstream approval is required before this node may deploy. Defaults
   * to true so production-shaped deploys fail safe when no approval exists.
   */
  requireApproval?: boolean;
  /** Free-form extra config forwarded to the deploy handler. */
  [key: string]: unknown;
};

export function deployNode(nodeId: string, config: DeployNodeConfig = {}): WorkflowNode {
  return {
    nodeId,
    kind: 'deploy',
    label: 'Deploy',
    config: {
      requireApproval: true,
      ...config,
    },
  };
}
