/**
 * Unit tests for describeSignInFailure — the pure classifier that turns a raw
 * sign-in failure reason into calm, plain-language copy. It must NEVER echo a
 * raw error object back to the user and must always offer a retryable message.
 */
import { describe, expect, it } from 'vitest';
import { describeSignInFailure } from './SignIn';

describe('describeSignInFailure', () => {
  it('handles a missing reason with a generic, retryable message', () => {
    const out = describeSignInFailure(undefined);
    expect(out.title).toMatch(/did not complete/i);
    expect(out.hint).toMatch(/try again/i);
  });

  it('classifies denial', () => {
    expect(describeSignInFailure('access_denied').title).toMatch(/declined/i);
    expect(describeSignInFailure('sign-in was denied').title).toMatch(/declined/i);
  });

  it('classifies expiry / timeout', () => {
    expect(describeSignInFailure('device grant expired before approval').title).toMatch(/expired/i);
    expect(describeSignInFailure('timeout').title).toMatch(/expired/i);
  });

  it('classifies cancellation', () => {
    expect(describeSignInFailure('cancelled').title).toMatch(/cancelled/i);
    expect(describeSignInFailure('window-closed').title).toMatch(/cancelled/i);
  });

  it('classifies network/transport failures', () => {
    expect(describeSignInFailure('fetch failed: ECONNREFUSED').title).toMatch(/couldn.?t reach/i);
    expect(describeSignInFailure('transport error (HTTP 503)').title).toMatch(/couldn.?t reach/i);
  });

  it('classifies an unavailable sign-in service', () => {
    expect(describeSignInFailure('device-flow unavailable (@recoder/distribution not loaded)').title)
      .toMatch(/unavailable/i);
    expect(describeSignInFailure('no-desktop-device-login').title).toMatch(/unavailable/i);
  });

  it('never echoes an unknown raw reason verbatim as the title', () => {
    const raw = 'TypeError: Cannot read properties of undefined (reading foo)';
    const out = describeSignInFailure(raw);
    expect(out.title).not.toContain('TypeError');
    expect(out.title).toMatch(/did not complete/i);
    expect(out.hint).toMatch(/try again/i);
  });
});
