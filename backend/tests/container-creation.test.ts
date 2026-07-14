import { describe, it, expect, vi } from 'vitest';
import { isCreationStale, withCreationTimeout } from '../src/container-creation';

const makeEntry = (startedAt: number) => ({ promise: Promise.resolve(true), startedAt });

describe('container-creation helpers', () => {
  it('detects stale entries based on timeout', () => {
    const now = Date.now();
    expect(isCreationStale(makeEntry(now - 5000), 4000, now)).toBe(true);
    expect(isCreationStale(makeEntry(now - 3000), 4000, now)).toBe(false);
  });

  it('times out unresolved promises', async () => {
    vi.useFakeTimers();
    const pending = new Promise<void>(() => {});
    const timed = withCreationTimeout(pending, 1000);

    vi.advanceTimersByTime(1000);
    await expect(timed).rejects.toThrow('Container creation timed out');
    vi.useRealTimers();
  });

  it('invokes timeout cleanup callback', async () => {
    vi.useFakeTimers();
    let cleaned = false;
    const pending = new Promise<void>(() => {});
    const timed = withCreationTimeout(pending, 1000, () => {
      cleaned = true;
    });

    vi.advanceTimersByTime(1000);
    await expect(timed).rejects.toThrow('Container creation timed out');
    expect(cleaned).toBe(true);
    vi.useRealTimers();
  });

  it('returns resolved promises without timeout', async () => {
    const result = await withCreationTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });
});
