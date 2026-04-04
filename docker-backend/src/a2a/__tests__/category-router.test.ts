/**
 * Tests for category-router — maps IntentClassification to RuntimeType + ModelTier.
 */

import { describe, it, expect } from 'vitest';
import { routeByCategory, getRoutingTable } from '../category-router';
import { classifyIntent } from '../intent-gate';
import type { IntentClassification } from '../intent-gate';

// Helper: build a minimal classification for a given category at high confidence
function mkClass(
  category: IntentClassification['category'],
  confidence = 0.9,
): IntentClassification {
  return {
    category,
    confidence,
    keywords: ['test-keyword'],
    allScores: {
      'bug-fix': 0, debug: 0, feature: 0, refactor: 0,
      test: 0, doc: 0, visual: 0, other: 0,
      [category]: 5,
    } as IntentClassification['allScores'],
  };
}

describe('routeByCategory', () => {
  describe('default mappings', () => {
    it('visual → opencode + powerful', () => {
      const decision = routeByCategory(mkClass('visual'));
      expect(decision.runtimeType).toBe('opencode');
      expect(decision.modelTier).toBe('powerful');
      expect(decision.category).toBe('visual');
      expect(decision.fallback).toBe(false);
    });

    it('bug-fix → claude-code + powerful', () => {
      const decision = routeByCategory(mkClass('bug-fix'));
      expect(decision.runtimeType).toBe('claude-code');
      expect(decision.modelTier).toBe('powerful');
    });

    it('debug → claude-code + powerful', () => {
      const decision = routeByCategory(mkClass('debug'));
      expect(decision.runtimeType).toBe('claude-code');
      expect(decision.modelTier).toBe('powerful');
    });

    it('feature → opencode + powerful', () => {
      const decision = routeByCategory(mkClass('feature'));
      expect(decision.runtimeType).toBe('opencode');
      expect(decision.modelTier).toBe('powerful');
    });

    it('refactor → opencode + balanced', () => {
      const decision = routeByCategory(mkClass('refactor'));
      expect(decision.runtimeType).toBe('opencode');
      expect(decision.modelTier).toBe('balanced');
    });

    it('test → omo + fast', () => {
      const decision = routeByCategory(mkClass('test'));
      expect(decision.runtimeType).toBe('omo');
      expect(decision.modelTier).toBe('fast');
    });

    it('doc → omo + fast', () => {
      const decision = routeByCategory(mkClass('doc'));
      expect(decision.runtimeType).toBe('omo');
      expect(decision.modelTier).toBe('fast');
    });

    it('other → native + balanced', () => {
      const decision = routeByCategory(mkClass('other'));
      expect(decision.runtimeType).toBe('native');
      expect(decision.modelTier).toBe('balanced');
    });
  });

  describe('confidence threshold', () => {
    it('routes low-confidence classification to other', () => {
      const lowConf = mkClass('visual', 0.1);
      const decision = routeByCategory(lowConf);
      expect(decision.category).toBe('other');
      expect(decision.runtimeType).toBe('native');
      expect(decision.reasoning).toContain('Low confidence');
    });

    it('respects custom confidence threshold', () => {
      const midConf = mkClass('visual', 0.5);
      const decision = routeByCategory(midConf, { confidenceThreshold: 0.8 });
      expect(decision.category).toBe('other');
    });

    it('trusts high confidence above threshold', () => {
      const highConf = mkClass('visual', 0.9);
      const decision = routeByCategory(highConf, { confidenceThreshold: 0.5 });
      expect(decision.category).toBe('visual');
      expect(decision.runtimeType).toBe('opencode');
    });

    it('default threshold (0.2) blocks very low confidence', () => {
      const decision = routeByCategory(mkClass('bug-fix', 0.1));
      expect(decision.category).toBe('other');
    });
  });

  describe('reasoning strings', () => {
    it('includes reasoning for every category', () => {
      const categories: IntentClassification['category'][] = [
        'bug-fix', 'debug', 'feature', 'refactor', 'test', 'doc', 'visual', 'other',
      ];
      for (const cat of categories) {
        const decision = routeByCategory(mkClass(cat));
        expect(decision.reasoning).toBeTruthy();
        expect(decision.reasoning.length).toBeGreaterThan(10);
      }
    });
  });

  describe('classification passthrough', () => {
    it('preserves the input classification in the decision', () => {
      const input = mkClass('visual', 0.75);
      const decision = routeByCategory(input);
      expect(decision.classification).toBe(input);
    });
  });

  describe('integration with classifyIntent', () => {
    it('end-to-end: visual prompt → opencode + powerful', () => {
      const classification = classifyIntent('build a landing page with Tailwind');
      const decision = routeByCategory(classification);
      expect(decision.category).toBe('visual');
      expect(decision.runtimeType).toBe('opencode');
      expect(decision.modelTier).toBe('powerful');
    });

    it('end-to-end: bug prompt → claude-code + powerful', () => {
      const classification = classifyIntent('fix the broken login error');
      const decision = routeByCategory(classification);
      expect(decision.category).toBe('bug-fix');
      expect(decision.runtimeType).toBe('claude-code');
    });

    it('end-to-end: empty prompt → native + balanced', () => {
      const classification = classifyIntent('');
      const decision = routeByCategory(classification);
      expect(decision.category).toBe('other');
      expect(decision.runtimeType).toBe('native');
    });
  });
});

describe('getRoutingTable', () => {
  it('returns a map with all 8 categories', () => {
    const table = getRoutingTable();
    const categories: IntentClassification['category'][] = [
      'bug-fix', 'debug', 'feature', 'refactor', 'test', 'doc', 'visual', 'other',
    ];
    for (const cat of categories) {
      expect(table).toHaveProperty(cat);
      expect(table[cat]).toHaveProperty('runtime');
      expect(table[cat]).toHaveProperty('tier');
      expect(table[cat]).toHaveProperty('reasoning');
    }
  });

  it('every tier is one of fast/balanced/powerful', () => {
    const table = getRoutingTable();
    const validTiers = ['fast', 'balanced', 'powerful'];
    for (const mapping of Object.values(table)) {
      expect(validTiers).toContain(mapping.tier);
    }
  });
});
