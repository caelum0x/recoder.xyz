import { describe, it, expect } from 'vitest';
import { parsePassthrough } from '../passthrough';

/** Build a webhook payload whose `passthrough` is the JSON the checkout wrote. */
function payload(obj: unknown) {
  return { passthrough: JSON.stringify(obj) };
}

describe('parsePassthrough', () => {
  it('parses the checkout producer shape { userId, plan } (the bug: was reading user_id)', () => {
    // create-checkout/route.ts writes exactly this.
    expect(parsePassthrough(payload({ userId: 'user_123', plan: 'pro' }))).toEqual({
      userId: 'user_123',
      plan: 'pro',
    });
  });

  it('still accepts the legacy snake_case user_id (in-flight passthrough)', () => {
    expect(parsePassthrough(payload({ user_id: 'user_9', plan: 'team' }))).toEqual({
      userId: 'user_9',
      plan: 'team',
    });
  });

  it('prefers userId when both keys are present', () => {
    expect(parsePassthrough(payload({ userId: 'a', user_id: 'b' }))?.userId).toBe('a');
  });

  it('omits plan when absent', () => {
    expect(parsePassthrough(payload({ userId: 'user_1' }))).toEqual({ userId: 'user_1' });
  });

  it('returns null on a missing user id, absent passthrough, or malformed JSON', () => {
    expect(parsePassthrough(payload({ plan: 'pro' }))).toBeNull();
    expect(parsePassthrough({})).toBeNull();
    expect(parsePassthrough({ passthrough: 'not json' })).toBeNull();
    expect(parsePassthrough({ passthrough: JSON.stringify('a string') })).toBeNull();
  });
});
