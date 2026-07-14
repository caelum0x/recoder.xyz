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

import {
  A2AErrorCodeEnum,
  buildA2AError,
  A2AStructuredError,
} from '@recoder/shared/a2a';
import { createLogger } from '../logger';

const logger = createLogger('a2a-rbac');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type A2ARole = 'admin' | 'operator' | 'agent' | 'viewer';
export type A2AResource = 'tasks' | 'channels' | 'agents' | 'adapters' | 'metrics';
export type A2AAction = 'create' | 'read' | 'update' | 'delete' | 'execute';

export interface A2APrincipal {
  id: string;
  role: A2ARole;
  metadata?: Record<string, string>;
}

export interface RBACPolicy {
  role: A2ARole;
  resource: A2AResource;
  actions: A2AAction[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All valid roles, ordered from highest privilege to lowest. */
export const ROLE_HIERARCHY: readonly A2ARole[] = [
  'admin',
  'operator',
  'agent',
  'viewer',
] as const;

/** All possible actions. */
const ALL_ACTIONS: readonly A2AAction[] = [
  'create',
  'read',
  'update',
  'delete',
  'execute',
] as const;

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
const DEFAULT_POLICIES: RBACPolicy[] = [
  // admin — full access to every resource
  { role: 'admin', resource: 'tasks',    actions: [...ALL_ACTIONS] },
  { role: 'admin', resource: 'channels', actions: [...ALL_ACTIONS] },
  { role: 'admin', resource: 'agents',   actions: [...ALL_ACTIONS] },
  { role: 'admin', resource: 'adapters', actions: [...ALL_ACTIONS] },
  { role: 'admin', resource: 'metrics',  actions: [...ALL_ACTIONS] },

  // operator — manage agents/adapters/channels; execute tasks; no role mgmt
  { role: 'operator', resource: 'tasks',    actions: ['create', 'read', 'update', 'execute'] },
  { role: 'operator', resource: 'channels', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'operator', resource: 'agents',   actions: ['create', 'read', 'update', 'delete'] },
  { role: 'operator', resource: 'adapters', actions: ['create', 'read', 'update', 'delete'] },
  { role: 'operator', resource: 'metrics',  actions: ['read'] },

  // agent — execute tasks, send messages (create on channels), read
  { role: 'agent', resource: 'tasks',    actions: ['read', 'execute'] },
  { role: 'agent', resource: 'channels', actions: ['read', 'create'] },
  { role: 'agent', resource: 'agents',   actions: ['read'] },
  { role: 'agent', resource: 'adapters', actions: ['read'] },
  { role: 'agent', resource: 'metrics',  actions: ['read'] },

  // viewer — read-only
  { role: 'viewer', resource: 'tasks',    actions: ['read'] },
  { role: 'viewer', resource: 'channels', actions: ['read'] },
  { role: 'viewer', resource: 'agents',   actions: ['read'] },
  { role: 'viewer', resource: 'adapters', actions: ['read'] },
  { role: 'viewer', resource: 'metrics',  actions: ['read'] },
];

// ---------------------------------------------------------------------------
// A2ARBACService
// ---------------------------------------------------------------------------

export class A2ARBACService {
  /** principalId → A2APrincipal */
  private principals = new Map<string, A2APrincipal>();

  /** apiKey → principalId */
  private apiKeys = new Map<string, string>();

  /** Effective policies: role:resource → Set<action> */
  private policyIndex = new Map<string, Set<A2AAction>>();

  constructor() {
    this.rebuildPolicyIndex(DEFAULT_POLICIES);
  }

  // -- helpers --------------------------------------------------------------

  /** Build a lookup key for the policy index. */
  private static policyKey(role: A2ARole, resource: A2AResource): string {
    return `${role}:${resource}`;
  }

  /** Rebuild the policy index from a list of policies. */
  private rebuildPolicyIndex(policies: RBACPolicy[]): void {
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
  private mergePolicy(policy: RBACPolicy): void {
    const key = A2ARBACService.policyKey(policy.role, policy.resource);
    let existing = this.policyIndex.get(key);
    if (!existing) {
      existing = new Set<A2AAction>();
      this.policyIndex.set(key, existing);
    }
    for (const action of policy.actions) {
      existing.add(action);
    }
  }

  // ---- Role assignment ----------------------------------------------------

  assignRole(principalId: string, role: A2ARole): void {
    const existing = this.principals.get(principalId);
    const principal: A2APrincipal = {
      id: principalId,
      role,
      metadata: existing?.metadata,
    };
    this.principals.set(principalId, principal);
    logger.info({ principalId, role }, 'Role assigned');
  }

  removeRole(principalId: string): void {
    const deleted = this.principals.delete(principalId);
    if (deleted) {
      logger.info({ principalId }, 'Role removed');
    }
  }

  getRole(principalId: string): A2ARole | undefined {
    return this.principals.get(principalId)?.role;
  }

  listPrincipals(role?: A2ARole): A2APrincipal[] {
    const all = Array.from(this.principals.values());
    if (!role) return all;
    return all.filter((p) => p.role === role);
  }

  // ---- Permission checking ------------------------------------------------

  isAllowed(principalId: string, resource: A2AResource, action: A2AAction): boolean {
    const principal = this.principals.get(principalId);
    if (!principal) return false;

    const key = A2ARBACService.policyKey(principal.role, resource);
    const actions = this.policyIndex.get(key);
    return actions ? actions.has(action) : false;
  }

  /**
   * Assert that the principal is allowed to perform the action on the resource.
   * Throws an `A2AStructuredError` with `AuthorizationDenied` if denied.
   */
  enforce(principalId: string, resource: A2AResource, action: A2AAction): void {
    if (this.isAllowed(principalId, resource, action)) return;

    const role = this.getRole(principalId) ?? 'unknown';
    const err = buildA2AError({
      code: A2AErrorCodeEnum.AuthorizationDenied,
      message: `Principal '${principalId}' (role=${role}) is not allowed to ${action} ${resource}`,
      details: { principalId, role, resource, action },
    });
    throw new A2AStructuredError(err);
  }

  // ---- Policy management --------------------------------------------------

  getDefaultPolicies(): RBACPolicy[] {
    return DEFAULT_POLICIES.map((p) => ({ ...p, actions: [...p.actions] }));
  }

  addCustomPolicy(policy: RBACPolicy): void {
    this.mergePolicy(policy);
    logger.info(
      { role: policy.role, resource: policy.resource, actions: policy.actions },
      'Custom policy added',
    );
  }

  // ---- API key management -------------------------------------------------

  registerApiKey(apiKey: string, principalId: string): void {
    this.apiKeys.set(apiKey, principalId);
    logger.info({ principalId }, 'API key registered');
  }

  resolveApiKey(apiKey: string): string | undefined {
    return this.apiKeys.get(apiKey);
  }

  revokeApiKey(apiKey: string): void {
    const deleted = this.apiKeys.delete(apiKey);
    if (deleted) {
      logger.info('API key revoked');
    }
  }

  // ---- Reset --------------------------------------------------------------

  reset(): void {
    this.principals.clear();
    this.apiKeys.clear();
    this.policyIndex.clear();
    this.rebuildPolicyIndex(DEFAULT_POLICIES);
    logger.info('RBAC service reset');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let singleton: A2ARBACService | null = null;

export function getA2ARBACService(): A2ARBACService {
  if (!singleton) {
    singleton = new A2ARBACService();
  }
  return singleton;
}

export function resetA2ARBACService(): void {
  if (singleton) {
    singleton.reset();
  }
  singleton = null;
}
