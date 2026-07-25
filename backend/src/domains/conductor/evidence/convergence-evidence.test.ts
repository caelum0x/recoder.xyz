/**
 * Convergence evidence (product step 3) — the exportable, content-hashed record a
 * governed merge produces.
 *
 * Proves: the pure assembler folds candidates + governance verdict + pre-merge
 * verification + provenance into a versioned record; the chosen candidate is flagged
 * by id; each readable candidate diff gets an order-independent `diffHash` and an
 * unreadable one gets NONE (never fabricated); verification degrades to
 * `available:false` + reason when absent (never a fabricated pass); the `contentHash`
 * is deterministic (same inputs ⇒ same hash) and tamper-evident (any field change ⇒
 * a different hash, and `verifyEvidenceHash` catches an altered record).
 */
import { describe, it, expect } from 'vitest';
import type { ReadinessView } from '../services/readiness.service.js';
import {
  assembleConvergenceEvidence,
  computeEvidenceHash,
  hashCandidateDiff,
  verifyEvidenceHash,
  CONVERGENCE_EVIDENCE_SCHEMA,
  type EvidenceAssemblyInput,
  type EvidenceCandidateInput,
  type EvidenceGovernance,
} from './convergence-evidence.js';

const FIXED_NOW = '2026-07-25T00:00:00.000Z';

const GOVERNANCE: EvidenceGovernance = {
  action: 'workspace.merge',
  effect: 'allow',
  riskTier: 'medium',
  degraded: false,
  reason: 'policy allowed',
};

const READINESS: ReadinessView = {
  verdict: 'ready',
  signals: [
    { id: 'lifecycle', status: 'pass', detail: 'workspace is reviewable' },
    { id: 'merge', status: 'pass', detail: 'trial merge is clean' },
    { id: 'checks', status: 'unknown', detail: 'no checks reported' },
    { id: 'preview', status: 'unknown', detail: 'preview not verified' },
  ],
  blockers: [],
};

function candidate(over: Partial<EvidenceCandidateInput> & { workspaceId: string }): EvidenceCandidateInput {
  return {
    agent: 'claude_code',
    branch: `recoder/${over.workspaceId}`,
    state: 'awaiting_review',
    ...over,
  };
}

function baseInput(over: Partial<EvidenceAssemblyInput> = {}): EvidenceAssemblyInput {
  return {
    chosenWorkspaceId: 'ws-a',
    taskId: 'task-1',
    taskGroup: 'grp-1',
    mergeMode: 'local',
    candidates: [
      candidate({ workspaceId: 'ws-a', diffStat: { files: 2, additions: 10, deletions: 3 }, changedFiles: ['src/b.ts', 'src/a.ts'] }),
      candidate({ workspaceId: 'ws-b', diffStat: { files: 1, additions: 4, deletions: 0 }, changedFiles: ['src/a.ts'] }),
    ],
    governance: GOVERNANCE,
    verification: { view: READINESS },
    actorId: 'user-1',
    mergedAt: FIXED_NOW,
    now: () => FIXED_NOW,
    ...over,
  };
}

