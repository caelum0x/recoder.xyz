import type { Approval } from '@recoder/agent-os';

/**
 * The governance/agent-os approval gate. Distribution waits on it and never
 * opens it: any customer-visible delivery pauses on `approval_requested` and
 * only proceeds on a recorded `Approval{status:'approved'}`.
 */
export interface ApprovalPort {
  /**
   * Request an approval for a customer-visible delivery. Returns the recorded
   * Approval (typically `pending`). Distribution does not decide it.
   */
  requestApproval(input: {
    taskId: string;
    reason: string;
    requestedBy: string;
    target?: { command?: string; path?: string; toolName?: string };
  }): Promise<Approval>;

  /** Look up a recorded approval by id. Null when none exists. */
  getApproval(approvalId: string): Promise<Approval | null>;
}
