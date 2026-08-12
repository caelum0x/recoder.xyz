/**
 * `createEd25519SkillSignatureVerifier` — proves the manifest signature check
 * REUSES the repo's real ed25519 verification: a manifest signed by a publisher's
 * private key over the canonical body verifies against the trusted public key; a
 * tampered body, forged signature, unknown publisher, or empty signature is a
 * truthful `{ ok: false, reason }` (never a throw, never a false admission).
 */
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { canonicalJson } from '@recoder/a2a-sdk';
import {
  createEd25519SkillSignatureVerifier,
  skillManifestSigningBody,
} from './skill-signature-verifier.js';
import type { SkillManifest } from './skill.types.js';

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return { publicPem, privateKey };
}

function signManifest(base: Omit<SkillManifest, 'signature'>, privateKey: ReturnType<typeof keypair>['privateKey']): SkillManifest {
  const body = skillManifestSigningBody({ ...base, signature: '' });
  const sig = edSign(null, Buffer.from(canonicalJson(body), 'utf8'), privateKey);
  return { ...base, signature: sig.toString('hex') };
}

const BASE: Omit<SkillManifest, 'signature'> = {
  id: 'fmt',
  version: '1.0.0',
  publisherKeyId: 'pub-1',
  actions: [
    {
      id: 'format',
      title: 'Format',
      paramsSchema: { path: { type: 'string', required: true } },
      requiredCapabilities: ['fs.write'],
    },
  ],
};

describe('ed25519 skill signature verifier', () => {
  it('verifies a genuinely signed manifest against the trusted publisher key', () => {
    const { publicPem, privateKey } = keypair();
    const verifier = createEd25519SkillSignatureVerifier({
      resolveKey: (id) => (id === 'pub-1' ? publicPem : null),
    });
    const signed = signManifest(BASE, privateKey);
    expect(verifier.verify(signed)).toEqual({ ok: true });
  });

  it('rejects a TAMPERED manifest body (signature no longer matches)', () => {
    const { publicPem, privateKey } = keypair();
    const verifier = createEd25519SkillSignatureVerifier({
      resolveKey: () => publicPem,
    });
    const signed = signManifest(BASE, privateKey);
    // Flip a capability AFTER signing — the signature must fail.
    const tampered: SkillManifest = {
      ...signed,
      actions: [{ ...signed.actions[0], requiredCapabilities: ['secrets.read'] }],
    };
    expect(verifier.verify(tampered)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an UNKNOWN publisher (no trusted key)', () => {
    const { privateKey } = keypair();
    const verifier = createEd25519SkillSignatureVerifier({ resolveKey: () => null });
    const signed = signManifest(BASE, privateKey);
    expect(verifier.verify(signed)).toEqual({ ok: false, reason: 'unknown_publisher' });
  });

  it('rejects an EMPTY signature as unsigned', () => {
    const { publicPem } = keypair();
    const verifier = createEd25519SkillSignatureVerifier({ resolveKey: () => publicPem });
    expect(verifier.verify({ ...BASE, signature: '' })).toEqual({ ok: false, reason: 'unsigned' });
  });

  it('rejects a signature made by a DIFFERENT key', () => {
    const trusted = keypair();
    const attacker = keypair();
    const verifier = createEd25519SkillSignatureVerifier({
      resolveKey: () => trusted.publicPem,
    });
    // Signed by the attacker, but the trusted key is published for pub-1.
    const signed = signManifest(BASE, attacker.privateKey);
    expect(verifier.verify(signed)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
