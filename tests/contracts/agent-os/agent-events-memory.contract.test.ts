import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboxRecord, mapRunEventToCloudEvent, markOutboxFailed, markOutboxPublished } from '../../../packages/agent-events/src/index';
import { createMemoryCandidate, materializeMemoryItem, reviewMemoryCandidate } from '../../../packages/agent-memory/src/index';

test('run events map into CloudEvents and outbox records are stateful', () => {
  const event = mapRunEventToCloudEvent({
    eventId: 'evt-1',
    type: 'completed',
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-06-06T00:00:00.000Z',
  });

  assert.equal(event.specversion, '1.0');
  assert.equal(event.type, 'recoder.run.completed');
  assert.equal(event.source, 'recoder://task/task-1');

  const pending = createOutboxRecord(event, '2026-06-06T00:00:01.000Z');
  assert.equal(pending.status, 'pending');
  assert.equal(markOutboxPublished(pending).status, 'published');
  const failed = markOutboxFailed(pending, 'nats unavailable', '2026-06-06T00:00:02.000Z');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attempts, 1);
});

test('memory candidates must be reviewed before becoming durable memory', () => {
  const candidate = createMemoryCandidate({
    candidateId: 'cand-1',
    scope: 'repo',
    title: 'Build command',
    body: 'Use pnpm test:evals:agent-os for Agent OS contract checks.',
    evidence: { taskId: 'task-1', artifactId: 'artifact-1' },
    proposedBy: 'codex',
    proposedAt: '2026-06-06T00:00:00.000Z',
  });

  assert.throws(() => materializeMemoryItem(candidate, { memoryId: 'mem-1', acceptedBy: 'human' }), /unaccepted/);

  const accepted = reviewMemoryCandidate(candidate, {
    accepted: true,
    reviewedBy: 'human',
    reviewedAt: '2026-06-06T00:01:00.000Z',
  });
  const memory = materializeMemoryItem(accepted, { memoryId: 'mem-1', acceptedBy: 'human' });

  assert.equal(accepted.status, 'accepted');
  assert.equal(memory.status, 'active');
  assert.equal(memory.evidence.artifactId, 'artifact-1');
});
