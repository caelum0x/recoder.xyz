/**
 * Tests for approval-gate.service — gates privileged inter-agent actions
 * behind human approval with timeout + escalation support.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eventBus: {
    publish: vi.fn(),
  },
  persistence: {
    loadA2AApprovals: vi.fn(() => new Map()),
    saveA2AApprovals: vi.fn(),
  },
}));

vi.mock('../a2a-event-bus', () => ({
  getA2AEventBus: () => mocks.eventBus,
  A2AEventType: {
    ApprovalGranted: 'approval.granted',
    ApprovalRejected: 'approval.rejected',
    ApprovalEscalated: 'approval.escalated',
  },
}));

vi.mock('../a2a-persistence', () => ({
  loadA2AApprovals: mocks.persistence.loadA2AApprovals,
  saveA2AApprovals: mocks.persistence.saveA2AApprovals,
}));

describe('approval-gate.service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.eventBus.publish.mockReset();
    mocks.persistence.loadA2AApprovals.mockReset();
    mocks.persistence.loadA2AApprovals.mockReturnValue(new Map());
    mocks.persistence.saveA2AApprovals.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function freshService() {
    const { ApprovalGateService, resetApprovalGateService } = await import('../approval-gate.service');
    resetApprovalGateService();
    return new ApprovalGateService();
  }

  describe('createRequest', () => {
    it('creates a pending request with a generated approval ID', async () => {
      const svc = await freshService();

      const request = svc.createRequest({
        workspaceId: 'ws_1',
        requestingAgentId: 'agent_a',
        targetAgentId: 'agent_b',
        action: 'delete_file',
        details: { path: '/etc/passwd' },
      });

      expect(request.approvalId).toMatch(/^approval_[a-f0-9]{16}$/);
      expect(request.status).toBe('pending');
      expect(request.action).toBe('delete_file');
      expect(request.details).toEqual({ path: '/etc/passwd' });
      expect(request.timeoutMs).toBe(300_000);
      expect(request.createdAt).toBeTruthy();
    });

    it('uses custom timeout when provided', async () => {
      const svc = await freshService();

      const request = svc.createRequest({
        workspaceId: 'ws_1',
        requestingAgentId: 'a',
        targetAgentId: 'b',
        action: 'test',
        details: {},
        timeoutMs: 60_000,
      });

      expect(request.timeoutMs).toBe(60_000);
    });

    it('persists the request to disk', async () => {
      const svc = await freshService();
      svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      expect(mocks.persistence.saveA2AApprovals).toHaveBeenCalled();
    });
  });

  describe('grant', () => {
    it('transitions pending → granted', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      const result = svc.grant(req.approvalId, 'user_123');

      expect(result).toBeDefined();
      expect(result?.status).toBe('granted');
      expect(result?.resolvedBy).toBe('user_123');
      expect(result?.resolvedAt).toBeTruthy();
    });

    it('publishes ApprovalGranted event', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_42', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      svc.grant(req.approvalId, 'user_1');

      expect(mocks.eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
        type: 'approval.granted',
        workspaceId: 'ws_42',
        data: expect.objectContaining({
          approval: expect.objectContaining({ approvalId: req.approvalId, status: 'granted' }),
        }),
      }));
    });

    it('returns undefined for unknown approval', async () => {
      const svc = await freshService();
      expect(svc.grant('unknown_id', 'user')).toBeUndefined();
    });

    it('returns undefined when already granted', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      svc.grant(req.approvalId, 'user_1');
      const second = svc.grant(req.approvalId, 'user_2');

      expect(second).toBeUndefined();
    });

    it('can grant an escalated request', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      svc.escalate(req.approvalId, 'needs review');
      const result = svc.grant(req.approvalId, 'admin');

      expect(result?.status).toBe('granted');
    });

    it('fires onResolved callbacks', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      const callback = vi.fn();
      svc.onResolved(req.approvalId, callback);

      svc.grant(req.approvalId, 'user');

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        status: 'granted',
      }));
    });
  });

  describe('reject', () => {
    it('transitions pending → rejected', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      const result = svc.reject(req.approvalId, 'user');

      expect(result?.status).toBe('rejected');
    });

    it('publishes ApprovalRejected event', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      svc.reject(req.approvalId, 'user');

      expect(mocks.eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
        type: 'approval.rejected',
      }));
    });

    it('returns undefined for unknown approval', async () => {
      const svc = await freshService();
      expect(svc.reject('unknown', 'user')).toBeUndefined();
    });
  });

  describe('escalate', () => {
    it('transitions pending → escalated with 2x extended timeout', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
        timeoutMs: 10_000,
      });

      const result = svc.escalate(req.approvalId, 'needs review');

      expect(result?.status).toBe('escalated');
      expect(result?.timeoutMs).toBe(20_000); // 2x original
    });

    it('publishes ApprovalEscalated event', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      svc.escalate(req.approvalId, 'manual review');

      expect(mocks.eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
        type: 'approval.escalated',
        data: expect.objectContaining({ reason: 'manual review' }),
      }));
    });

    it('cannot escalate an already-granted request', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      svc.grant(req.approvalId, 'user');
      const result = svc.escalate(req.approvalId);

      expect(result).toBeUndefined();
    });
  });

  describe('timeout expiry', () => {
    it('expires a pending request after timeoutMs', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
        timeoutMs: 5000,
      });

      expect(svc.get(req.approvalId)?.status).toBe('pending');

      vi.advanceTimersByTime(5001);

      expect(svc.get(req.approvalId)?.status).toBe('expired');
    });

    it('does not expire after grant', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
        timeoutMs: 5000,
      });

      svc.grant(req.approvalId, 'user');
      vi.advanceTimersByTime(10_000);

      expect(svc.get(req.approvalId)?.status).toBe('granted');
    });
  });

  describe('queries', () => {
    it('get returns the request by ID', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      expect(svc.get(req.approvalId)?.approvalId).toBe(req.approvalId);
    });

    it('get returns undefined for unknown ID', async () => {
      const svc = await freshService();
      expect(svc.get('unknown')).toBeUndefined();
    });

    it('listPending returns pending requests for a workspace', async () => {
      const svc = await freshService();

      svc.createRequest({
        workspaceId: 'ws_a', requestingAgentId: 'x', targetAgentId: 'y',
        action: 't1', details: {},
      });
      svc.createRequest({
        workspaceId: 'ws_a', requestingAgentId: 'x', targetAgentId: 'y',
        action: 't2', details: {},
      });
      svc.createRequest({
        workspaceId: 'ws_b', requestingAgentId: 'x', targetAgentId: 'y',
        action: 't3', details: {},
      });

      expect(svc.listPending('ws_a')).toHaveLength(2);
      expect(svc.listPending('ws_b')).toHaveLength(1);
      expect(svc.listPending('ws_nonexistent')).toHaveLength(0);
    });

    it('listPending excludes granted/rejected/expired', async () => {
      const svc = await freshService();

      const granted = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'granted', details: {},
      });
      const rejected = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'rejected', details: {},
      });
      svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'pending', details: {},
      });

      svc.grant(granted.approvalId, 'u');
      svc.reject(rejected.approvalId, 'u');

      const pending = svc.listPending('ws_1');
      expect(pending).toHaveLength(1);
      expect(pending[0].action).toBe('pending');
    });

    it('listPending includes escalated requests', async () => {
      const svc = await freshService();
      const req = svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'test', details: {},
      });

      svc.escalate(req.approvalId);

      expect(svc.listPending('ws_1')).toHaveLength(1);
    });

    it('listForTask filters approvals to a single task and never leaks others', async () => {
      const svc = await freshService();

      svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'merge:pr', details: { sourceTaskId: 'task_a' },
      });
      svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'deploy', details: { taskId: 'task_a' },
      });
      svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'other', details: { task_id: 'task_b' },
      });
      svc.createRequest({
        workspaceId: 'ws_1', requestingAgentId: 'a', targetAgentId: 'b',
        action: 'unrelated', details: {},
      });

      const forA = svc.listForTask('ws_1', 'task_a');
      expect(forA.map((r) => r.action).sort()).toEqual(['deploy', 'merge:pr']);
      // No approval belonging to another task (or with no task id) leaks through.
      expect(forA.every((r) => r.action !== 'other' && r.action !== 'unrelated')).toBe(true);

      expect(svc.listForTask('ws_1', 'task_b').map((r) => r.action)).toEqual(['other']);
      expect(svc.listForTask('ws_1', 'task_missing')).toHaveLength(0);
    });

    it('extractApprovalTaskId reads the canonical key variants', async () => {
      const { extractApprovalTaskId } = await import('../approval-gate.service');
      const base = {
        approvalId: 'approval_x', workspaceId: 'ws_1', requestingAgentId: 'a',
        targetAgentId: 'b', action: 'x', status: 'pending' as const,
        createdAt: new Date().toISOString(), timeoutMs: 1000,
      };

      expect(extractApprovalTaskId({ ...base, details: { sourceTaskId: 't1' } })).toBe('t1');
      expect(extractApprovalTaskId({ ...base, details: { taskId: 't2' } })).toBe('t2');
      expect(extractApprovalTaskId({ ...base, details: { task_id: 't3' } })).toBe('t3');
      expect(extractApprovalTaskId({ ...base, details: {} })).toBeUndefined();
    });
  });

  describe('persistence and recovery', () => {
    it('hydrates from disk on construction', async () => {
      const persisted = new Map();
      persisted.set('approval_stored', {
        approvalId: 'approval_stored',
        workspaceId: 'ws_1',
        requestingAgentId: 'a',
        targetAgentId: 'b',
        action: 'test',
        details: {},
        status: 'pending',
        createdAt: new Date().toISOString(),
        timeoutMs: 300_000,
      });
      mocks.persistence.loadA2AApprovals.mockReturnValueOnce(persisted);

      const { ApprovalGateService, resetApprovalGateService } = await import('../approval-gate.service');
      resetApprovalGateService();
      const svc = new ApprovalGateService();

      expect(svc.get('approval_stored')).toBeDefined();
      expect(svc.get('approval_stored')?.status).toBe('pending');
    });

    it('expires persisted requests that are already past deadline', async () => {
      const persisted = new Map();
      const oldTimestamp = new Date(Date.now() - 1_000_000).toISOString();
      persisted.set('approval_old', {
        approvalId: 'approval_old',
        workspaceId: 'ws_1',
        requestingAgentId: 'a',
        targetAgentId: 'b',
        action: 'test',
        details: {},
        status: 'pending',
        createdAt: oldTimestamp,
        timeoutMs: 300_000, // 5 min, already expired since 1M ms ago
      });
      mocks.persistence.loadA2AApprovals.mockReturnValueOnce(persisted);

      const { ApprovalGateService, resetApprovalGateService } = await import('../approval-gate.service');
      resetApprovalGateService();
      const svc = new ApprovalGateService();

      expect(svc.get('approval_old')?.status).toBe('expired');
    });
  });

  describe('singleton', () => {
    it('getApprovalGateService returns the same instance', async () => {
      const { getApprovalGateService, resetApprovalGateService } = await import('../approval-gate.service');
      resetApprovalGateService();

      const a = getApprovalGateService();
      const b = getApprovalGateService();

      expect(a).toBe(b);
    });

    it('resetApprovalGateService creates a fresh instance next time', async () => {
      const { getApprovalGateService, resetApprovalGateService } = await import('../approval-gate.service');

      const a = getApprovalGateService();
      resetApprovalGateService();
      const b = getApprovalGateService();

      expect(a).not.toBe(b);
    });
  });
});
