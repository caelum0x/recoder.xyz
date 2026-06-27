import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CoherenceFinding, Effect } from '../../../src/domain';
import { buildHealEffects, healEffectsFor, isHealable } from '../../../src/coherence/heal-actions';
import { NOW } from './fixtures';

function finding(overrides: Partial<CoherenceFinding>): CoherenceFinding {
  return {
    driftKind: 'lock_without_task',
    disposition: 'heal',
    severity: 'medium',
    evidence: 'e',
    detectedAt: NOW,
    ...overrides,
  };
}

test('lock_without_task heals to RecordFinding + ReleaseLock', () => {
  const effects = healEffectsFor(
    finding({ driftKind: 'lock_without_task', lockId: 'lock_1', agentId: 'a', taskId: 't' }),
  );
  const types = effects.map((e: Effect) => e.type);
  assert.deepEqual(types, ['RecordFinding', 'ReleaseLock']);
  const release = effects.find((e) => e.type === 'ReleaseLock');
  assert.equal(release?.type === 'ReleaseLock' && release.lockId, 'lock_1');
});

test('stale_presence heals to RecordFinding + MarkPresenceOffline', () => {
  const effects = healEffectsFor(
    finding({ driftKind: 'stale_presence', disposition: 'heal', agentId: 'agent_9' }),
  );
  const types = effects.map((e) => e.type);
  assert.deepEqual(types, ['RecordFinding', 'MarkPresenceOffline']);
});

test('escalate findings are never healable even if mis-routed', () => {
  assert.equal(
    isHealable(finding({ driftKind: 'overlapping_active_locks', disposition: 'escalate' })),
    false,
  );
  assert.deepEqual(
    healEffectsFor(finding({ driftKind: 'duplicate_claim', disposition: 'escalate' })),
    [],
  );
});

test('buildHealEffects only emits effects for the healable subset', () => {
  const effects = buildHealEffects([
    finding({ driftKind: 'lock_without_task', lockId: 'l1' }),
    finding({ driftKind: 'run_without_claim', disposition: 'escalate' }),
    finding({ driftKind: 'stale_presence', agentId: 'a2' }),
  ]);
  // 2 healable findings × 2 effects each = 4.
  assert.equal(effects.length, 4);
});
