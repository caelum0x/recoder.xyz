/**
 * T2 — correlation propagates across async boundaries; nested runs are isolated
 * (a child run's ids never leak back to the parent scope).
 */
import { describe, it, expect } from 'vitest';
import {
  runWithCorrelation,
  currentCorrelation,
  currentCorrelationId,
  correlationLabels,
  enrichCorrelation,
} from '../services/correlation.service.js';

describe('correlation service', () => {
  it('is null outside any scope', () => {
    expect(currentCorrelation()).toBeNull();
    expect(currentCorrelationId()).toBeNull();
  });

  it('propagates across an await boundary', async () => {
    await runWithCorrelation({ correlationId: 'c-1' }, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      expect(currentCorrelationId()).toBe('c-1');
    });
  });

  it('generates an id when none supplied', () => {
    runWithCorrelation(undefined, () => {
      expect(currentCorrelationId()).toBeTruthy();
    });
  });

  it('nested runs are isolated', () => {
    runWithCorrelation({ correlationId: 'parent', runId: 'r-parent' }, () => {
      runWithCorrelation({ correlationId: 'child', runId: 'r-child' }, () => {
        expect(currentCorrelationId()).toBe('child');
        expect(currentCorrelation()?.runId).toBe('r-child');
      });
      // Parent scope is intact after the child returns.
      expect(currentCorrelationId()).toBe('parent');
      expect(currentCorrelation()?.runId).toBe('r-parent');
    });
  });

  it('enrichCorrelation adds a trace id to the current scope only', () => {
    runWithCorrelation({ correlationId: 'c' }, () => {
      enrichCorrelation({ traceId: 't-1' });
      expect(correlationLabels()).toMatchObject({ correlationId: 'c', traceId: 't-1' });
    });
    // No leak outside the scope.
    expect(correlationLabels()).toEqual({});
  });
});
