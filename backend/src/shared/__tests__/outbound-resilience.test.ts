import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  nextBackoffDelayMs,
  backoffCeilingMs,
  RetryAbortedError,
  CircuitBreaker,
  CircuitOpenError,
  defaultSleep,
  type Sleep,
  type RetryNotice,
} from '../outbound-resilience.js';

/** A sleep that records the requested delays and resolves instantly. */
function fakeSleep(): { sleep: Sleep; delays: number[] } {
  const delays: number[] = [];
  const sleep: Sleep = async (ms, signal) => {
    delays.push(ms);
    if (signal?.aborted) {
      const reason = (signal as { reason?: unknown }).reason;
      throw reason instanceof Error ? reason : new RetryAbortedError(reason);
    }
  };
  return { sleep, delays };
}

/** A frozen-then-advanceable fake clock. */
function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void; set: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
  };
}

/* ------------------------------------------------------------------ *
 * backoff math                                                        *
 * ------------------------------------------------------------------ */

describe('backoffCeilingMs', () => {
  it('grows exponentially then clamps to maxDelay', () => {
    expect(backoffCeilingMs(1, 100, 30_000)).toBe(100); // 100 * 2^0
    expect(backoffCeilingMs(2, 100, 30_000)).toBe(200); // 100 * 2^1
    expect(backoffCeilingMs(3, 100, 30_000)).toBe(400);
    expect(backoffCeilingMs(9, 100, 30_000)).toBe(25_600);
    expect(backoffCeilingMs(10, 100, 30_000)).toBe(30_000); // clamped
  });

  it('never returns Infinity even for absurd attempt numbers', () => {
    expect(backoffCeilingMs(5000, 100, 30_000)).toBe(30_000);
  });

  it('treats attempt < 1 as attempt 1', () => {
    expect(backoffCeilingMs(0, 100, 30_000)).toBe(100);
  });
});

describe('nextBackoffDelayMs', () => {
  it('is full-jitter: uniformly in [0, ceiling] via injected random', () => {
    expect(nextBackoffDelayMs(2, { baseDelayMs: 100, maxDelayMs: 30_000, random: () => 0 })).toBe(0);
    expect(nextBackoffDelayMs(2, { baseDelayMs: 100, maxDelayMs: 30_000, random: () => 0.5 })).toBe(100); // 0.5*200
    expect(nextBackoffDelayMs(2, { baseDelayMs: 100, maxDelayMs: 30_000, random: () => 0.999999 })).toBe(199);
  });

  it('is deterministic for a fixed random', () => {
    const random = () => 0.25;
    const a = nextBackoffDelayMs(3, { baseDelayMs: 100, maxDelayMs: 30_000, random });
    const b = nextBackoffDelayMs(3, { baseDelayMs: 100, maxDelayMs: 30_000, random });
    expect(a).toBe(b);
    expect(a).toBe(100); // 0.25 * 400
  });
});

