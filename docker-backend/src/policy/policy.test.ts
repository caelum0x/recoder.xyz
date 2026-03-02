/**
 * @module policy/policy.test
 *
 * Comprehensive test suite for the A2A policy hook middleware system.
 *
 * Covers:
 * - Policy engine evaluation logic
 * - Approval CRUD operations
 * - Express middleware blocking/allowing
 * - Audit event emission
 * - Edge cases (expired approvals, revoked approvals, unknown actions)
 * - Approval route handlers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockRequest, createMockResponse, createMockNext } from '../../tests/setup.js';
import type { Request, Response, NextFunction } from 'express';

// -- Module imports (under test) -------------------------------------------

import {
  evaluatePolicy,
  getPolicyRules,
  getPolicyRule,
  updatePolicyRules,
  resetPolicyRules,
  isPrivilegedAction,
  isValidActionType,
} from './policy-engine.js';

import {
  createApproval,
  getApproval,
  getApprovalsByTask,
  findActiveApproval,
  revokeApproval,
  revokeAllTaskApprovals,
  clearAllApprovals,
  getApprovalStoreStats,
} from './approval-store.js';

import {
  requirePolicyApproval,
  policyHookMiddleware,
  requireBodyActionApproval,
} from './policy-middleware.js';

import {
  emitPolicyDecisionAudit,
  emitApprovalCreatedAudit,
  emitApprovalRevokedAudit,
  onPolicyAuditEvent,
  clearPolicyAuditHandlers,
  type PolicyAuditEvent,
} from './audit-emitter.js';

import {
  PrivilegedActionTypeEnum,
  PolicyDecisionOutcomeEnum,
  ApprovalStatusEnum,
} from './types.js';

// ===========================================================================
// Test Helpers
// ===========================================================================

function makeReq(overrides: Partial<Request> & { userId?: string } = {}): any {
  const base = createMockRequest(overrides);
  (base as any).userId = overrides.userId || 'test-user';
  return base;
}

function makeRes() {
  return createMockResponse();
}

function makeNext() {
  return createMockNext();
}

// ===========================================================================
// Policy Engine Tests
// ===========================================================================

describe('Policy Engine', () => {
  beforeEach(() => {
    resetPolicyRules();
    clearAllApprovals();
  });

  describe('getPolicyRules()', () => {
    it('returns the default ruleset with all action types', () => {
      const rules = getPolicyRules();
      expect(rules).toBeDefined();
      expect(rules[PrivilegedActionTypeEnum.FileSystemWrite]).toBeDefined();
      expect(rules[PrivilegedActionTypeEnum.SecretAccess]).toBeDefined();
      expect(rules[PrivilegedActionTypeEnum.Deployment]).toBeDefined();
    });
  });

  describe('getPolicyRule()', () => {
    it('returns the rule for a known action type', () => {
      const rule = getPolicyRule(PrivilegedActionTypeEnum.FileSystemWrite);
      expect(rule).toBeDefined();
      expect(rule!.action).toBe('file_system_write');
      expect(rule!.disposition).toBe('prompt');
    });

    it('returns undefined for an unknown action type', () => {
      const rule = getPolicyRule('unknown_action' as any);
      expect(rule).toBeUndefined();
    });
  });

  describe('updatePolicyRules()', () => {
    it('merges updates into the active rules', () => {
      updatePolicyRules({
        [PrivilegedActionTypeEnum.FileSystemWrite]: {
          action: PrivilegedActionTypeEnum.FileSystemWrite,
          disposition: 'auto',
          reason: 'Auto-approved for testing',
        },
      });

      const rule = getPolicyRule(PrivilegedActionTypeEnum.FileSystemWrite);
      expect(rule!.disposition).toBe('auto');
    });
  });

  describe('resetPolicyRules()', () => {
    it('resets rules back to defaults', () => {
      updatePolicyRules({
        [PrivilegedActionTypeEnum.FileSystemWrite]: {
          action: PrivilegedActionTypeEnum.FileSystemWrite,
          disposition: 'auto',
          reason: 'temp',
        },
      });

      resetPolicyRules();

      const rule = getPolicyRule(PrivilegedActionTypeEnum.FileSystemWrite);
      expect(rule!.disposition).toBe('prompt');
    });
  });

  describe('isPrivilegedAction()', () => {
    it('returns true for prompt-disposition actions', () => {
      expect(isPrivilegedAction('file_system_write')).toBe(true);
    });

    it('returns true for deny-disposition actions', () => {
      expect(isPrivilegedAction('secret_access')).toBe(true);
    });

    it('returns false for auto-disposition actions', () => {
      updatePolicyRules({
        [PrivilegedActionTypeEnum.FileSystemWrite]: {
          action: PrivilegedActionTypeEnum.FileSystemWrite,
          disposition: 'auto',
          reason: 'auto',
        },
      });
      expect(isPrivilegedAction('file_system_write')).toBe(false);
    });

    it('returns false for unknown actions', () => {
      expect(isPrivilegedAction('totally_unknown')).toBe(false);
    });
  });

  describe('isValidActionType()', () => {
    it('returns true for known action types', () => {
      expect(isValidActionType('file_system_write')).toBe(true);
      expect(isValidActionType('deployment')).toBe(true);
    });

    it('returns false for unknown action types', () => {
      expect(isValidActionType('not_a_real_action')).toBe(false);
    });
  });

  describe('evaluatePolicy()', () => {
    it('allows unknown action types (no rule)', () => {
      const decision = evaluatePolicy({
        action: 'unknown_action' as any,
        resource: '/foo',
        actor_id: 'agent-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);
      expect(decision.rule).toBe('auto');
    });

    it('allows auto-disposition actions', () => {
      updatePolicyRules({
        [PrivilegedActionTypeEnum.FileSystemWrite]: {
          action: PrivilegedActionTypeEnum.FileSystemWrite,
          disposition: 'auto',
          reason: 'Auto for test',
        },
      });

      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        actor_id: 'agent-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);
    });

    it('denies deny-disposition actions without bypass role', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.SecretAccess,
        resource: '/secrets/db-password',
        actor_id: 'agent-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Denied);
      expect(decision.rule).toBe('deny');
    });

    it('allows deny-disposition actions with bypass role', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.SecretAccess,
        resource: '/secrets/db-password',
        actor_id: 'admin-user',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
        actor_roles: ['admin'],
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);
    });

    it('denies prompt-disposition actions without approval', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/project/main.ts',
        actor_id: 'agent-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Denied);
      expect(decision.rule).toBe('prompt');
    });

    it('allows prompt-disposition actions with valid approval', () => {
      // Create an approval first
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/project/main.ts',
        granted_by: 'user-1',
        reason: 'Approved for editing',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/project/main.ts',
        actor_id: 'agent-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);
      expect(decision.approval_id).toBeDefined();
    });

    it('allows prompt-disposition actions with wildcard approval', () => {
      createApproval({
        task_id: 'task-2',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '*',
        granted_by: 'user-1',
        reason: 'Blanket approval',
        workspace_id: 'ws-1',
        trace_id: 'trace-2',
      });

      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/any/file.ts',
        actor_id: 'agent-1',
        task_id: 'task-2',
        workspace_id: 'ws-1',
        trace_id: 'trace-2',
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);
    });

    it('allows prompt-disposition actions with bypass role', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/project/main.ts',
        actor_id: 'system-agent',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
        actor_roles: ['system'],
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);
    });

    it('denies prompt-disposition actions without task_id (no approval lookup)', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/project/main.ts',
        actor_id: 'agent-1',
        // No task_id
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Denied);
    });

    it('includes duration_ms in the decision', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        actor_id: 'agent-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(decision.duration_ms).toBeDefined();
      expect(typeof decision.duration_ms).toBe('number');
      expect(decision.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('includes trace_id in the decision', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        actor_id: 'agent-1',
        workspace_id: 'ws-1',
        trace_id: 'my-trace-id',
      });

      expect(decision.trace_id).toBe('my-trace-id');
    });
  });
});

// ===========================================================================
// Approval Store Tests
// ===========================================================================

describe('Approval Store', () => {
  beforeEach(() => {
    clearAllApprovals();
  });

  describe('createApproval()', () => {
    it('creates an approval with correct fields', () => {
      const approval = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/project/main.ts',
        granted_by: 'user-1',
        reason: 'Approved',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(approval.id).toMatch(/^apv_/);
      expect(approval.task_id).toBe('task-1');
      expect(approval.action).toBe('file_system_write');
      expect(approval.resource).toBe('/project/main.ts');
      expect(approval.status).toBe('active');
      expect(approval.granted_by).toBe('user-1');
      expect(approval.granted_at).toBeDefined();
      expect(approval.expires_at).toBeNull();
      expect(approval.revoked_at).toBeNull();
      expect(approval.revoked_by).toBeNull();
    });

    it('sets expires_at when ttl_ms is provided', () => {
      const before = Date.now();
      const approval = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'TTL test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
        ttl_ms: 60_000, // 1 minute
      });

      expect(approval.expires_at).not.toBeNull();
      const expiresAtMs = new Date(approval.expires_at!).getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 59_000);
      expect(expiresAtMs).toBeLessThanOrEqual(before + 61_000);
    });
  });

  describe('getApproval()', () => {
    it('returns the approval by ID', () => {
      const created = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const fetched = getApproval(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
    });

    it('returns null for unknown ID', () => {
      expect(getApproval('apv_nonexistent')).toBeNull();
    });
  });

  describe('getApprovalsByTask()', () => {
    it('returns all approvals for a task', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.CodeExecution,
        resource: '/bar',
        granted_by: 'user-1',
        reason: 'test 2',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const approvals = getApprovalsByTask('task-1');
      expect(approvals).toHaveLength(2);
    });

    it('returns empty array for unknown task', () => {
      expect(getApprovalsByTask('nonexistent')).toHaveLength(0);
    });
  });

  describe('findActiveApproval()', () => {
    it('finds an active approval matching task, action, and resource', () => {
      const created = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const found = findActiveApproval('task-1', PrivilegedActionTypeEnum.FileSystemWrite, '/foo');
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('returns null when action does not match', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const found = findActiveApproval('task-1', PrivilegedActionTypeEnum.CodeExecution, '/foo');
      expect(found).toBeNull();
    });

    it('returns null when resource does not match', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const found = findActiveApproval('task-1', PrivilegedActionTypeEnum.FileSystemWrite, '/bar');
      expect(found).toBeNull();
    });

    it('matches wildcard resource', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '*',
        granted_by: 'user-1',
        reason: 'wildcard',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const found = findActiveApproval('task-1', PrivilegedActionTypeEnum.FileSystemWrite, '/any/path');
      expect(found).toBeDefined();
    });

    it('does not find revoked approvals', () => {
      const created = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      revokeApproval(created.id, 'admin');

      const found = findActiveApproval('task-1', PrivilegedActionTypeEnum.FileSystemWrite, '/foo');
      expect(found).toBeNull();
    });

    it('does not find expired approvals', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'expired test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
        ttl_ms: -1000, // Already expired (negative TTL)
      });

      const found = findActiveApproval('task-1', PrivilegedActionTypeEnum.FileSystemWrite, '/foo');
      expect(found).toBeNull();
    });
  });

  describe('revokeApproval()', () => {
    it('revokes an approval and sets revoked_at/revoked_by', () => {
      const created = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const revoked = revokeApproval(created.id, 'admin-user');
      expect(revoked).toBeDefined();
      expect(revoked!.status).toBe('revoked');
      expect(revoked!.revoked_by).toBe('admin-user');
      expect(revoked!.revoked_at).toBeDefined();
    });

    it('returns null for unknown approval ID', () => {
      expect(revokeApproval('apv_nonexistent', 'admin')).toBeNull();
    });
  });

  describe('revokeAllTaskApprovals()', () => {
    it('revokes all active approvals for a task', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test 1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.CodeExecution,
        resource: '/bar',
        granted_by: 'user-1',
        reason: 'test 2',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const count = revokeAllTaskApprovals('task-1', 'admin');
      expect(count).toBe(2);

      const approvals = getApprovalsByTask('task-1');
      expect(approvals.every(a => a.status === 'revoked')).toBe(true);
    });

    it('returns 0 when task has no approvals', () => {
      expect(revokeAllTaskApprovals('nonexistent', 'admin')).toBe(0);
    });
  });

  describe('getApprovalStoreStats()', () => {
    it('returns correct statistics', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'active',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const created2 = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.CodeExecution,
        resource: '/bar',
        granted_by: 'user-1',
        reason: 'to revoke',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      revokeApproval(created2.id, 'admin');

      const stats = getApprovalStoreStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.revoked).toBe(1);
      expect(stats.taskCount).toBe(1);
    });
  });
});

// ===========================================================================
// Policy Middleware Tests
// ===========================================================================

describe('Policy Middleware', () => {
  beforeEach(() => {
    resetPolicyRules();
    clearAllApprovals();
  });

  describe('requirePolicyApproval()', () => {
    it('blocks privileged action without approval', () => {
      const middleware = requirePolicyApproval(PrivilegedActionTypeEnum.FileSystemWrite, {
        resource_extractor: 'params',
        resource_key: 'projectId',
      });

      const req = makeReq({
        method: 'POST',
        path: '/api/file/proj-1',
        params: { projectId: 'proj-1' },
        headers: { 'x-task-id': 'task-1' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(false);
      expect(res._status).toBe(403);
      expect(res._data.error.code).toBe('POLICY_DENIED');
    });

    it('allows privileged action with valid approval', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: 'proj-1',
        granted_by: 'user-1',
        reason: 'approved',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const middleware = requirePolicyApproval(PrivilegedActionTypeEnum.FileSystemWrite, {
        resource_extractor: 'params',
        resource_key: 'projectId',
      });

      const req = makeReq({
        method: 'POST',
        path: '/api/file/proj-1',
        params: { projectId: 'proj-1' },
        headers: { 'x-task-id': 'task-1' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
      expect(req.policyDecision).toBeDefined();
      expect(req.policyDecision.outcome).toBe('allowed');
    });

    it('allows action for actors with bypass role', () => {
      const middleware = requirePolicyApproval(PrivilegedActionTypeEnum.FileSystemWrite);

      const req = makeReq({
        method: 'POST',
        path: '/api/file/proj-1',
        headers: { 'x-admin-role': 'true' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
    });

    it('attaches policyDecision to request', () => {
      updatePolicyRules({
        [PrivilegedActionTypeEnum.FileSystemWrite]: {
          action: PrivilegedActionTypeEnum.FileSystemWrite,
          disposition: 'auto',
          reason: 'auto for test',
        },
      });

      const middleware = requirePolicyApproval(PrivilegedActionTypeEnum.FileSystemWrite);

      const req = makeReq({
        method: 'POST',
        path: '/api/file/proj-1',
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
      expect(req.policyDecision).toBeDefined();
      expect(req.policyDecision.outcome).toBe('allowed');
      expect(req.policyDecision.action).toBe('file_system_write');
    });

    it('uses x-trace-id header for trace_id', () => {
      updatePolicyRules({
        [PrivilegedActionTypeEnum.FileSystemWrite]: {
          action: PrivilegedActionTypeEnum.FileSystemWrite,
          disposition: 'auto',
          reason: 'auto',
        },
      });

      const middleware = requirePolicyApproval(PrivilegedActionTypeEnum.FileSystemWrite);

      const req = makeReq({
        headers: { 'x-trace-id': 'my-custom-trace' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(req.policyDecision.trace_id).toBe('my-custom-trace');
    });
  });

  describe('policyHookMiddleware()', () => {
    it('passes through requests that do not match any mapping', () => {
      const middleware = policyHookMiddleware();

      const req = makeReq({
        method: 'GET',
        path: '/api/health',
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
    });

    it('blocks matching privileged routes without approval', () => {
      const middleware = policyHookMiddleware();

      const req = makeReq({
        method: 'POST',
        path: '/api/file/proj-1',
        params: { projectId: 'proj-1' },
        headers: { 'x-task-id': 'task-1' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(false);
      expect(res._status).toBe(403);
      expect(res._data.error.code).toBe('POLICY_DENIED');
    });

    it('allows matching routes with valid approval', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: 'proj-1',
        granted_by: 'user-1',
        reason: 'approved',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const middleware = policyHookMiddleware();

      const req = makeReq({
        method: 'POST',
        path: '/api/file/proj-1',
        params: { projectId: 'proj-1' },
        headers: { 'x-task-id': 'task-1' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
    });

    it('accepts custom mappings', () => {
      const customMappings = [
        {
          methods: ['POST'],
          pattern: '/api/custom/',
          action: PrivilegedActionTypeEnum.Deployment as const,
          resource_extractor: 'path' as const,
          resource_key: '',
        },
      ];

      const middleware = policyHookMiddleware(customMappings);

      const req = makeReq({
        method: 'POST',
        path: '/api/custom/deploy',
        headers: { 'x-task-id': 'task-1' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(false);
      expect(res._status).toBe(403);
    });
  });

  describe('requireBodyActionApproval()', () => {
    it('passes through when no action in body', () => {
      const middleware = requireBodyActionApproval();

      const req = makeReq({
        method: 'POST',
        body: { prompt: 'Hello' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
    });

    it('passes through when action is not a known type', () => {
      const middleware = requireBodyActionApproval();

      const req = makeReq({
        method: 'POST',
        body: { action: 'unknown_action_type' },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
    });

    it('blocks when body specifies a privileged action without approval', () => {
      const middleware = requireBodyActionApproval();

      const req = makeReq({
        method: 'POST',
        body: {
          action: 'file_system_write',
          resource: '/project/main.ts',
          task_id: 'task-1',
        },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(false);
      expect(res._status).toBe(403);
    });

    it('allows when body action has valid approval', () => {
      createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/project/main.ts',
        granted_by: 'user-1',
        reason: 'approved',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const middleware = requireBodyActionApproval();

      const req = makeReq({
        method: 'POST',
        body: {
          action: 'file_system_write',
          resource: '/project/main.ts',
          task_id: 'task-1',
        },
      });
      const res = makeRes();
      const next = makeNext();

      middleware(req, res, next);

      expect(next._called).toBe(true);
    });
  });
});

// ===========================================================================
// Audit Emitter Tests
// ===========================================================================

describe('Audit Emitter', () => {
  let capturedEvents: PolicyAuditEvent[];

  beforeEach(() => {
    resetPolicyRules();
    clearAllApprovals();
    clearPolicyAuditHandlers();
    capturedEvents = [];
    onPolicyAuditEvent((event) => capturedEvents.push(event));
  });

  afterEach(() => {
    clearPolicyAuditHandlers();
  });

  describe('emitPolicyDecisionAudit()', () => {
    it('emits an event for an allowed decision', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        actor_id: 'agent-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
        actor_roles: ['admin'],
      });

      emitPolicyDecisionAudit(decision);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event_type).toBe('policy.approved');
      expect(capturedEvents[0].policy.approved).toBe(true);
    });

    it('emits an event for a denied decision', () => {
      const decision = evaluatePolicy({
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        actor_id: 'agent-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      emitPolicyDecisionAudit(decision);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event_type).toBe('policy.denied');
      expect(capturedEvents[0].policy.approved).toBe(false);
    });
  });

  describe('emitApprovalCreatedAudit()', () => {
    it('emits an event when approval is created', () => {
      const approval = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      emitApprovalCreatedAudit(approval);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event_type).toBe('policy.approval_created');
      expect(capturedEvents[0].approval_id).toBe(approval.id);
    });
  });

  describe('emitApprovalRevokedAudit()', () => {
    it('emits an event when approval is revoked', () => {
      const approval = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      const revoked = revokeApproval(approval.id, 'admin')!;
      emitApprovalRevokedAudit(revoked, 'admin');

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event_type).toBe('policy.revoked');
      expect(capturedEvents[0].approval_id).toBe(approval.id);
      expect(capturedEvents[0].actor.id).toBe('admin');
    });
  });

  describe('handler error isolation', () => {
    it('does not throw when a handler throws', () => {
      clearPolicyAuditHandlers();

      // Register a handler that throws
      onPolicyAuditEvent(() => {
        throw new Error('Handler error');
      });

      // Register a normal handler to verify it still gets called
      const safeEvents: PolicyAuditEvent[] = [];
      onPolicyAuditEvent((event) => safeEvents.push(event));

      const approval = createApproval({
        task_id: 'task-1',
        action: PrivilegedActionTypeEnum.FileSystemWrite,
        resource: '/foo',
        granted_by: 'user-1',
        reason: 'test',
        workspace_id: 'ws-1',
        trace_id: 'trace-1',
      });

      expect(() => emitApprovalCreatedAudit(approval)).not.toThrow();
      expect(safeEvents).toHaveLength(1);
    });
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    resetPolicyRules();
    clearAllApprovals();
  });

  it('handles concurrent approvals for different actions on the same task', () => {
    createApproval({
      task_id: 'task-1',
      action: PrivilegedActionTypeEnum.FileSystemWrite,
      resource: '/foo',
      granted_by: 'user-1',
      reason: 'write',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });

    createApproval({
      task_id: 'task-1',
      action: PrivilegedActionTypeEnum.CodeExecution,
      resource: '/bar',
      granted_by: 'user-1',
      reason: 'exec',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });

    // Write should be allowed
    const writeDecision = evaluatePolicy({
      action: PrivilegedActionTypeEnum.FileSystemWrite,
      resource: '/foo',
      actor_id: 'agent-1',
      task_id: 'task-1',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });
    expect(writeDecision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);

    // Exec should be allowed
    const execDecision = evaluatePolicy({
      action: PrivilegedActionTypeEnum.CodeExecution,
      resource: '/bar',
      actor_id: 'agent-1',
      task_id: 'task-1',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });
    expect(execDecision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);

    // Deployment should still be denied (no approval)
    const deployDecision = evaluatePolicy({
      action: PrivilegedActionTypeEnum.Deployment,
      resource: '/deploy',
      actor_id: 'agent-1',
      task_id: 'task-1',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });
    expect(deployDecision.outcome).toBe(PolicyDecisionOutcomeEnum.Denied);
  });

  it('denies after revocation of previously approved action', () => {
    const approval = createApproval({
      task_id: 'task-1',
      action: PrivilegedActionTypeEnum.FileSystemWrite,
      resource: '/foo',
      granted_by: 'user-1',
      reason: 'approved',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });

    // Should be allowed
    let decision = evaluatePolicy({
      action: PrivilegedActionTypeEnum.FileSystemWrite,
      resource: '/foo',
      actor_id: 'agent-1',
      task_id: 'task-1',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });
    expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Allowed);

    // Revoke
    revokeApproval(approval.id, 'admin');

    // Should now be denied
    decision = evaluatePolicy({
      action: PrivilegedActionTypeEnum.FileSystemWrite,
      resource: '/foo',
      actor_id: 'agent-1',
      task_id: 'task-1',
      workspace_id: 'ws-1',
      trace_id: 'trace-1',
    });
    expect(decision.outcome).toBe(PolicyDecisionOutcomeEnum.Denied);
  });

  it('handles missing userId in middleware gracefully', () => {
    const middleware = requirePolicyApproval(PrivilegedActionTypeEnum.FileSystemWrite);

    const req = makeReq({ userId: undefined });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    // Should still work (uses 'anonymous' as actor_id)
    expect(res._status).toBe(403); // Denied because no approval
    expect(res._data.error.code).toBe('POLICY_DENIED');
  });

  it('POLICY_DENIED response has correct structure', () => {
    const middleware = requirePolicyApproval(PrivilegedActionTypeEnum.FileSystemWrite);

    const req = makeReq({
      headers: { 'x-task-id': 'task-1', 'x-trace-id': 'trace-1' },
      path: '/api/file/proj-1',
    });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    expect(res._data).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'POLICY_DENIED',
          category: 'policy',
          severity: 'medium',
          retryable: false,
          message: expect.any(String),
          details: expect.objectContaining({
            action: 'file_system_write',
            rule: 'prompt',
            trace_id: 'trace-1',
            task_id: 'task-1',
          }),
        }),
      }),
    );
  });
});
