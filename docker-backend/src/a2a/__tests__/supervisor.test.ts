/**
 * @module supervisor.test
 *
 * Tests for the SupervisorOrchestrator — the A2A supervisor lifecycle
 * pattern with restart policies, backoff, and one-for-one / one-for-all
 * strategies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SupervisorOrchestrator,
  getSupervisorOrchestrator,
  resetSupervisorOrchestrator,
  type SupervisorDefinition,
  type ChildSpec,
  type SupervisorEventName,
} from '../orchestration/supervisor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChild(id: string, overrides: Partial<ChildSpec> = {}): ChildSpec {
  return {
    childId: id,
    agentId: `agent-${id}`,
    restartPolicy: 'on-failure',
    maxRestarts: 3,
    backoffBaseMs: 10,
    maxBackoffMs: 50,
    ...overrides,
  };
}

function makeDefinition(overrides: Partial<SupervisorDefinition> = {}): SupervisorDefinition {
  return {
    supervisorId: 'sup-1',
    name: 'Test Supervisor',
    children: [makeChild('child-a'), makeChild('child-b')],
    strategy: 'one-for-one',
    ...overrides,
  };
}

const successStart = async (_childId: string, _agentId: string): Promise<void> => {
  /* noop — simulates successful start */
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let orch: SupervisorOrchestrator;

beforeEach(() => {
  resetSupervisorOrchestrator();
  orch = new SupervisorOrchestrator();
});

// ===========================================================================
// Registration
// ===========================================================================

