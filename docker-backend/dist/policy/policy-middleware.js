"use strict";
/**
 * @module policy/policy-middleware
 *
 * Express middleware that intercepts requests with privileged actions
 * and enforces the policy engine's decisions.
 *
 * Usage:
 *
 * 1. As a route-level middleware for a specific action:
 *    ```ts
 *    app.post('/api/file/:projectId',
 *      requirePolicyApproval('file_system_write', { resource_extractor: 'params', resource_key: 'projectId' }),
 *      async (req, res) => { ... }
 *    );
 *    ```
 *
 * 2. As a general middleware using route-action mapping:
 *    ```ts
 *    app.use('/api/a2a', policyHookMiddleware);
 *    ```
 *
 * When a privileged action is detected and no valid approval exists,
 * the middleware responds with a 403 status and POLICY_DENIED error code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROUTE_ACTION_MAPPINGS = void 0;
exports.requirePolicyApproval = requirePolicyApproval;
exports.policyHookMiddleware = policyHookMiddleware;
exports.requireBodyActionApproval = requireBodyActionApproval;
const uuid_1 = require("uuid");
const logger_js_1 = require("../logger.js");
const policy_engine_js_1 = require("./policy-engine.js");
const audit_emitter_js_1 = require("./audit-emitter.js");
const types_js_1 = require("./types.js");
const logger = (0, logger_js_1.createLogger)('policy:middleware');
// ---------------------------------------------------------------------------
// Route-Action Mappings
// ---------------------------------------------------------------------------
/**
 * Default route-to-action mappings for the docker-backend.
 *
 * These map Express route patterns to their privileged action types,
 * allowing the general middleware to automatically detect privileged
 * actions without explicit per-route configuration.
 */
