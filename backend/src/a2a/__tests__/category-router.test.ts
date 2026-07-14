import { describe, expect, it } from 'vitest';
import { routeByCategory } from '../category-router';

describe('category-router', () => {
  it('routes visual work to opencode with a powerful tier', () => {
    const decision = routeByCategory({
      category: 'visual',
      confidence: 0.8,
      keywords: ['landing page', 'ui'],
      allScores: {
        'bug-fix': 0,
        debug: 0,
        feature: 1,
        refactor: 0,
        test: 0,
        doc: 0,
        visual: 2,
        other: 0,
      },
    });

    expect(decision.runtimeType).toBe('opencode');
    expect(decision.modelTier).toBe('powerful');
    expect(decision.fallback).toBe(false);
  });

  it('falls back to native for low-confidence prompts', () => {
    const decision = routeByCategory({
      category: 'feature',
      confidence: 0.1,
      keywords: ['add'],
      allScores: {
        'bug-fix': 0,
        debug: 0,
        feature: 1,
        refactor: 0,
        test: 0,
        doc: 0,
        visual: 0,
        other: 0,
      },
    });

    expect(decision.category).toBe('other');
    expect(decision.runtimeType).toBe('native');
    expect(decision.reasoning.toLowerCase()).toContain('low confidence');
  });
});
