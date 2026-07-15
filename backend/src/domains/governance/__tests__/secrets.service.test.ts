import { describe, it, expect, vi } from 'vitest';
import { SecretsService } from '../services/secrets.service.js';
import { ErrorCode } from '../../../shared/errors.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import { InMemorySecretRepository, fakeVault, undecryptableVault, silentLogger } from './_fakes.js';

function build(opts: { available?: boolean; gate?: GovernanceGate } = {}) {
  const repo = new InMemorySecretRepository();
  const vault = fakeVault({ available: opts.available ?? true });
  const service = new SecretsService({ repo, vault, gate: opts.gate, logger: silentLogger });
  return { repo, vault, service };
}

describe('SecretsService — encrypted-at-rest with fail-safe posture', () => {
  it('set → get round-trips the plaintext', async () => {
    const { service } = build();
    const ref = await service.set('u1', 'openai', 'sk-secret-value');
    expect(ref.ref).toBe('openai');
    expect(ref.ownerUserId).toBe('u1');
    expect(await service.get('u1', 'openai')).toBe('sk-secret-value');
  });

  it('get returns null for an absent secret', async () => {
    const { service } = build();
    expect(await service.get('u1', 'missing')).toBeNull();
  });

  it('list returns metadata only — never ciphertext or plaintext', async () => {
    const { service } = build();
    await service.set('u1', 'a', 'plain-a');
    const refs = await service.list('u1');
    expect(refs).toHaveLength(1);
    expect(refs[0]).not.toHaveProperty('ciphertext');
    expect(refs[0]).not.toHaveProperty('nonce');
    expect(JSON.stringify(refs)).not.toContain('plain-a');
  });

  it('FAIL-SAFE: an unavailable vault refuses to store (no write, truthful error)', async () => {
    const { repo, service } = build({ available: false });
    await expect(service.set('u1', 'openai', 'sk-x')).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    expect(repo.rows.size).toBe(0); // never a faked/dropped write
  });

  it('FAIL-SAFE: an unavailable vault refuses to read', async () => {
    const { service } = build({ available: false });
    await expect(service.get('u1', 'openai')).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
  });

  it('a decrypt failure surfaces as unavailable without leaking plaintext', async () => {
    const repo = new InMemorySecretRepository();
    // Seed a row via a working vault, then swap in a vault whose open() throws.
    const seeded = new SecretsService({ repo, vault: fakeVault(), logger: silentLogger });
    await seeded.set('u1', 'openai', 'sk-secret-value');

    const broken = new SecretsService({ repo, vault: undecryptableVault(), logger: silentLogger });
    await expect(broken.get('u1', 'openai')).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    // The rejection message must not carry the plaintext.
    await broken.get('u1', 'openai').catch((e: unknown) => {
      expect(String((e as Error).message)).not.toContain('sk-secret-value');
    });
  });

  it('rotate bumps the key version and stamps rotatedAt', async () => {
    const { service } = build();
    await service.set('u1', 'openai', 'sk-1');
    const rotated = await service.rotate('u1', 'openai');
    expect(rotated?.keyVersion).toBe(2);
    expect(rotated?.rotatedAt).toBeTruthy();
    // Value still decrypts after rotation.
    expect(await service.get('u1', 'openai')).toBe('sk-1');
  });

  it('rotate on an absent ref returns null', async () => {
    const { service } = build();
    expect(await service.rotate('u1', 'missing')).toBeNull();
  });

  it('delete removes the row', async () => {
    const { service } = build();
    await service.set('u1', 'openai', 'sk-1');
    expect(await service.delete('u1', 'openai')).toBe(true);
    expect(await service.get('u1', 'openai')).toBeNull();
    expect(await service.delete('u1', 'openai')).toBe(false);
  });

  it('health is truthful: up when the vault is up, down when the key is absent', async () => {
    expect(build({ available: true }).service.health().status).toBe('up');
    const down = build({ available: false }).service.health();
    expect(down.status).toBe('down');
    expect(down.reason).toBeTruthy();
  });

  it('best-effort audit: a set seals a value-free audit entry via the gate', async () => {
    const recordAudit = vi.fn(async () => ({}) as never);
    const gate = { recordAudit } as unknown as GovernanceGate;
    const { service } = build({ gate });
    await service.set('u1', 'openai', 'sk-secret-value');

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const entry = recordAudit.mock.calls[0]![0] as { action: string; payload: Record<string, unknown> };
    expect(entry.action).toBe('secret.set');
    expect(JSON.stringify(entry.payload)).not.toContain('sk-secret-value');
  });
});
