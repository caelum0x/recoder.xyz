import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('workspace-vault-store crypto', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('encrypt/decrypt roundtrip with VAULT_MASTER_KEY set', async () => {
    const masterKey = crypto.randomBytes(32).toString('base64');
    process.env.VAULT_MASTER_KEY = masterKey;

    const { encryptSecretValue, decryptSecretValue } = await import(
      '~/lib/.server/workspaces/workspace-vault-store'
    );

    const plaintext = 'sk-ant-super-secret-api-key-1234';
    const encrypted = encryptSecretValue(plaintext);

    expect(encrypted.startsWith('vault:v1:')).toBe(true);
    expect(encrypted).not.toContain(plaintext);

    const decrypted = decryptSecretValue(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypts different values to different ciphertexts', async () => {
    process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('base64');

    const { encryptSecretValue } = await import(
      '~/lib/.server/workspaces/workspace-vault-store'
    );

    const enc1 = encryptSecretValue('same-value');
    const enc2 = encryptSecretValue('same-value');

    // Different IVs produce different ciphertexts even for same plaintext
    expect(enc1).not.toBe(enc2);
  });

  it('legacy Base64 values are still readable', async () => {
    process.env.VAULT_MASTER_KEY = crypto.randomBytes(32).toString('base64');

    const { decryptSecretValue } = await import(
      '~/lib/.server/workspaces/workspace-vault-store'
    );

    const legacyEncrypted = Buffer.from('my-legacy-secret').toString('base64');
    const decrypted = decryptSecretValue(legacyEncrypted);
    expect(decrypted).toBe('my-legacy-secret');
  });

  it('falls back to Base64 when VAULT_MASTER_KEY is not set', async () => {
    delete process.env.VAULT_MASTER_KEY;

    const { encryptSecretValue, decryptSecretValue } = await import(
      '~/lib/.server/workspaces/workspace-vault-store'
    );

    const plaintext = 'dev-mode-secret';
    const encrypted = encryptSecretValue(plaintext);

    // Should be plain base64, not vault:v1: prefixed
    expect(encrypted.startsWith('vault:v1:')).toBe(false);
    expect(Buffer.from(encrypted, 'base64').toString('utf8')).toBe(plaintext);

    const decrypted = decryptSecretValue(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
