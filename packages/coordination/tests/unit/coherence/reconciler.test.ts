import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reconcile, summarizeFindings } from '../../../src/coherence/reconciler';
import { expectedSignalId } from '../../../src/coherence/escalation';
import { runAllChecks } from '../../../src/coherence/checks';
import type { Effect } from '../../../src/domain';
import {
  claim,
  lock,
  minutesAgo,
  openSignal,
  presence,
  run,
  snapshot,
  task,
} from './fixtures';

function idGen() {
  let n = 0;
  return () => `gen_${n++}`;
}

test('reconcile heals safe drift and escalates unsafe drift', () => {
  // Safe: a lock on a terminal task (heal → ReleaseLock).
  // Unsafe: a live run with no claim (escalate → EmitSignal).
  const snap = snapshot({
    locks: [lock({ lockId: 'lock_term', taskId: 'task_done' })],
    tasks: [task({ taskId: 'task_done', state: 'done' })],
    runs: [run({ runId: 'run_orphan', taskId: 'task_live', agentId: 'agent_z' })],
    claims: [],
  });

  const result = reconcile(snap, { newSignalId: idGen(), autoHeal: true });

  const effectTypes = result.effects.map((e: Effect) => e.type);
  assert.ok(effectTypes.includes('ReleaseLock'), 'safe lock drift healed');
  assert.ok(effectTypes.includes('EmitSignal'), 'unsafe run drift escalated');
  assert.ok(result.signals.length >= 1, 'a WorkSignal was emitted for unsafe drift');
  const runSignal = result.signals.find((s) => s.detectedReason === 'claim_lost');
  assert.ok(runSignal, 'orphan run escalates to claim_lost');
  assert.match(runSignal!.agentHandoffPrompt, /work signal needs attention/);
});

test('autoHeal=false escalates would-be-healable drift instead of healing', () => {
  const snap = snapshot({
    locks: [lock({ lockId: 'lock_term', taskId: 'task_done' })],
    tasks: [task({ taskId: 'task_done', state: 'done' })],
  });

  const result = reconcile(snap, { newSignalId: idGen(), autoHeal: false });
  const effectTypes = result.effects.map((e) => e.type);
  assert.ok(!effectTypes.includes('ReleaseLock'), 'no heal when autoHeal disabled');
  assert.ok(effectTypes.includes('EmitSignal'), 'drift surfaced as a signal instead');
});

test('reconcile does not re-emit a signal that is already open (dedup)', () => {
  // Orphan run → escalate. Pre-seed the matching open signal by its stable id.
  const snap0 = snapshot({
    runs: [run({ runId: 'r', taskId: 'task_live', agentId: 'agent_z' })],
  });
  const findings = runAllChecks(snap0);
  const orphan = findings.find((f) => f.driftKind === 'run_without_claim')!;
  const stableId = expectedSignalId(orphan);

  const snap = snapshot({
    runs: [run({ runId: 'r', taskId: 'task_live', agentId: 'agent_z' })],
    openSignals: [openSignal({ signalId: stableId })],
  });

  const result = reconcile(snap, { newSignalId: idGen(), autoHeal: true });
  assert.equal(result.signals.length, 0, 'already-open signal is not duplicated');
  assert.ok(
    !result.effects.some((e) => e.type === 'EmitSignal'),
    'no EmitSignal effect for an already-open signal',
  );
});

test('a healthy snapshot yields no findings and no effects', () => {
  const snap = snapshot({
    locks: [lock()],
    tasks: [task({ state: 'running' })],
    claims: [claim()],
    runs: [run({ alive: true })],
    presence: [presence({ lastSeen: minutesAgo(1) })],
  });
  const result = reconcile(snap, { newSignalId: idGen(), autoHeal: true });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.signals, []);
});

test('escalated findings publish a coherence.finding event', () => {
  const snap = snapshot({
    runs: [run({ runId: 'r', taskId: 'task_live', agentId: 'agent_z' })],
  });
  const result = reconcile(snap, { newSignalId: idGen(), autoHeal: true });
  const events = result.effects.filter((e) => e.type === 'PublishEvent');
  assert.ok(events.length >= 1);
  assert.equal(
    events[0].type === 'PublishEvent' && events[0].event.type,
    'coherence.finding',
  );
});

test('summarizeFindings counts heal vs escalate', () => {
  const snap = snapshot({
    locks: [lock({ lockId: 'l', taskId: 'task_done' })],
    tasks: [task({ taskId: 'task_done', state: 'done' })],
    runs: [run({ runId: 'r', taskId: 'task_live', agentId: 'z' })],
  });
  const findings = runAllChecks(snap);
  const summary = summarizeFindings(findings);
  assert.equal(summary.total, findings.length);
  assert.ok(summary.healed >= 1);
  assert.ok(summary.escalated >= 1);
});
