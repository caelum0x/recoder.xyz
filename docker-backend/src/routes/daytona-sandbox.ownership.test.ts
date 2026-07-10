import { describe, it, expect } from 'vitest';
import { assertSandboxOwnership } from './daytona-sandbox.routes.js';

function clientReturning(labels: Record<string, string> | undefined) {
  return { getSandbox: async () => ({ id: 'sb1', labels }) } as any;
}

describe('assertSandboxOwnership', () => {
  it('allows when the sandbox userId label matches the caller', async () => {
    const result = await assertSandboxOwnership(clientReturning({ userId: 'u1' }), 'sb1', 'u1');
    expect(result).toEqual({ ok: true });
  });
  it('denies (403) when the sandbox belongs to another user', async () => {
    const result = await assertSandboxOwnership(clientReturning({ userId: 'u2' }), 'sb1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
  it('denies (403) when the sandbox has no userId label (unowned/legacy)', async () => {
    const result = await assertSandboxOwnership(clientReturning(undefined), 'sb1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
  it('denies (401) when the caller has no userId', async () => {
    const result = await assertSandboxOwnership(clientReturning({ userId: 'u1' }), 'sb1', undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});