describe('SupervisorOrchestrator', () => {
  // 1. registerSupervisor + getSupervisor
  describe('registerSupervisor + getSupervisor', () => {
    it('registers and retrieves a supervisor definition', () => {
      const def = makeDefinition();
      orch.registerSupervisor(def);

      const retrieved = orch.getSupervisor('sup-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.supervisorId).toBe('sup-1');
      expect(retrieved!.children).toHaveLength(2);
    });

    it('returns undefined for unknown supervisor', () => {
      expect(orch.getSupervisor('nonexistent')).toBeUndefined();
    });
  });

  // 2. listSupervisors
  describe('listSupervisors', () => {
    it('lists all registered supervisors', () => {
      orch.registerSupervisor(makeDefinition({ supervisorId: 'sup-1' }));
      orch.registerSupervisor(makeDefinition({ supervisorId: 'sup-2', name: 'Second' }));

      const list = orch.listSupervisors();
      expect(list).toHaveLength(2);
      expect(list.map((d) => d.supervisorId).sort()).toEqual(['sup-1', 'sup-2']);
    });
  });

  // 3. removeSupervisor
  describe('removeSupervisor', () => {
    it('removes a stopped supervisor', () => {
      orch.registerSupervisor(makeDefinition());
      expect(orch.removeSupervisor('sup-1')).toBe(true);
      expect(orch.getSupervisor('sup-1')).toBeUndefined();
    });

    it('returns false for unknown supervisor', () => {
      expect(orch.removeSupervisor('nonexistent')).toBe(false);
    });
  });

  // 16. Cannot remove running supervisor
  describe('removeSupervisor on running supervisor', () => {
    it('returns false when supervisor is running', async () => {
      orch.registerSupervisor(makeDefinition());
      await orch.start('sup-1', successStart);

      expect(orch.removeSupervisor('sup-1')).toBe(false);
      expect(orch.getSupervisor('sup-1')).toBeDefined();
    });
  });

  // ===========================================================================
  // Start
  // ===========================================================================

  // 4. Start supervisor — all children started
  describe('start', () => {
    it('starts all children and sets their status to running', async () => {
      orch.registerSupervisor(makeDefinition());
      const state = await orch.start('sup-1', successStart);

      expect(state.status).toBe('running');
      expect(state.children).toHaveLength(2);
      for (const child of state.children) {
        expect(child.status).toBe('running');
        expect(child.lastStartedAt).toBeDefined();
      }
    });

    it('throws when supervisor does not exist', async () => {
      await expect(orch.start('nonexistent', successStart)).rejects.toThrow('not found');
    });
  });

  // 5. Start supervisor — emits events
  describe('start events', () => {
    it('emits child:started for each child and supervisor:started', async () => {
      orch.registerSupervisor(makeDefinition());

      const events: Array<{ event: string; payload: unknown }> = [];
      orch.on('child:started', (payload) => events.push({ event: 'child:started', payload }));
      orch.on('supervisor:started', (payload) => events.push({ event: 'supervisor:started', payload }));

      await orch.start('sup-1', successStart);

      const childStarted = events.filter((e) => e.event === 'child:started');
      expect(childStarted).toHaveLength(2);

      const supStarted = events.filter((e) => e.event === 'supervisor:started');
      expect(supStarted).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Stop
  // ===========================================================================

  // 6. Stop supervisor — all children stopped
  describe('stop', () => {
    it('stops all children and sets supervisor status to stopped', async () => {
      orch.registerSupervisor(makeDefinition());
      await orch.start('sup-1', successStart);
      const state = orch.stop('sup-1');

      expect(state.status).toBe('stopped');
      for (const child of state.children) {
        expect(child.status).toBe('stopped');
        expect(child.lastStoppedAt).toBeDefined();
      }
    });

    it('emits child:stopped for each child and supervisor:stopped', async () => {
      orch.registerSupervisor(makeDefinition());
      await orch.start('sup-1', successStart);

      const events: string[] = [];
      orch.on('child:stopped', () => events.push('child:stopped'));
      orch.on('supervisor:stopped', () => events.push('supervisor:stopped'));

      orch.stop('sup-1');

      expect(events.filter((e) => e === 'child:stopped')).toHaveLength(2);
      expect(events.filter((e) => e === 'supervisor:stopped')).toHaveLength(1);
    });
  });

  // ===========================================================================
  // reportChildFailure
  // ===========================================================================

  // 7. 'never' policy — stays failed
  describe('reportChildFailure with never policy', () => {
    it('leaves the child as failed and does not restart', async () => {
      const def = makeDefinition({
        children: [makeChild('child-a', { restartPolicy: 'never' }), makeChild('child-b')],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      const events: string[] = [];
      orch.on('child:restarted', () => events.push('child:restarted'));

      await orch.reportChildFailure('sup-1', 'child-a', 'Boom', successStart);

      const state = orch.getState('sup-1')!;
      const childA = state.children.find((c) => c.childId === 'child-a')!;
      expect(childA.status).toBe('failed');
      expect(childA.lastError).toBe('Boom');
      expect(events).toHaveLength(0);
    });
  });

  // 8. 'on-failure' policy — restarts
  describe('reportChildFailure with on-failure policy', () => {
    it('restarts the failed child', async () => {
      const def = makeDefinition({
        children: [makeChild('child-a', { restartPolicy: 'on-failure' }), makeChild('child-b')],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      const events: string[] = [];
      orch.on('child:restarted', () => events.push('child:restarted'));

      await orch.reportChildFailure('sup-1', 'child-a', 'Crashed', successStart);

      const state = orch.getState('sup-1')!;
      const childA = state.children.find((c) => c.childId === 'child-a')!;
      expect(childA.status).toBe('running');
      expect(childA.restartCount).toBe(1);
      expect(events).toHaveLength(1);
    });
  });

  // 9. 'always' policy — restarts
  describe('reportChildFailure with always policy', () => {
    it('restarts the child', async () => {
      const def = makeDefinition({
        children: [makeChild('child-a', { restartPolicy: 'always' })],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      await orch.reportChildFailure('sup-1', 'child-a', 'Random crash', successStart);

      const state = orch.getState('sup-1')!;
      const childA = state.children.find((c) => c.childId === 'child-a')!;
      expect(childA.status).toBe('running');
      expect(childA.restartCount).toBe(1);
    });
  });

  // 10. Max restarts exceeded — child stays failed
  describe('max restarts per child exceeded', () => {
    it('stops restarting after maxRestarts and leaves child as failed', async () => {
      const def = makeDefinition({
        children: [makeChild('child-a', { restartPolicy: 'always', maxRestarts: 2 })],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      // Fail twice — should restart each time
      await orch.reportChildFailure('sup-1', 'child-a', 'Crash 1', successStart);
      expect(orch.getState('sup-1')!.children[0].restartCount).toBe(1);

      await orch.reportChildFailure('sup-1', 'child-a', 'Crash 2', successStart);
      expect(orch.getState('sup-1')!.children[0].restartCount).toBe(2);

      // Third failure — should NOT restart (maxRestarts=2 exhausted)
      await orch.reportChildFailure('sup-1', 'child-a', 'Crash 3', successStart);
      const state = orch.getState('sup-1')!;
      const childA = state.children.find((c) => c.childId === 'child-a')!;
      expect(childA.status).toBe('failed');
      expect(childA.restartCount).toBe(2); // stays at 2
    });
  });

  // ===========================================================================
  // Strategies
  // ===========================================================================

  // 11. one-for-one — only failed child restarts
  describe('one-for-one strategy', () => {
    it('only restarts the failed child, leaving others untouched', async () => {
      const def = makeDefinition({
        strategy: 'one-for-one',
        children: [
          makeChild('child-a', { restartPolicy: 'on-failure' }),
          makeChild('child-b', { restartPolicy: 'on-failure' }),
        ],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      const restartedIds: string[] = [];
      orch.on('child:restarted', (payload: { childId: string }) => restartedIds.push(payload.childId));
      const stoppedIds: string[] = [];
      orch.on('child:stopped', (payload: { childId: string }) => stoppedIds.push(payload.childId));

      await orch.reportChildFailure('sup-1', 'child-a', 'Crash', successStart);

      // Only child-a restarted, child-b was never stopped or restarted
      expect(restartedIds).toEqual(['child-a']);
      expect(stoppedIds).toHaveLength(0); // child-b was not stopped

      const state = orch.getState('sup-1')!;
      expect(state.children.find((c) => c.childId === 'child-a')!.status).toBe('running');
      expect(state.children.find((c) => c.childId === 'child-b')!.status).toBe('running');
      expect(state.children.find((c) => c.childId === 'child-b')!.restartCount).toBe(0);
    });
  });

  // 12. one-for-all strategy — all children restart on any failure
  describe('one-for-all strategy', () => {
    it('stops and restarts all children when one fails', async () => {
      const def = makeDefinition({
        strategy: 'one-for-all',
        children: [
          makeChild('child-a', { restartPolicy: 'on-failure' }),
          makeChild('child-b', { restartPolicy: 'on-failure' }),
        ],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      const restartedIds: string[] = [];
      orch.on('child:restarted', (payload: { childId: string }) => restartedIds.push(payload.childId));
      const stoppedIds: string[] = [];
      orch.on('child:stopped', (payload: { childId: string }) => stoppedIds.push(payload.childId));

      await orch.reportChildFailure('sup-1', 'child-a', 'Crash', successStart);

      // child-b should have been stopped (it was running) then both restarted
      expect(stoppedIds).toContain('child-b');
      expect(restartedIds).toContain('child-a');
      expect(restartedIds).toContain('child-b');

      const state = orch.getState('sup-1')!;
      expect(state.children.find((c) => c.childId === 'child-a')!.status).toBe('running');
      expect(state.children.find((c) => c.childId === 'child-b')!.status).toBe('running');
    });
  });

  // ===========================================================================
  // maxTotalRestarts
  // ===========================================================================

  // 13. maxTotalRestarts exceeded — supervisor stops
  describe('maxTotalRestarts exceeded', () => {
    it('emits max-restarts-reached and stops the supervisor', async () => {
      const def = makeDefinition({
        maxTotalRestarts: 2,
        children: [
          makeChild('child-a', { restartPolicy: 'always', maxRestarts: 5 }),
          makeChild('child-b', { restartPolicy: 'always', maxRestarts: 5 }),
        ],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      const events: string[] = [];
      orch.on('supervisor:max-restarts-reached', () => events.push('max-restarts-reached'));
      orch.on('supervisor:stopped', () => events.push('stopped'));

      // Two failures should consume the 2 total restarts
      await orch.reportChildFailure('sup-1', 'child-a', 'Crash 1', successStart);
      await orch.reportChildFailure('sup-1', 'child-a', 'Crash 2', successStart);

      expect(events).toContain('max-restarts-reached');
      expect(events).toContain('stopped');

      const state = orch.getState('sup-1')!;
      expect(state.status).toBe('stopped');
      expect(state.totalRestarts).toBe(2);
    });
  });

  // ===========================================================================
  // Child state tracking
  // ===========================================================================

  // 14. Child state tracking (restartCount, uptimeMs)
  describe('child state tracking', () => {
    it('tracks restartCount and accumulates uptimeMs', async () => {
      const def = makeDefinition({
        children: [makeChild('child-a', { restartPolicy: 'always', maxRestarts: 5 })],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      // Let some time pass (uptimeMs should increase)
      const stateBefore = orch.getState('sup-1')!;
      const childBefore = stateBefore.children[0];
      expect(childBefore.restartCount).toBe(0);
      // uptimeMs should be >= 0 (could be 0 in fast execution)
      expect(childBefore.uptimeMs).toBeGreaterThanOrEqual(0);

      await orch.reportChildFailure('sup-1', 'child-a', 'Crash', successStart);

      const stateAfter = orch.getState('sup-1')!;
      const childAfter = stateAfter.children[0];
      expect(childAfter.restartCount).toBe(1);
      expect(childAfter.status).toBe('running');
      expect(childAfter.lastStartedAt).toBeDefined();
    });

    it('records lastError on failure', async () => {
      const def = makeDefinition({
        children: [makeChild('child-a', { restartPolicy: 'never' })],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      await orch.reportChildFailure('sup-1', 'child-a', 'OOM killed', successStart);

      const state = orch.getState('sup-1')!;
      expect(state.children[0].lastError).toBe('OOM killed');
      expect(state.children[0].lastStoppedAt).toBeDefined();
    });
  });

  // ===========================================================================
  // Singleton
  // ===========================================================================

  // 15. Singleton management (get/reset)
  describe('singleton', () => {
    it('getSupervisorOrchestrator returns the same instance', () => {
      const a = getSupervisorOrchestrator();
      const b = getSupervisorOrchestrator();
      expect(a).toBe(b);
    });

    it('resetSupervisorOrchestrator clears and creates a new instance', () => {
      const a = getSupervisorOrchestrator();
      a.registerSupervisor(makeDefinition());
      expect(a.listSupervisors()).toHaveLength(1);

      resetSupervisorOrchestrator();

      const b = getSupervisorOrchestrator();
      expect(b).not.toBe(a);
      expect(b.listSupervisors()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Backoff
  // ===========================================================================

  describe('backoff timing', () => {
    it('applies exponential backoff on restarts', async () => {
      const def = makeDefinition({
        children: [
          makeChild('child-a', {
            restartPolicy: 'always',
            maxRestarts: 3,
            backoffBaseMs: 10,
            maxBackoffMs: 100,
          }),
        ],
      });
      orch.registerSupervisor(def);
      await orch.start('sup-1', successStart);

      const startTime = Date.now();

      // First failure: backoff = min(10 * 2^0, 100) = 10ms
      await orch.reportChildFailure('sup-1', 'child-a', 'Crash 1', successStart);
      // Second failure: backoff = min(10 * 2^1, 100) = 20ms
      await orch.reportChildFailure('sup-1', 'child-a', 'Crash 2', successStart);

      const elapsed = Date.now() - startTime;
      // Should have waited at least ~30ms total (10 + 20)
      expect(elapsed).toBeGreaterThanOrEqual(20);
    });
  });
});
