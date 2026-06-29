/**
 * Conductor / Agent OS module (mobile monitor + approve).
 *
 * Read-only monitor of parallel agent workspaces + their RunEvents, plus the
 * approve/reject decision surface over the canonical Recoder control plane.
 * Mobile is monitor/approve only — it does NOT author or launch workspaces.
 */

export * from './types';
export {
  fetchWorkspaces,
  fetchWorkspaceEvents,
  fetchApprovals,
  approveApproval,
  rejectApproval,
} from './api';
export {
  conductorKeys,
  useWorkspaces,
  useWorkspaceEvents,
  useApprovals,
  useDecideApproval,
} from './hooks';
