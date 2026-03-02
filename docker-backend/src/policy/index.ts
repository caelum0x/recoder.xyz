/**
 * @module policy
 *
 * A2A Policy Hook Middleware System
 *
 * Provides policy enforcement for privileged actions in the docker-backend.
 * Intercepts requests, evaluates them against policy rules, checks for
 * existing approvals, and blocks unauthorized actions with POLICY_DENIED errors.
 *
 * Architecture:
 * - types.ts: Canonical types for actions, rules, approvals, decisions
 * - policy-engine.ts: Core evaluation logic and rule management
 * - approval-store.ts: In-memory approval record management
 * - policy-middleware.ts: Express middleware for route-level enforcement
 * - approval-routes.ts: REST API for approval CRUD operations
 * - audit-emitter.ts: Audit event emission for all policy decisions
 *
 * Usage:
 * ```ts
 * import {
 *   requirePolicyApproval,
 *   policyHookMiddleware,
 *   approvalRouter,
 * } from './policy/index.js';
 *
 * // Mount approval management routes
 * app.use('/api/a2a/approvals', approvalRouter);
 *
 * // Protect a specific route
 * app.post('/api/file/:projectId',
 *   requirePolicyApproval('file_system_write', {
 *     resource_extractor: 'params',
 *     resource_key: 'projectId',
 *   }),
 *   fileWriteHandler,
 * );
 *
 * // Or use automatic route matching
 * app.use('/api', policyHookMiddleware());
 * ```
 */

// -- Types ------------------------------------------------------------------
export {
  PrivilegedActionTypeEnum,
  PRIVILEGED_ACTION_TYPES,
  ApprovalStatusEnum,
  PolicyDecisionOutcomeEnum,
  type PrivilegedActionType,
  type PolicyRuleDisposition,
  type PolicyRule,
  type PolicyRuleset,
  type ApprovalStatus,
  type Approval,
  type CreateApprovalInput,
  type PolicyDecisionOutcome,
  type PolicyDecision,
  type PolicyCheckRequest,
  type RouteActionMapping,
} from './types.js';

// -- Policy Engine ----------------------------------------------------------
export {
  getPolicyRules,
  getPolicyRule,
  updatePolicyRules,
  resetPolicyRules,
  isPrivilegedAction,
  isValidActionType,
  evaluatePolicy,
} from './policy-engine.js';

// -- Approval Store ---------------------------------------------------------
export {
  createApproval,
  getApproval,
  getApprovalsByTask,
  findActiveApproval,
  revokeApproval,
  revokeAllTaskApprovals,
  getApprovalStoreStats,
  clearAllApprovals,
} from './approval-store.js';

// -- Middleware --------------------------------------------------------------
export {
  requirePolicyApproval,
  policyHookMiddleware,
  requireBodyActionApproval,
  DEFAULT_ROUTE_ACTION_MAPPINGS,
  type PolicyAwareRequest,
} from './policy-middleware.js';

// -- Approval Routes --------------------------------------------------------
export { approvalRouter } from './approval-routes.js';

// -- Audit Emitter ----------------------------------------------------------
export {
  PolicyAuditEventType,
  emitPolicyDecisionAudit,
  emitApprovalCreatedAudit,
  emitApprovalRevokedAudit,
  onPolicyAuditEvent,
  clearPolicyAuditHandlers,
  type PolicyAuditEvent,
  type PolicyAuditEventTypeValue,
  type PolicyAuditHandler,
} from './audit-emitter.js';
