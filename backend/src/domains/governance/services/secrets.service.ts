/**
 * `SecretsService` — the concrete `SecretsPort` (get/set/rotate/delete/list).
 *
 * This is the ENCRYPTED-AT-REST secret store consumed by identity (`sk_` keys),
 * billing, inference (BYOK), and interop (connector creds). It envelope-encrypts
 * plaintext through the {@link VaultAdapter} (`@recoder/vault` AES-256-GCM) and
 * persists CIPHERTEXT + nonce + key_version ONLY via the {@link SecretRepository}
 * (`governance_secrets`), scoped app-layer by `owner_user_id` (no Supabase RLS).
 *
 * FAIL-SAFE POSTURE (the core secrets invariant):
 *   - No vault master key  → `available === false`; every `get`/`set`/`rotate`
 *     rejects with `SERVICE_UNAVAILABLE`. NEVER a plaintext fallback, NEVER a
 *     faked write, NEVER a dropped write claimed as success.
 *   - Plaintext is never persisted, never logged, and never returned by `list`.
 *
 * AUDIT: when the gate core is injected, every mutation (`set`/`rotate`/`delete`)
 * is best-effort sealed into the tamper-evident Merkle chain via
 * `GovernanceGate.recordAudit` — payload carries the ref + owner + key_version
 * only, never the secret value. An audit-seal failure is logged (the durable DB
 * write already happened) but does not fabricate a different outcome.
 */
import { ErrorCode, createError } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import type { SecretsPort, SecretRepository, SecretCipherRow } from '../ports/secrets.port.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import type { SecretRef, GovernanceEffect } from '../types.js';
import type { VaultAdapter } from '../adapters/vault.adapter.js';

export interface SecretsServiceDeps {
  /** Persistence for ciphertext rows (`governance_secrets`). */
  readonly repo: SecretRepository;
  /** Envelope-encryption seam (`@recoder/vault`); down → service reports down. */
  readonly vault: VaultAdapter;
  /** Gate core for tamper-evident mutation audit; optional (best-effort seal). */
  readonly gate?: GovernanceGate;
  readonly logger?: Logger;
}

export class SecretsService implements SecretsPort {
  private readonly repo: SecretRepository;
  private readonly vault: VaultAdapter;
  private readonly gate?: GovernanceGate;
  private readonly log?: Logger;

  constructor(deps: SecretsServiceDeps) {
    this.repo = deps.repo;
    this.vault = deps.vault;
    this.gate = deps.gate;
    this.log = deps.logger;
  }

  async get(ownerUserId: string, ref: string): Promise<string | null> {
    this.requireVault();
    const row = await this.repo.find(ownerUserId, ref);
    if (!row) return null;
    try {
      return await this.vault.open(row.ciphertext, row.nonce);
    } catch (err) {
      // A decrypt failure (wrong key / tampered bytes) must NOT leak or fake a
      // value — surface it as unavailable and log without the plaintext.
      this.log?.error({ ref, ownerUserId, err: msg(err) }, 'governance secret decrypt failed');
      throw createError(ErrorCode.SERVICE_UNAVAILABLE, 'Secret could not be decrypted.');
    }
  }

  async set(ownerUserId: string, ref: string, plaintext: string): Promise<SecretRef> {
    this.requireVault();
    const sealed = await this.vault.seal(plaintext);
    const row = await this.repo.upsert({
      ref,
      ownerUserId,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      keyVersion: this.vault.keyVersion,
    });
    await this.audit('secret.set', ownerUserId, ref, 'allow', row.keyVersion);
    return toRef(row);
  }

  async rotate(ownerUserId: string, ref: string): Promise<SecretRef | null> {
    this.requireVault();
    const existing = await this.repo.find(ownerUserId, ref);
    if (!existing) return null;

    // Decrypt the current value, then re-encrypt under a fresh nonce and bump the
    // row's key generation. A single master key still re-wraps every rotation
    // (new nonce + ciphertext); the counter records the re-wrap generation.
    const plaintext = await this.openOrFail(existing, ref, ownerUserId);
    const sealed = await this.vault.seal(plaintext);
    const nextVersion = existing.keyVersion + 1;
    const row = await this.repo.rotate(ownerUserId, ref, sealed.ciphertext, sealed.nonce, nextVersion);
    if (!row) return null;
    await this.audit('secret.rotate', ownerUserId, ref, 'allow', row.keyVersion);
    return toRef(row);
  }

  async delete(ownerUserId: string, ref: string): Promise<boolean> {
    // Deletion does not require the vault key (no crypto) — but it is still audited.
    const removed = await this.repo.remove(ownerUserId, ref);
    if (removed) await this.audit('secret.delete', ownerUserId, ref, 'allow');
    return removed;
  }

  async list(ownerUserId: string): Promise<readonly SecretRef[]> {
    // Metadata only — ciphertext/nonce bytes are never selected by the repo.
    return this.repo.listRefs(ownerUserId);
  }

  /** Truthful component health: `down` (fail-safe) when the vault key is absent. */
  health(): ComponentHealth {
    const engine = this.vault.status();
    const up = engine.status === 'up';
    return {
      name: 'governance-secrets',
      status: up ? 'up' : 'down',
      degraded: false,
      ...(up ? {} : { reason: engine.reason ?? 'vault master key not configured' }),
      engines: [engine],
    };
  }

  // --- internals -------------------------------------------------------------

  /** Fail-safe guard: reject writes/reads when the vault cannot encrypt. */
  private requireVault(): void {
    if (!this.vault.available) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Secrets vault not configured — refusing to store or read secrets without envelope encryption.',
      );
    }
  }

  private async openOrFail(
    row: SecretCipherRow,
    ref: string,
    ownerUserId: string,
  ): Promise<string> {
    try {
      return await this.vault.open(row.ciphertext, row.nonce);
    } catch (err) {
      this.log?.error({ ref, ownerUserId, err: msg(err) }, 'governance secret rotate decrypt failed');
      throw createError(ErrorCode.SERVICE_UNAVAILABLE, 'Secret could not be decrypted for rotation.');
    }
  }

  /** Best-effort tamper-evident audit of a secret mutation (value never included). */
  private async audit(
    action: string,
    ownerUserId: string,
    ref: string,
    effect: GovernanceEffect,
    keyVersion?: number,
  ): Promise<void> {
    if (!this.gate) return;
    try {
      await this.gate.recordAudit({
        actorId: ownerUserId,
        action,
        resource: `secret:${ref}`,
        effect,
        riskTier: 'high',
        degraded: false,
        payload: { ref, ownerUserId, ...(keyVersion != null ? { keyVersion } : {}) },
      });
    } catch (err) {
      // The durable secret write already committed; a failed audit seal is a
      // logged degradation, not a reason to claim a different outcome.
      this.log?.warn({ action, ref, ownerUserId, err: msg(err) }, 'governance secret audit seal failed');
    }
  }
}

/** Build the secrets service. */
export function createSecretsService(deps: SecretsServiceDeps): SecretsService {
  return new SecretsService(deps);
}

function toRef(row: SecretCipherRow): SecretRef {
  return {
    id: row.id,
    ref: row.ref,
    ownerUserId: row.ownerUserId,
    keyVersion: row.keyVersion,
    rotatedAt: row.rotatedAt ?? null,
    createdAt: row.createdAt,
  };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
