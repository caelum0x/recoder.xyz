/**
 * Cryptographic signing of the evidence export pack — a DETACHED Ed25519 signature
 * over the pack's stable `contentHash`, turning "content-hashed" into "signed,
 * verifiable" (the thesis's signed exportable evidence).
 *
 * Node built-in `node:crypto` ONLY (no new dependency): `crypto.sign(null, …)` /
 * `crypto.verify(null, …)` — for Ed25519 the algorithm is `null` (the key selects
 * the curve). Signing is a THIN step layered over the PURE `renderEvidenceExport`:
 * the pack + its `contentHash` are computed exactly as before, THEN the hash is
 * signed, THEN the signature block is attached — so signing never changes the hash
 * and the pure renderer stays deterministic.
 *
 * DEGRADE-TRUTHFUL: an absent / malformed / non-Ed25519 key ⇒ the pack is returned
 * UNSIGNED (`signature: null`) with a truthful warning — NEVER a thrown error into
 * the export path and NEVER a fabricated signature.
 */
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { EvidenceExport, EvidenceSignature } from './evidence-export.js';

/**
 * Parse the configured signing secret into an Ed25519 private key, or `null`
 * (⇒ unsigned). Accepts EITHER a PKCS8 PEM (`-----BEGIN PRIVATE KEY-----…`) OR a
 * bare base64 of the PKCS8 DER (wrapped into a PEM here). Degrade-truthful: an
 * empty/malformed/non-Ed25519 value logs a truthful warning and returns `null`
 * (never throws). The raw value is a SECRET — never logged.
 */
export function loadEvidenceSigningKey(raw: string | null | undefined, logger?: Logger): KeyObject | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const pem = value.includes('-----BEGIN')
      ? value
      : `-----BEGIN PRIVATE KEY-----\n${wrapBase64(value)}\n-----END PRIVATE KEY-----`;
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') {
      logger?.warn(
        { asymmetricKeyType: key.asymmetricKeyType },
        'EVIDENCE_SIGNING_KEY is not an Ed25519 key — evidence exports will be UNSIGNED',
      );
      return null;
    }
    return key;
  } catch (err) {
    logger?.warn({ err }, 'EVIDENCE_SIGNING_KEY could not be parsed — evidence exports will be UNSIGNED');
    return null;
  }
}

/** Insert PEM line breaks (64-char lines) into a bare base64 DER body. */
function wrapBase64(b64: string): string {
  return (b64.replace(/\s+/g, '').match(/.{1,64}/g) ?? []).join('\n');
}

/**
 * Attach a DETACHED Ed25519 signature over `pack.contentHash`. When `privateKey` is
 * `null` the pack is returned unsigned (`signature: null`). The embedded SPKI PEM
 * public key makes the pack self-verifying. Never throws for a signing fault — a
 * failure degrades to an unsigned pack with a truthful warning.
 */
export function signEvidenceExport(
  pack: EvidenceExport,
  options: { readonly privateKey: KeyObject | null; readonly now?: () => string; readonly logger?: Logger },
): EvidenceExport {
  const { privateKey } = options;
  if (!privateKey) return { ...pack, signature: null };
  try {
    const now = options.now ?? (() => new Date().toISOString());
    const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
    const signature = cryptoSign(null, Buffer.from(pack.contentHash), privateKey).toString('base64');
    const block: EvidenceSignature = {
      algorithm: 'ed25519',
      publicKeyPem,
      signedContentHash: pack.contentHash,
      signature,
      signedAt: now(),
    };
    return { ...pack, signature: block };
  } catch (err) {
    options.logger?.warn({ err }, 'evidence export signing failed — returning UNSIGNED pack');
    return { ...pack, signature: null };
  }
}

/** The truthful result of checking an export pack's signature. */
export interface EvidenceSignatureVerification {
  /** Whether the pack carries a signature at all. */
  readonly signed: boolean;
  /** Whether that signature is cryptographically valid AND signs this pack's hash. */
  readonly valid: boolean;
  /** Why `valid:false` (or the pack is unsigned) — absent for a clean valid check. */
  readonly reason?: string;
}

/**
 * Verify a pack's detached signature: the base64 `signature` over `signedContentHash`
 * against the embedded `publicKeyPem`, AND that `signedContentHash === pack.contentHash`
 * (a signature over a DIFFERENT hash than the pack carries ⇒ tampered ⇒ invalid).
 * Never throws — a malformed key/sig degrades to `valid:false` with a reason.
 */
export function verifyEvidenceSignature(pack: EvidenceExport): EvidenceSignatureVerification {
  const sig = pack.signature;
  if (!sig) return { signed: false, valid: false, reason: 'pack is unsigned' };
  if (sig.signedContentHash !== pack.contentHash) {
    return { signed: true, valid: false, reason: 'signedContentHash does not match the pack contentHash (tampered)' };
  }
  try {
    const publicKey = createPublicKey(sig.publicKeyPem);
    const ok = cryptoVerify(null, Buffer.from(sig.signedContentHash), publicKey, Buffer.from(sig.signature, 'base64'));
    return ok
      ? { signed: true, valid: true }
      : { signed: true, valid: false, reason: 'signature does not verify against the embedded public key' };
  } catch (err) {
    return { signed: true, valid: false, reason: err instanceof Error ? err.message : 'signature verification error' };
  }
}