/* ------------------------------------------------------------------ *
 * withRetry                                                           *
 * ------------------------------------------------------------------ */

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    const { sleep, delays } = fakeSleep();
    const op = vi.fn(async () => 'ok');
    const result = await withRetry(op, { idempotent: true, sleep });
    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries an idempotent op until it succeeds, backing off between tries', async () => {
    const { sleep, delays } = fakeSleep();
    let calls = 0;
    const op = async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return calls;
    };
    const notices: RetryNotice[] = [];
    const result = await withRetry(op, {
      idempotent: true,
      maxAttempts: 5,
      baseDelayMs: 100,
      random: () => 1, // deterministic upper edge of full jitter
      sleep,
      onRetry: (n) => notices.push(n),
    });
    expect(result).toBe(3);
    // 2 failures → 2 sleeps. random()=1 clamps to just under ceiling floor.
    expect(delays).toHaveLength(2);
    expect(notices.map((n) => n.attempt)).toEqual([1, 2]);
    expect(notices[0].delayMs).toBe(delays[0]);
  });

  it('does NOT retry a non-idempotent op — fails fast on first error', async () => {
    const { sleep, delays } = fakeSleep();
    const op = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(withRetry(op, { idempotent: false, maxAttempts: 5, sleep })).rejects.toThrow('boom');
    expect(op).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const { sleep, delays } = fakeSleep();
    let calls = 0;
    const op = async () => {
      calls += 1;
      throw new Error(`fail-${calls}`);
    };
    await expect(
      withRetry(op, { idempotent: true, maxAttempts: 3, baseDelayMs: 10, random: () => 0, sleep }),
    ).rejects.toThrow('fail-3');
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2); // slept between the 3 attempts, not after the last
  });

  it('respects isRetryable: a non-retryable error terminates immediately', async () => {
    const { sleep } = fakeSleep();
    const op = vi.fn(async () => {
      const err = new Error('4xx');
      (err as { status?: number }).status = 400;
      throw err;
    });
    await expect(
      withRetry(op, {
        idempotent: true,
        maxAttempts: 5,
        sleep,
        isRetryable: (e) => (e as { status?: number }).status !== 400,
      }),
    ).rejects.toThrow('4xx');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('aborts before the first attempt when the signal is already aborted', async () => {
    const { sleep } = fakeSleep();
    const controller = new AbortController();
    controller.abort();
    const op = vi.fn(async () => 'never');
    await expect(withRetry(op, { idempotent: true, signal: controller.signal, sleep })).rejects.toBeDefined();
    expect(op).not.toHaveBeenCalled();
  });

  it('aborts mid-backoff: no further attempt is made', async () => {
    const controller = new AbortController();
    // A sleep that aborts the controller then rejects, simulating cancellation.
    const sleep: Sleep = async () => {
      controller.abort(new Error('cancelled'));
      throw new RetryAbortedError(new Error('cancelled'));
    };
    let calls = 0;
    const op = async () => {
      calls += 1;
      throw new Error('transient');
    };
    await expect(
      withRetry(op, { idempotent: true, maxAttempts: 5, signal: controller.signal, sleep }),
    ).rejects.toBeInstanceOf(RetryAbortedError);
    expect(calls).toBe(1); // failed once, then abort during backoff stops the loop
  });

  it('treats an AbortError thrown by the op as terminal (no retry)', async () => {
    const { sleep } = fakeSleep();
    const op = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    await expect(withRetry(op, { idempotent: true, maxAttempts: 5, sleep })).rejects.toThrow('aborted');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('clamps maxAttempts below 1 up to a single attempt', async () => {
    const { sleep } = fakeSleep();
    const op = vi.fn(async () => 'ok');
    await expect(withRetry(op, { idempotent: true, maxAttempts: 0, sleep })).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('passes the attempt number and signal into the op context', async () => {
    const { sleep } = fakeSleep();
    const seen: number[] = [];
    const controller = new AbortController();
    let calls = 0;
    await withRetry(
      async (ctx) => {
        seen.push(ctx.attempt);
        expect(ctx.signal).toBe(controller.signal);
        calls += 1;
        if (calls < 2) throw new Error('x');
        return 'done';
      },
      { idempotent: true, maxAttempts: 3, baseDelayMs: 1, random: () => 0, sleep, signal: controller.signal },
    );
    expect(seen).toEqual([1, 2]);
  });
});

describe('defaultSleep', () => {
  it('resolves after the delay using a real timer', async () => {
    const start = Date.now();
    await defaultSleep(5);
    expect(Date.now() - start).toBeGreaterThanOrEqual(3);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const c = new AbortController();
    c.abort(new Error('nope'));
    await expect(defaultSleep(1000, c.signal)).rejects.toThrow('nope');
  });

  it('rejects promptly when aborted during the wait', async () => {
    const c = new AbortController();
    const p = defaultSleep(10_000, c.signal);
    c.abort(new Error('cut'));
    await expect(p).rejects.toThrow('cut');
  });
});

/* ------------------------------------------------------------------ *
 * CircuitBreaker                                                      *
 * ------------------------------------------------------------------ */

describe('CircuitBreaker', () => {
  it('starts CLOSED and stays closed while under the failure threshold', () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: clock.now });
    expect(cb.state('svc')).toBe('closed');
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    expect(cb.state('svc')).toBe('closed');
    expect(cb.snapshot('svc').consecutiveFailures).toBe(2);
  });

  it('trips OPEN after N consecutive failures and fast-fails via guard', () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    expect(cb.state('svc')).toBe('open');
    expect(() => cb.guard('svc')).toThrow(CircuitOpenError);
    const snap = cb.snapshot('svc');
    expect(snap.state).toBe('open');
    expect(snap.retryAfterMs).toBe(1000);
  });

  it('a success resets the failure streak back toward CLOSED', () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    cb.recordSuccess('svc');
    expect(cb.snapshot('svc').consecutiveFailures).toBe(0);
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    expect(cb.state('svc')).toBe('closed'); // streak restarted, not yet 3
  });

  it('transitions OPEN → HALF-OPEN once the cooldown elapses', () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    expect(cb.state('svc')).toBe('open');
    clock.advance(999);
    expect(cb.state('svc')).toBe('open');
    clock.advance(1); // exactly at cooldown boundary
    expect(cb.state('svc')).toBe('half-open');
  });

  it('a HALF-OPEN probe success closes the circuit', () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    clock.advance(1000);
    expect(cb.guard('svc')).toBe('half-open');
    cb.recordSuccess('svc');
    expect(cb.state('svc')).toBe('closed');
    expect(cb.snapshot('svc').consecutiveFailures).toBe(0);
  });

  it('a HALF-OPEN probe failure re-opens and restarts the cooldown', () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('svc');
    cb.recordFailure('svc');
    clock.advance(1000);
    expect(cb.guard('svc')).toBe('half-open');
    cb.recordFailure('svc'); // probe failed
    expect(cb.state('svc')).toBe('open');
    expect(cb.snapshot('svc').retryAfterMs).toBe(1000); // full cooldown again
    clock.advance(1000);
    expect(cb.state('svc')).toBe('half-open');
  });

  it('permits only ONE half-open probe at a time (others fast-fail)', () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('svc');
    clock.advance(1000);
    expect(cb.guard('svc')).toBe('half-open'); // reserves the single probe slot
    expect(() => cb.guard('svc')).toThrow(CircuitOpenError); // second probe blocked
    expect(cb.snapshot('svc').probesInFlight).toBe(1);
  });

  it('isolates state per key', () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('a');
    cb.recordFailure('a');
    expect(cb.state('a')).toBe('open');
    expect(cb.state('b')).toBe('closed');
    expect(() => cb.guard('b')).not.toThrow();
  });

  it('reset(key) forgets a single key; reset() clears all', () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: clock.now });
    cb.recordFailure('a');
    cb.recordFailure('b');
    cb.reset('a');
    expect(cb.state('a')).toBe('closed');
    expect(cb.state('b')).toBe('open');
    cb.reset();
    expect(cb.state('b')).toBe('closed');
  });

  it('CircuitOpenError carries the key and code', () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 500, now: clock.now });
    cb.recordFailure('svc');
    try {
      cb.guard('svc');
      throw new Error('expected guard to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CircuitOpenError);
      expect((e as CircuitOpenError).key).toBe('svc');
      expect((e as CircuitOpenError).code).toBe('EGRESS_CIRCUIT_OPEN');
      expect((e as CircuitOpenError).retryAfterMs).toBe(500);
    }
  });
});

