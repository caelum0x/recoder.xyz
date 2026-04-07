"use strict";
/**
 * @module rbac.service
 *
 * Role-Based Access Control (RBAC) service for the A2A ecosystem.
 *
 * Provides a hierarchical role system with fine-grained permission checking
 * across A2A resources (tasks, channels, agents, adapters, metrics).
 *
 * Roles (highest to lowest privilege):
 *   admin > operator > agent > viewer
 *
 * Features:
 * - Hierarchical roles with a configurable default permission matrix
 * - Principal management (role assignment, removal, listing)
 * - Permission checking with `isAllowed` / `enforce`
 * - Custom policy extension (addCustomPolicy)
 * - API key → principal mapping for downstream auth middleware
 * - In-memory storage, no external dependencies
 *
 * P18-001: A2A RBAC service (roles + permissions)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2ARBACService = exports.ROLE_HIERARCHY = void 0;
exports.getA2ARBACService = getA2ARBACService;
exports.resetA2ARBACService = resetA2ARBACService;
const a2a_1 = require("@recoder/shared/a2a");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-rbac');
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** All valid roles, ordered from highest privilege to lowest. */
exports.ROLE_HIERARCHY = [
    'admin',
    'operator',
    'agent',
    'viewer',
];
/** All possible actions. */
const ALL_ACTIONS = [
    'create',
    'read',
    'update',
    'delete',
    'execute',
];
// ---------------------------------------------------------------------------
// Default permission matrix
// ---------------------------------------------------------------------------
/**
 * The default RBAC policy matrix.
 *
 * | Resource | admin       | operator                    | agent          | viewer |
 * |----------|-------------|-----------------------------|----------------|--------|
 * | tasks    | all         | create,read,update,execute  | read,execute   | read   |
 * | channels | all         | create,read,update,delete   | read,create    | read   |
 * | agents   | all         | create,read,update,delete   | read           | read   |
 * | adapters | all         | create,read,update,delete   | read           | read   |
 * | metrics  | all         | read                        | read           | read   |
 */
