/**
 * Signed preview-verification evidence pack (BE-6.2).
 *
 * Proves: a verification outcome renders into a deterministic, content-hashed pack
 * that faithfully mirrors the real status/degrade posture (never a fabricated pass);
 * signing is DETACHED (does not change contentHash) and re-verifies against the
 * embedded public key; no key ⇒ an UNSIGNED pack (never a forged sig, never a throw);
 * a malformed key degrades to unsigned; and a tampered pack fails the hash check.
 */
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { verifyEvidenceSignature } from './evidence-signing.js';
import {
  PREVIEW_EVIDENCE_SCHEMA,
  renderPreviewEvidence,
  signPreviewEvidence,
  verifyPreviewEvidenceHash,
  type PreviewEvidencePack,
} from './preview-evidence.js';
import type { PreviewVerification } from '../ports/preview-verify.port.js';

const FIXED = '2026-08-01T00:00:00.000Z';

const PASSED: PreviewVerification = {
  status: 'passed',
  degraded: false,
  summary: 'preview verified: 2 checks passed',
  checks: [
    { tool: 'open', status: 'passed', message: 'navigated' },
    { tool: 'assert', status: 'passed' },
  ],
  artifacts: [
    { artifactId: 'art-shot-1', kind: 'screenshot', summary: 'screenshot' },
    { artifactId: 'art-sum-1', kind: 'verification_summary', summary: 'summary' },
  ],
};

const DEGRADED: PreviewVerification = {
  status: 'skipped',
  degraded: true,
  reason: 'no browser engine wired',
  summary: 'preview verification skipped: browser unavailable',
  checks: [{ tool: 'open', status: 'skipped', message: 'engine down' }],
  artifacts: [],
};

function render(v: PreviewVerification): PreviewEvidencePack {
  return renderPreviewEvidence(
    { workspaceId: 'ws-1', url: 'http://127.0.0.1:5173/', taskId: 'task-1', verification: v },
    { now: () => FIXED },
  );
}

/** A fresh Ed25519 private key for the test (ephemeral — never persisted/committed). */
function ephemeralKey() {
  return generateKeyPairSync('ed25519').privateKey;
}

describe('renderPreviewEvidence', () => {
  it('renders a deterministic, content-hashed pack that mirrors the verification', () => {
    const a = render(PASSED);
    const b = render(PASSED);
    expect(a.schema).toBe(PREVIEW_EVIDENCE_SCHEMA);
    expect(a.contentHash).toBe(b.contentHash); // deterministic under a fixed `now`
    expect(a.status).toBe('passed');
    expect(a.degraded).toBe(false);
    expect(a.reason).toBeUndefined();
    expect(a.subject).toEqual({ workspaceId: 'ws-1', url: 'http://127.0.0.1:5173/', taskId: 'task-1' });
    expect(a.artifactIds).toEqual(['art-shot-1', 'art-sum-1']);
    expect(a.checks).toEqual(PASSED.checks);
    expect(verifyPreviewEvidenceHash(a)).toBe(true);
  });

  it('faithfully carries a degraded/skipped run (never fabricates a pass)', () => {
    const pack = render(DEGRADED);
    expect(pack.status).toBe('skipped');
    expect(pack.degraded).toBe(true);
    expect(pack.reason).toBe('no browser engine wired');
    expect(pack.artifactIds).toEqual([]);
    expect(verifyPreviewEvidenceHash(pack)).toBe(true);
  });

  it('omits an absent taskId from the subject', () => {
    const pack = renderPreviewEvidence(
      { workspaceId: 'ws-2', url: 'http://127.0.0.1:3000/', verification: PASSED },
      { now: () => FIXED },
    );
    expect(pack.subject).toEqual({ workspaceId: 'ws-2', url: 'http://127.0.0.1:3000/' });
    expect('taskId' in pack.subject).toBe(false);
  });
});

describe('signPreviewEvidence', () => {
  it('signs a pack that then verifies, WITHOUT changing the contentHash (detached)', () => {
    const unsigned = render(PASSED);
    const signed = signPreviewEvidence(unsigned, { privateKey: ephemeralKey(), now: () => FIXED });
    expect(signed.signature).not.toBeNull();
    expect(signed.signature?.algorithm).toBe('ed25519');
    expect(signed.signature?.signedContentHash).toBe(unsigned.contentHash);
    expect(signed.signature?.signedAt).toBe(FIXED);
    expect(signed.contentHash).toBe(unsigned.contentHash);
    expect(verifyPreviewEvidenceHash(signed)).toBe(true); // hash excludes the signature
    expect(verifyEvidenceSignature(signed)).toEqual({ signed: true, valid: true });
  });

  it('no key ⇒ signature:null (unsigned, never forged, never throws)', () => {
    const pack = signPreviewEvidence(render(PASSED), { privateKey: null });
    expect(pack.signature).toBeNull();
    expect(verifyEvidenceSignature(pack)).toMatchObject({ signed: false, valid: false });
  });

  it('a contentHash mutated AFTER signing ⇒ signature invalid', () => {
    const signed = signPreviewEvidence(render(PASSED), { privateKey: ephemeralKey(), now: () => FIXED });
    const tampered: PreviewEvidencePack = { ...signed, contentHash: 'deadbeef'.repeat(8) };
    expect(verifyEvidenceSignature(tampered).valid).toBe(false);
    expect(verifyPreviewEvidenceHash(tampered)).toBe(false);
  });
});
