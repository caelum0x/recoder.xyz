/**
 * The publisher-side signing helper for `recoder.skill.json` manifests — the OPS
 * counterpart to {@link createEd25519SkillSignatureVerifier}. A publisher holds an
 * ed25519 PRIVATE key (never in the repo / never on the server); this helper signs
 * the SAME canonical body the verifier checks (`skillManifestSigningBody` →
 * `canonicalJson`), so a manifest signed here verifies byte-identically at load.
 *
 * The runtime NEVER signs — it only verifies with the PUBLIC key. This module is a
 * build/ops tool (used to mint a publisher identity and stamp a manifest); it is
 * kept in the domain so the sign/verify canonicalization can never drift apart.
 */
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { canonicalJson } from '@recoder/a2a-sdk';
import { skillManifestSigningBody } from './skill-signature-verifier.js';
import type { SkillManifest } from './skill.types.js';

/** A freshly-minted publisher identity: the PUBLIC key to trust + the PRIVATE key to guard. */
export interface SkillPublisherKeypair {
  /** Raw 32-byte ed25519 public key, hex — the value that goes in the trust allow-list. */
  readonly publicKeyHex: string;
  /** PKCS#8 PEM private key — a SECRET; store in a vault, NEVER commit or ship it. */
  readonly privateKeyPem: string;
}

/** Mint a new ed25519 publisher keypair for signing skill manifests. */
export function generateSkillPublisherKeypair(): SkillPublisherKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  // Raw 32-byte public key = the last 32 bytes of the DER SPKI (12-byte header).
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const publicKeyHex = Buffer.from(spki.subarray(spki.length - 32)).toString('hex');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  return { publicKeyHex, privateKeyPem };
}

/**
 * Sign a manifest's canonical body with a publisher PRIVATE key (PEM or KeyObject).
 * Returns the hex ed25519 signature to place in `manifest.signature`. Signs the
 * EXACT bytes the verifier checks, so `verify(sign(m)) === ok`.
 */
export function signSkillManifest(
  manifest: SkillManifest,
  privateKeyPem: string,
): string {
  const body = skillManifestSigningBody(manifest);
  const sig = cryptoSign(null, Buffer.from(canonicalJson(body), 'utf8'), privateKeyPem);
  return sig.toString('hex');
}

/**
 * Convenience: attach a fresh signature to an unsigned manifest body. The input's
 * `signature` (if any) is ignored — the returned manifest carries the new one.
 */
export function signManifest(
  unsigned: Omit<SkillManifest, 'signature'>,
  privateKeyPem: string,
): SkillManifest {
  const withEmptySig: SkillManifest = { ...unsigned, signature: '' };
  return { ...withEmptySig, signature: signSkillManifest(withEmptySig, privateKeyPem) };
}
