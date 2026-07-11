import { describe, it, expect } from 'vitest';
import { resolveRuntimeProfile } from './runtime-profile.js';

describe('resolveRuntimeProfile', () => {
  it('enters embedded mode only when RECODER_SOLO_MODE is truthy', () => {
    const p = resolveRuntimeProfile({ RECODER_SOLO_MODE: '1' });
    expect(p.mode).toBe('embedded');
    expect(p.multiTenant).toBe(false);
    expect(p.requireApprovals).toBe(false);
  });

  it('EMBEDDED needs no Postgres/Redis/SSO (the core invariant)', () => {
    const p = resolveRuntimeProfile({ RECODER_SOLO_MODE: 'true' });
    expect(p.distributedState).toBe(false);
    expect(p.quotaBackend).toBe('in_process');
    expect(p.rateLimitBackend).toBe('in_process');
    expect(p.ssoRequired).toBe(false);
  });

  it('fails closed to self_host when nothing is set', () => {
    const p = resolveRuntimeProfile({});
    expect(p.mode).toBe('self_host');
    expect(p.multiTenant).toBe(true);
    expect(p.requireApprovals).toBe(true);
  });

  it('marks distributedState true when a database URL is present', () => {
    expect(resolveRuntimeProfile({ DATABASE_URL: 'postgres://x' }).distributedState).toBe(true);
    expect(resolveRuntimeProfile({ AGENT_OS_DATABASE_URL: 'postgres://y' }).distributedState).toBe(true);
    expect(resolveRuntimeProfile({}).distributedState).toBe(false);
  });

  it('uses redis quota/rate-limit backends when REDIS_URL is present', () => {
    const p = resolveRuntimeProfile({ REDIS_URL: 'redis://x' });
    expect(p.quotaBackend).toBe('redis');
    expect(p.rateLimitBackend).toBe('redis');
    const q = resolveRuntimeProfile({});
    expect(q.quotaBackend).toBe('in_process');
  });

  it('ssoRequired is opt-in via RECODER_SSO_REQUIRED (SSO enforcement lands later)', () => {
    expect(resolveRuntimeProfile({ RECODER_SSO_REQUIRED: 'true' }).ssoRequired).toBe(true);
    expect(resolveRuntimeProfile({}).ssoRequired).toBe(false);
  });

  it('returns a deeply frozen object (resolved once, never mutated)', () => {
    const p = resolveRuntimeProfile({ RECODER_SOLO_MODE: '1' });
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => { (p as unknown as { mode: string }).mode = 'x'; }).toThrow();
  });
});
