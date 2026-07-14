import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

describe('byok-key-cache', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null on cache miss', async () => {
    process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('base64');
    const { _resetVaultDriver } = await import('./vault');
    _resetVaultDriver();
    const { getCachedKeys, clearCache } = await import('./byok-key-cache');
    clearCache();
    expect(await getCachedKeys('user-1')).toBeNull();
  });

  it('returns null when VAULT_MASTER_KEY is not set', async () => {
    delete process.env.VAULT_MASTER_KEY;
    const { _resetVaultDriver } = await import('./vault');
    _resetVaultDriver();
    const { getCachedKeys, setCachedKeys, clearCache } = await import('./byok-key-cache');
    clearCache();
    await setCachedKeys('user-1', { openai: 'sk-test' });
    expect(await getCachedKeys('user-1')).toBeNull();
  });

  it('caches and retrieves keys when VAULT_MASTER_KEY is set', async () => {
    process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('base64');
    const { _resetVaultDriver } = await import('./vault');
    _resetVaultDriver();
    const { getCachedKeys, setCachedKeys, clearCache } = await import('./byok-key-cache');
    clearCache();

    const keys = { openai: 'sk-test-123', anthropic: 'sk-ant-test' };
    await setCachedKeys('user-1', keys);

    const cached = await getCachedKeys('user-1');
    expect(cached).toEqual(keys);
  });

  it('returns null after TTL expiry', async () => {
    process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('base64');
    const { _resetVaultDriver } = await import('./vault');
    _resetVaultDriver();
    const { getCachedKeys, setCachedKeys, clearCache } = await import('./byok-key-cache');
    clearCache();

    await setCachedKeys('user-1', { openai: 'sk-test' });

    // Manually expire by manipulating the internal state
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000; // 6 minutes later

    expect(await getCachedKeys('user-1')).toBeNull();

    Date.now = realNow;
  });

  it('invalidateCachedKeys removes entry', async () => {
    process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('base64');
    const { _resetVaultDriver } = await import('./vault');
    _resetVaultDriver();
    const { getCachedKeys, setCachedKeys, invalidateCachedKeys, clearCache } = await import('./byok-key-cache');
    clearCache();

    await setCachedKeys('user-1', { openai: 'sk-test' });
    expect(await getCachedKeys('user-1')).not.toBeNull();

    invalidateCachedKeys('user-1');
    expect(await getCachedKeys('user-1')).toBeNull();
  });

  it('clearCache removes all entries', async () => {
    process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('base64');
    const { _resetVaultDriver } = await import('./vault');
    _resetVaultDriver();
    const { getCachedKeys, setCachedKeys, clearCache } = await import('./byok-key-cache');
    clearCache();

    await setCachedKeys('user-1', { openai: 'sk-test-1' });
    await setCachedKeys('user-2', { openai: 'sk-test-2' });

    clearCache();
    expect(await getCachedKeys('user-1')).toBeNull();
    expect(await getCachedKeys('user-2')).toBeNull();
  });
});
