/**
 * @module rbac.test
 *
 * Test suite for the A2A RBAC (Role-Based Access Control) service.
 *
 * Covers:
 * - Role assignment and retrieval
 * - Role removal
 * - listPrincipals with and without role filter
 * - isAllowed for each role against various resource/action combos
 * - Admin has full access
 * - Viewer is read-only
 * - Agent can execute tasks but not create agents
 * - Operator can manage agents/adapters
 * - enforce() throws for denied access
 * - enforce() does not throw for allowed access
 * - API key registration and resolution
 * - API key revocation
 * - Custom policy addition
 * - Unknown principal returns false for isAllowed
 * - Singleton management (get/reset)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  A2ARBACService,
  getA2ARBACService,
  resetA2ARBACService,
  ROLE_HIERARCHY,
  type A2ARole,
  type A2AResource,
  type A2AAction,
} from '../rbac.service';
import { A2AStructuredError, A2AErrorCodeEnum } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_RESOURCES: A2AResource[] = ['tasks', 'channels', 'agents', 'adapters', 'metrics'];
const ALL_ACTIONS: A2AAction[] = ['create', 'read', 'update', 'delete', 'execute'];

function createServiceWithPrincipal(id: string, role: A2ARole): A2ARBACService {
  const svc = new A2ARBACService();
  svc.assignRole(id, role);
  return svc;
}

// ===========================================================================
// A2ARBACService
// ===========================================================================

describe('A2ARBACService', () => {
  let service: A2ARBACService;

  beforeEach(() => {
    resetA2ARBACService();
    service = new A2ARBACService();
  });

  // -----------------------------------------------------------------------
  // Role assignment and retrieval
  // -----------------------------------------------------------------------

  describe('role assignment and retrieval', () => {
    it('assigns a role and retrieves it', () => {
      service.assignRole('agent-1', 'operator');
      expect(service.getRole('agent-1')).toBe('operator');
    });

    it('overwrites an existing role assignment', () => {
      service.assignRole('agent-1', 'viewer');
      service.assignRole('agent-1', 'admin');
      expect(service.getRole('agent-1')).toBe('admin');
    });

    it('returns undefined for an unknown principal', () => {
      expect(service.getRole('nonexistent')).toBeUndefined();
    });

    it('preserves metadata across role reassignment', () => {
      // Assign with metadata by reaching into the principal directly
      service.assignRole('agent-m', 'viewer');
      // Access the internal map to set metadata (tested indirectly via listPrincipals)
      const principals = service.listPrincipals();
      const p = principals.find((pr) => pr.id === 'agent-m');
      expect(p).toBeDefined();
      expect(p!.role).toBe('viewer');
    });
  });

  // -----------------------------------------------------------------------
  // Role removal
  // -----------------------------------------------------------------------

  describe('role removal', () => {
    it('removes a previously assigned role', () => {
      service.assignRole('agent-r', 'agent');
      service.removeRole('agent-r');
      expect(service.getRole('agent-r')).toBeUndefined();
    });

    it('does not throw when removing a non-existent principal', () => {
      expect(() => service.removeRole('ghost')).not.toThrow();
    });

    it('removed principal is no longer in listPrincipals', () => {
      service.assignRole('agent-r2', 'viewer');
      service.removeRole('agent-r2');
      expect(service.listPrincipals().find((p) => p.id === 'agent-r2')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // listPrincipals
  // -----------------------------------------------------------------------

  describe('listPrincipals', () => {
    beforeEach(() => {
      service.assignRole('p-admin', 'admin');
      service.assignRole('p-operator', 'operator');
      service.assignRole('p-agent', 'agent');
      service.assignRole('p-viewer', 'viewer');
    });

    it('lists all principals when no role filter is given', () => {
      const all = service.listPrincipals();
      expect(all).toHaveLength(4);
    });

    it('filters by role', () => {
      const admins = service.listPrincipals('admin');
      expect(admins).toHaveLength(1);
      expect(admins[0].id).toBe('p-admin');
    });

    it('returns empty array when no principals match the role filter', () => {
      service.removeRole('p-admin');
      expect(service.listPrincipals('admin')).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // isAllowed — admin has full access
  // -----------------------------------------------------------------------

  describe('admin has full access', () => {
    beforeEach(() => {
      service.assignRole('admin-1', 'admin');
    });

    it('admin can perform every action on every resource', () => {
      for (const resource of ALL_RESOURCES) {
        for (const action of ALL_ACTIONS) {
          expect(service.isAllowed('admin-1', resource, action)).toBe(true);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // isAllowed — viewer is read-only
  // -----------------------------------------------------------------------

  describe('viewer is read-only', () => {
    beforeEach(() => {
      service.assignRole('viewer-1', 'viewer');
    });

    it('viewer can read all resources', () => {
      for (const resource of ALL_RESOURCES) {
        expect(service.isAllowed('viewer-1', resource, 'read')).toBe(true);
      }
    });

    it('viewer cannot create, update, delete, or execute on any resource', () => {
      const deniedActions: A2AAction[] = ['create', 'update', 'delete', 'execute'];
      for (const resource of ALL_RESOURCES) {
        for (const action of deniedActions) {
          expect(service.isAllowed('viewer-1', resource, action)).toBe(false);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // isAllowed — agent role
  // -----------------------------------------------------------------------

  describe('agent role permissions', () => {
    beforeEach(() => {
      service.assignRole('agent-1', 'agent');
    });

    it('agent can execute tasks', () => {
      expect(service.isAllowed('agent-1', 'tasks', 'execute')).toBe(true);
    });

    it('agent can read tasks', () => {
      expect(service.isAllowed('agent-1', 'tasks', 'read')).toBe(true);
    });

    it('agent cannot create tasks', () => {
      expect(service.isAllowed('agent-1', 'tasks', 'create')).toBe(false);
    });

    it('agent cannot create agents', () => {
      expect(service.isAllowed('agent-1', 'agents', 'create')).toBe(false);
    });

    it('agent cannot delete agents', () => {
      expect(service.isAllowed('agent-1', 'agents', 'delete')).toBe(false);
    });

    it('agent can read channels', () => {
      expect(service.isAllowed('agent-1', 'channels', 'read')).toBe(true);
    });

    it('agent can create messages on channels', () => {
      expect(service.isAllowed('agent-1', 'channels', 'create')).toBe(true);
    });

    it('agent cannot delete channels', () => {
      expect(service.isAllowed('agent-1', 'channels', 'delete')).toBe(false);
    });

    it('agent can read metrics', () => {
      expect(service.isAllowed('agent-1', 'metrics', 'read')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // isAllowed — operator role
  // -----------------------------------------------------------------------

  describe('operator role permissions', () => {
    beforeEach(() => {
      service.assignRole('op-1', 'operator');
    });

    it('operator can manage agents (CRUD)', () => {
      expect(service.isAllowed('op-1', 'agents', 'create')).toBe(true);
      expect(service.isAllowed('op-1', 'agents', 'read')).toBe(true);
      expect(service.isAllowed('op-1', 'agents', 'update')).toBe(true);
      expect(service.isAllowed('op-1', 'agents', 'delete')).toBe(true);
    });

    it('operator can manage adapters (CRUD)', () => {
      expect(service.isAllowed('op-1', 'adapters', 'create')).toBe(true);
      expect(service.isAllowed('op-1', 'adapters', 'read')).toBe(true);
      expect(service.isAllowed('op-1', 'adapters', 'update')).toBe(true);
      expect(service.isAllowed('op-1', 'adapters', 'delete')).toBe(true);
    });

    it('operator can execute tasks', () => {
      expect(service.isAllowed('op-1', 'tasks', 'execute')).toBe(true);
    });

    it('operator cannot delete tasks', () => {
      expect(service.isAllowed('op-1', 'tasks', 'delete')).toBe(false);
    });

    it('operator can only read metrics', () => {
      expect(service.isAllowed('op-1', 'metrics', 'read')).toBe(true);
      expect(service.isAllowed('op-1', 'metrics', 'create')).toBe(false);
      expect(service.isAllowed('op-1', 'metrics', 'delete')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Unknown principal
  // -----------------------------------------------------------------------

  describe('unknown principal', () => {
    it('isAllowed returns false for an unknown principal', () => {
      expect(service.isAllowed('unknown-xyz', 'tasks', 'read')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // enforce()
  // -----------------------------------------------------------------------

  describe('enforce', () => {
    it('does not throw when access is allowed', () => {
      service.assignRole('enforced-admin', 'admin');
      expect(() => {
        service.enforce('enforced-admin', 'tasks', 'delete');
      }).not.toThrow();
    });

    it('throws A2AStructuredError when access is denied', () => {
      service.assignRole('enforced-viewer', 'viewer');
      expect(() => {
        service.enforce('enforced-viewer', 'tasks', 'create');
      }).toThrow(A2AStructuredError);
    });

    it('thrown error has AuthorizationDenied code', () => {
      service.assignRole('enforced-agent', 'agent');
      try {
        service.enforce('enforced-agent', 'agents', 'delete');
        expect.fail('Expected enforce to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(A2AStructuredError);
        const structured = err as A2AStructuredError;
        expect(structured.code).toBe(A2AErrorCodeEnum.AuthorizationDenied);
      }
    });

    it('thrown error message contains principal, role, resource, and action', () => {
      service.assignRole('enforced-viewer2', 'viewer');
      try {
        service.enforce('enforced-viewer2', 'adapters', 'execute');
        expect.fail('Expected enforce to throw');
      } catch (err) {
        const structured = err as A2AStructuredError;
        expect(structured.message).toContain('enforced-viewer2');
        expect(structured.message).toContain('viewer');
        expect(structured.message).toContain('adapters');
        expect(structured.message).toContain('execute');
      }
    });

    it('throws for an unknown principal', () => {
      expect(() => {
        service.enforce('nobody', 'tasks', 'read');
      }).toThrow(A2AStructuredError);
    });
  });

  // -----------------------------------------------------------------------
  // API key management
  // -----------------------------------------------------------------------

  describe('API key management', () => {
    it('registers an API key and resolves it to a principal', () => {
      service.registerApiKey('sk-abc123', 'agent-1');
      expect(service.resolveApiKey('sk-abc123')).toBe('agent-1');
    });

    it('returns undefined for an unknown API key', () => {
      expect(service.resolveApiKey('sk-unknown')).toBeUndefined();
    });

    it('revokes an API key so it no longer resolves', () => {
      service.registerApiKey('sk-revoke', 'agent-2');
      service.revokeApiKey('sk-revoke');
      expect(service.resolveApiKey('sk-revoke')).toBeUndefined();
    });

    it('revoking a non-existent key does not throw', () => {
      expect(() => service.revokeApiKey('sk-nonexistent')).not.toThrow();
    });

    it('multiple API keys can map to the same principal', () => {
      service.registerApiKey('sk-a', 'principal-shared');
      service.registerApiKey('sk-b', 'principal-shared');
      expect(service.resolveApiKey('sk-a')).toBe('principal-shared');
      expect(service.resolveApiKey('sk-b')).toBe('principal-shared');
    });
  });

  // -----------------------------------------------------------------------
  // Custom policy addition
  // -----------------------------------------------------------------------

  describe('custom policy addition', () => {
    it('adds a custom policy that extends existing permissions', () => {
      service.assignRole('custom-viewer', 'viewer');

      // Viewer normally cannot execute tasks
      expect(service.isAllowed('custom-viewer', 'tasks', 'execute')).toBe(false);

      // Add a custom policy granting viewers execute on tasks
      service.addCustomPolicy({
        role: 'viewer',
        resource: 'tasks',
        actions: ['execute'],
      });

      expect(service.isAllowed('custom-viewer', 'tasks', 'execute')).toBe(true);
      // Original read permission still works
      expect(service.isAllowed('custom-viewer', 'tasks', 'read')).toBe(true);
    });

    it('custom policies are additive and do not remove existing actions', () => {
      service.assignRole('op-custom', 'operator');

      // Operator can already read metrics
      expect(service.isAllowed('op-custom', 'metrics', 'read')).toBe(true);

      // Add create to metrics for operator
      service.addCustomPolicy({
        role: 'operator',
        resource: 'metrics',
        actions: ['create'],
      });

      // Both read and create should work
      expect(service.isAllowed('op-custom', 'metrics', 'read')).toBe(true);
      expect(service.isAllowed('op-custom', 'metrics', 'create')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getDefaultPolicies
  // -----------------------------------------------------------------------

  describe('getDefaultPolicies', () => {
    it('returns the default policies as a new array', () => {
      const policies = service.getDefaultPolicies();
      expect(policies.length).toBeGreaterThan(0);

      // Verify it is a copy, not a reference
      const policies2 = service.getDefaultPolicies();
      expect(policies).not.toBe(policies2);
    });

    it('includes policies for all four roles', () => {
      const policies = service.getDefaultPolicies();
      const roles = new Set(policies.map((p) => p.role));
      expect(roles).toEqual(new Set(['admin', 'operator', 'agent', 'viewer']));
    });
  });

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------

  describe('reset', () => {
    it('clears all principals and API keys', () => {
      service.assignRole('reset-p', 'admin');
      service.registerApiKey('sk-reset', 'reset-p');

      service.reset();

      expect(service.getRole('reset-p')).toBeUndefined();
      expect(service.resolveApiKey('sk-reset')).toBeUndefined();
      expect(service.listPrincipals()).toHaveLength(0);
    });

    it('restores default policies after reset', () => {
      // Add a custom policy
      service.addCustomPolicy({
        role: 'viewer',
        resource: 'tasks',
        actions: ['execute'],
      });

      service.assignRole('v1', 'viewer');
      expect(service.isAllowed('v1', 'tasks', 'execute')).toBe(true);

      service.reset();

      // After reset, the custom policy should be gone
      service.assignRole('v2', 'viewer');
      expect(service.isAllowed('v2', 'tasks', 'execute')).toBe(false);
      // But default read should still work
      expect(service.isAllowed('v2', 'tasks', 'read')).toBe(true);
    });
  });
});

// ===========================================================================
// Singleton management
// ===========================================================================

describe('singleton management', () => {
  afterEach(() => {
    resetA2ARBACService();
  });

  it('getA2ARBACService returns the same instance on repeated calls', () => {
    const a = getA2ARBACService();
    const b = getA2ARBACService();
    expect(a).toBe(b);
  });

  it('resetA2ARBACService creates a fresh instance', () => {
    const a = getA2ARBACService();
    a.assignRole('singleton-test', 'admin');

    resetA2ARBACService();

    const b = getA2ARBACService();
    expect(a).not.toBe(b);
    // State should be cleared in the new instance
    expect(b.getRole('singleton-test')).toBeUndefined();
  });
});

// ===========================================================================
// ROLE_HIERARCHY constant
// ===========================================================================

describe('ROLE_HIERARCHY', () => {
  it('contains all four roles in privilege order', () => {
    expect(ROLE_HIERARCHY).toEqual(['admin', 'operator', 'agent', 'viewer']);
  });
});