describe('CircuitBreaker.execute', () => {
  it('runs op when closed and records success', async () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: clock.now });
    const result = await cb.execute('svc', async () => 42);
    expect(result).toBe(42);
    expect(cb.state('svc')).toBe('closed');
  });

  it('records failures and eventually fast-fails without invoking op', async () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: clock.now });
    const op = vi.fn(async () => {
      throw new Error('down');
    });
    await expect(cb.execute('svc', op)).rejects.toThrow('down');
    await expect(cb.execute('svc', op)).rejects.toThrow('down');
    expect(cb.state('svc')).toBe('open');
    // Third call must fast-fail WITHOUT calling op again.
    await expect(cb.execute('svc', op)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('combines with withRetry: retries inside a single breaker slot', async () => {
    const clock = fakeClock();
    const { sleep } = fakeSleep();
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: clock.now });
    let calls = 0;
    const result = await cb.execute(
      'svc',
      async () => {
        calls += 1;
        if (calls < 2) throw new Error('transient');
        return 'ok';
      },
      { idempotent: true, maxAttempts: 3, baseDelayMs: 1, random: () => 0, sleep },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    // The retry succeeded, so the breaker sees ONE success, not the inner failure.
    expect(cb.state('svc')).toBe('closed');
    expect(cb.snapshot('svc').consecutiveFailures).toBe(0);
  });

  it('a retry that exhausts records a single breaker failure', async () => {
    const clock = fakeClock();
    const { sleep } = fakeSleep();
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: clock.now });
    const op = async () => {
      throw new Error('always');
    };
    await expect(
      cb.execute('svc', op, { idempotent: true, maxAttempts: 2, baseDelayMs: 1, random: () => 0, sleep }),
    ).rejects.toThrow('always');
    expect(cb.snapshot('svc').consecutiveFailures).toBe(1);
  });

  it('half-open probe via execute closes on success', async () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: clock.now });
    await expect(cb.execute('svc', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(cb.state('svc')).toBe('open');
    clock.advance(1000);
    const result = await cb.execute('svc', async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.state('svc')).toBe('closed');
  });
});
