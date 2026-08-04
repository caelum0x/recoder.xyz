/**
 * Framework annotation mapper — truthfulness of the presence-filtered catalog.
 *
 * Proves: a FULL record (approval + seal + verification + human contested pick)
 * maps controls in all three frameworks; a record WITHOUT approval drops every
 * human-oversight mapping (even when contested picks exist — a pick alone is not
 * a recorded approval); a record WITHOUT verification drops every DORA mapping;
 * an EMPTY record (no approval / seal / verification / convergence) maps to [].
 * And: the export pack carries the annotations as an optional `frameworks`
 * section while the sealed record's `contentHash` stays untouched.
 */
import { describe, it, expect } from 'vitest';
import type { ReadinessView } from '../services/readiness.service.js';
import {
  assembleConvergenceEvidence,
  verifyEvidenceHash,
  type ConvergenceEvidenceRecord,
  type EvidenceAssemblyInput,
  type EvidenceConvergence,
  type EvidenceSeal,
} from './convergence-evidence.js';
import { mapFrameworkAnnotations, type FrameworkAnnotation } from './framework-mapping.js';
import { renderEvidenceExport } from './evidence-export.js';

const FIXED = '2026-08-04T00:00:00.000Z';

const READY: ReadinessView = {
  verdict: 'ready',
  signals: [{ id: 'lifecycle', status: 'pass', detail: 'reviewable' }],
  blockers: [],
};

/** A convergence block with a HUMAN-resolved contested pick (the Art. 14 corroborator). */
const HUMAN_PICK_CONVERGENCE: EvidenceConvergence = {
  fromTaskGroup: 'grp-1',
  sourceCount: 2,
  fileCount: 2,
  selections: [
    { path: 'a.ts', mode: 'pick', sourceWorkspaceId: 'ws-a', contested: false },
    { path: 'shared.ts', mode: 'pick', sourceWorkspaceId: 'ws-b', contested: true },
  ],
};

const SEAL: EvidenceSeal = { auditId: 'aud-1', auditSeq: 7, auditEntryHash: 'a'.repeat(64) };
const NO_SEAL: EvidenceSeal = { auditId: null, auditSeq: null, auditEntryHash: null };

function evidenceInput(over: Partial<EvidenceAssemblyInput> = {}): EvidenceAssemblyInput {
  return {
    chosenWorkspaceId: 'ws-a',
    taskId: 'task-1',
    taskGroup: 'grp-1',
    candidates: [
      { workspaceId: 'ws-a', agent: 'claude_code', branch: 'b-a', runId: 'run-a', state: 'awaiting_review', changedFiles: ['a.ts'] },
      { workspaceId: 'ws-b', agent: 'codex', branch: 'b-b', runId: 'run-b', state: 'awaiting_review', changedFiles: ['shared.ts'] },
    ],
    governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'medium', degraded: false, approvalId: 'appr-1' },
    verification: { view: READY },
    convergence: HUMAN_PICK_CONVERGENCE,
    actorId: 'user-1',
    mergedAt: FIXED,
    now: () => FIXED,
    ...over,
  };
}

function makeRecord(over: { evidence?: Partial<EvidenceAssemblyInput>; seal?: EvidenceSeal } = {}): ConvergenceEvidenceRecord {
  return {
    evidence: assembleConvergenceEvidence(evidenceInput(over.evidence)),
    seal: over.seal ?? SEAL,
  };
}

function byControl(annotations: readonly FrameworkAnnotation[], control: string): FrameworkAnnotation | undefined {
  return annotations.find(a => a.control === control);
}

