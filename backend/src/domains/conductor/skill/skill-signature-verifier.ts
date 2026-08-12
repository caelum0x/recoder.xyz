/**
 * The ed25519-backed skill-manifest signature verifier — REUSES the repo's real
 * asymmetric verification (`@recoder/interop`'s `verifyEd25519Signature`, the same
 * primitive the A2A ed25519 ingress gate uses) rather than reinventing crypto.
 *
 * A publisher signs the canonical manifest body (everything MINUS the `signature`
 * field) with its ed25519 private key; this verifier resolves the publisher's
 * PUBLIC key from an injected trust allow-list and verifies the signature over the
 * SAME canonical body. The verifier never holds a secret, and never throws on
 * untrusted input:
 *
 *  - empty signature            ⇒ { ok: false, reason: 'unsigned' }
 *  - unknown/unresolved publisher ⇒ { ok: false, reason: 'unknown_publisher' }
 *  - signature does not verify   ⇒ { ok: false, reason: 'bad_signature' }
 *
 * The signed body is byte-identical whether produced here or by a publisher tool,
 * because both canonicalize via `@recoder/interop`'s verifier (which applies the
 * a2a-sdk `canonicalJson` internally) over the SAME object.
 */
import { verifyEd25519Signature } from '@recoder/interop';
import type {
  SkillManifest,
  SkillManifestSigningBody,
  SkillSignatureVerifier,
  SkillVerificationOutcome,
} from './skill.types.js';

/** Resolve the trusted ed25519 PUBLIC key for a publisher `keyId`; `null` ⇒ untrusted. */
export type PublisherKeyResolver = (publisherKeyId: string) => string | null;

export interface Ed25519SkillVerifierDeps {
  /**
   * The trust allow-list: publisher `keyId` → ed25519 public key (raw hex/base64
   * or PEM). A `keyId` absent here is an UNKNOWN publisher and its manifest is
   * rejected — there is no implicit trust.
   */
  readonly resolveKey: PublisherKeyResolver;
}

/**
 * The canonical body a manifest signature covers: the manifest MINUS its
 * `signature` field. Kept as an explicit, ordered projection so a producer and
 * this verifier sign/verify byte-identical bytes.
 */
export function skillManifestSigningBody(manifest: SkillManifest): SkillManifestSigningBody {
  return {
    id: manifest.id,
    version: manifest.version,
    publisherKeyId: manifest.publisherKeyId,
    actions: manifest.actions,
  };
}

/**
 * Build the ed25519-backed verifier over an injected publisher-key allow-list.
 * Pure factory; the returned verifier never throws on untrusted input.
 */
export function createEd25519SkillSignatureVerifier(
  deps: Ed25519SkillVerifierDeps,
): SkillSignatureVerifier {
  return {
    verify(manifest: SkillManifest): SkillVerificationOutcome {
      if (typeof manifest.signature !== 'string' || manifest.signature.trim().length === 0) {
        return { ok: false, reason: 'unsigned' };
      }
      const publicKey = deps.resolveKey(manifest.publisherKeyId);
      if (publicKey === null || publicKey.length === 0) {
        return { ok: false, reason: 'unknown_publisher' };
      }
      const body = skillManifestSigningBody(manifest);
      // `verifyEd25519Signature` never throws — a malformed key/signature is `false`.
      if (!verifyEd25519Signature(body, manifest.signature, publicKey)) {
        return { ok: false, reason: 'bad_signature' };
      }
      return { ok: true };
    },
  };
}
