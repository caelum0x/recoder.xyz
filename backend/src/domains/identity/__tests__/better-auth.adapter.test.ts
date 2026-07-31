import { describe, it, expect, vi } from 'vitest';
import { stubSenders } from '../adapters/better-auth.adapter.js';

/** A magic-link / reset URL embeds a single-use bearer token — it must never hit the logs. */
const TOKEN_URL = 'https://recoder.xyz/auth/magic?token=SUPER-SECRET-BEARER-TOKEN';

function makeLogger() {
  return { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

describe('better-auth stub senders — never log the token-bearing URL', () => {
  it('sendMagicLink logs the email but never the magic-link URL/token', async () => {
    const log = makeLogger();
    await stubSenders(log as never).sendMagicLink({ email: 'a@b.com', url: TOKEN_URL });
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [payload, message] = log.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toMatchObject({ email: 'a@b.com' });
    expect(payload).not.toHaveProperty('url');
    expect(JSON.stringify({ payload, message })).not.toContain('SUPER-SECRET-BEARER-TOKEN');
  });

  it('sendResetPassword never logs the reset URL/token', async () => {
    const log = makeLogger();
    await stubSenders(log as never).sendResetPassword!({ user: { email: 'a@b.com' }, url: TOKEN_URL });
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [payload, message] = log.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).not.toHaveProperty('url');
    expect(JSON.stringify({ payload, message })).not.toContain('SUPER-SECRET-BEARER-TOKEN');
  });

  it('sendVerificationEmail never logs the verification URL/token', async () => {
    const log = makeLogger();
    await stubSenders(log as never).sendVerificationEmail!({ user: { email: 'a@b.com' }, url: TOKEN_URL });
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [payload, message] = log.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).not.toHaveProperty('url');
    expect(JSON.stringify({ payload, message })).not.toContain('SUPER-SECRET-BEARER-TOKEN');
  });
});
