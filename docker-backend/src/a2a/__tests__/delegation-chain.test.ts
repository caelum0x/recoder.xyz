/**
 * @module delegation-chain.test
 *
 * Comprehensive test suite for the A2A delegation chain service.
 *
 * Covers:
 * - Delegate creates request with correct fields
 * - Delegate calculates depth from parent
 * - Delegate rejects exceeding maxDepth
 * - Delegate rejects self-delegation (default config)
 * - Delegate allows self-delegation when configured
 * - Delegate rejects circular chains (default config)
 * - Accept updates status
 * - Reject updates status with reason
 * - Complete sets result and propagates
 * - Fail sets error
 * - Cancel updates status
 * - getDelegation returns by ID
 * - getDelegationsFrom / getDelegationsTo
 * - getChain returns full chain with correct depth ordering
 * - Chain status: completed when all complete
 * - Chain status: failed when any failed
 * - Events emitted correctly (created, accepted, completed, chain-completed)
 * - getStats returns correct counts
 * - Singleton management (get/reset)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DelegationChainService,
  getDelegationChainService,
  resetDelegationChainService,
  resetDelegationIdCounter,
  type DelegateInput,
  type DelegationRequest,
  type DelegationChain,
  type DelegationEventName,
} from '../delegation-chain.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(config?: Parameters<typeof getDelegationChainService>[0]): DelegationChainService {
  return new DelegationChainService(config);
}

function defaultInput(overrides: Partial<DelegateInput> = {}): DelegateInput {
  return {
    fromAgentId: 'agent-A',
    toAgentId: 'agent-B',
    prompt: 'Write unit tests',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DelegationChainService', () => {
  let svc: DelegationChainService;

  beforeEach(() => {
    svc = makeService();
    resetDelegationIdCounter();
  });

  afterEach(() => {
    svc.reset();
    resetDelegationChainService();
  });

  // -----------------------------------------------------------------------
  // delegate()
  // -----------------------------------------------------------------------

  describe('delegate()', () => {
    it('creates a delegation request with correct fields', () => {
      const d = svc.delegate(defaultInput());

      expect(d.delegationId).toMatch(/^dlg_/);
      expect(d.fromAgentId).toBe('agent-A');
      expect(d.toAgentId).toBe('agent-B');
      expect(d.prompt).toBe('Write unit tests');
      expect(d.priority).toBe('normal');
      expect(d.depth).toBe(0);
      expect(d.status).toBe('pending');
      expect(d.createdAt).toBeTruthy();
      expect(d.parentDelegationId).toBeUndefined();
    });

    it('uses the specified priority', () => {
      const d = svc.delegate(defaultInput({ priority: 'critical' }));
      expect(d.priority).toBe('critical');
    });

    it('calculates depth from parent delegation', () => {
      const parent = svc.delegate(defaultInput());
      const child = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: parent.delegationId,
        }),
      );

      expect(parent.depth).toBe(0);
      expect(child.depth).toBe(1);
    });

    it('throws when exceeding maxDepth', () => {
      const shallow = makeService({ maxDepth: 1 });

      const d0 = shallow.delegate(defaultInput());
      const d1 = shallow.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d0.delegationId,
        }),
      );

      // depth would be 2, maxDepth is 1
      expect(() =>
        shallow.delegate(
          defaultInput({
            fromAgentId: 'agent-C',
            toAgentId: 'agent-D',
            parentDelegationId: d1.delegationId,
          }),
        ),
      ).toThrow(/depth/i);
    });

    it('emits delegation:depth-exceeded when depth is exceeded', () => {
      const shallow = makeService({ maxDepth: 0 });
      const handler = vi.fn();
      shallow.on('delegation:depth-exceeded', handler);

      const root = shallow.delegate(defaultInput()); // depth 0, allowed
      expect(() =>
        shallow.delegate(
          defaultInput({
            fromAgentId: 'agent-B',
            toAgentId: 'agent-C',
            parentDelegationId: root.delegationId,
          }),
        ),
      ).toThrow();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('rejects self-delegation with default config', () => {
      expect(() =>
        svc.delegate(defaultInput({ fromAgentId: 'agent-A', toAgentId: 'agent-A' })),
      ).toThrow(/self-delegation/i);
    });

    it('allows self-delegation when configured', () => {
      const selfOk = makeService({ allowSelfDelegation: true });
      const d = selfOk.delegate(
        defaultInput({ fromAgentId: 'agent-A', toAgentId: 'agent-A' }),
      );
      expect(d.fromAgentId).toBe('agent-A');
      expect(d.toAgentId).toBe('agent-A');
    });

    it('rejects circular delegation chains (A -> B -> C, then C -> A)', () => {
      const d0 = svc.delegate(defaultInput()); // A -> B
      const d1 = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d0.delegationId,
        }),
      ); // B -> C

      // C -> A should fail because A is already in the chain
      expect(() =>
        svc.delegate(
          defaultInput({
            fromAgentId: 'agent-C',
            toAgentId: 'agent-A',
            parentDelegationId: d1.delegationId,
          }),
        ),
      ).toThrow(/circular/i);
    });

    it('allows circular when configured', () => {
      const circOk = makeService({ allowCircular: true });
      const d0 = circOk.delegate(defaultInput()); // A -> B
      const d1 = circOk.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d0.delegationId,
        }),
      );

      // C -> A should succeed
      const d2 = circOk.delegate(
        defaultInput({
          fromAgentId: 'agent-C',
          toAgentId: 'agent-A',
          parentDelegationId: d1.delegationId,
        }),
      );
      expect(d2.depth).toBe(2);
    });

    it('throws when parent delegation does not exist', () => {
      expect(() =>
        svc.delegate(defaultInput({ parentDelegationId: 'nonexistent' })),
      ).toThrow(/parent delegation not found/i);
    });

    it('stores metadata on the delegation', () => {
      const d = svc.delegate(defaultInput({ metadata: { project: 'recoder' } }));
      expect(d.metadata).toEqual({ project: 'recoder' });
    });
  });

  // -----------------------------------------------------------------------
  // accept()
  // -----------------------------------------------------------------------

  describe('accept()', () => {
    it('updates status to accepted and sets acceptedAt', () => {
      const d = svc.delegate(defaultInput());
      const accepted = svc.accept(d.delegationId);

      expect(accepted).toBeDefined();
      expect(accepted!.status).toBe('accepted');
      expect(accepted!.acceptedAt).toBeTruthy();
    });

    it('returns undefined for unknown ID', () => {
      expect(svc.accept('unknown')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // reject()
  // -----------------------------------------------------------------------

  describe('reject()', () => {
    it('updates status to rejected with reason', () => {
      const d = svc.delegate(defaultInput());
      const rejected = svc.reject(d.delegationId, 'Too busy');

      expect(rejected).toBeDefined();
      expect(rejected!.status).toBe('rejected');
      expect(rejected!.error).toBe('Too busy');
      expect(rejected!.completedAt).toBeTruthy();
      expect(rejected!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns undefined for unknown ID', () => {
      expect(svc.reject('unknown')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // complete()
  // -----------------------------------------------------------------------

  describe('complete()', () => {
    it('sets result, completedAt, durationMs', () => {
      const d = svc.delegate(defaultInput());
      const completed = svc.complete(d.delegationId, 'All tests pass');

      expect(completed).toBeDefined();
      expect(completed!.status).toBe('completed');
      expect(completed!.result).toBe('All tests pass');
      expect(completed!.completedAt).toBeTruthy();
      expect(completed!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns undefined for unknown ID', () => {
      expect(svc.complete('unknown', 'result')).toBeUndefined();
    });

    it('emits delegation:chain-completed when entire chain completes', () => {
      const chainCompleted = vi.fn();
      svc.on('delegation:chain-completed', chainCompleted);

      const root = svc.delegate(defaultInput());
      const child = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: root.delegationId,
        }),
      );

      // Complete child first
      svc.complete(child.delegationId, 'child done');
      expect(chainCompleted).not.toHaveBeenCalled();

      // Complete root => chain is fully completed
      svc.complete(root.delegationId, 'root done');
      expect(chainCompleted).toHaveBeenCalledOnce();
      const chain = chainCompleted.mock.calls[0][0] as DelegationChain;
      expect(chain.status).toBe('completed');
      expect(chain.delegations).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // fail()
  // -----------------------------------------------------------------------

  describe('fail()', () => {
    it('sets error, completedAt, durationMs, and status to failed', () => {
      const d = svc.delegate(defaultInput());
      const failed = svc.fail(d.delegationId, 'Timeout');

      expect(failed).toBeDefined();
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBe('Timeout');
      expect(failed!.completedAt).toBeTruthy();
      expect(failed!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns undefined for unknown ID', () => {
      expect(svc.fail('unknown', 'err')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // cancel()
  // -----------------------------------------------------------------------

  describe('cancel()', () => {
    it('updates status to cancelled with completedAt and durationMs', () => {
      const d = svc.delegate(defaultInput());
      const cancelled = svc.cancel(d.delegationId);

      expect(cancelled).toBeDefined();
      expect(cancelled!.status).toBe('cancelled');
      expect(cancelled!.completedAt).toBeTruthy();
      expect(cancelled!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns undefined for unknown ID', () => {
      expect(svc.cancel('unknown')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getDelegation()
  // -----------------------------------------------------------------------

  describe('getDelegation()', () => {
    it('returns delegation by ID', () => {
      const d = svc.delegate(defaultInput());
      expect(svc.getDelegation(d.delegationId)).toBe(d);
    });

    it('returns undefined for unknown ID', () => {
      expect(svc.getDelegation('nope')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getDelegationsFrom() / getDelegationsTo()
  // -----------------------------------------------------------------------

  describe('getDelegationsFrom() / getDelegationsTo()', () => {
    it('returns delegations from a specific agent', () => {
      svc.delegate(defaultInput());
      svc.delegate(defaultInput({ fromAgentId: 'agent-A', toAgentId: 'agent-C' }));
      svc.delegate(defaultInput({ fromAgentId: 'agent-X', toAgentId: 'agent-Y' }));

      const fromA = svc.getDelegationsFrom('agent-A');
      expect(fromA).toHaveLength(2);
      expect(fromA.every((d) => d.fromAgentId === 'agent-A')).toBe(true);
    });

    it('returns delegations to a specific agent', () => {
      svc.delegate(defaultInput());
      svc.delegate(defaultInput({ fromAgentId: 'agent-C', toAgentId: 'agent-B' }));
      svc.delegate(defaultInput({ fromAgentId: 'agent-X', toAgentId: 'agent-Y' }));

      const toB = svc.getDelegationsTo('agent-B');
      expect(toB).toHaveLength(2);
      expect(toB.every((d) => d.toAgentId === 'agent-B')).toBe(true);
    });

    it('returns empty array when no delegations match', () => {
      expect(svc.getDelegationsFrom('ghost')).toHaveLength(0);
      expect(svc.getDelegationsTo('ghost')).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getChain()
  // -----------------------------------------------------------------------

  describe('getChain()', () => {
    it('returns full chain with correct depth ordering', () => {
      const d0 = svc.delegate(defaultInput()); // A -> B, depth 0
      const d1 = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d0.delegationId,
        }),
      ); // depth 1
      const d2 = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-C',
          toAgentId: 'agent-D',
          parentDelegationId: d1.delegationId,
        }),
      ); // depth 2

      const chain = svc.getChain(d2.delegationId);
      expect(chain).toBeDefined();
      expect(chain!.rootDelegationId).toBe(d0.delegationId);
      expect(chain!.delegations).toHaveLength(3);
      expect(chain!.delegations[0].depth).toBe(0);
      expect(chain!.delegations[1].depth).toBe(1);
      expect(chain!.delegations[2].depth).toBe(2);
      expect(chain!.maxDepth).toBe(2);
    });

    it('reports status completed when all delegations are completed', () => {
      const d0 = svc.delegate(defaultInput());
      const d1 = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d0.delegationId,
        }),
      );

      svc.complete(d0.delegationId, 'done');
      svc.complete(d1.delegationId, 'done');

      const chain = svc.getChain(d0.delegationId);
      expect(chain!.status).toBe('completed');
      expect(chain!.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('reports status failed when any delegation failed', () => {
      const d0 = svc.delegate(defaultInput());
      const d1 = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d0.delegationId,
        }),
      );

      svc.complete(d0.delegationId, 'done');
      svc.fail(d1.delegationId, 'error');

      const chain = svc.getChain(d0.delegationId);
      expect(chain!.status).toBe('failed');
    });

    it('reports status in-progress when delegations are still active', () => {
      const d0 = svc.delegate(defaultInput());
      svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d0.delegationId,
        }),
      );

      svc.complete(d0.delegationId, 'done');
      // d1 still pending

      const chain = svc.getChain(d0.delegationId);
      expect(chain!.status).toBe('in-progress');
    });

    it('returns undefined for unknown delegation ID', () => {
      expect(svc.getChain('nonexistent')).toBeUndefined();
    });

    it('works with a single-delegation chain', () => {
      const d = svc.delegate(defaultInput());
      const chain = svc.getChain(d.delegationId);

      expect(chain).toBeDefined();
      expect(chain!.delegations).toHaveLength(1);
      expect(chain!.maxDepth).toBe(0);
      expect(chain!.rootDelegationId).toBe(d.delegationId);
    });
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  describe('events', () => {
    it('emits delegation:created on delegate()', () => {
      const handler = vi.fn();
      svc.on('delegation:created', handler);

      const d = svc.delegate(defaultInput());
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(d);
    });

    it('emits delegation:accepted on accept()', () => {
      const handler = vi.fn();
      svc.on('delegation:accepted', handler);

      const d = svc.delegate(defaultInput());
      svc.accept(d.delegationId);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits delegation:rejected on reject()', () => {
      const handler = vi.fn();
      svc.on('delegation:rejected', handler);

      const d = svc.delegate(defaultInput());
      svc.reject(d.delegationId, 'no');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits delegation:completed on complete()', () => {
      const handler = vi.fn();
      svc.on('delegation:completed', handler);

      const d = svc.delegate(defaultInput());
      svc.complete(d.delegationId, 'result');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits delegation:failed on fail()', () => {
      const handler = vi.fn();
      svc.on('delegation:failed', handler);

      const d = svc.delegate(defaultInput());
      svc.fail(d.delegationId, 'oops');
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // getStats()
  // -----------------------------------------------------------------------

  describe('getStats()', () => {
    it('returns correct counts', () => {
      const d1 = svc.delegate(defaultInput());
      const d2 = svc.delegate(defaultInput({ fromAgentId: 'agent-A', toAgentId: 'agent-C' }));
      const d3 = svc.delegate(
        defaultInput({
          fromAgentId: 'agent-B',
          toAgentId: 'agent-C',
          parentDelegationId: d1.delegationId,
        }),
      );

      svc.complete(d1.delegationId, 'done');
      svc.fail(d2.delegationId, 'err');
      svc.reject(d3.delegationId, 'nah');

      const stats = svc.getStats();
      expect(stats.totalDelegations).toBe(3);
      expect(stats.totalCompleted).toBe(1);
      expect(stats.totalFailed).toBe(1);
      expect(stats.totalRejected).toBe(1);
      expect(stats.maxDepthReached).toBe(1);
      expect(stats.avgDepth).toBeCloseTo(1 / 3);

      // agent-A delegated 2 times
      expect(stats.byAgent['agent-A'].delegated).toBe(2);
      // agent-B received 1 delegation (from d1) and delegated 1 (d3)
      expect(stats.byAgent['agent-B'].received).toBe(1);
      expect(stats.byAgent['agent-B'].delegated).toBe(1);
      // agent-C received 2 delegations
      expect(stats.byAgent['agent-C'].received).toBe(2);
    });

    it('returns zeros for empty service', () => {
      const stats = svc.getStats();
      expect(stats.totalDelegations).toBe(0);
      expect(stats.avgDepth).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  describe('singleton management', () => {
    it('getDelegationChainService returns the same instance', () => {
      const a = getDelegationChainService();
      const b = getDelegationChainService();
      expect(a).toBe(b);
    });

    it('resetDelegationChainService clears the singleton', () => {
      const a = getDelegationChainService();
      resetDelegationChainService();
      const b = getDelegationChainService();
      expect(a).not.toBe(b);
    });
  });
});
