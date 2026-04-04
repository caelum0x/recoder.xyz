import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../intent-gate';

describe('intent-gate', () => {
  it('classifies visual feature prompts with strong confidence', () => {
    const result = classifyIntent('Build a responsive landing page UI with a navbar, hero section, and Tailwind styling.');

    expect(result.category).toBe('visual');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.keywords).toContain('landing page');
  });

  it('prioritizes bug-fix over debug on failing crash prompts', () => {
    const result = classifyIntent('Fix the crash bug that throws an error and fails the app on startup.');

    expect(result.category).toBe('bug-fix');
    expect(result.allScores['bug-fix']).toBeGreaterThan(0);
    expect(result.allScores.debug).toBe(0);
  });

  it('returns other for empty prompts', () => {
    const result = classifyIntent('   ');

    expect(result.category).toBe('other');
    expect(result.confidence).toBe(0);
  });
});
