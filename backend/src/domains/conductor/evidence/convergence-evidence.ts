/**
 * Convergence evidence (product step 3) — the EXPORTABLE, content-hashed record a
 * governed merge produces as its headline artifact.
 *
 * The thesis (PRODUCT-THESIS.md): Recoder runs N agents in parallel worktrees on
 * one task, then converges their divergent diffs into ONE trusted, shippable change
 * via a governed, human-approvable merge. Step 3's deliverable is not the git merge
 * alone — it is a truthful, auditable EVIDENCE record that captures *what converged
 * and under what authority*: the task, the N candidate runs and their diffs (by
 * content hash), which candidate was chosen/merged, the governance verdict +
 * approval, the pre-merge verification outcome, and provenance — sealed with a
 * SHA-256 `contentHash` so a human or CI can prove it was not altered.
 *
 * This module is PURE (mirroring `readiness.service.ts` foldReadiness): it assembles
 * the record from already-gathered inputs and computes the hashes. The Merkle audit
 * chain pointer (`auditEntryHash`) is NOT part of the hashed record — the chain
 * assigns it AFTER hashing — so it is carried by the module-level wrapper
 * ({@link ConvergenceEvidenceRecord}) alongside, not inside, the sealed content.
 *
 * Degrade-truthful throughout: an unreadable candidate diff yields an ABSENT
 * `diffHash` (never a fabricated one); an uncomputable verification yields
 * `available:false` with a reason (never a fabricated pass); the record is always
 * assemblable from the chosen workspace alone (siblings/verification are enrichment).
 */
import { createHash } from 'node:crypto';
import type { GovernanceEffect, RiskTier } from '../ports/index.js';
import type { ReadinessSignal, ReadinessView } from '../services/readiness.service.js';
import type { DiffStat } from '../services/compare.service.js';

/** Versioned schema tag — bump when the record shape changes (exportable-artifact contract). */
export const CONVERGENCE_EVIDENCE_SCHEMA = 'recoder.convergence-evidence/v1' as const;

/** One candidate run's contribution, as gathered from the compare/sibling read. */
export interface EvidenceCandidateInput {
  readonly workspaceId: string;
  /** The agent (runtimeId) that produced this candidate — the compare key. */
  readonly agent: string;
  readonly branch: string;
  readonly runId?: string;
  /** Durable lifecycle state at decision time. */
  readonly state: string;
  /** Change footprint vs base — ABSENT when it could not be computed. */
  readonly diffStat?: DiffStat;
  /** Tracked changed-file paths vs base — ABSENT when unreadable. */
  readonly changedFiles?: readonly string[];
}

/** A candidate row in the sealed record: the input plus its content hash + chosen flag. */
export interface EvidenceCandidate extends EvidenceCandidateInput {
  /**
   * SHA-256 over this candidate's diff footprint (stat + sorted changed files) —
   * the tamper-evident fingerprint of what this agent produced. ABSENT when the
   * diff was unreadable (truthful; never a fabricated hash of nothing).
   */
  readonly diffHash?: string;
  /** True for the single candidate that was merged (the convergence winner). */
  readonly chosen: boolean;
}

/** The governance verdict that authorized the merge (the "under what authority"). */
export interface EvidenceGovernance {
  readonly action: string;
  readonly effect: GovernanceEffect;
  readonly riskTier: RiskTier;
  readonly degraded: boolean;
  readonly reason?: string;
  /** The approval record id that cleared a `needs_approval`, when one applied. */
  readonly approvalId?: string;
}

/** The pre-merge verification outcome (folded readiness), or a truthful unavailability. */
export interface EvidenceVerification {
  /** Whether verification could be computed at all (false ⇒ probes rejected). */
  readonly available: boolean;
  /** The readiness verdict at decision time (absent when `available:false`). */
  readonly verdict?: ReadinessView['verdict'];
  /** The constituent signals (lifecycle/merge/checks/preview) — `[]` when unavailable. */
  readonly signals: readonly ReadinessSignal[];
  /** Hard blockers recorded at decision time — `[]` when none/unavailable. */
  readonly blockers: readonly string[];
  /** Truthful reason verification is unavailable (never a fabricated pass). */
  readonly reason?: string;
}

/** The content-hashed, exportable convergence evidence record (the sealed artifact). */
export interface ConvergenceEvidence {
  readonly schema: typeof CONVERGENCE_EVIDENCE_SCHEMA;
  readonly taskId?: string;
  /** The parallel-run group key the candidates shared, or `null` when ungrouped. */
  readonly taskGroup: string | null;
  readonly chosenWorkspaceId: string;
  readonly mergeMode?: 'github' | 'local';
  readonly base?: string;
  readonly candidateCount: number;
  readonly candidates: readonly EvidenceCandidate[];
  readonly governance: EvidenceGovernance;
  readonly verification: EvidenceVerification;
  readonly provenance: {
    readonly actorId: string;
    readonly mergedAt: string;
    readonly emittedAt: string;
  };
  /** SHA-256 over the canonical record MINUS this field — the integrity seal. */
  readonly contentHash: string;
}

