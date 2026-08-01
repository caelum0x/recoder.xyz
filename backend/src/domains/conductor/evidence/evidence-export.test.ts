/**
 * Framework-mapped evidence EXPORT — render a convergence evidence record into a
 * control-mapped, exportable pack.
 *
 * Proves: a FULL record maps every control to `met`; a DEGRADED record (no approval
 * on a high-risk change / no audit seal / not governance-allowed / verification
 * unavailable / no candidates / single-agent / tampered hash) flips the RIGHT
 * controls to `partial`/`not-evidenced` WITH a truthful reason — never a fabricated
 * `met`; the pack's own `contentHash` is stable + tamper-evident; the markdown
 * summary renders the controls.
 */
import { describe, it, expect } from 'vitest';
import type { ReadinessView } from '../services/readiness.service.js';
import {
  assembleConvergenceEvidence,
  type ConvergenceEvidenceRecord,
  type EvidenceAssemblyInput,
  type EvidenceConvergence,
  type EvidenceSeal,
} from './convergence-evidence.js';
import {
  renderEvidenceExport,
  verifyExportHash,
  EVIDENCE_EXPORT_SCHEMA,
  type ControlStatus,
} from './evidence-export.js';

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

const CONVERGENCE: EvidenceConvergence = {
  fromTaskGroup: 'grp-1',
  sourceCount: 2,
  fileCount: 2,
  selections: [
    { path: 'a.ts', mode: 'pick', sourceWorkspaceId: 'ws-a', contested: false },
    { path: 'shared.ts', mode: 'synthesize', contributors: ['ws-a', 'ws-b'], contested: true },
  ],
};

const SEAL: EvidenceSeal = { auditId: 'aud-1', auditSeq: 7, auditEntryHash: 'a'.repeat(64) };

