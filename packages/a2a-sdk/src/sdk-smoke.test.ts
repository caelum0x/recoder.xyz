import { describe, expect, it } from 'vitest';

import {
  A2AErrorCodeEnum,
  TaskStateEnum,
} from './schemas';

import {
  mapCodexState,
  mapCodexStateStrict,
  mapClaudeState,
} from './state-mapping';
import { mapHttpError } from './error-mapping';

describe('@recoder/a2a-sdk smoke', () => {
  it('maps Codex and Claude states to canonical task states', () => {
    expect(mapCodexState('running')).toBe(TaskStateEnum.Working);
    expect(mapClaudeState('done')).toBe(TaskStateEnum.Completed);
    expect(mapCodexState('unknown-state')).toBeUndefined();
  });

  it('throws on strict mapping for unknown connector states', () => {
    expect(() => mapCodexStateStrict('unknown-state')).toThrow(
      'Unknown Codex state: "unknown-state"',
    );
  });

  it('maps HTTP errors to canonical error taxonomy', () => {
    const err = mapHttpError(429, 'rate limited');
    expect(err.code).toBe(A2AErrorCodeEnum.RateLimitExceeded);
    expect(err.message).toBe('rate limited');
  });
});