describe('mapFrameworkAnnotations', () => {
  it('maps all three frameworks for a full record, with spec-pinned satisfiedBy sections', () => {
    const annotations = mapFrameworkAnnotations(makeRecord());

    expect(new Set(annotations.map(a => a.framework))).toEqual(new Set(['SOC2', 'EU-AI-Act', 'DORA']));
    // Full record ⇒ the whole starter catalog (3 per framework) is defensible.
    expect(annotations).toHaveLength(9);

    // The spec-pinned section mappings.
    expect(byControl(annotations, 'CC8.1')?.satisfiedBy).toEqual(['governance.verdict', 'approval', 'seal']);
    expect(byControl(annotations, 'Art. 14')?.satisfiedBy).toEqual(['approval', 'convergence.selections']);
    expect(byControl(annotations, 'Art. 9(4)(e)')?.satisfiedBy).toEqual(['verification', 'seal']);

    // Every annotation carries a one-line rationale and only present sections.
    for (const a of annotations) {
      expect(a.rationale.length).toBeGreaterThan(0);
      expect(a.rationale).not.toContain('\n');
      expect(a.satisfiedBy.length).toBeGreaterThan(0);
    }
  });

  it('drops human-oversight (Art. 14) and approval-anchored CC8.1 when there is no approval', () => {
    // Contested human picks are still present — a pick alone must NOT stand in
    // for a recorded approval.
    const record = makeRecord({
      evidence: { governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'medium', degraded: false } },
    });
    const annotations = mapFrameworkAnnotations(record);

    expect(byControl(annotations, 'Art. 14')).toBeUndefined();
    expect(byControl(annotations, 'CC8.1')).toBeUndefined();
    // Approval-independent mappings survive.
    expect(byControl(annotations, 'Art. 12')).toBeDefined();
    expect(annotations.some(a => a.framework === 'DORA')).toBe(true);
    // The invariant, not just two ids: nothing references the absent section.
    expect(annotations.every(a => !a.satisfiedBy.includes('approval'))).toBe(true);
  });

  it('drops every DORA mapping when verification is unavailable', () => {
    const record = makeRecord({ evidence: { verification: { reason: 'readiness probe unavailable' } } });
    const annotations = mapFrameworkAnnotations(record);

    expect(annotations.some(a => a.framework === 'DORA')).toBe(false);
    expect(annotations.every(a => !a.satisfiedBy.includes('verification'))).toBe(true);
    // Non-verification evidence still maps (approval + seal are present).
    expect(byControl(annotations, 'CC8.1')).toBeDefined();
    expect(byControl(annotations, 'Art. 14')).toBeDefined();
  });

  it('maps an empty record (no approval / seal / verification / convergence) to []', () => {
    const record = makeRecord({
      evidence: {
        governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'medium', degraded: false },
        verification: { reason: 'not computed' },
        convergence: undefined,
      },
      seal: NO_SEAL,
    });
    expect(mapFrameworkAnnotations(record)).toEqual([]);
  });

  it('does not count mechanical selections (uncontested pick / synthesize) as the human-selection corroborator', () => {
    const record = makeRecord({
      evidence: {
        convergence: {
          fromTaskGroup: 'grp-1',
          sourceCount: 2,
          fileCount: 2,
          selections: [
            { path: 'a.ts', mode: 'pick', sourceWorkspaceId: 'ws-a', contested: false },
            { path: 'shared.ts', mode: 'synthesize', contributors: ['ws-a', 'ws-b'], contested: true },
          ],
        },
      },
    });
    // Art. 14 still maps (approval is present) but is NOT corroborated by selections.
    expect(byControl(mapFrameworkAnnotations(record), 'Art. 14')?.satisfiedBy).toEqual(['approval']);
  });
});

describe('export pack wiring (optional frameworks section)', () => {
  it('carries the annotations in the pack while the sealed record stays unchanged', () => {
    const record = makeRecord();
    const before = record.evidence.contentHash;

    const pack = renderEvidenceExport(record, { now: () => FIXED });

    expect(pack.frameworks).toEqual(mapFrameworkAnnotations(record));
    // Derived-at-export metadata must not alter the sealed record or its meaning.
    expect(record.evidence.contentHash).toBe(before);
    expect(verifyEvidenceHash(record.evidence)).toBe(true);
  });

  it('omits the frameworks section entirely for an empty record (no hollow claim)', () => {
    const record = makeRecord({
      evidence: {
        governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'medium', degraded: false },
        verification: { reason: 'not computed' },
        convergence: undefined,
      },
      seal: NO_SEAL,
    });
    const pack = renderEvidenceExport(record, { now: () => FIXED });
    expect('frameworks' in pack).toBe(false);
  });
});