/** The durable Merkle chain pointer for the merge — assigned by the chain AFTER hashing. */
export interface EvidenceSeal {
  readonly auditId: string | null;
  readonly auditSeq: number | null;
  readonly auditEntryHash: string | null;
}

/**
 * The module-persisted wrapper: the sealed {@link ConvergenceEvidence} plus its
 * external audit-chain pointer. `evidence.contentHash` covers `evidence` only; the
 * chain's `seal.auditEntryHash` independently seals `{ …decision, evidenceHash }`.
 */
export interface ConvergenceEvidenceRecord {
  readonly evidence: ConvergenceEvidence;
  readonly seal: EvidenceSeal;
}

/** The already-gathered inputs the pure assembler folds into a record. */
export interface EvidenceAssemblyInput {
  readonly chosenWorkspaceId: string;
  readonly taskId?: string;
  readonly taskGroup: string | null;
  readonly mergeMode?: 'github' | 'local';
  readonly base?: string;
  /** Every candidate at decision time (chosen is flagged by id match; always ≥1). */
  readonly candidates: readonly EvidenceCandidateInput[];
  readonly governance: EvidenceGovernance;
  /** The folded readiness view, or `undefined`/`{reason}` when it could not be computed. */
  readonly verification?: { readonly view?: ReadinessView; readonly reason?: string };
  readonly actorId: string;
  readonly mergedAt: string;
  /** Injectable clock (defaults to `Date.now`) so the emitted timestamp is testable. */
  readonly now?: () => string;
}

/** Stable, key-sorted JSON so a hash is deterministic across processes (mirrors audit-chain). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Content-hash ONE candidate's diff footprint: SHA-256 over `{ diffStat, changedFiles }`
 * with the file list sorted (order-independent) and canonically encoded. Returns
 * `undefined` when the changed-file list is absent (unreadable) — a truthful "no
 * fingerprint", never a hash of an empty guess. A readable-but-empty change set
 * (`changedFiles: []`) DOES hash (it is a real, verifiable "no changes").
 */
export function hashCandidateDiff(
  diffStat: DiffStat | undefined,
  changedFiles: readonly string[] | undefined,
): string | undefined {
  if (!changedFiles) return undefined;
  return sha256Hex(
    canonicalJson({
      diffStat: diffStat ?? null,
      changedFiles: [...changedFiles].sort(),
    }),
  );
}

/**
 * Compute the record's integrity `contentHash`: SHA-256 over the canonical record
 * with `contentHash` itself excluded. Deterministic — `assemble` and any external
 * verifier derive identical bytes.
 */
export function computeEvidenceHash(record: Omit<ConvergenceEvidence, 'contentHash'>): string {
  return sha256Hex(canonicalJson(record));
}

/**
 * Assemble the exportable convergence evidence record from already-gathered inputs.
 * PURE — no I/O, no mutation. Degrade-truthful: a candidate with no readable diff
 * gets no `diffHash`; unavailable verification is `available:false` + reason; the
 * `chosen` flag marks the merged workspace (falls back to no chosen row only if the
 * merged id is somehow absent from the candidate set — still a truthful record).
 */
export function assembleConvergenceEvidence(input: EvidenceAssemblyInput): ConvergenceEvidence {
  const now = input.now ?? (() => new Date().toISOString());
  const candidates: readonly EvidenceCandidate[] = input.candidates.map((candidate) => {
    const diffHash = hashCandidateDiff(candidate.diffStat, candidate.changedFiles);
    return {
      ...candidate,
      ...(diffHash ? { diffHash } : {}),
      chosen: candidate.workspaceId === input.chosenWorkspaceId,
    };
  });

  const verification: EvidenceVerification = input.verification?.view
    ? {
        available: true,
        verdict: input.verification.view.verdict,
        signals: input.verification.view.signals,
        blockers: input.verification.view.blockers,
      }
    : {
        available: false,
        signals: [],
        blockers: [],
        reason: input.verification?.reason ?? 'verification not computed',
      };

  const unsealed: Omit<ConvergenceEvidence, 'contentHash'> = {
    schema: CONVERGENCE_EVIDENCE_SCHEMA,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    taskGroup: input.taskGroup,
    chosenWorkspaceId: input.chosenWorkspaceId,
    ...(input.mergeMode ? { mergeMode: input.mergeMode } : {}),
    ...(input.base ? { base: input.base } : {}),
    candidateCount: candidates.length,
    candidates,
    governance: input.governance,
    verification,
    provenance: {
      actorId: input.actorId,
      mergedAt: input.mergedAt,
      emittedAt: now(),
    },
  };

  return { ...unsealed, contentHash: computeEvidenceHash(unsealed) };
}

/**
 * Re-verify a record's `contentHash` (tamper check): recompute the hash over the
 * record minus its `contentHash` and compare. A human/CI exporting the artifact
 * calls this to prove the evidence was not altered after sealing.
 */
export function verifyEvidenceHash(evidence: ConvergenceEvidence): boolean {
  const { contentHash, ...rest } = evidence;
  return computeEvidenceHash(rest) === contentHash;
}
