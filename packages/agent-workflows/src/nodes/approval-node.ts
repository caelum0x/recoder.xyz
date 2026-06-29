import type { WorkflowNode } from '../workflow-definition';

export function approvalNode(nodeId: string, config: Record<string, unknown>): WorkflowNode {
  return { nodeId, kind: 'approval', label: 'Approval', config };
}

/**
 * Config for an `approval-wait` node in the delivery pipeline.
 *
 * Unlike the generic `approval` node (which an approval handler may resolve
 * synchronously), an `approval-wait` node ALWAYS parks the run in `waiting` until an
 * external `approval_decision` signal arrives. This is the explicit human gate that
 * sits between `verify` and `pr`/`deploy` in `verify -> approve -> pr -> deploy`.
 */
export type ApprovalWaitNodeConfig = {
  /** Why approval is being requested (surfaced to the approver). */
  reason?: string;
  /** Lifecycle point this gate guards (mirrors Approval.requiredAt semantics). */
  requiredAt?:
    | 'before_execution'
    | 'before_write'
    | 'before_push'
    | 'before_pr'
    | 'before_sensitive_action'
    | 'after_verification'
    | 'custom';
  /** Who/what is being asked to approve (path/command/tool). */
  target?: {
    path?: string;
    command?: string;
    toolName?: string;
  };
  /** Free-form extra config forwarded to the approval handler. */
  [key: string]: unknown;
};

export function approvalWaitNode(nodeId: string, config: ApprovalWaitNodeConfig = {}): WorkflowNode {
  return {
    nodeId,
    kind: 'approval-wait',
    label: 'Approval Wait',
    config: {
      requiredAt: 'after_verification',
      ...config,
    },
  };
}
