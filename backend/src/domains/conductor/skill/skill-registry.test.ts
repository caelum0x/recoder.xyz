/**
 * `SkillRegistry` — proves the TRUST BOUNDARY of the governed skill model: a
 * manifest is admitted (and thus invocable) ONLY when it is authentically SIGNED
 * (the injected verifier says ok) AND version-PINNED. An unsigned / bad-signature
 * / unpinned / wrong-version / unknown-publisher / malformed manifest is REJECTED
 * at load with a truthful reason and is never exposed by `list`/`resolveAction`.
 */
import { describe, it, expect } from 'vitest';
import { createSkillRegistry, type PinnedSkillVersions } from './skill-registry.js';
import type {
  SkillManifest,
  SkillSignatureVerifier,
  SkillVerificationOutcome,
} from './skill.types.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as unknown as Parameters<typeof createSkillRegistry>[0]['logger'];

function manifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    id: 'fmt',
    version: '1.0.0',
    publisherKeyId: 'pub-1',
    signature: 'sig-good',
    actions: [
      {
        id: 'format',
        title: 'Format file',
        paramsSchema: { path: { type: 'string', required: true } },
        requiredCapabilities: ['fs.write'],
      },
    ],
    ...overrides,
  };
}

/** A verifier that accepts one exact signature string and rejects everything else. */
function verifierFor(goodSignature: string, knownPublishers: readonly string[]): SkillSignatureVerifier {
  return {
    verify(m: SkillManifest): SkillVerificationOutcome {
      if (typeof m.signature !== 'string' || m.signature.length === 0) {
        return { ok: false, reason: 'unsigned' };
      }
      if (!knownPublishers.includes(m.publisherKeyId)) {
        return { ok: false, reason: 'unknown_publisher' };
      }
      if (m.signature !== goodSignature) {
        return { ok: false, reason: 'bad_signature' };
      }
      return { ok: true };
    },
  };
}

const PINNED: PinnedSkillVersions = { fmt: '1.0.0' };

function registry(deps?: {
  verifier?: SkillSignatureVerifier;
  pinned?: PinnedSkillVersions;
}) {
  return createSkillRegistry({
    verifier: deps?.verifier ?? verifierFor('sig-good', ['pub-1']),
    pinned: deps?.pinned ?? PINNED,
    logger: silentLogger,
  });
}

describe('SkillRegistry', () => {
  it('admits a valid signed + pinned manifest and exposes it', async () => {
    const reg = registry();
    const report = await reg.load([manifest()]);
    expect(report).toEqual([{ id: 'fmt', ok: true }]);
    expect(reg.list()).toHaveLength(1);
    const resolved = reg.resolveAction('fmt', 'format');
    expect(resolved?.action.id).toBe('format');
  });

  it('rejects an UNSIGNED manifest and never exposes it (not invocable)', async () => {
    const reg = registry();
    const report = await reg.load([manifest({ signature: '' })]);
    expect(report).toEqual([{ id: 'fmt', ok: false, reason: 'unsigned' }]);
    expect(reg.list()).toHaveLength(0);
    expect(reg.resolveAction('fmt', 'format')).toBeNull();
  });

  it('rejects a BAD-SIGNATURE manifest (not invocable)', async () => {
    const reg = registry();
    const report = await reg.load([manifest({ signature: 'sig-forged' })]);
    expect(report).toEqual([{ id: 'fmt', ok: false, reason: 'bad_signature' }]);
    expect(reg.resolveAction('fmt', 'format')).toBeNull();
  });

  it('rejects an UNKNOWN-PUBLISHER manifest', async () => {
    const reg = registry();
    const report = await reg.load([manifest({ publisherKeyId: 'pub-evil' })]);
    expect(report).toEqual([{ id: 'fmt', ok: false, reason: 'unknown_publisher' }]);
    expect(reg.resolveAction('fmt', 'format')).toBeNull();
  });

  it('rejects an UNPINNED skill (id not in the pinned allow-list)', async () => {
    const reg = registry({ pinned: {} });
    const report = await reg.load([manifest()]);
    expect(report).toEqual([{ id: 'fmt', ok: false, reason: 'not_pinned' }]);
    expect(reg.resolveAction('fmt', 'format')).toBeNull();
  });

  it('rejects a WRONG-VERSION manifest even when signed by a trusted publisher', async () => {
    const reg = registry();
    const report = await reg.load([manifest({ version: '2.0.0' })]);
    expect(report).toEqual([{ id: 'fmt', ok: false, reason: 'version_mismatch' }]);
    expect(reg.resolveAction('fmt', 'format')).toBeNull();
  });

  it('rejects a MALFORMED manifest (missing action id)', async () => {
    const reg = registry();
    const bad = manifest({
      // deliberately malformed action
      actions: [{ id: '', title: 'x', paramsSchema: {}, requiredCapabilities: [] }],
    });
    const report = await reg.load([bad]);
    expect(report[0]).toMatchObject({ ok: false, reason: 'malformed' });
    expect(reg.list()).toHaveLength(0);
  });

  it('rejects a DUPLICATE id without overwriting the verified skill', async () => {
    const reg = registry();
    const report = await reg.load([manifest(), manifest({ signature: 'sig-forged' })]);
    expect(report[0]).toEqual({ id: 'fmt', ok: true });
    expect(report[1]).toEqual({ id: 'fmt', ok: false, reason: 'duplicate_id' });
    expect(reg.list()).toHaveLength(1);
  });

  it('fails closed when the verifier THROWS (verifier_fault, not admitted)', async () => {
    const throwingVerifier: SkillSignatureVerifier = {
      verify() {
        throw new Error('hsm offline');
      },
    };
    const reg = registry({ verifier: throwingVerifier });
    const report = await reg.load([manifest()]);
    expect(report).toEqual([{ id: 'fmt', ok: false, reason: 'verifier_fault' }]);
    expect(reg.list()).toHaveLength(0);
  });

  it('resolves null for an unknown action on a verified skill', async () => {
    const reg = registry();
    await reg.load([manifest()]);
    expect(reg.resolveAction('fmt', 'nope')).toBeNull();
    expect(reg.resolveAction('nope', 'format')).toBeNull();
  });
});
