import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DispatchManager } from '../../../src/dispatch/dispatch-manager';
import type { DispatchManagerDeps } from '../../../src/dispatch/dispatch-manager';
import { CoordinationErrorCode } from '../../../src/errors/error-codes';
import type {
  AgentPresence,
  ClaimId,
  DependencyEdge,
  EventId,
  HandoffId,
  LockId,
  SignalId,
  TaskClaim,
  TaskNode,
  WorkLock,
} from '../../../src/domain';
import type {
  DirectoryAgent,
  PolicyDecision,
} from '../../../src/ports';
import { makeAgent, makeTask } from '../../fixtures/dispatch';

const NOW = '2026-06-27T00:00:00.000Z';

type StoreState = {
  claimByTask: Map<string, TaskClaim>;
  /** When set, compareAndSet returns undefined (CAS loss) and seeds this holder. */
  casLoses?: TaskClaim;
  locks: WorkLock[];
};

function buildDeps(options: {
  agents: DirectoryAgent[];
  policy?: PolicyDecision;
  edges?: DependencyEdge[];
  upstream?: TaskNode[];
  presence?: AgentPresence[];
  state: StoreState;
  dispatchDryRun?: boolean;
}): DispatchManagerDeps {
  const { state } = options;
  let idSeq = 0;
  const nextId = (prefix: string) => `${prefix}-${(idSeq += 1)}`;
  return {
    agentDirectory: {
      get: async () => undefined,
      listForSpace: async () => options.agents,
    },
    claimStore: {
      getByTask: async (taskId: string) =>
        state.casLoses?.taskId === taskId ? state.casLoses : state.claimByTask.get(taskId),
      compareAndSet: async (claim: TaskClaim) => {
        if (state.casLoses) {
          return undefined;
        }
        state.claimByTask.set(claim.taskId, claim);
        return claim;
      },
      renew: async () => undefined,
      release: async () => {},
    },
    lockStore: {
      list: async () => state.locks,
      put: async (lock: WorkLock) => {
        state.locks.push(lock);
        return lock;
      },
      delete: async () => {},
      get: async () => undefined,
    },
    dependencyStore: {
      dependenciesOf: async () => options.edges ?? [],
      taskStates: async () => options.upstream ?? [],
      candidateTasks: async () => [],
    },
    presenceStore: {
      get: async () => undefined,
      list: async () => options.presence ?? [],
      heartbeat: async () => {},
      setStatus: async () => {},
    },
    policyGate: {
      evaluate: async () => options.policy ?? { allowed: true },
    },
    clock: { now: () => Date.parse(NOW), iso: () => NOW },
    ids: {
      lockId: () => nextId('lock') as LockId,
      claimId: () => nextId('claim') as ClaimId,
      handoffId: () => nextId('handoff') as HandoffId,
      eventId: () => nextId('event') as EventId,
      signalId: () => nextId('signal') as SignalId,
    },
    fencer: {
      issue: async () => 1,
      verify: async () => true,
    },
    metrics: {
      increment: () => {},
      observe: () => {},
      gauge: () => {},
    },
    config: {
      leaseMs: 1_800_000,
      recoveryWindowMs: 90_000,
      maxConcurrency: 3,
      dispatchDryRun: options.dispatchDryRun ?? false,
    },
  };
}

test('happy path commits a claim and a lock reservation', async () => {
  const state: StoreState = { claimByTask: new Map(), locks: [] };
  const manager = new DispatchManager(buildDeps({ agents: [makeAgent({ agentId: 'a' })], state }));
  const result = await manager.dispatch({ task: makeTask() });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.claim.agentId, 'a');
  }
  assert.equal(state.claimByTask.size, 1);
  assert.equal(state.locks.length, 1);
});

test('policy denial returns POLICY_DENIED and commits nothing', async () => {
  const state: StoreState = { claimByTask: new Map(), locks: [] };
  const manager = new DispatchManager(
    buildDeps({
      agents: [makeAgent()],
      policy: { allowed: false, reason: 'space frozen' },
      state,
    }),
  );
  const result = await manager.dispatch({ task: makeTask() });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, CoordinationErrorCode.POLICY_DENIED);
  }
  assert.equal(state.claimByTask.size, 0);
});

test('losing the claim CAS maps to ClaimConflictError (exactly-once)', async () => {
  const holder: TaskClaim = {
    claimId: 'held-1',
    taskId: 'task-1',
    spaceId: 'space-1',
    agentId: 'rival',
    status: 'claimed',
    claimedAt: NOW,
    leaseUntil: '2026-06-27T00:30:00.000Z',
    fenceToken: 1,
    idempotencyKey: 'k',
  };
  const state: StoreState = { claimByTask: new Map(), casLoses: holder, locks: [] };
  const manager = new DispatchManager(buildDeps({ agents: [makeAgent()], state }));
  const result = await manager.dispatch({ task: makeTask() });
  // existingClaim is the rival's live claim → duplicate-guard already errs
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, CoordinationErrorCode.CLAIM_CONFLICT);
  }
  assert.equal(state.locks.length, 0);
});

test('blocked route is an ok decision with no claim', async () => {
  const state: StoreState = { claimByTask: new Map(), locks: [] };
  const manager = new DispatchManager(
    buildDeps({ agents: [makeAgent({ supportedIntents: ['feature'] })], state }),
  );
  const result = await manager.dispatch({ task: makeTask({ intent: 'visual' }) });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.route.blocked, true);
  }
  assert.equal(state.claimByTask.size, 0);
});

test('dry-run computes a decision but commits nothing', async () => {
  const state: StoreState = { claimByTask: new Map(), locks: [] };
  const manager = new DispatchManager(
    buildDeps({ agents: [makeAgent({ agentId: 'a' })], state, dispatchDryRun: true }),
  );
  const result = await manager.dispatch({ task: makeTask() });
  assert.equal(result.ok, true);
  assert.equal(state.claimByTask.size, 0);
  assert.equal(state.locks.length, 0);
});
