"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearPolicyAuditHandlers = exports.onPolicyAuditEvent = exports.emitApprovalRevokedAudit = exports.emitApprovalCreatedAudit = exports.emitPolicyDecisionAudit = exports.PolicyAuditEventType = exports.approvalRouter = exports.DEFAULT_ROUTE_ACTION_MAPPINGS = exports.requireBodyActionApproval = exports.policyHookMiddleware = exports.requirePolicyApproval = exports.clearAllApprovals = exports.getApprovalStoreStats = exports.revokeAllTaskApprovals = exports.revokeApproval = exports.findActiveApproval = exports.getApprovalsByTask = exports.getApproval = exports.createApproval = exports.evaluatePolicy = exports.isValidActionType = exports.isPrivilegedAction = exports.resetPolicyRules = exports.updatePolicyRules = exports.getPolicyRule = exports.getPolicyRules = exports.PolicyDecisionOutcomeEnum = exports.ApprovalStatusEnum = exports.PRIVILEGED_ACTION_TYPES = exports.PrivilegedActionTypeEnum = void 0;
// -- Types ------------------------------------------------------------------
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "PrivilegedActionTypeEnum", { enumerable: true, get: function () { return types_js_1.PrivilegedActionTypeEnum; } });
Object.defineProperty(exports, "PRIVILEGED_ACTION_TYPES", { enumerable: true, get: function () { return types_js_1.PRIVILEGED_ACTION_TYPES; } });
Object.defineProperty(exports, "ApprovalStatusEnum", { enumerable: true, get: function () { return types_js_1.ApprovalStatusEnum; } });
Object.defineProperty(exports, "PolicyDecisionOutcomeEnum", { enumerable: true, get: function () { return types_js_1.PolicyDecisionOutcomeEnum; } });
// -- Policy Engine ----------------------------------------------------------
var policy_engine_js_1 = require("./policy-engine.js");
Object.defineProperty(exports, "getPolicyRules", { enumerable: true, get: function () { return policy_engine_js_1.getPolicyRules; } });
Object.defineProperty(exports, "getPolicyRule", { enumerable: true, get: function () { return policy_engine_js_1.getPolicyRule; } });
Object.defineProperty(exports, "updatePolicyRules", { enumerable: true, get: function () { return policy_engine_js_1.updatePolicyRules; } });
Object.defineProperty(exports, "resetPolicyRules", { enumerable: true, get: function () { return policy_engine_js_1.resetPolicyRules; } });
Object.defineProperty(exports, "isPrivilegedAction", { enumerable: true, get: function () { return policy_engine_js_1.isPrivilegedAction; } });
Object.defineProperty(exports, "isValidActionType", { enumerable: true, get: function () { return policy_engine_js_1.isValidActionType; } });
Object.defineProperty(exports, "evaluatePolicy", { enumerable: true, get: function () { return policy_engine_js_1.evaluatePolicy; } });
// -- Approval Store ---------------------------------------------------------
var approval_store_js_1 = require("./approval-store.js");
Object.defineProperty(exports, "createApproval", { enumerable: true, get: function () { return approval_store_js_1.createApproval; } });
Object.defineProperty(exports, "getApproval", { enumerable: true, get: function () { return approval_store_js_1.getApproval; } });
Object.defineProperty(exports, "getApprovalsByTask", { enumerable: true, get: function () { return approval_store_js_1.getApprovalsByTask; } });
Object.defineProperty(exports, "findActiveApproval", { enumerable: true, get: function () { return approval_store_js_1.findActiveApproval; } });
Object.defineProperty(exports, "revokeApproval", { enumerable: true, get: function () { return approval_store_js_1.revokeApproval; } });
Object.defineProperty(exports, "revokeAllTaskApprovals", { enumerable: true, get: function () { return approval_store_js_1.revokeAllTaskApprovals; } });
Object.defineProperty(exports, "getApprovalStoreStats", { enumerable: true, get: function () { return approval_store_js_1.getApprovalStoreStats; } });
Object.defineProperty(exports, "clearAllApprovals", { enumerable: true, get: function () { return approval_store_js_1.clearAllApprovals; } });
// -- Middleware --------------------------------------------------------------
var policy_middleware_js_1 = require("./policy-middleware.js");
Object.defineProperty(exports, "requirePolicyApproval", { enumerable: true, get: function () { return policy_middleware_js_1.requirePolicyApproval; } });
Object.defineProperty(exports, "policyHookMiddleware", { enumerable: true, get: function () { return policy_middleware_js_1.policyHookMiddleware; } });
Object.defineProperty(exports, "requireBodyActionApproval", { enumerable: true, get: function () { return policy_middleware_js_1.requireBodyActionApproval; } });
Object.defineProperty(exports, "DEFAULT_ROUTE_ACTION_MAPPINGS", { enumerable: true, get: function () { return policy_middleware_js_1.DEFAULT_ROUTE_ACTION_MAPPINGS; } });
// -- Approval Routes --------------------------------------------------------
var approval_routes_js_1 = require("./approval-routes.js");
Object.defineProperty(exports, "approvalRouter", { enumerable: true, get: function () { return approval_routes_js_1.approvalRouter; } });
// -- Audit Emitter ----------------------------------------------------------
var audit_emitter_js_1 = require("./audit-emitter.js");
Object.defineProperty(exports, "PolicyAuditEventType", { enumerable: true, get: function () { return audit_emitter_js_1.PolicyAuditEventType; } });
Object.defineProperty(exports, "emitPolicyDecisionAudit", { enumerable: true, get: function () { return audit_emitter_js_1.emitPolicyDecisionAudit; } });
Object.defineProperty(exports, "emitApprovalCreatedAudit", { enumerable: true, get: function () { return audit_emitter_js_1.emitApprovalCreatedAudit; } });
Object.defineProperty(exports, "emitApprovalRevokedAudit", { enumerable: true, get: function () { return audit_emitter_js_1.emitApprovalRevokedAudit; } });
Object.defineProperty(exports, "onPolicyAuditEvent", { enumerable: true, get: function () { return audit_emitter_js_1.onPolicyAuditEvent; } });
Object.defineProperty(exports, "clearPolicyAuditHandlers", { enumerable: true, get: function () { return audit_emitter_js_1.clearPolicyAuditHandlers; } });
