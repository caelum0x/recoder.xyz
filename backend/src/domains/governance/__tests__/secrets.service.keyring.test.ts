import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { SecretsService } from '../services/secrets.service.js';
import { ErrorCode } from '../../../shared/errors.js';
import { createVaultKeyring, type VaultKeyring } from '../adapters/keyring.adapter.js';
import { createVaultAdapter } from '../adapters/vault.adapter.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import { InMemorySecretRepository, silentLogger } from './_fakes.js';

/** A fresh, valid 32-byte AES-256 master key, base64-encoded. */
function validKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

function build(opts: { keyring: VaultKeyring; gate?: GovernanceGate }) {
  const repo = new InMemorySecretRepository();
  const service = new SecretsService({
    repo,
    keyring: opts.keyring,
    gate: opts.gate,
    logger: silentLogger,
  });
  return { repo, service };
}

describe('SecretsService — versioned keyring seam (real AES-256-GCM rotation)', () => {
  it('single-key keyring round-trips set → get and stamps v1', async () => {
    const keyring = createVaultKeyring({ keys: [{ version: 1, masterKey: validKey() }] });
    const { service } = build({ keyring });

    const ref = await service.set('u1', 'openai', 'sk-secret-value');
    expect(ref.keyVersion).toBe(1);
    expect(await service.get('u1', 'openai')).toBe('sk-secret-value');
  });

  it('new writes seal under the ACTIVE version (v2 when v2 is active)', async () => {
    const keyring = createVaultKeyring({
      keys: [
        { version: 1, masterKey: validKey() },
        { version: 2, masterKey: validKey() },
      ],
    });
    const { repo, service } = build({ keyring });

    const ref = await service.set('u1', 'openai', 'sk-new');
    expect(ref.keyVersion).toBe(2); // active version
    // The persisted row is stamped v2 and never carries the plaintext bytes.
    const stored = repo.rows.get('u1::openai')!;
    expect(stored.keyVersion).toBe(2);
    expect(stored.ciphertext.toString('utf8')).not.toBe('sk-new');
    expect(await service.get('u1', 'openai')).toBe('sk-new');
  });

  it('BACKWARD COMPATIBLE: an existing v1 row keeps opening after v2 becomes active', async () => {
    const v1Key = validKey();
    const v2Key = validKey();

    // Seal a legacy value under the v1 key alone and seed it straight into the repo
    // (as a pre-existing v1 secret would have been persisted).
    const v1Adapter = createVaultAdapter({ vaultMasterKey: v1Key, keyVersion: 1 });
    const legacy = await v1Adapter.seal('legacy-v1-value');
    const repo = new InMemorySecretRepository();
    await repo.upsert({
      ref: 'legacy',
      ownerUserId: 'u1',
      ciphertext: legacy.ciphertext,
      nonce: legacy.nonce,
      keyVersion: 1,
    });

    // Now the service runs on a ring with v2 active.
    const keyring = createVaultKeyring({
      keys: [
        { version: 1, masterKey: v1Key },
        { version: 2, masterKey: v2Key },
      ],
    });
    const service = new SecretsService({ repo, keyring, logger: silentLogger });

    expect(keyring.activeVersion).toBe(2);
    // Opened by its OWN stored version (v1), not the active v2 key.
    expect(await service.get('u1', 'legacy')).toBe('legacy-v1-value');
  });

  it('rotate re-keys v1 → active v2: bumps version, re-wraps bytes, still decrypts', async () => {
    const v1Key = validKey();
    const v2Key = validKey();
    const keyring = createVaultKeyring({
      keys: [
        { version: 1, masterKey: v1Key },
        { version: 2, masterKey: v2Key },
      ],
      activeVersion: 1, // start with v1 active so the first write is a real v1 row
    });
    const { repo, service } = build({ keyring });

    await service.set('u1', 'openai', 'sk-rotate-me');
    const before = repo.rows.get('u1::openai')!;
    expect(before.keyVersion).toBe(1);

    // Bring v2 online as the active sealer and rotate.
    const activeV2 = createVaultKeyring({
      keys: [
        { version: 1, masterKey: v1Key },
        { version: 2, masterKey: v2Key },
      ],
    });
    const svc2 = new SecretsService({ repo, keyring: activeV2, logger: silentLogger });

    const rotated = await svc2.rotate('u1', 'openai');
    expect(rotated?.keyVersion).toBe(2); // re-keyed onto the active version
    expect(rotated?.rotatedAt).toBeTruthy();

    const after = repo.rows.get('u1::openai')!;
    // Genuinely re-wrapped under the v2 key (distinct ciphertext + nonce).
    expect(after.ciphertext.equals(before.ciphertext)).toBe(false);
    expect(after.nonce.equals(before.nonce)).toBe(false);
    // The value survives the re-key.
    expect(await svc2.get('u1', 'openai')).toBe('sk-rotate-me');
  });

  it('rotate on an absent ref returns null', async () => {
    const keyring = createVaultKeyring({ keys: [{ version: 1, masterKey: validKey() }] });
    const { service } = build({ keyring });
    expect(await service.rotate('u1', 'missing')).toBeNull();
  });

  it('FAIL-SAFE: a down active key refuses to store and to read (never plaintext)', async () => {
    const keyring = createVaultKeyring({ keys: [{ version: 1, masterKey: null }] });
    const { repo, service } = build({ keyring });

    await expect(service.set('u1', 'openai', 'sk-x')).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
    expect(repo.rows.size).toBe(0); // no faked / dropped write
    await expect(service.get('u1', 'openai')).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });

  it('FAIL-SAFE: a row whose version key is down surfaces as unavailable, not a guess', async () => {
    const v1Key = validKey();
    // Seed a real v1 row.
    const v1Adapter = createVaultAdapter({ vaultMasterKey: v1Key, keyVersion: 1 });
    const sealed = await v1Adapter.seal('v1-only');
    const repo = new InMemorySecretRepository();
    await repo.upsert({
      ref: 'x',
      ownerUserId: 'u1',
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      keyVersion: 1,
    });

    // Ring where v1 is rotated out (down) but v2 is the active sealer.
    const keyring = createVaultKeyring({
      keys: [
        { version: 1, masterKey: null },
        { version: 2, masterKey: validKey() },
      ],
    });
    const service = new SecretsService({ repo, keyring, logger: silentLogger });

    expect(keyring.available).toBe(true); // active key works...
    await expect(service.get('u1', 'x')).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE, // ...but the v1 row cannot be opened
    });
  });

  it('health reflects the keyring: up with a valid active key, down when absent', async () => {
    const up = build({ keyring: createVaultKeyring({ keys: [{ version: 1, masterKey: validKey() }] }) });
    expect(up.service.health().status).toBe('up');

    const down = build({ keyring: createVaultKeyring({ keys: [{ version: 1, masterKey: null }] }) });
    const h = down.service.health();
    expect(h.status).toBe('down');
    expect(h.reason).toBeTruthy();
  });

  it('best-effort audit: a keyring-backed set seals a value-free entry with the active version', async () => {
    const recordAudit = vi.fn(async () => ({}) as never);
    const gate = { recordAudit } as unknown as GovernanceGate;
    const keyring = createVaultKeyring({
      keys: [
        { version: 1, masterKey: validKey() },
        { version: 2, masterKey: validKey() },
      ],
    });
    const { service } = build({ keyring, gate });

    await service.set('u1', 'openai', 'sk-secret-value');
    expect(recordAudit).toHaveBeenCalledTimes(1);
    const entry = recordAudit.mock.calls[0]![0] as {
      action: string;
      payload: Record<string, unknown>;
    };
    expect(entry.action).toBe('secret.set');
    expect(entry.payload.keyVersion).toBe(2);
    expect(JSON.stringify(entry.payload)).not.toContain('sk-secret-value');
  });

  it('construction throws when neither a vault nor a keyring is supplied', () => {
    const repo = new InMemorySecretRepository();
    expect(() => new SecretsService({ repo, logger: silentLogger })).toThrow(
      /requires a vault adapter or a vault keyring/,
    );
  });
});