function evidenceInput(over: Partial<EvidenceAssemblyInput> = {}): EvidenceAssemblyInput {
  return {
    chosenWorkspaceId: 'ws-a',
    taskId: 'task-1',
    taskGroup: 'grp-1',
    mergeMode: 'local',
    candidates: [
      { workspaceId: 'ws-a', agent: 'claude_code', branch: 'b-a', runId: 'run-a', state: 'awaiting_review', changedFiles: ['a.ts'] },
      { workspaceId: 'ws-b', agent: 'codex', branch: 'b-b', runId: 'run-b', state: 'awaiting_review', changedFiles: ['shared.ts'] },
    ],
    governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'medium', degraded: false },
    verification: { view: READY },
    convergence: CONVERGENCE,
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

function statusOf(record: ConvergenceEvidenceRecord, id: string): { status: ControlStatus; reason?: string } {
  const pack = renderEvidenceExport(record, { now: () => FIXED });
  const control = pack.controls.find((c) => c.id === id);
  if (!control) throw new Error(`control not found: ${id}`);
  return { status: control.status, ...(control.reason ? { reason: control.reason } : {}) };
}

describe('renderEvidenceExport', () => {
  it('maps every control to `met` for a full, sealed, verified, human-approved record', () => {
    // A maximally-compliant merge carries a human approval (Art. 14 human oversight
    // is `met` only with a recorded approvalId — an auto-merge legitimately lacks it).
    const record = makeRecord({
      evidence: { governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'medium', degraded: false, approvalId: 'appr-1' } },
    });
    const pack = renderEvidenceExport(record, { now: () => FIXED });

    expect(pack.schema).toBe(EVIDENCE_EXPORT_SCHEMA);
    expect(pack.evidenceIntegrity.verified).toBe(true);
    expect(pack.coverage).toEqual({ met: 6, partial: 0, notEvidenced: 0, total: 6 });
    expect(pack.controls.map((c) => c.status)).toEqual(['met', 'met', 'met', 'met', 'met', 'met']);
    expect(pack.controls.every((c) => c.reason === undefined)).toBe(true);

    // Provenance + subject lifted truthfully.
    expect(pack.generatedFrom).toBe(record.evidence.contentHash);
    expect(pack.subject).toMatchObject({
      taskId: 'task-1',
      chosenWorkspaceId: 'ws-a',
      actorId: 'user-1',
      candidateCount: 2,
      auditEntryHash: 'a'.repeat(64),
    });
    expect(verifyExportHash(pack)).toBe(true);
  });

  describe('SOC2-CC8.1 (change management)', () => {
    it('is not-evidenced when the merge was not governance-allowed', () => {
      const r = makeRecord({ evidence: { governance: { action: 'workspace.merge', effect: 'deny', riskTier: 'medium', degraded: false } } });
      const s = statusOf(r, 'SOC2-CC8.1');
      expect(s.status).toBe('not-evidenced');
      expect(s.reason).toContain("effect='deny'");
    });

    it('is partial when there is no durable audit seal', () => {
      const r = makeRecord({ seal: { auditId: null, auditSeq: null, auditEntryHash: null } });
      const s = statusOf(r, 'SOC2-CC8.1');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain('audit seal');
    });

    it('is partial for a high-risk change with no recorded approval', () => {
      const r = makeRecord({ evidence: { governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'high', degraded: false } } });
      const s = statusOf(r, 'SOC2-CC8.1');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain('high-risk');
    });

    it('is met for a high-risk change WITH a recorded approvalId', () => {
      const r = makeRecord({
        evidence: { governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'high', degraded: false, approvalId: 'appr-9' } },
      });
      expect(statusOf(r, 'SOC2-CC8.1').status).toBe('met');
    });
  });

  describe('SOC2-CC7.2 (change verification)', () => {
    it('is met when verification ran delivery-clean before promotion', () => {
      expect(statusOf(makeRecord(), 'SOC2-CC7.2').status).toBe('met');
    });

    it('is partial when pre-merge verification was unavailable', () => {
      const r = makeRecord({ evidence: { verification: { reason: 'readiness probe unavailable' } } });
      const s = statusOf(r, 'SOC2-CC7.2');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain('unavailable');
    });

    it('is partial when verification RAN but the verdict is not delivery-clean', () => {
      const r = makeRecord({ evidence: { verification: { view: { ...READY, verdict: 'blocked' } } } });
      const s = statusOf(r, 'SOC2-CC7.2');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain("verdict='blocked'");
    });
  });

  describe('EU-AI-ACT-ART14 (human oversight)', () => {
    it('is met when a human approval cleared the change', () => {
      const r = makeRecord({
        evidence: { governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'high', degraded: false, approvalId: 'appr-1' } },
      });
      expect(statusOf(r, 'EU-AI-ACT-ART14').status).toBe('met');
    });

    it('is partial for a high-risk change auto-allowed with no human approval', () => {
      const r = makeRecord({ evidence: { governance: { action: 'workspace.merge', effect: 'allow', riskTier: 'high', degraded: false } } });
      const s = statusOf(r, 'EU-AI-ACT-ART14');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain('high-risk');
    });

    it('is not-evidenced for a low/medium auto-merge with no human approval', () => {
      expect(statusOf(makeRecord(), 'EU-AI-ACT-ART14').status).toBe('not-evidenced');
    });

    it('is not-evidenced when the merge was not governance-allowed', () => {
      const r = makeRecord({ evidence: { governance: { action: 'workspace.merge', effect: 'deny', riskTier: 'high', degraded: false } } });
      expect(statusOf(r, 'EU-AI-ACT-ART14').status).toBe('not-evidenced');
    });
  });

  describe('DORA-ICT-CHANGE (change control)', () => {
    it('is partial when pre-merge verification was unavailable', () => {
      const r = makeRecord({ evidence: { verification: { reason: 'readiness probe unavailable' } } });
      const s = statusOf(r, 'DORA-ICT-CHANGE');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain('unavailable');
    });

    it('is not-evidenced when there is no candidate change set', () => {
      const r = makeRecord({ evidence: { candidates: [] } });
      expect(statusOf(r, 'DORA-ICT-CHANGE').status).toBe('not-evidenced');
    });

    it('is partial (not met) when verification RAN but the verdict is not delivery-clean', () => {
      const r = makeRecord({ evidence: { verification: { view: { ...READY, verdict: 'blocked' } } } });
      const s = statusOf(r, 'DORA-ICT-CHANGE');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain("verdict='blocked'");
    });
  });

  describe('EU-AI-ACT-ART12 (record-keeping)', () => {
    it('is partial when no candidate run ids are recorded', () => {
      const r = makeRecord({
        evidence: {
          candidates: [{ workspaceId: 'ws-a', agent: 'claude_code', branch: 'b-a', state: 'awaiting_review', changedFiles: ['a.ts'] }],
        },
      });
      const s = statusOf(r, 'EU-AI-ACT-ART12');
      expect(s.status).toBe('partial');
      expect(s.reason).toContain('run ids');
    });
  });

  describe('RECODER-CONVERGENCE (convergence integrity)', () => {
    it('is not-evidenced for a plain single-agent merge (no convergence block)', () => {
      const r = makeRecord({ evidence: { convergence: undefined } });
      const s = statusOf(r, 'RECODER-CONVERGENCE');
      expect(s.status).toBe('not-evidenced');
      expect(s.reason).toContain('single-agent');
    });
  });

  describe('tamper detection (integrity-gated controls flip)', () => {
    it('flips EU-AI-ACT + RECODER to partial when the record hash does not verify', () => {
      const record = makeRecord();
      const tampered: ConvergenceEvidenceRecord = {
        ...record,
        evidence: { ...record.evidence, chosenWorkspaceId: 'ws-EVIL' }, // hash no longer matches
      };
      const pack = renderEvidenceExport(tampered, { now: () => FIXED });
      expect(pack.evidenceIntegrity.verified).toBe(false);
      const byId = Object.fromEntries(pack.controls.map((c) => [c.id, c.status]));
      expect(byId['EU-AI-ACT-ART12']).toBe('partial');
      expect(byId['RECODER-CONVERGENCE']).toBe('partial');
      // SOC2 + DORA do not depend on the content hash — they stay met.
      expect(byId['SOC2-CC8.1']).toBe('met');
      expect(byId['DORA-ICT-CHANGE']).toBe('met');
    });
  });

  describe('pack integrity', () => {
    it('is deterministic for the same record + clock', () => {
      const record = makeRecord();
      const a = renderEvidenceExport(record, { now: () => FIXED });
      const b = renderEvidenceExport(record, { now: () => FIXED });
      expect(a.contentHash).toBe(b.contentHash);
    });

    it('verifyExportHash catches a pack altered after rendering', () => {
      const pack = renderEvidenceExport(makeRecord(), { now: () => FIXED });
      const tampered = { ...pack, summary: pack.summary + '\n(injected)' };
      expect(verifyExportHash(tampered)).toBe(false);
    });
  });

  describe('markdown summary', () => {
    it('renders the header, coverage line, and control labels', () => {
      const pack = renderEvidenceExport(makeRecord(), { now: () => FIXED });
      expect(pack.summary).toContain('# Convergence Evidence Export');
      expect(pack.summary).toContain('5 met · 0 partial · 1 not evidenced');
      expect(pack.summary).toContain('[MET] SOC 2 SOC2-CC8.1 — Change management');
      expect(pack.summary).toContain('Merged workspace: ws-a');
    });

    it('renders a truthful NOT EVIDENCED / PARTIAL label for a degraded record', () => {
      const r = makeRecord({ evidence: { convergence: undefined, verification: { reason: 'x' } } });
      const pack = renderEvidenceExport(r, { now: () => FIXED });
      expect(pack.summary).toContain('[NOT EVIDENCED] Recoder RECODER-CONVERGENCE');
      expect(pack.summary).toContain('[PARTIAL] DORA DORA-ICT-CHANGE');
    });
  });
});
