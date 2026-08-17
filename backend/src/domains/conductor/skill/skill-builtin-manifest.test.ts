/**
 * Locks the FIRST-PARTY trust anchor: the committed `recoder.workspace` manifest
 * signature ({@link RECODER_WORKSPACE_SIGNATURE}) must verify against the committed
 * public key ({@link RECODER_BUILTIN_PUBLIC_KEY_HEX}) through the REAL verifier — so
 * the batteries-included skill is genuinely admitted, and a drift in either the
 * manifest body or the signature/key fails loudly here rather than silently
 * de-trusting the built-in skill in production.
 */
import { describe, it, expect } from 'vitest';
import { createEd25519SkillSignatureVerifier } from './skill-signature-verifier.js';
import {
  recoderWorkspaceSignedManifest,
  RECODER_BUILTIN_PUBLIC_KEY_HEX,
  RECODER_BUILTIN_PUBLISHER_KEY_ID,
} from './skill-builtin-manifest.js';

describe('first-party recoder.workspace trust anchor', () => {
  it('the committed signature verifies against the committed public key', () => {
    const verifier = createEd25519SkillSignatureVerifier({
      resolveKey: (id) => (id === RECODER_BUILTIN_PUBLISHER_KEY_ID ? RECODER_BUILTIN_PUBLIC_KEY_HEX : null),
    });
    expect(verifier.verify(recoderWorkspaceSignedManifest())).toEqual({ ok: true });
  });

  it('a DIFFERENT trusted key rejects the committed signature (proves the sig is real, not skipped)', () => {
    const verifier = createEd25519SkillSignatureVerifier({
      resolveKey: () => '00'.repeat(32),
    });
    expect(verifier.verify(recoderWorkspaceSignedManifest())).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
