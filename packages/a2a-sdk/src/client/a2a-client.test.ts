/**
 * A2AClient — proves remote task envelopes with a malformed `history` chain are
 * REJECTED on consumption (`listTasks`), wiring `validateTaskHistory` at the
 * client-side trust boundary, and that rejections surface via `onInvalidHistory`.
 */
import { describe, it, expect, vi } from 'vitest';
import { A2AClient } from './a2a-client';

function fetchReturning(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

const VALID_HISTORY = [
  { from: 'submitted', to: 'working', transitioned_at: '2026-01-01T00:00:00.000Z' },
];

const FORGED_HISTORY = [
  { from: 'completed', to: 'working', transitioned_at: '2026-01-01T00:00:00.000Z' },
];

describe('A2AClient.listTasks history validation', () => {
  it('keeps envelopes with a well-formed (or absent) history', async () => {
    const client = new A2AClient({
      baseUrl: 'http://remote',
      fetchImpl: fetchReturning({ data: [{ id: 't1', history: VALID_HISTORY }, { id: 't2' }] }),
    });
    const tasks = await client.listTasks();
    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('drops an envelope with a forged history chain and reports it', async () => {
    const onInvalidHistory = vi.fn();
    const client = new A2AClient({
      baseUrl: 'http://remote',
      onInvalidHistory,
      fetchImpl: fetchReturning({
        data: [{ id: 'good', history: VALID_HISTORY }, { id: 'bad', history: FORGED_HISTORY }],
      }),
    });
    const tasks = await client.listTasks();
    expect(tasks.map((t) => t.id)).toEqual(['good']);
    expect(onInvalidHistory).toHaveBeenCalledTimes(1);
    expect(onInvalidHistory).toHaveBeenCalledWith('bad', expect.stringContaining('illegal transition'));
  });
});
