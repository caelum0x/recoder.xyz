import { describe, expect, it } from 'vitest';
import { FakeRecoderSessionRpcClient } from './fake-client.js';
import type { SessionThreadStreamItem } from './types.js';

describe('FakeRecoderSessionRpcClient', () => {
  it('lists seeded threads', async () => {
    const client = new FakeRecoderSessionRpcClient({
      threads: [
        { id: 't1', projectId: 'p1', title: 'Fix the parser', status: 'active', branch: 'main', activeRunId: null, updatedAt: '2026-10-15T00:00:00.000Z' },
      ],
    });
    await client.connect();
    const threads = await client.listThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]?.title).toBe('Fix the parser');
  });

  it('delivers a snapshot on subscribe, then a message event on sendMessage', async () => {
    const client = new FakeRecoderSessionRpcClient({
      messagesByThread: {
        t1: [{ id: 'm0', threadId: 't1', role: 'system', text: 'Session started', streaming: false, createdAt: '2026-10-15T00:00:00.000Z' }],
      },
    });
    await client.connect();
    const received: SessionThreadStreamItem[] = [];
    const unsubscribe = client.subscribeThread('t1', (item) => received.push(item));

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'snapshot', messages: [{ text: 'Session started' }] });

    await client.sendMessage({ threadId: 't1', text: 'hello' });
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({ kind: 'message', message: { role: 'user', text: 'hello' } });
    expect(client.sentMessages).toEqual([{ threadId: 't1', text: 'hello' }]);

    unsubscribe();
    await client.sendMessage({ threadId: 't1', text: 'ignored after unsubscribe' });
    expect(received).toHaveLength(2);
  });

  it('pushAssistantMessage notifies subscribers like a real agent reply', async () => {
    const client = new FakeRecoderSessionRpcClient();
    await client.connect();
    const received: SessionThreadStreamItem[] = [];
    client.subscribeThread('t1', (item) => received.push(item));
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    client.pushAssistantMessage('t1', 'Done. Ran the tests, all green.');
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({ kind: 'message', message: { role: 'assistant' } });
  });

  it('returns an empty diff for a thread with no diff seeded', async () => {
    const client = new FakeRecoderSessionRpcClient();
    await client.connect();
    const diff = await client.getFullThreadDiff('unknown-thread');
    expect(diff).toEqual({ threadId: 'unknown-thread', fromTurnCount: 0, toTurnCount: 0, diff: '' });
  });

  it('returns the seeded diff for a thread that has one', async () => {
    const seededDiff = { threadId: 't1', fromTurnCount: 0, toTurnCount: 2, diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n' };
    const client = new FakeRecoderSessionRpcClient({ diffsByThread: { t1: seededDiff } });
    await client.connect();
    expect(await client.getFullThreadDiff('t1')).toEqual(seededDiff);
  });
});
