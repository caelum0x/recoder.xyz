import { describe, expect, it } from 'vitest';
import { deriveRoutingPlan } from '../multi-dispatch.service';

describe('deriveRoutingPlan', () => {
  it('derives implementation routing defaults for feature prompts', () => {
    const plan = deriveRoutingPlan('Add a new agent task routing feature for coding work');

    expect(plan.intent.category).toBe('feature');
    expect(plan.runtimeCategory).toBe('implementation');
    expect(plan.requirements.requiredCapabilities).toEqual(['code-generation']);
    expect(plan.requirements.preferredPlatform).toBe('codex');
  });

  it('derives debug-oriented routing defaults for investigation prompts', () => {
    const plan = deriveRoutingPlan('Debug and investigate task routing behavior across the review flow');

    expect(plan.intent.category).toBe('debug');
    expect(plan.runtimeCategory).toBe('debug');
    expect(plan.requirements.requiredCapabilities).toEqual(['code-review']);
    expect(plan.requirements.preferredPlatform).toBe('claude_code');
  });

  it('allows explicit routing hints to override prompt-derived defaults', () => {
    const plan = deriveRoutingPlan('Add a landing page component', {
      runtimeCategory: 'visual',
      requiredCapabilities: ['web-interface'],
      preferredCapabilities: ['ui'],
      preferredPlatform: 'recoder_app',
    });

    expect(plan.runtimeCategory).toBe('visual');
    expect(plan.requirements.requiredCapabilities).toEqual(['web-interface']);
    expect(plan.requirements.preferredCapabilities).toEqual(['ui']);
    expect(plan.requirements.preferredPlatform).toBe('recoder_app');
  });

  it('falls back to a general routing plan for ambiguous prompts', () => {
    const plan = deriveRoutingPlan('hello there');

    expect(plan.intent.category).toBe('other');
    expect(plan.runtimeCategory).toBe('general');
    expect(plan.requirements.requiredCapabilities).toEqual([]);
    expect(plan.requirements.preferredCapabilities).toEqual([]);
  });
});
