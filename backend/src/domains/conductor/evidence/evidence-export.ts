/**
 * Framework-mapped evidence EXPORT (product step-3 headline artifact) — render a
 * {@link ConvergenceEvidenceRecord} into a portable, control-mapped pack an auditor
 * (or a CI gate) can read: the source evidence (by contentHash + key fields) + a
 * small, HONEST control catalog (SOC 2 / EU AI Act / DORA / Recoder) + a
 * human-readable markdown summary, content-hashed for its own integrity.
 *
 * PURE (mirrors `convergence-evidence.ts`): no I/O, no network, no compliance
 * engine. Each control maps to a SPECIFIC field of the record and derives its status
 * ONLY from whether that backing evidence is present — a missing sub-field flips the
 * control to `partial`/`not-evidenced` WITH a reason. It NEVER asserts `met` without
 * the backing field. This is a truthful STARTER catalog, not a certification.
 */
import { createHash } from 'node:crypto';
import {
  canonicalJson,
  verifyEvidenceHash,
  type ConvergenceEvidence,
  type ConvergenceEvidenceRecord,
} from './convergence-evidence.js';

/** Versioned schema tag for the export pack (bump on shape changes). */
export const EVIDENCE_EXPORT_SCHEMA = 'recoder.evidence-export/v1' as const;

/** A control's truthful, DERIVED status — never hardcoded to `met`. */
export type ControlStatus = 'met' | 'partial' | 'not-evidenced';

/** One framework control mapped to specific evidence fields + a derived status. */
export interface EvidenceControl {
  /** Stable control id, e.g. `SOC2-CC8.1`. */
  readonly id: string;
  /** The framework this control belongs to (`SOC 2` | `EU AI Act` | `DORA` | `Recoder`). */
  readonly framework: string;
  readonly title: string;
  /** What the control requires (plain language). */
  readonly requirement: string;
  readonly status: ControlStatus;
  /** Dot-path references into the source evidence that back this control. */
  readonly evidenceRefs: readonly string[];
  /** Why `partial`/`not-evidenced` (or a truthful note) — absent only for a clean `met`. */
  readonly reason?: string;
}

/** Count of controls by status (the coverage rollup). */
export interface ControlCoverage {
  readonly met: number;
  readonly partial: number;
  readonly notEvidenced: number;
  readonly total: number;
}

/** The key source fields lifted for the auditor (the full record is referenced by hash). */
export interface EvidenceExportSubject {
  readonly taskId?: string;
  readonly taskGroup: string | null;
  readonly chosenWorkspaceId: string;
  readonly mergedAt: string;
  readonly actorId: string;
  readonly candidateCount: number;
  /** The source record's own schema tag. */
  readonly evidenceSchema: string;
  /** The durable Merkle audit leaf for the merge (`null` when sealing was skipped). */
  readonly auditEntryHash: string | null;
}

/**
 * A DETACHED Ed25519 signature over the pack's {@link EvidenceExport.contentHash}.
 * Attached AFTER the pack (and its contentHash) is fully rendered, so signing does
 * NOT change the contentHash — the signature is over the stable hash, not part of it.
 * `null`/absent ⇒ the pack is unsigned (no key configured) — never a fabricated sig.
 */
export interface EvidenceSignature {
  readonly algorithm: 'ed25519';
  /** SPKI PEM of the signer's public key — verifiers use this (self-verifying pack). */
  readonly publicKeyPem: string;
  /** The pack `contentHash` that was signed (must equal the pack's contentHash). */
  readonly signedContentHash: string;
  /** The detached signature, base64. */
  readonly signature: string;
  readonly signedAt: string;
}

