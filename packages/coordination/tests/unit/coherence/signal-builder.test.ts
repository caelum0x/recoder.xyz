import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHandoffPrompt,
  buildSignal,
  deterministicSignalId,
  slug,
} from '../../../src/coherence/signal-builder';
import { escalateFinding, expectedSignalId } from '../../../src/coherence/escalation';
import type { CoherenceFinding } from '../../../src/domain';
import { NOW } from './fixtures';

test('buildSignal stamps why/what + a handoff prompt and marks it open', () => {
  const signal = buildSignal({
    signalId: 's1',
    taskId: 'task_1',
    source: 'coherence',
    sourceId: 'src',
    reason: 'claim_lost',
    severity: 'high',
    title: 'Claim lost',
    whyItMatters: 'matters',
    recommendedNextAction: 'do this',
    detectedAt: NOW,
  });
  assert.equal(signal.status, 'open');
  assert.equal(signal.detectedReason, 'claim_lost');
  assert.match(signal.agentHandoffPrompt, /A Recoder work signal needs attention/);
  assert.match(signal.agentHandoffPrompt, /do this/);
  assert.equal(signal.metadata?.generatedBy, 'coherence_reconciler');
});

test('deterministicSignalId coalesces the same drift onto a stable id', () => {
  const a = deterministicSignalId('duplicate_claim', 'task_1', 'claim_x');
  const b = deterministicSignalId('duplicate_claim', 'task_1', 'claim_x');
  assert.equal(a, b);
  assert.equal(a, 'signal_duplicate_claim_task_1_claim_x');
});

test('slug strips unsafe characters', () => {
  assert.equal(slug('a/b:c d'), 'a_b_c_d');
  assert.equal(slug(''), 'unknown');
});

test('buildHandoffPrompt includes the three action lines', () => {
  const prompt = buildHandoffPrompt('T', 'W', 'A');
  assert.match(prompt, /Signal: T/);
  assert.match(prompt, /Why it matters: W/);
  assert.match(prompt, /Recommended next action: A/);
});

test('escalateFinding maps drift kind to the coordination WorkSignal reason', () => {
  const finding: CoherenceFinding = {
    driftKind: 'overlapping_active_locks',
    disposition: 'escalate',
    severity: 'critical',
    lockId: 'lock_b',
    taskId: 'task_1',
    spaceId: 'space_1',
    evidence: 'breach',
    detectedAt: NOW,
  };
  const signal = escalateFinding(finding, expectedSignalId(finding));
  assert.equal(signal.detectedReason, 'overlapping_locks');
  assert.equal(signal.source, 'work_lock');
  assert.equal(signal.severity, 'critical');
  assert.equal(signal.metadata?.driftKind, 'overlapping_active_locks');
});
