import { afterEach, describe, expect, it } from 'vitest';

import {
  clearContainerCreateFailure,
  getContainerCreateCooldown,
  noteContainerCreateFailure,
  resetContainerCreateBreakerForTests,
  shouldAttemptContainerCreate,
} from './container-create-breaker';

describe('container-create-breaker', () => {
  afterEach(() => {
    resetContainerCreateBreakerForTests();
  });

  it('allows requests when no cooldown is active', () => {
    expect(shouldAttemptContainerCreate('project-1')).toEqual({ allowed: true });
  });

  it('blocks repeated automatic attempts while cooldown is active', () => {
    noteContainerCreateFailure('project-1', 'No such image', {
      now: 1_000,
      cooldownMs: 30_000,
    });

    expect(shouldAttemptContainerCreate('project-1', { now: 15_000 })).toEqual({
      allowed: false,
      message: 'No such image',
      retryAfterMs: 16_000,
      retryAt: 31_000,
    });
  });

  it('allows manual retries to bypass the cooldown', () => {
    noteContainerCreateFailure('project-1', 'No such image', {
      now: 1_000,
      cooldownMs: 30_000,
    });

    expect(shouldAttemptContainerCreate('project-1', {
      now: 5_000,
      bypassCooldown: true,
    })).toEqual({ allowed: true });
  });

  it('expires cooldown entries automatically once the retry window passes', () => {
    noteContainerCreateFailure('project-1', 'No such image', {
      now: 1_000,
      cooldownMs: 5_000,
    });

    expect(getContainerCreateCooldown('project-1', 7_000)).toBeNull();
    expect(shouldAttemptContainerCreate('project-1', { now: 7_000 })).toEqual({ allowed: true });
  });

  it('clears a project-specific cooldown explicitly', () => {
    noteContainerCreateFailure('project-1', 'No such image');
    clearContainerCreateFailure('project-1');

    expect(getContainerCreateCooldown('project-1')).toBeNull();
  });
});