/** The portable, control-mapped export pack. */
export interface EvidenceExport {
  readonly schema: typeof EVIDENCE_EXPORT_SCHEMA;
  /** The source evidence `contentHash` this pack was generated from (provenance). */
  readonly generatedFrom: string;
  /** Whether the source record's own `contentHash` re-verifies (tamper check). */
  readonly evidenceIntegrity: { readonly verified: boolean };
  readonly subject: EvidenceExportSubject;
  readonly controls: readonly EvidenceControl[];
  readonly coverage: ControlCoverage;
  /** A human-readable (markdown) rendering for an auditor. */
  readonly summary: string;
  readonly generatedAt: string;
  /** SHA-256 over this pack MINUS `contentHash` AND `signature` — the pack's integrity seal. */
  readonly contentHash: string;
  /**
   * OPTIONAL detached Ed25519 signature over {@link contentHash}. Present only when a
   * signing key is configured; `null`/absent otherwise. NOT part of `contentHash`
   * (it signs the hash), so an unsigned and a signed pack share the same contentHash.
   */
  readonly signature?: EvidenceSignature | null;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

const HIGH_RISK_TIERS: readonly string[] = ['high', 'critical'];

/**
 * SOC 2 CC8.1 (change management): a change is authorized (governance allowed) AND
 * recorded in a tamper-evident audit trail; a HIGH-risk change additionally needs a
 * recorded approval. `met` only with all backing fields; else the truthful gap.
 */
function deriveSoc2Cc81(record: ConvergenceEvidenceRecord): EvidenceControl {
  const { governance } = record.evidence;
  const sealed = record.seal.auditEntryHash != null;
  const highRisk = HIGH_RISK_TIERS.includes(governance.riskTier);
  const refs = ['governance.effect', 'governance.riskTier', 'seal.auditEntryHash'];
  if (governance.approvalId) refs.push('governance.approvalId');

  const base = {
    id: 'SOC2-CC8.1',
    framework: 'SOC 2',
    title: 'Change management',
    requirement:
      'Changes are authorized through a governed decision and recorded in a tamper-evident audit trail; high-risk changes require a recorded approval.',
    evidenceRefs: refs,
  } as const;

  if (governance.effect !== 'allow') {
    return { ...base, status: 'not-evidenced', reason: `merge was not governance-allowed (effect='${governance.effect}')` };
  }
  if (!sealed) {
    return { ...base, status: 'partial', reason: 'no durable Merkle audit seal (seal.auditEntryHash is absent)' };
  }
  if (highRisk && !governance.approvalId) {
    return { ...base, status: 'partial', reason: `high-risk change (tier='${governance.riskTier}') without a recorded approvalId` };
  }
  return { ...base, status: 'met' };
}

/**
 * SOC 2 CC7.2 (detect + verify before promotion): the change was verified
 * (readiness/checks) before it was promoted to the trusted branch. Verification
 * unavailable OR a non-clean verdict ⇒ `partial` (truthful), never `met`. (A SOC 2
 * lens on the same verification evidence DORA-ICT-CHANGE cites — auditors map both.)
 */
function deriveSoc2Cc72(record: ConvergenceEvidenceRecord): EvidenceControl {
  const { verification } = record.evidence;
  const base = {
    id: 'SOC2-CC7.2',
    framework: 'SOC 2',
    title: 'Change verification before promotion',
    requirement:
      'The change is verified (readiness / checks) before it is promoted to the trusted branch.',
    evidenceRefs: ['verification.available', 'verification.verdict', 'verification.blockers'],
  } as const;

  if (!verification.available) {
    return {
      ...base,
      status: 'partial',
      reason: verification.reason
        ? `pre-merge verification unavailable: ${verification.reason}`
        : 'pre-merge verification was unavailable',
    };
  }
  const verdict = verification.verdict;
  if (verdict !== 'ready' && verdict !== 'delivered') {
    return {
      ...base,
      status: 'partial',
      reason: verdict
        ? `verification ran but the verdict is not delivery-clean (verdict='${verdict}')`
        : 'verification available but no verdict was recorded',
    };
  }
  return { ...base, status: 'met' };
}

/**
 * EU AI Act Art. 12 (record-keeping / logging): automatically generated, immutable
 * logs — actor + timestamp + candidate run provenance + a tamper-evident hash.
 */
function deriveEuAiActArt12(record: ConvergenceEvidenceRecord, integrityVerified: boolean): EvidenceControl {
  const { provenance, candidates } = record.evidence;
  const hasActor = provenance.actorId.trim().length > 0;
  const hasMergedAt = provenance.mergedAt.trim().length > 0;
  const hasRunProvenance = candidates.length > 0 && candidates.some((c) => Boolean(c.runId));
  const base = {
    id: 'EU-AI-ACT-ART12',
    framework: 'EU AI Act',
    title: 'Record-keeping (logging)',
    requirement:
      'The system automatically records immutable run logs: the responsible actor, the timestamp, candidate run provenance, and a tamper-evident content hash.',
    evidenceRefs: ['provenance.actorId', 'provenance.mergedAt', 'candidates[].runId', 'contentHash'],
  } as const;

  if (!hasActor || !hasMergedAt) {
    return { ...base, status: 'partial', reason: 'incomplete provenance (actor and/or merge timestamp missing)' };
  }
  if (!integrityVerified) {
    return { ...base, status: 'partial', reason: 'source record contentHash does not verify (tampered or malformed)' };
  }
  if (!hasRunProvenance) {
    return { ...base, status: 'partial', reason: 'no candidate run ids recorded (run provenance incomplete)' };
  }
  return { ...base, status: 'met' };
}

/**
 * EU AI Act Art. 14 (human oversight): a high-risk / gated AI-produced change is
 * subject to human oversight — evidenced by an explicit human approval, not merged
 * fully autonomously. `met` requires a recorded `approvalId`. A high-risk change
 * auto-allowed WITHOUT one is `partial` (oversight should have applied but didn't);
 * a low/medium auto-allowed change is `not-evidenced` (no human touched it — truthful,
 * not a failure). Never `met` without the backing approval.
 */
function deriveEuAiActArt14(record: ConvergenceEvidenceRecord): EvidenceControl {
  const { governance } = record.evidence;
  const base = {
    id: 'EU-AI-ACT-ART14',
    framework: 'EU AI Act',
    title: 'Human oversight',
    requirement:
      'High-risk / gated changes are subject to human oversight (an explicit recorded approval), not merged fully autonomously.',
    evidenceRefs: ['governance.approvalId', 'governance.riskTier', 'governance.effect'],
  } as const;

  if (governance.effect !== 'allow') {
    return { ...base, status: 'not-evidenced', reason: `merge was not governance-allowed (effect='${governance.effect}')` };
  }
  if (governance.approvalId) {
    return { ...base, status: 'met' };
  }
  if (HIGH_RISK_TIERS.includes(governance.riskTier)) {
    return { ...base, status: 'partial', reason: `high-risk change (tier='${governance.riskTier}') auto-allowed without a recorded human approval` };
  }
  return { ...base, status: 'not-evidenced', reason: `low/medium change (tier='${governance.riskTier}') auto-allowed — no human oversight was exercised on this change` };
}

/**
 * DORA ICT change control: the ICT change is identified (a candidate change set) and
 * verified before delivery. Verification unavailable ⇒ `partial` (truthful), never met.
 */
function deriveDoraChangeControl(record: ConvergenceEvidenceRecord): EvidenceControl {
  const { candidateCount, verification } = record.evidence;
  const base = {
    id: 'DORA-ICT-CHANGE',
    framework: 'DORA',
    title: 'ICT change control',
    requirement:
      'The ICT change is identified (a recorded candidate change set) and verified before delivery.',
    evidenceRefs: ['candidateCount', 'verification.available', 'verification.verdict'],
  } as const;

  if (candidateCount < 1) {
    return { ...base, status: 'not-evidenced', reason: 'no candidate change set recorded' };
  }
  if (!verification.available) {
    return {
      ...base,
      status: 'partial',
      reason: verification.reason
        ? `pre-merge verification unavailable: ${verification.reason}`
        : 'pre-merge verification was unavailable',
    };
  }
  // `met` requires a delivery-clean verdict. Verification that RAN but returned a
  // non-clean verdict (blocked / not_ready / unknown / terminal) is NOT a satisfied
  // change control — a compliance export must not show `met` for an unverified-clean
  // change; it is a truthful `partial` with the recorded verdict.
  const verdict = verification.verdict;
  if (verdict !== 'ready' && verdict !== 'delivered') {
    return {
      ...base,
      status: 'partial',
      reason: verdict
        ? `verification ran but the verdict is not delivery-clean (verdict='${verdict}')`
        : 'verification available but no verdict was recorded',
    };
  }
  return { ...base, status: 'met' };
}

/**
 * Recoder convergence integrity (optional): per-file convergence provenance (which
 * sibling won each path, via pick/synthesize) with a verifiable content hash. A
 * plain single-agent merge has no convergence block ⇒ `not-evidenced` (truthful, not
 * a failure).
 */
function deriveConvergenceIntegrity(record: ConvergenceEvidenceRecord, integrityVerified: boolean): EvidenceControl {
  const { convergence } = record.evidence;
  const base = {
    id: 'RECODER-CONVERGENCE',
    framework: 'Recoder',
    title: 'Convergence integrity',
    requirement:
      'Per-file convergence provenance (which sibling won each contested path, pick or synthesize) is recorded with a verifiable content hash.',
    evidenceRefs: ['convergence.selections', 'convergence.fileCount', 'contentHash'],
  } as const;

  if (!integrityVerified) {
    return { ...base, status: 'partial', reason: 'source record contentHash does not verify (tampered or malformed)' };
  }
  if (!convergence || convergence.selections.length === 0) {
    return { ...base, status: 'not-evidenced', reason: 'single-agent merge — no per-file convergence provenance' };
  }
  return { ...base, status: 'met' };
}

function tallyCoverage(controls: readonly EvidenceControl[]): ControlCoverage {
  const met = controls.filter((c) => c.status === 'met').length;
  const partial = controls.filter((c) => c.status === 'partial').length;
  const notEvidenced = controls.filter((c) => c.status === 'not-evidenced').length;
  return { met, partial, notEvidenced, total: controls.length };
}

const STATUS_LABEL: Record<ControlStatus, string> = {
  met: 'MET',
  partial: 'PARTIAL',
  'not-evidenced': 'NOT EVIDENCED',
};

/** Render the auditor-facing markdown summary — a faithful text view of the pack. */
function renderSummaryMarkdown(
  subject: EvidenceExportSubject,
  controls: readonly EvidenceControl[],
  coverage: ControlCoverage,
  integrityVerified: boolean,
): string {
  const short = (h: string | null): string => (h ? `${h.slice(0, 12)}…` : 'none');
  const lines: string[] = [
    '# Convergence Evidence Export',
    '',
    `- Task: ${subject.taskId ?? '(none)'}`,
    `- Task group: ${subject.taskGroup ?? '(ungrouped)'}`,
    `- Merged workspace: ${subject.chosenWorkspaceId}`,
    `- Merged at: ${subject.mergedAt} by ${subject.actorId}`,
    `- Candidates: ${subject.candidateCount}`,
    `- Source evidence: ${subject.evidenceSchema} (integrity: ${integrityVerified ? 'verified' : 'UNVERIFIED'})`,
    `- Audit seal: ${short(subject.auditEntryHash)}`,
    '',
    `## Control mapping (${coverage.met} met · ${coverage.partial} partial · ${coverage.notEvidenced} not evidenced)`,
    '',
  ];
  for (const c of controls) {
    lines.push(`### [${STATUS_LABEL[c.status]}] ${c.framework} ${c.id} — ${c.title}`);
    lines.push(`- Requirement: ${c.requirement}`);
    lines.push(`- Evidence: ${c.evidenceRefs.join(', ')}`);
    if (c.reason) lines.push(`- Note: ${c.reason}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Render an exportable, framework-mapped evidence pack from a stored convergence
 * evidence record. PURE + degrade-truthful: every control's status is derived only
 * from the backing fields present in the record (never a fabricated `met`). The
 * pack is content-hashed over its canonical form (inject `now` for a stable hash).
 */
export function renderEvidenceExport(
  record: ConvergenceEvidenceRecord,
  options?: { readonly now?: () => string },
): EvidenceExport {
  const now = options?.now ?? (() => new Date().toISOString());
  const evidence: ConvergenceEvidence = record.evidence;
  const integrityVerified = verifyEvidenceHash(evidence);

  const controls: readonly EvidenceControl[] = [
    deriveSoc2Cc81(record),
    deriveSoc2Cc72(record),
    deriveEuAiActArt12(record, integrityVerified),
    deriveEuAiActArt14(record),
    deriveDoraChangeControl(record),
    deriveConvergenceIntegrity(record, integrityVerified),
  ];
  const coverage = tallyCoverage(controls);

  const subject: EvidenceExportSubject = {
    ...(evidence.taskId ? { taskId: evidence.taskId } : {}),
    taskGroup: evidence.taskGroup,
    chosenWorkspaceId: evidence.chosenWorkspaceId,
    mergedAt: evidence.provenance.mergedAt,
    actorId: evidence.provenance.actorId,
    candidateCount: evidence.candidateCount,
    evidenceSchema: evidence.schema,
    auditEntryHash: record.seal.auditEntryHash,
  };

  const summary = renderSummaryMarkdown(subject, controls, coverage, integrityVerified);

  const unsealed: Omit<EvidenceExport, 'contentHash'> = {
    schema: EVIDENCE_EXPORT_SCHEMA,
    generatedFrom: evidence.contentHash,
    evidenceIntegrity: { verified: integrityVerified },
    subject,
    controls,
    coverage,
    summary,
    generatedAt: now(),
  };
  return { ...unsealed, contentHash: sha256Hex(canonicalJson(unsealed)) };
}

/**
 * Re-verify an export pack's own `contentHash` (tamper check): recompute over the
 * pack minus `contentHash` AND the detached `signature` (which signs the hash and is
 * attached afterward), and compare. Mirrors `verifyEvidenceHash`.
 */
export function verifyExportHash(pack: EvidenceExport): boolean {
  const { contentHash, signature, ...rest } = pack;
  return sha256Hex(canonicalJson(rest)) === contentHash;
}
