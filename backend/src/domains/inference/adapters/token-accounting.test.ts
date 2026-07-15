/**
 * `token-accounting` — token estimation + integer micro-USD cost. Verifies the
 * gateway-reported usage wins, the char heuristic fills gaps, and unpriced /
 * absent catalog entries cost 0 (never a fabricated charge).
 */
import { describe, it, expect } from 'vitest';
import {
  computeCostMicroUsd,
  estimatePromptTokens,
  estimateStringTokens,
  resolveUsage,
} from './token-accounting.js';
import type { ModelCatalogEntry } from '../types.js';

describe('estimateStringTokens', () => {
  it('is ~4 chars/token and at least 1 for non-empty', () => {
    expect(estimateStringTokens('')).toBe(0);
    expect(estimateStringTokens('abcd')).toBe(1);
    expect(estimateStringTokens('a'.repeat(40))).toBe(10);
  });
});

describe('estimatePromptTokens', () => {
  it('sums per-message estimates with framing overhead', () => {
    const tokens = estimatePromptTokens([
      { role: 'system', content: 'a'.repeat(40) },
      { role: 'user', content: 'a'.repeat(40) },
    ]);
    // (10 + 3) * 2
    expect(tokens).toBe(26);
  });
});

describe('resolveUsage', () => {
  it('prefers gateway-reported counts', () => {
    const usage = resolveUsage({
      messages: [{ role: 'user', content: 'x'.repeat(400) }],
      completion: 'y'.repeat(400),
      reported: { inputTokens: 11, outputTokens: 7 },
    });
    expect(usage).toEqual({ inputTokens: 11, outputTokens: 7, totalTokens: 18 });
  });

  it('falls back to the heuristic for a missing side', () => {
    const usage = resolveUsage({
      messages: [{ role: 'user', content: 'x'.repeat(40) }],
      completion: 'y'.repeat(40),
      reported: { inputTokens: 5 },
    });
    expect(usage.inputTokens).toBe(5); // reported wins
    expect(usage.outputTokens).toBe(10); // heuristic (40/4)
    expect(usage.totalTokens).toBe(15);
  });
});

describe('computeCostMicroUsd', () => {
  const entry: Pick<ModelCatalogEntry, 'inputMicroUsdPerMTok' | 'outputMicroUsdPerMTok'> = {
    inputMicroUsdPerMTok: 150_000, // $0.15 / MTok
    outputMicroUsdPerMTok: 600_000, // $0.60 / MTok
  };

  it('computes integer micro-USD from per-MTok pricing', () => {
    // 1000 input * 150000/1e6 = 150 ; 500 output * 600000/1e6 = 300 => 450
    const cost = computeCostMicroUsd(
      { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      entry,
    );
    expect(cost).toBe(450);
  });

  it('costs 0 for an absent catalog entry or 0/0 pricing', () => {
    expect(computeCostMicroUsd({ inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 }, null)).toBe(0);
    expect(
      computeCostMicroUsd(
        { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 },
        { inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0 },
      ),
    ).toBe(0);
  });
});
