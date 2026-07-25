/**
 * Cryptographic signing of the evidence export pack — detached Ed25519 over the
 * pack's stable `contentHash`.
 *
 * Proves (with an EPHEMERAL in-test keypair — never committed): a signed pack
 * verifies (`signed && valid`); signing does NOT change the pack `contentHash` and
 * the hash still re-verifies; no key ⇒ `signature:null` + `signed:false`; a pack
 * whose contentHash was mutated after signing ⇒ `valid:false` (signedContentHash
 * mismatch); verifying with a DIFFERENT embedded public key ⇒ `valid:false`; the key
 * loader accepts PKCS8 PEM and base64-DER, and degrades a malformed / non-Ed25519 /
 * empty key to `null` (unsigned) without throwing.
 */
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { ReadinessView } from '../services/readiness.service.js';
import { assembleConvergenceEvidence, type ConvergenceEvidenceRecord } from './convergence-evidence.js';
import { renderEvidenceExport, verifyExportHash, type EvidenceExport } from './evidence-export.js';
import {
  loadEvidenceSigningKey,
  signEvidenceExport,
  verifyEvidenceSignature,
} from './evidence-signing.js';

const FIXED = '2026-07-26T00:00:00.000Z';

const READY: ReadinessView = {
  verdict: 'ready',
  signals: [
    { id: 'lifecycle', status: 'pass', detail: 'reviewable' },
    { id: 'merge', status: 'pass', detail: 'clean' },
    { id: 'checks', status: 'unknown', detail: 'no checks' },
    { id: 'preview', status: 'unknown', detail: 'not verified' },
  ],
  blockers: [],
};

function makeRecord(): ConvergenceEvidenceRecord {
  return {
    evidence: assembleConvergenceEvidence({
      chosenWorkspaceId: 'ws-a',
      taskId: 'task-1',
      taskGroup: 'grp-1',
      candidates: [{ workspaceId: 'ws-a', agent: 'claude_code', branch: 'b-a', runId: 'run-a', state: 'awaiting_review', changedFiles: ['a.ts'] }],
      governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'medium', degraded: false },
      verification: { view: READY },
      actorId: 'user-1',
      mergedAt: FIXED,
      now: () => FIXED,
    }),
    seal: { auditId: 'aud-1', auditSeq: 1, auditEntryHash: 'a'.repeat(64) },
  };
}

function renderPack(): EvidenceExport {
  return renderEvidenceExport(makeRecord(), { now: () => FIXED });
}

/** A fresh Ed25519 private key for the test (ephemeral — never persisted/committed). */
function ephemeralKey() {
  return generateKeyPairSync('ed25519').privateKey;
}

describe('signEvidenceExport / verifyEvidenceSignature', () => {
  it('signs a pack that then verifies (signed && valid)', () => {
    const unsigned = renderPack();
    const signed = signEvidenceExport(unsigned, { privateKey: ephemeralKey(), now: () => FIXED });

    expect(signed.signature).not.toBeNull();
    expect(signed.signature?.algorithm).toBe('ed25519');
    expect(signed.signature?.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(signed.signature?.signedContentHash).toBe(unsigned.contentHash);
    expect(signed.signature?.signedAt).toBe(FIXED);

    expect(verifyEvidenceSignature(signed)).toEqual({ signed: true, valid: true });
  });

  it('does NOT change the pack contentHash (detached) and the hash still re-verifies', () => {
    const unsigned = renderPack();
    const signed = signEvidenceExport(unsigned, { privateKey: ephemeralKey(), now: () => FIXED });
    expect(signed.contentHash).toBe(unsigned.contentHash); // signing is over the hash, not part of it
    expect(verifyExportHash(signed)).toBe(true); // verifyExportHash excludes the signature
  });

  it('is deterministic — Ed25519 signs the same hash to the same signature', () => {
    const key = ephemeralKey();
    const pack = renderPack();
    const a = signEvidenceExport(pack, { privateKey: key, now: () => FIXED });
    const b = signEvidenceExport(pack, { privateKey: key, now: () => FIXED });
    expect(a.signature?.signature).toBe(b.signature?.signature);
  });

  it('no key ⇒ signature:null and verify reports signed:false', () => {
    const pack = signEvidenceExport(renderPack(), { privateKey: null });
    expect(pack.signature).toBeNull();
    expect(verifyEvidenceSignature(pack)).toMatchObject({ signed: false, valid: false });
  });

  it('a contentHash mutated AFTER signing ⇒ valid:false (signedContentHash mismatch)', () => {
    const signed = signEvidenceExport(renderPack(), { privateKey: ephemeralKey(), now: () => FIXED });
    const tampered: EvidenceExport = { ...signed, contentHash: 'deadbeef'.repeat(8) };
    const result = verifyEvidenceSignature(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not match');
  });

  it('verifying with a DIFFERENT embedded public key ⇒ valid:false', () => {
    const signed = signEvidenceExport(renderPack(), { privateKey: ephemeralKey(), now: () => FIXED });
    // Swap the embedded public key for an UNRELATED one — the signature no longer verifies.
    const otherPubPem = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const swapped: EvidenceExport = {
      ...signed,
      signature: { ...signed.signature!, publicKeyPem: otherPubPem },
    };
    expect(verifyEvidenceSignature(swapped)).toMatchObject({ signed: true, valid: false });
  });
});

describe('loadEvidenceSigningKey', () => {
  it('accepts a PKCS8 PEM and round-trips to a valid signature', () => {
    const pem = ephemeralKey().export({ type: 'pkcs8', format: 'pem' }).toString();
    const key = loadEvidenceSigningKey(pem);
    expect(key).not.toBeNull();
    const signed = signEvidenceExport(renderPack(), { privateKey: key, now: () => FIXED });
    expect(verifyEvidenceSignature(signed).valid).toBe(true);
  });

  it('accepts a bare base64-DER (PKCS8) and round-trips', () => {
    const der = ephemeralKey().export({ type: 'pkcs8', format: 'der' });
    const b64 = Buffer.from(der).toString('base64');
    const key = loadEvidenceSigningKey(b64);
    expect(key).not.toBeNull();
    const signed = signEvidenceExport(renderPack(), { privateKey: key, now: () => FIXED });
    expect(verifyEvidenceSignature(signed).valid).toBe(true);
  });

  it('degrades to null (unsigned) for empty / malformed / non-Ed25519 keys — never throws', () => {
    expect(loadEvidenceSigningKey(undefined)).toBeNull();
    expect(loadEvidenceSigningKey('')).toBeNull();
    expect(loadEvidenceSigningKey('   ')).toBeNull();
    expect(loadEvidenceSigningKey('not-a-key')).toBeNull();
    // A valid PEM but the WRONG algorithm (RSA) ⇒ null (evidence stays unsigned).
    const rsaPem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(loadEvidenceSigningKey(rsaPem)).toBeNull();
  });

  it('a malformed key routed through the module signer ⇒ an UNSIGNED pack (no throw)', () => {
    const pack = signEvidenceExport(renderPack(), { privateKey: loadEvidenceSigningKey('garbage') });
    expect(pack.signature).toBeNull();
  });
});
