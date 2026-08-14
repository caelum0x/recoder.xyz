import { describe, expect, it } from 'vitest';
import { createPollingWaitSource } from './wait-source.js';

describe('createPollingWaitSource', () => {
  it('ends cleanly when an authoritative probe throws', async () => {
    const source = createPollingWaitSource({
      probe: async () => {
        throw new Error('workspace store unavailable');
      },
    });

    const iterator = source.watch('ws_1', 0)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });
});
