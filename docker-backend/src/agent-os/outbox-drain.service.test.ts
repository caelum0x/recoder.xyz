import { describe, expect, it } from 'vitest';
import { createOutboxRecord, createRecoderCloudEvent, markOutboxPublished } from '@recoder/agent-events';
import { InMemoryAgentOsRepository } from './repositories/in-memory-agent-os.repository';
import { drainAgentOsOutbox } from './outbox-drain.service';

function record(id: string) {
  return createOutboxRecord(createRecoderCloudEvent({
    id,
    type: 'recoder.task.created',
    source: 'recoder://space/test',
    subject: 'task_1',
    time: '2026-06-13T10:00:00.000Z',
    data: {
      taskId: 'task_1',
      title: 'Task',
      intent: 'feature_delivery',
      goal: 'Ship task',
      spaceId: 'space_1',
      targetPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: [],
      verification: { commands: [] },
      approvalRequired: [],
      artifactRequired: [],
    },
  }), '2026-06-13T10:00:00.000Z');
}

describe('drainAgentOsOutbox', () => {
  it('publishes pending records and marks them published', async () => {
    const repository = new InMemoryAgentOsRepository();
    await repository.appendOutbox(record('evt_1'));
    await repository.appendOutbox(record('evt_2'));
    const published: string[] = [];

    const result = await drainAgentOsOutbox(repository, {
      publish: async (event) => {
        published.push(event.id);
      },
    }, {
      now: '2026-06-13T10:05:00.000Z',
    });

    expect(result).toMatchObject({
      attempted: 2,
      published: 2,
      failed: 0,
      remainingPending: 0,
    });
    expect(published).toEqual(['evt_1', 'evt_2']);
    expect((await repository.listOutbox()).map((item) => item.status)).toEqual(['published', 'published']);
  });

  it('marks failed publishes failed and leaves already published records untouched', async () => {
    const repository = new InMemoryAgentOsRepository();
    await repository.appendOutbox(markOutboxPublished(record('evt_done'), '2026-06-13T10:01:00.000Z'));
    await repository.appendOutbox(record('evt_fail'));

    const result = await drainAgentOsOutbox(repository, {
      publish: async () => {
        throw new Error('nats unavailable');
      },
    }, {
      now: '2026-06-13T10:05:00.000Z',
    });

    expect(result).toMatchObject({
      attempted: 1,
      published: 0,
      failed: 1,
      remainingPending: 0,
    });

    const outbox = await repository.listOutbox();
    expect(outbox[0]).toMatchObject({ status: 'published', attempts: 0 });
    expect(outbox[1]).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'nats unavailable',
    });
  });
});
