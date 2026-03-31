import { describe, expect, it } from 'vitest';
import { ActionRunner } from './action-runner';

describe('ActionRunner project id handling', () => {
  it('does not treat route slugs as sandbox ids', () => {
    const runner = new ActionRunner('hello-world');

    expect(runner.getProjectId()).toMatch(/^project-/);
    expect(runner.getProjectId()).not.toBe('hello-world');
  });

  it('accepts a later sandbox project id update', () => {
    const runner = new ActionRunner();

    runner.setProjectId('project-123');

    expect(runner.getProjectId()).toBe('project-123');
  });
});
