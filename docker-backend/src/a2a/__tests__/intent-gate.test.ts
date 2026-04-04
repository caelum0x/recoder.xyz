/**
 * Tests for intent-gate — classify user prompts into TaskCategory.
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent, type TaskCategory } from '../intent-gate';

describe('classifyIntent', () => {
  describe('bug-fix category', () => {
    it('classifies "fix the broken login" as bug-fix', () => {
      const result = classifyIntent('fix the broken login');
      expect(result.category).toBe('bug-fix');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.keywords).toContain('fix');
    });

    it('classifies "there is a bug in the parser"', () => {
      const result = classifyIntent('there is a bug in the parser');
      expect(result.category).toBe('bug-fix');
    });

    it('classifies "the app keeps crashing" as bug-fix', () => {
      const result = classifyIntent('the app keeps crashing');
      expect(result.category).toBe('bug-fix');
    });

    it('classifies "failing test in CI" as bug-fix (wins over test)', () => {
      const result = classifyIntent('failing test in CI');
      // "fail" matches bug-fix, "test" matches test — bug-fix wins on priority
      expect(result.category).toBe('bug-fix');
    });
  });

  describe('debug category', () => {
    it('classifies "debug this weird issue"', () => {
      const result = classifyIntent('debug this weird issue');
      expect(result.category).toBe('debug');
    });

    it('classifies "why is the request slow"', () => {
      const result = classifyIntent('why is the request slow');
      expect(result.category).toBe('debug');
    });

    it('classifies "investigate the memory leak"', () => {
      const result = classifyIntent('investigate the memory leak');
      expect(result.category).toBe('debug');
    });
  });

  describe('feature category', () => {
    it('classifies "add a dark mode toggle"', () => {
      const result = classifyIntent('add a dark mode toggle');
      // "dark mode" is a visual keyword and wins over "add"
      expect(['visual', 'feature']).toContain(result.category);
    });

    it('classifies "implement user authentication"', () => {
      const result = classifyIntent('implement user authentication');
      expect(result.category).toBe('feature');
    });

    it('classifies "build a new dashboard"', () => {
      const result = classifyIntent('build a new dashboard');
      expect(result.category).toBe('feature');
    });
  });

  describe('refactor category', () => {
    it('classifies "refactor the auth module"', () => {
      const result = classifyIntent('refactor the auth module');
      expect(result.category).toBe('refactor');
    });

    it('classifies "clean up the legacy code"', () => {
      const result = classifyIntent('clean up the legacy code');
      expect(result.category).toBe('refactor');
    });

    it('classifies "rename getUser to fetchUser"', () => {
      const result = classifyIntent('rename getUser to fetchUser');
      expect(result.category).toBe('refactor');
    });
  });

  describe('test category', () => {
    it('classifies "add unit tests for UserService"', () => {
      const result = classifyIntent('add unit tests for UserService');
      // "unit test" and "test" match test, "add" matches feature — test wins on count
      expect(result.category).toBe('test');
    });

    it('classifies "improve test coverage"', () => {
      const result = classifyIntent('improve test coverage');
      expect(result.category).toBe('test');
    });

    it('classifies "write vitest specs"', () => {
      const result = classifyIntent('write vitest specs');
      expect(result.category).toBe('test');
    });

    it('classifies "add e2e tests with playwright"', () => {
      const result = classifyIntent('add e2e tests with playwright');
      expect(result.category).toBe('test');
    });
  });

  describe('doc category', () => {
    it('classifies "document the API"', () => {
      const result = classifyIntent('document the API');
      expect(result.category).toBe('doc');
    });

    it('classifies "update the README"', () => {
      const result = classifyIntent('update the README');
      expect(result.category).toBe('doc');
    });

    it('classifies "explain how auth works"', () => {
      const result = classifyIntent('explain how auth works');
      expect(result.category).toBe('doc');
    });
  });

  describe('visual category', () => {
    it('classifies "build a landing page for a coffee shop"', () => {
      const result = classifyIntent('build a landing page for a coffee shop');
      expect(result.category).toBe('visual');
    });

    it('classifies "make the button bigger"', () => {
      const result = classifyIntent('make the button bigger');
      expect(result.category).toBe('visual');
    });

    it('classifies "style the navbar with Tailwind"', () => {
      const result = classifyIntent('style the navbar with Tailwind');
      expect(result.category).toBe('visual');
    });

    it('classifies "add a dark mode theme"', () => {
      const result = classifyIntent('add a dark mode theme');
      expect(result.category).toBe('visual');
    });

    it('classifies "create a responsive hero section"', () => {
      const result = classifyIntent('create a responsive hero section');
      expect(result.category).toBe('visual');
    });
  });

  describe('other category (fallback)', () => {
    it('classifies empty prompt as other with 0 confidence', () => {
      const result = classifyIntent('');
      expect(result.category).toBe('other');
      expect(result.confidence).toBe(0);
      expect(result.keywords).toEqual([]);
    });

    it('classifies whitespace-only as other', () => {
      const result = classifyIntent('   \n\t  ');
      expect(result.category).toBe('other');
      expect(result.confidence).toBe(0);
    });

    it('classifies prompt with no category signals as other', () => {
      const result = classifyIntent('the quick brown fox jumps over the lazy dog');
      expect(result.category).toBe('other');
    });

    it('handles null-like input gracefully', () => {
      // @ts-expect-error — testing runtime safety
      const result = classifyIntent(null);
      expect(result.category).toBe('other');
      expect(result.confidence).toBe(0);
    });
  });

  describe('confidence scoring', () => {
    it('gives high confidence to prompts with many category-specific keywords', () => {
      const result = classifyIntent('refactor the component, simplify the logic, extract the helper');
      expect(result.category).toBe('refactor');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('gives low confidence to prompts with single keyword match', () => {
      const result = classifyIntent('please test this');
      expect(result.category).toBe('test');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('confidence is between 0 and 1', () => {
      const prompts = [
        'fix the bug',
        'add a feature',
        'refactor this',
        'write tests',
        'document the API',
        'build a landing page',
        'debug the issue',
        '',
      ];
      for (const p of prompts) {
        const r = classifyIntent(p);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('allScores metadata', () => {
    it('includes scores for all categories', () => {
      const result = classifyIntent('fix the bug');
      const categories: TaskCategory[] = ['bug-fix', 'debug', 'feature', 'refactor', 'test', 'doc', 'visual', 'other'];
      for (const cat of categories) {
        expect(result.allScores).toHaveProperty(cat);
        expect(typeof result.allScores[cat]).toBe('number');
      }
    });

    it('winning category has the highest score', () => {
      const result = classifyIntent('add unit tests for UserService');
      const winningScore = result.allScores[result.category];
      for (const [cat, score] of Object.entries(result.allScores)) {
        if (cat !== result.category) {
          expect(winningScore).toBeGreaterThanOrEqual(score);
        }
      }
    });
  });

  describe('keyword deduplication', () => {
    it('deduplicates matched keywords', () => {
      const result = classifyIntent('fix the fix for the fixing fix');
      const unique = new Set(result.keywords);
      expect(result.keywords.length).toBe(unique.size);
    });
  });
});
