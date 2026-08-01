/**
 * `audit-signer.adapter` — the SERVER-HELD detached-signature seam over the audit
 * chain's current TIP hash.
 *
 * The Merkle chain links entries by content hash, which proves INTERNAL
 * consistency (no in-place tamper) but NOT authorship: anyone who re-seals a
 * forged chain with the same algorithm produces an equally "consistent" tip. This
 * adapter adds an ADDITIVE, SEPARATE artifact — an ed25519 signature over the tip
 * hash using a server-held private key — so an external verifier can prove the tip
 * was produced by THIS server, not merely that it hashes together.
 *
 * It does NOT touch the per-entry `entryDigest` or the chain link format: the
 * signature is computed over the already-sealed tip hash, never re-seals or
 * migrates anything.
 *
 * FAIL-SAFE (degrade-truthful): an absent or malformed signing key yields an
 * `available: false` signer whose `signHash` returns `null` (UNSIGNED) — NEVER a
 * forged or placeholder signature. `verifyHash` needs only a public key, so it
 * keeps working for external verifiers even on a signer with no private key.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

/** The signature algorithm this seam emits (fixed; ed25519 detached). */
export const AUDIT_SIGNATURE_ALGORITHM = 'ed25519' as const;

/** DER PKCS8 prefix for a raw 32-byte ed25519 private seed. */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
/** DER SPKI prefix for a raw 32-byte ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * A detached signature artifact over a specific audit tip hash. It carries what
 * was signed (`contentHash`, `tipSeq`) and how to verify it (`publicKey`, `keyId`,
 * `algorithm`) so a verifier needs nothing but this record + the raw tip hash.
 * SEPARATE from the chain: storing/dropping it never affects chain verification.
 */
export interface TipSignature {
  readonly algorithm: typeof AUDIT_SIGNATURE_ALGORITHM;
  /** The exact tip content hash (`AuditRecord.entryHash`) that was signed. */
  readonly contentHash: string;
  /** The tip `seq` at signing time (informational; binds the artifact to a height). */
  readonly tipSeq: number;
  /** The detached ed25519 signature, base64. */
  readonly signature: string;
  /** The server's ed25519 public key (raw 32 bytes, base64) for verification. */
  readonly publicKey: string;
  /** A short, stable id of the signing key (sha256(pubKey)[:16] hex). */
  readonly keyId: string;
  /** ISO timestamp the signature was produced. */
  readonly signedAt: string;
}

/**
 * The signing seam consumed by `AuditChainService`. `signHash` is server-key
 * dependent (returns `null` when unavailable); `verifyHash` is pure crypto and
 * works with any supplied public key.
 */
export interface AuditTipSigner {
  /** True only when a valid server signing key produced a working private key. */
  readonly available: boolean;
  readonly algorithm: typeof AUDIT_SIGNATURE_ALGORITHM;
  /** The server's public key (raw 32 bytes, base64), or `null` when unavailable. */
  readonly publicKey: string | null;
  /** The short key id, or `null` when unavailable. */
  readonly keyId: string | null;
  /**
   * Sign a tip content hash. Returns a detached {@link TipSignature}, or `null`
   * when no signing key is configured (degrade-truthful UNSIGNED — never forged).
   */
  signHash(contentHash: string, tipSeq: number): TipSignature | null;
  /**
   * Verify a detached signature over `contentHash` against `publicKey` (base64 raw
   * 32 bytes or PEM). Defaults to the server's own public key when omitted. Pure —
   * never throws; returns `false` on any malformed input or mismatch.
   */
  verifyHash(contentHash: string, signature: string, publicKey?: string | null): boolean;
}

/** The bytes actually signed for a given content hash (utf-8 of the hex string). */
function hashBytes(contentHash: string): Buffer {
  return Buffer.from(contentHash, 'utf8');
}

/** Derive a stable short key id from a raw ed25519 public key. */
function deriveKeyId(rawPublicKey: Buffer): string {
  return createHash('sha256').update(rawPublicKey).digest('hex').slice(0, 16);
}

/** Parse the configured server signing key (base64 raw 32-byte seed OR PEM). */
function parseSigningKey(raw: string | null | undefined): KeyObject | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('-----BEGIN')) {
      const key = createPrivateKey({ key: trimmed, format: 'pem' });
      return key.asymmetricKeyType === 'ed25519' ? key : null;
    }
    const seed = Buffer.from(trimmed, 'base64');
    if (seed.length !== 32) return null;
    return createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    return null;
  }
}

/** Parse a verifier-supplied public key (base64 raw 32-byte OR PEM) to a KeyObject. */
function parsePublicKey(raw: string | null | undefined): KeyObject | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('-----BEGIN')) {
      const key = createPublicKey({ key: trimmed, format: 'pem' });
      return key.asymmetricKeyType === 'ed25519' ? key : null;
    }
    const rawKey = Buffer.from(trimmed, 'base64');
    if (rawKey.length !== 32) return null;
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return null;
  }
}

/** Export a public KeyObject to its raw 32-byte form. */
function rawPublicKey(key: KeyObject): Buffer {
  const spki = key.export({ type: 'spki', format: 'der' });
  return spki.subarray(spki.length - 32);
}

/**
 * The always-safe verifier used by both the available and unavailable signers:
 * pure ed25519 verification with a supplied public key. Never throws.
 */
function verifyWith(
  contentHash: string,
  signature: string,
  publicKey: string | null | undefined,
): boolean {
  const pub = parsePublicKey(publicKey);
  if (!pub) return false;
  try {
    return verify(null, hashBytes(contentHash), pub, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/**
 * Build the audit tip signer from the governance config's `auditSigningKey`
 * (base64 raw 32-byte ed25519 seed, or a PEM private key). A `null`/invalid key
 * yields an `available: false` signer whose `signHash` returns `null` — the
 * fail-safe posture (UNSIGNED, never a forged signature). `verifyHash` still
 * verifies any externally-supplied public key.
 */
export function createAuditTipSigner(cfg: {
  readonly auditSigningKey: string | null;
}): AuditTipSigner {
  const privateKey = parseSigningKey(cfg.auditSigningKey);

  if (!privateKey) {
    return {
      available: false,
      algorithm: AUDIT_SIGNATURE_ALGORITHM,
      publicKey: null,
      keyId: null,
      signHash: () => null,
      verifyHash: (contentHash, signature, publicKey) =>
        verifyWith(contentHash, signature, publicKey ?? null),
    };
  }

  const publicKeyObject = createPublicKey(privateKey);
  const rawPub = rawPublicKey(publicKeyObject);
  const publicKeyB64 = rawPub.toString('base64');
  const keyId = deriveKeyId(rawPub);

  return {
    available: true,
    algorithm: AUDIT_SIGNATURE_ALGORITHM,
    publicKey: publicKeyB64,
    keyId,
    signHash(contentHash: string, tipSeq: number): TipSignature {
      const signature = sign(null, hashBytes(contentHash), privateKey).toString('base64');
      return {
        algorithm: AUDIT_SIGNATURE_ALGORITHM,
        contentHash,
        tipSeq,
        signature,
        publicKey: publicKeyB64,
        keyId,
        signedAt: new Date().toISOString(),
      };
    },
    verifyHash(contentHash: string, signature: string, publicKey?: string | null): boolean {
      // Default to the server's own public key when the caller omits one.
      return verifyWith(contentHash, signature, publicKey ?? publicKeyB64);
    },
  };
}
