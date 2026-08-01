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
import type { ComponentHealth, EngineStatus } from '../../../shared/health-types.js';
import type { SecretsPort, SecretRepository, SecretCipherRow } from '../ports/secrets.port.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import type { SecretRef, GovernanceEffect } from '../types.js';
import type { VaultAdapter } from '../adapters/vault.adapter.js';
import type { VaultKeyring } from '../adapters/keyring.adapter.js';

/** A stored row's version-bearing cipher columns (structural: `SecretCipherRow` fits). */
interface CipherRowRef {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyVersion: number;
}

/** A freshly sealed value plus the version it was sealed under. */
interface SealedWithVersion {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyVersion: number;
}

/**
 * The internal crypto seam the service drives. Two concrete seams exist:
 *  - {@link legacyVaultSeam} — a single {@link VaultAdapter}; preserves TODAY's
 *    exact behavior (open ignores the stored version; rotate re-wraps under the
 *    same key and bumps the version counter v(n)→v(n+1)).
 *  - {@link keyringSeam} — a versioned {@link VaultKeyring}; opens a row by ITS
 *    OWN stored version (backward compatible), seals new writes under the active
 *    version, and rotates via `keyring.rekey`.
 */
interface SecretVaultSeam {
  readonly available: boolean;
  status(): EngineStatus;
  seal(plaintext: string): Promise<SealedWithVersion>;
  open(row: CipherRowRef): Promise<string>;
  rotate(row: CipherRowRef): Promise<SealedWithVersion>;
}

/** Legacy single-key seam — byte-for-byte the pre-keyring behavior. */
function legacyVaultSeam(vault: VaultAdapter): SecretVaultSeam {
  return {
    available: vault.available,
    status: () => vault.status(),
    async seal(plaintext: string): Promise<SealedWithVersion> {
      const sealed = await vault.seal(plaintext);
      return { ...sealed, keyVersion: vault.keyVersion };
    },
    // Single key: the stored version is only a re-wrap counter, so open ignores it.
    open: (row: CipherRowRef): Promise<string> => vault.open(row.ciphertext, row.nonce),
    async rotate(row: CipherRowRef): Promise<SealedWithVersion> {
      const plaintext = await vault.open(row.ciphertext, row.nonce);
      const sealed = await vault.seal(plaintext);
      return { ...sealed, keyVersion: row.keyVersion + 1 };
    },
  };
}

/** Versioned keyring seam — open-by-stored-version, seal-active, rotate via rekey. */
function keyringSeam(keyring: VaultKeyring): SecretVaultSeam {
  return {
    available: keyring.available,
    status: () => keyring.status(),
    seal: (plaintext: string): Promise<SealedWithVersion> => keyring.seal(plaintext),
    open: (row: CipherRowRef): Promise<string> => keyring.open(row),
    rotate: (row: CipherRowRef): Promise<SealedWithVersion> => keyring.rekey(row),
  };
}

export interface SecretsServiceDeps {
  /** Persistence for ciphertext rows (`governance_secrets`). */
  readonly repo: SecretRepository;
  /**
   * Legacy single-key envelope seam (`@recoder/vault`). Still accepted for
   * backward compatibility; when a {@link VaultKeyring} is supplied it takes
   * precedence. At least one of `vault`/`keyring` MUST be provided.
   */
  readonly vault?: VaultAdapter;
  /**
   * Versioned master-key ring (preferred). When present the service opens a row
   * by its stored `keyVersion`, seals new writes under the active version, and
   * rotates v(n)→v(n+1) via `keyring.rekey`.
   */
  readonly keyring?: VaultKeyring;
  /** Gate core for tamper-evident mutation audit; optional (best-effort seal). */
  readonly gate?: GovernanceGate;
  readonly logger?: Logger;
}

export class SecretsService implements SecretsPort {
  private readonly repo: SecretRepository;
  private readonly seam: SecretVaultSeam;
  private readonly gate?: GovernanceGate;
  private readonly log?: Logger;

  constructor(deps: SecretsServiceDeps) {
    this.repo = deps.repo;
    // The keyring is the preferred seam; a bare vault stays legacy-compatible.
    if (deps.keyring) {
      this.seam = keyringSeam(deps.keyring);
    } else if (deps.vault) {
      this.seam = legacyVaultSeam(deps.vault);
    } else {
      throw new Error('SecretsService requires a vault adapter or a vault keyring');
    }
    this.gate = deps.gate;
    this.log = deps.logger;
  }

  async get(ownerUserId: string, ref: string): Promise<string | null> {
    this.requireVault();
    const row = await this.repo.find(ownerUserId, ref);
    if (!row) return null;
    try {
      // Opens by the row's OWN stored version under the keyring seam (an existing
      // v1 secret keeps opening after v2 becomes active — backward compatible).
      return await this.seam.open(row);
    } catch (err) {
      // A decrypt failure (wrong key / tampered bytes) must NOT leak or fake a
      // value — surface it as unavailable and log without the plaintext.
      this.log?.error({ ref, ownerUserId, err: msg(err) }, 'governance secret decrypt failed');
      throw createError(ErrorCode.SERVICE_UNAVAILABLE, 'Secret could not be decrypted.');
    }
  }

  async set(ownerUserId: string, ref: string, plaintext: string): Promise<SecretRef> {
    this.requireVault();
    // New writes seal under the ACTIVE version (keyring) or the single key (legacy).
    const sealed = await this.seam.seal(plaintext);
    const row = await this.repo.upsert({
      ref,
      ownerUserId,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      keyVersion: sealed.keyVersion,
    });
    await this.audit('secret.set', ownerUserId, ref, 'allow', row.keyVersion);
    return toRef(row);
  }

  async rotate(ownerUserId: string, ref: string): Promise<SecretRef | null> {
    this.requireVault();
    const existing = await this.repo.find(ownerUserId, ref);
    if (!existing) return null;

    // Re-key the row: decrypt under its stored version and re-seal under the
    // active version. The keyring seam drives `keyring.rekey` (v(n)→v(n+1)); the
    // legacy seam re-wraps under the single key and bumps the version counter.
    let sealed: SealedWithVersion;
    try {
      sealed = await this.seam.rotate(existing);
    } catch (err) {
      this.log?.error({ ref, ownerUserId, err: msg(err) }, 'governance secret rotate decrypt failed');
      throw createError(ErrorCode.SERVICE_UNAVAILABLE, 'Secret could not be decrypted for rotation.');
    }
    const row = await this.repo.rotate(ownerUserId, ref, sealed.ciphertext, sealed.nonce, sealed.keyVersion);
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
    const engine = this.seam.status();
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

  /** Fail-safe guard: reject writes/reads when the active key cannot encrypt. */
  private requireVault(): void {
    if (!this.seam.available) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Secrets vault not configured — refusing to store or read secrets without envelope encryption.',
      );
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