const DEFAULT_POLICIES = [
    // admin — full access to every resource
    { role: 'admin', resource: 'tasks', actions: [...ALL_ACTIONS] },
    { role: 'admin', resource: 'channels', actions: [...ALL_ACTIONS] },
    { role: 'admin', resource: 'agents', actions: [...ALL_ACTIONS] },
    { role: 'admin', resource: 'adapters', actions: [...ALL_ACTIONS] },
    { role: 'admin', resource: 'metrics', actions: [...ALL_ACTIONS] },
    // operator — manage agents/adapters/channels; execute tasks; no role mgmt
    { role: 'operator', resource: 'tasks', actions: ['create', 'read', 'update', 'execute'] },
    { role: 'operator', resource: 'channels', actions: ['create', 'read', 'update', 'delete'] },
    { role: 'operator', resource: 'agents', actions: ['create', 'read', 'update', 'delete'] },
    { role: 'operator', resource: 'adapters', actions: ['create', 'read', 'update', 'delete'] },
    { role: 'operator', resource: 'metrics', actions: ['read'] },
    // agent — execute tasks, send messages (create on channels), read
    { role: 'agent', resource: 'tasks', actions: ['read', 'execute'] },
    { role: 'agent', resource: 'channels', actions: ['read', 'create'] },
    { role: 'agent', resource: 'agents', actions: ['read'] },
    { role: 'agent', resource: 'adapters', actions: ['read'] },
    { role: 'agent', resource: 'metrics', actions: ['read'] },
    // viewer — read-only
    { role: 'viewer', resource: 'tasks', actions: ['read'] },
    { role: 'viewer', resource: 'channels', actions: ['read'] },
    { role: 'viewer', resource: 'agents', actions: ['read'] },
    { role: 'viewer', resource: 'adapters', actions: ['read'] },
    { role: 'viewer', resource: 'metrics', actions: ['read'] },
];
// ---------------------------------------------------------------------------
// A2ARBACService
// ---------------------------------------------------------------------------
class A2ARBACService {
    /** principalId → A2APrincipal */
    principals = new Map();
    /** apiKey → principalId */
    apiKeys = new Map();
    /** Effective policies: role:resource → Set<action> */
    policyIndex = new Map();
    constructor() {
        this.rebuildPolicyIndex(DEFAULT_POLICIES);
    }
    // -- helpers --------------------------------------------------------------
    /** Build a lookup key for the policy index. */
    static policyKey(role, resource) {
        return `${role}:${resource}`;
    }
    /** Rebuild the policy index from a list of policies. */
    rebuildPolicyIndex(policies) {
        // Start with a fresh copy of the defaults every time, then layer custom
        // policies on top.  The constructor calls this with DEFAULT_POLICIES; later
        // `addCustomPolicy` just calls `mergePolicy` directly so we don't need to
        // rebuild from scratch.
        this.policyIndex.clear();
        for (const p of policies) {
            this.mergePolicy(p);
        }
    }
    /** Merge a single policy into the index (additive). */
    mergePolicy(policy) {
        const key = A2ARBACService.policyKey(policy.role, policy.resource);
        let existing = this.policyIndex.get(key);
        if (!existing) {
            existing = new Set();
            this.policyIndex.set(key, existing);
        }
        for (const action of policy.actions) {
            existing.add(action);
        }
    }
    // ---- Role assignment ----------------------------------------------------
    assignRole(principalId, role) {
        const existing = this.principals.get(principalId);
        const principal = {
            id: principalId,
            role,
            metadata: existing?.metadata,
        };
        this.principals.set(principalId, principal);
        logger.info({ principalId, role }, 'Role assigned');
    }
    removeRole(principalId) {
        const deleted = this.principals.delete(principalId);
        if (deleted) {
            logger.info({ principalId }, 'Role removed');
        }
    }
    getRole(principalId) {
        return this.principals.get(principalId)?.role;
    }
    listPrincipals(role) {
        const all = Array.from(this.principals.values());
        if (!role)
            return all;
        return all.filter((p) => p.role === role);
    }
    // ---- Permission checking ------------------------------------------------
    isAllowed(principalId, resource, action) {
        const principal = this.principals.get(principalId);
        if (!principal)
            return false;
        const key = A2ARBACService.policyKey(principal.role, resource);
        const actions = this.policyIndex.get(key);
        return actions ? actions.has(action) : false;
    }
    /**
     * Assert that the principal is allowed to perform the action on the resource.
     * Throws an `A2AStructuredError` with `AuthorizationDenied` if denied.
     */
    enforce(principalId, resource, action) {
        if (this.isAllowed(principalId, resource, action))
            return;
        const role = this.getRole(principalId) ?? 'unknown';
        const err = (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.AuthorizationDenied,
            message: `Principal '${principalId}' (role=${role}) is not allowed to ${action} ${resource}`,
            details: { principalId, role, resource, action },
        });
        throw new a2a_1.A2AStructuredError(err);
    }
    // ---- Policy management --------------------------------------------------
    getDefaultPolicies() {
        return DEFAULT_POLICIES.map((p) => ({ ...p, actions: [...p.actions] }));
    }
    addCustomPolicy(policy) {
        this.mergePolicy(policy);
        logger.info({ role: policy.role, resource: policy.resource, actions: policy.actions }, 'Custom policy added');
    }
    // ---- API key management -------------------------------------------------
    registerApiKey(apiKey, principalId) {
        this.apiKeys.set(apiKey, principalId);
        logger.info({ principalId }, 'API key registered');
    }
    resolveApiKey(apiKey) {
        return this.apiKeys.get(apiKey);
    }
    revokeApiKey(apiKey) {
        const deleted = this.apiKeys.delete(apiKey);
        if (deleted) {
            logger.info('API key revoked');
        }
    }
    // ---- Reset --------------------------------------------------------------
    reset() {
        this.principals.clear();
        this.apiKeys.clear();
        this.policyIndex.clear();
        this.rebuildPolicyIndex(DEFAULT_POLICIES);
        logger.info('RBAC service reset');
    }
}
exports.A2ARBACService = A2ARBACService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let singleton = null;
function getA2ARBACService() {
    if (!singleton) {
        singleton = new A2ARBACService();
    }
    return singleton;
}
function resetA2ARBACService() {
    if (singleton) {
        singleton.reset();
    }
    singleton = null;
}