exports.DEFAULT_ROUTE_ACTION_MAPPINGS = [
    // File system write operations
    {
        methods: ['POST', 'PUT', 'DELETE'],
        pattern: '/api/file/',
        action: types_js_1.PrivilegedActionTypeEnum.FileSystemWrite,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    {
        methods: ['POST'],
        pattern: '/api/files/',
        action: types_js_1.PrivilegedActionTypeEnum.FileSystemWrite,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    {
        methods: ['POST'],
        pattern: '/api/folder/',
        action: types_js_1.PrivilegedActionTypeEnum.FileSystemWrite,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    {
        methods: ['POST'],
        pattern: '/api/mount/',
        action: types_js_1.PrivilegedActionTypeEnum.FileSystemWrite,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    // Code execution
    {
        methods: ['POST'],
        pattern: '/api/exec/',
        action: types_js_1.PrivilegedActionTypeEnum.CodeExecution,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    {
        methods: ['POST'],
        pattern: '/api/terminal/',
        action: types_js_1.PrivilegedActionTypeEnum.CodeExecution,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    // Deployment
    {
        methods: ['POST'],
        pattern: '/api/deploy/',
        action: types_js_1.PrivilegedActionTypeEnum.Deployment,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    // Secret access
    {
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        pattern: '/api/secrets/',
        action: types_js_1.PrivilegedActionTypeEnum.SecretAccess,
        resource_extractor: 'params',
        resource_key: 'projectId',
    },
    // Admin actions
    {
        methods: ['POST', 'PUT', 'DELETE'],
        pattern: '/api/admin/',
        action: types_js_1.PrivilegedActionTypeEnum.AdminAction,
        resource_extractor: 'path',
        resource_key: '',
    },
];
// ---------------------------------------------------------------------------
// Resource Extraction
// ---------------------------------------------------------------------------
/**
 * Extract the resource identifier from a request based on the mapping.
 */
function extractResource(req, mapping) {
    switch (mapping.resource_extractor) {
        case 'params':
            return req.params?.[mapping.resource_key] || req.path;
        case 'body':
            return req.body?.[mapping.resource_key] || req.path;
        case 'query':
            return req.query?.[mapping.resource_key] || req.path;
        case 'path':
            return req.path;
        default:
            return req.path;
    }
}
/**
 * Find the route-action mapping for a request.
 */
function findRouteMapping(req, mappings) {
    const method = req.method.toUpperCase();
    const path = req.path;
    for (const mapping of mappings) {
        if (mapping.methods.includes(method) &&
            path.startsWith(mapping.pattern)) {
            return mapping;
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// Error Response
// ---------------------------------------------------------------------------
/**
 * Build the POLICY_DENIED error response.
 */
function buildPolicyDeniedResponse(decision) {
    return {
        success: false,
        error: {
            code: 'POLICY_DENIED',
            category: 'policy',
            message: decision.reason,
            severity: 'medium',
            retryable: false,
            details: {
                action: decision.action,
                resource: decision.resource,
                rule: decision.rule,
                trace_id: decision.trace_id,
                task_id: decision.task_id,
                timestamp: decision.timestamp,
            },
        },
        timestamp: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Middleware: requirePolicyApproval (explicit per-route)
// ---------------------------------------------------------------------------
/**
 * Create middleware that requires policy approval for a specific action.
 *
 * This is the recommended approach for protecting individual routes
 * with known action types.
 *
 * @param action - The privileged action type required.
 * @param options - How to extract the resource identifier.
 * @returns Express middleware function.
 *
 * @example
 * ```ts
 * app.post('/api/file/:projectId',
 *   authenticateRequest,
 *   requirePolicyApproval('file_system_write', {
 *     resource_extractor: 'params',
 *     resource_key: 'projectId',
 *   }),
 *   fileWriteHandler,
 * );
 * ```
 */
function requirePolicyApproval(action, options = {}) {
    return (req, res, next) => {
        const actorId = req.userId || 'anonymous';
        const traceId = req.headers['x-trace-id'] ||
            req.headers['x-request-id'] ||
            (0, uuid_1.v4)();
        // Extract resource
        let resource;
        switch (options.resource_extractor) {
            case 'params':
                resource = req.params?.[options.resource_key || ''] || req.path;
                break;
            case 'body':
                resource = req.body?.[options.resource_key || ''] || req.path;
                break;
            case 'query':
                resource = req.query?.[options.resource_key || ''] || req.path;
                break;
            default:
                resource = req.path;
        }
        // Extract task ID from various sources
        const taskId = req.headers['x-task-id'] ||
            req.body?.task_id ||
            req.query?.task_id;
        // Extract actor roles
        const actorRoles = [];
        if (actorId === 'system' || actorId === 'admin') {
            actorRoles.push(actorId);
        }
        // Check for admin role from request
        const adminHeader = req.headers['x-admin-role'];
        if (adminHeader === 'true') {
            actorRoles.push('admin');
        }
        const checkRequest = {
            action,
            resource,
            actor_id: actorId,
            task_id: taskId,
            workspace_id: req.headers['x-workspace-id'] || 'default',
            trace_id: traceId,
            actor_roles: actorRoles,
        };
        const decision = (0, policy_engine_js_1.evaluatePolicy)(checkRequest);
        // Emit audit event
        (0, audit_emitter_js_1.emitPolicyDecisionAudit)(decision);
        // Attach decision to request for downstream handlers
        req.policyDecision = {
            outcome: decision.outcome,
            action: decision.action,
            resource: decision.resource,
            approval_id: decision.approval_id,
            trace_id: decision.trace_id,
        };
        if (decision.outcome === types_js_1.PolicyDecisionOutcomeEnum.Denied) {
            logger.warn({
                action,
                resource,
                actorId,
                taskId,
                traceId,
                reason: decision.reason,
            }, 'policy denied: privileged action blocked');
            res.status(403).json(buildPolicyDeniedResponse(decision));
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// Middleware: policyHookMiddleware (automatic route matching)
// ---------------------------------------------------------------------------
/**
 * General policy hook middleware that automatically detects privileged
 * actions based on the route-action mapping table.
 *
 * Mount this on a router prefix to automatically enforce policy on
 * all matching routes. Requests that don't match any mapping are
 * passed through without policy checks.
 *
 * @param customMappings - Optional custom route-action mappings.
 *                         Defaults to DEFAULT_ROUTE_ACTION_MAPPINGS.
 * @returns Express middleware function.
 *
 * @example
 * ```ts
 * app.use('/api', policyHookMiddleware());
 * ```
 */
function policyHookMiddleware(customMappings) {
    const mappings = customMappings || exports.DEFAULT_ROUTE_ACTION_MAPPINGS;
    return (req, res, next) => {
        const mapping = findRouteMapping(req, mappings);
        // No mapping found -> not a privileged action, pass through
        if (!mapping) {
            next();
            return;
        }
        const actorId = req.userId || 'anonymous';
        const traceId = req.headers['x-trace-id'] ||
            req.headers['x-request-id'] ||
            (0, uuid_1.v4)();
        const resource = extractResource(req, mapping);
        const taskId = req.headers['x-task-id'] ||
            req.body?.task_id ||
            req.query?.task_id;
        const actorRoles = [];
        if (actorId === 'system' || actorId === 'admin') {
            actorRoles.push(actorId);
        }
        const adminHeader = req.headers['x-admin-role'];
        if (adminHeader === 'true') {
            actorRoles.push('admin');
        }
        const checkRequest = {
            action: mapping.action,
            resource,
            actor_id: actorId,
            task_id: taskId,
            workspace_id: req.headers['x-workspace-id'] || 'default',
            trace_id: traceId,
            actor_roles: actorRoles,
        };
        const decision = (0, policy_engine_js_1.evaluatePolicy)(checkRequest);
        // Emit audit event
        (0, audit_emitter_js_1.emitPolicyDecisionAudit)(decision);
        // Attach decision to request
        req.policyDecision = {
            outcome: decision.outcome,
            action: decision.action,
            resource: decision.resource,
            approval_id: decision.approval_id,
            trace_id: decision.trace_id,
        };
        if (decision.outcome === types_js_1.PolicyDecisionOutcomeEnum.Denied) {
            logger.warn({
                action: mapping.action,
                resource,
                actorId,
                taskId,
                traceId,
                reason: decision.reason,
            }, 'policy denied: privileged action blocked by route mapping');
            res.status(403).json(buildPolicyDeniedResponse(decision));
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// Middleware: requireActionApproval (body-based action detection)
// ---------------------------------------------------------------------------
/**
 * Middleware that reads the action type from the request body.
 *
 * Useful for A2A task submission endpoints where the action type
 * is specified in the request payload rather than implied by the route.
 *
 * Expects the request body to contain:
 * - `action` or `action_type`: the privileged action type
 * - `resource`: the resource being acted upon
 *
 * If the action is not a known privileged action type, the request
 * is passed through without policy checks.
 *
 * @returns Express middleware function.
 */
function requireBodyActionApproval() {
    return (req, res, next) => {
        const body = req.body;
        const actionRaw = body?.action || body?.action_type;
        // No action specified or not a known action -> pass through
        if (!actionRaw || !(0, policy_engine_js_1.isValidActionType)(actionRaw)) {
            next();
            return;
        }
        const action = actionRaw;
        const resource = body?.resource || req.path;
        const actorId = req.userId || 'anonymous';
        const traceId = req.headers['x-trace-id'] ||
            req.headers['x-request-id'] ||
            (0, uuid_1.v4)();
        const taskId = body?.task_id || req.headers['x-task-id'];
        const actorRoles = [];
        if (actorId === 'system' || actorId === 'admin') {
            actorRoles.push(actorId);
        }
        const adminHeader = req.headers['x-admin-role'];
        if (adminHeader === 'true') {
            actorRoles.push('admin');
        }
        const checkRequest = {
            action,
            resource,
            actor_id: actorId,
            task_id: taskId,
            workspace_id: body?.workspace_id || req.headers['x-workspace-id'] || 'default',
            trace_id: traceId,
            actor_roles: actorRoles,
        };
        const decision = (0, policy_engine_js_1.evaluatePolicy)(checkRequest);
        // Emit audit event
        (0, audit_emitter_js_1.emitPolicyDecisionAudit)(decision);
        req.policyDecision = {
            outcome: decision.outcome,
            action: decision.action,
            resource: decision.resource,
            approval_id: decision.approval_id,
            trace_id: decision.trace_id,
        };
        if (decision.outcome === types_js_1.PolicyDecisionOutcomeEnum.Denied) {
            logger.warn({
                action,
                resource,
                actorId,
                taskId,
                traceId,
                reason: decision.reason,
            }, 'policy denied: body-specified action blocked');
            res.status(403).json(buildPolicyDeniedResponse(decision));
            return;
        }
        next();
    };
}