describe('assembleConvergenceEvidence', () => {
  it('assembles a full record: schema, chosen flag, diff hashes, governance, verification, provenance', () => {
    const ev = assembleConvergenceEvidence(baseInput());

    expect(ev.schema).toBe(CONVERGENCE_EVIDENCE_SCHEMA);
    expect(ev.taskId).toBe('task-1');
    expect(ev.taskGroup).toBe('grp-1');
    expect(ev.chosenWorkspaceId).toBe('ws-a');
    expect(ev.mergeMode).toBe('local');
    expect(ev.candidateCount).toBe(2);

    const [a, b] = ev.candidates;
    expect(a.chosen).toBe(true); // the merged workspace
    expect(b.chosen).toBe(false);
    expect(a.diffHash).toBeTypeOf('string');
    expect(b.diffHash).toBeTypeOf('string');
    expect(a.diffHash).not.toBe(b.diffHash); // different footprints ⇒ different hashes

    expect(ev.governance).toEqual(GOVERNANCE);
    expect(ev.verification.available).toBe(true);
    expect(ev.verification.verdict).toBe('ready');
    expect(ev.verification.signals).toHaveLength(4);
    expect(ev.provenance).toEqual({ actorId: 'user-1', mergedAt: FIXED_NOW, emittedAt: FIXED_NOW });

    expect(ev.contentHash).toBeTypeOf('string');
    expect(verifyEvidenceHash(ev)).toBe(true);
  });

  it('flags no chosen candidate when the merged id is absent from the set (still truthful)', () => {
    const ev = assembleConvergenceEvidence(baseInput({ chosenWorkspaceId: 'ws-z' }));
    expect(ev.candidates.every((c) => c.chosen === false)).toBe(true);
    expect(verifyEvidenceHash(ev)).toBe(true);
  });

  it('carries the approvalId when the verdict cleared a needs_approval', () => {
    const ev = assembleConvergenceEvidence(
      baseInput({ governance: { ...GOVERNANCE, approvalId: 'appr-9' } }),
    );
    expect(ev.governance.approvalId).toBe('appr-9');
  });

  describe('degrade-truthful', () => {
    it('omits diffHash for a candidate whose changed-file list is unreadable', () => {
      const ev = assembleConvergenceEvidence(
        baseInput({
          candidates: [
            candidate({ workspaceId: 'ws-a', diffStat: { files: 1, additions: 1, deletions: 0 } }), // no changedFiles
          ],
        }),
      );
      expect(ev.candidates[0].diffHash).toBeUndefined();
      expect(verifyEvidenceHash(ev)).toBe(true);
    });

    it('reports verification unavailable (never a fabricated pass) when no readiness view', () => {
      const ev = assembleConvergenceEvidence(baseInput({ verification: { reason: 'readiness probe unavailable' } }));
      expect(ev.verification.available).toBe(false);
      expect(ev.verification.verdict).toBeUndefined();
      expect(ev.verification.signals).toEqual([]);
      expect(ev.verification.blockers).toEqual([]);
      expect(ev.verification.reason).toBe('readiness probe unavailable');
    });

    it('defaults a truthful reason when verification is entirely absent', () => {
      const ev = assembleConvergenceEvidence(baseInput({ verification: undefined }));
      expect(ev.verification.available).toBe(false);
      expect(ev.verification.reason).toBe('verification not computed');
    });

    it('emits a candidate-less-safe record with an ungrouped task', () => {
      const ev = assembleConvergenceEvidence(
        baseInput({ taskGroup: null, candidates: [candidate({ workspaceId: 'ws-a' })] }),
      );
      expect(ev.taskGroup).toBeNull();
      expect(ev.candidateCount).toBe(1);
    });
  });

  describe('content hashing', () => {
    it('is deterministic for identical inputs (fixed clock)', () => {
      const a = assembleConvergenceEvidence(baseInput());
      const b = assembleConvergenceEvidence(baseInput());
      expect(a.contentHash).toBe(b.contentHash);
    });

    it('changes when any sealed field changes (tamper-evident)', () => {
      const base = assembleConvergenceEvidence(baseInput());
      const changedActor = assembleConvergenceEvidence(baseInput({ actorId: 'user-2' }));
      const changedDiff = assembleConvergenceEvidence(
        baseInput({
          candidates: [
            candidate({ workspaceId: 'ws-a', diffStat: { files: 2, additions: 99, deletions: 3 }, changedFiles: ['src/b.ts', 'src/a.ts'] }),
            candidate({ workspaceId: 'ws-b', diffStat: { files: 1, additions: 4, deletions: 0 }, changedFiles: ['src/a.ts'] }),
          ],
        }),
      );
      expect(changedActor.contentHash).not.toBe(base.contentHash);
      expect(changedDiff.contentHash).not.toBe(base.contentHash);
    });

    it('verifyEvidenceHash catches a record altered after sealing', () => {
      const ev = assembleConvergenceEvidence(baseInput());
      const tampered = { ...ev, chosenWorkspaceId: 'ws-evil' };
      expect(verifyEvidenceHash(tampered)).toBe(false);
    });

    it('computeEvidenceHash ignores the contentHash field itself', () => {
      const ev = assembleConvergenceEvidence(baseInput());
      const { contentHash, ...rest } = ev;
      expect(computeEvidenceHash(rest)).toBe(contentHash);
    });
  });
});

describe('hashCandidateDiff', () => {
  it('is order-independent over the changed-file list', () => {
    const stat = { files: 2, additions: 1, deletions: 1 };
    expect(hashCandidateDiff(stat, ['a.ts', 'b.ts'])).toBe(hashCandidateDiff(stat, ['b.ts', 'a.ts']));
  });

  it('hashes a readable-but-empty change set (a real, verifiable "no changes")', () => {
    expect(hashCandidateDiff(undefined, [])).toBeTypeOf('string');
  });

  it('returns undefined for an unreadable (absent) change set — never a hash of a guess', () => {
    expect(hashCandidateDiff({ files: 1, additions: 1, deletions: 0 }, undefined)).toBeUndefined();
  });

  it('reflects the diffStat in the hash (stat change ⇒ different hash)', () => {
    const files = ['a.ts'];
    expect(hashCandidateDiff({ files: 1, additions: 1, deletions: 0 }, files)).not.toBe(
      hashCandidateDiff({ files: 1, additions: 2, deletions: 0 }, files),
    );
  });
});
