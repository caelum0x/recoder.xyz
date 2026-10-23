/**
 * The public "Evidence Sample" engine — a self-contained port of Recoder's
 * production evidence stack (backend/src/domains/conductor/evidence/
 * {convergence-evidence,evidence-export,evidence-signing}.ts) for the one
 * unauthenticated, public use case those modules were never exposed for:
 * a visitor pastes a real PR diff + test/verification output and gets back
 * exactly the kind of signed, framework-mapped ConvergenceEvidence record
 * every governed merge inside Recoder emits automatically.
 *
 * This is a PORT, not an import, because `site/` is a separate Next.js app
 * with no workspace dependency on `recoder-backend` (see pnpm-workspace.yaml —
 * backend is a member but not declared as a site dependency, and most of its
 * tree is server-only). The ported functions are pure (no I/O, no network)
 * and mirror the backend's field-by-field derivation rules exactly:
 * every control's status is computed ONLY from a backing field that is
 * actually present in the assembled record. Nothing here hardcodes a control
 * to "met". If the backend's derivation logic changes, this file should be
 * re-diffed against it — see the module doc comments for the 1:1 mapping.
 *
 * Because this runs on a PUBLIC, anonymous submission (no real workspace, no
 * real governance decision, no human approval), the resulting record is
 * truthfully a SAMPLE: `provenance.actorId` is "anonymous-sample",
 * `governance.approvalId` is always absent, and the seal's audit-chain
 * pointer is always null. That is the honest point of the demo — even an
 * auto-allowed sample run shows real, truthful gaps (e.g. "no human
 * oversight was exercised") instead of a fabricated clean bill of health.
 */
import {
  createPrivateKey,
  createPublicKey,
  createHash,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";

// ---------------------------------------------------------------------------
// Shared canonicalization + hashing (mirrors convergence-evidence.ts)
// ---------------------------------------------------------------------------

/** Stable, key-sorted JSON so a hash is deterministic (mirrors the backend). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export const CONVERGENCE_EVIDENCE_SCHEMA = "recoder.convergence-evidence/v4" as const;
export const EVIDENCE_EXPORT_SCHEMA = "recoder.evidence-export/v2" as const;

// ---------------------------------------------------------------------------
// Diff + verification-output parsing (new — the public-input surface the
// backend's evidence modules never needed, because a real governed merge
// already has structured diffStat/changedFiles and a folded ReadinessView)
// ---------------------------------------------------------------------------

export interface ParsedDiff {
  readonly changedFiles: readonly string[];
  readonly insertions: number;
  readonly deletions: number;
  readonly looksLikeDiff: boolean;
}

const HIGH_RISK_PATH_RE = /\b(auth|billing|payment|security|secret|password|token|permission|governance|credential)\w*/i;
const MEDIUM_RISK_PATH_RE = /\.(env|ya?ml)$|docker|k8s|kubernetes|infra|deploy|migration/i;

/** Parse a unified diff (as produced by `git diff` / a GitHub PR diff export). */
export function parseDiff(diffText: string): ParsedDiff {
  const lines = diffText.split("\n");
  const files = new Set<string>();
  let insertions = 0;
  let deletions = 0;
  let sawHunkMarker = false;

  for (const line of lines) {
    const gitDiffMatch = /^diff --git a\/(\S+) b\/(\S+)/.exec(line);
    if (gitDiffMatch) {
      files.add(gitDiffMatch[2] ?? gitDiffMatch[1] ?? "");
      continue;
    }
    const plusFileMatch = /^\+\+\+ (?:b\/)?(\S+)/.exec(line);
    if (plusFileMatch && plusFileMatch[1] !== "/dev/null") {
      files.add(plusFileMatch[1]!);
      continue;
    }
    if (line.startsWith("@@")) {
      sawHunkMarker = true;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      insertions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  const changedFiles = [...files].filter((f) => f.length > 0).sort();
  const looksLikeDiff = sawHunkMarker || changedFiles.length > 0 || insertions > 0 || deletions > 0;

  return { changedFiles, insertions, deletions, looksLikeDiff };
}

/** Derive the sample's risk tier from the changed-file paths (truthful heuristic, not a real policy engine). */
export function deriveRiskTier(changedFiles: readonly string[]): "low" | "medium" | "high" {
  if (changedFiles.some((f) => HIGH_RISK_PATH_RE.test(f))) return "high";
  if (changedFiles.length > 20 || changedFiles.some((f) => MEDIUM_RISK_PATH_RE.test(f))) return "medium";
  return "low";
}

export interface ParsedVerification {
  readonly available: boolean;
  readonly verdict: "ready" | "not_ready" | "unknown";
  readonly passingCount: number;
  readonly failingCount: number;
  readonly blockers: readonly string[];
  readonly reason?: string;
}

const FAILING_RE = /(\d+)\s*(?:failing|failed|errors?)\b/gi;
const PASSING_RE = /(\d+)\s*(?:passing|passed|succeeded)\b/gi;
const EXIT_NONZERO_RE = /exit code[: ]+(?!0\b)\d+/i;
const EXIT_ZERO_RE = /exit code[: ]+0\b/i;

/** Heuristically read a pasted test/CI run's pass/fail outcome. Never fabricates a clean pass. */
export function parseVerificationOutput(output: string): ParsedVerification {
  const trimmed = output.trim();
  if (!trimmed) {
    return { available: false, verdict: "unknown", passingCount: 0, failingCount: 0, blockers: [], reason: "no verification output was pasted" };
  }

  let failingCount = 0;
  for (const m of trimmed.matchAll(FAILING_RE)) failingCount = Math.max(failingCount, Number(m[1]));
  let passingCount = 0;
  for (const m of trimmed.matchAll(PASSING_RE)) passingCount = Math.max(passingCount, Number(m[1]));

  const hasFailMarker = /\bFAIL\b|✗|✘|AssertionError|Traceback \(most recent call last\)/.test(trimmed);
  const hasPassMarker = /\bPASS\b|✓|✔|\bOK\b/.test(trimmed);
  const exitNonZero = EXIT_NONZERO_RE.test(trimmed);
  const exitZero = EXIT_ZERO_RE.test(trimmed);

  if (failingCount > 0 || hasFailMarker || exitNonZero) {
    const blockers: string[] = [];
    if (failingCount > 0) blockers.push(`${failingCount} failing check(s) reported in the pasted output`);
    if (exitNonZero) blockers.push("a non-zero exit code was reported in the pasted output");
    if (blockers.length === 0) blockers.push("a failure marker (FAIL / traceback / assertion error) was found in the pasted output");
    return { available: true, verdict: "not_ready", passingCount, failingCount, blockers };
  }
  if (passingCount > 0 || hasPassMarker || exitZero) {
    return { available: true, verdict: "ready", passingCount, failingCount, blockers: [] };
  }
  return {
    available: true,
    verdict: "unknown",
    passingCount,
    failingCount,
    blockers: [],
    reason: "could not determine a pass/fail verdict from the pasted output — no recognized pass/fail markers",
  };
}

// ---------------------------------------------------------------------------
// ConvergenceEvidence assembly (mirrors convergence-evidence.ts's
// assembleConvergenceEvidence, narrowed to the single-candidate sample case)
// ---------------------------------------------------------------------------

export interface SampleEvidenceCandidate {
  readonly workspaceId: string;
  readonly agent: string;
  readonly branch: string;
  readonly state: string;
  readonly diffStat: { readonly filesChanged: number; readonly insertions: number; readonly deletions: number };
  readonly changedFiles: readonly string[];
  readonly diffHash: string;
  readonly chosen: true;
}

export interface SampleEvidenceGovernance {
  readonly action: string;
  readonly effect: "allow";
  readonly riskTier: "low" | "medium" | "high";
  readonly degraded: false;
  readonly approvalId?: string;
}

export interface SampleEvidenceVerification {
  readonly available: boolean;
  readonly verdict?: "ready" | "not_ready" | "unknown";
  readonly signals: readonly { readonly id: string; readonly status: "pass" | "fail" | "unknown"; readonly detail: string }[];
  readonly blockers: readonly string[];
  readonly reason?: string;
}

export interface ConvergenceEvidenceSample {
  readonly schema: typeof CONVERGENCE_EVIDENCE_SCHEMA;
  readonly taskGroup: null;
  readonly chosenWorkspaceId: string;
  readonly candidateCount: 1;
  readonly candidates: readonly [SampleEvidenceCandidate];
  readonly governance: SampleEvidenceGovernance;
  readonly verification: SampleEvidenceVerification;
  readonly provenance: { readonly actorId: string; readonly mergedAt: string; readonly emittedAt: string };
  readonly contentHash: string;
}

export interface AssembleSampleInput {
  readonly diff: ParsedDiff;
  readonly verification: ParsedVerification;
  readonly taskDescription?: string;
  readonly now?: () => string;
}

/** Content-hash the candidate's diff footprint — mirrors `hashCandidateDiff`. */
function hashCandidateDiff(diffStat: SampleEvidenceCandidate["diffStat"], changedFiles: readonly string[]): string {
  return sha256Hex(canonicalJson({ diffStat, changedFiles: [...changedFiles].sort() }));
}

export function computeEvidenceHash(record: Omit<ConvergenceEvidenceSample, "contentHash">): string {
  return sha256Hex(canonicalJson(record));
}

/** Assemble the sample's ConvergenceEvidence record. PURE — no I/O, no mutation. */
export function assembleSampleEvidence(input: AssembleSampleInput): ConvergenceEvidenceSample {
  const now = input.now ?? (() => new Date().toISOString());
  const { diff, verification } = input;

  const diffStat = { filesChanged: diff.changedFiles.length, insertions: diff.insertions, deletions: diff.deletions };
  const diffHash = hashCandidateDiff(diffStat, diff.changedFiles);
  const riskTier = deriveRiskTier(diff.changedFiles);

  const candidate: SampleEvidenceCandidate = {
    workspaceId: "sample",
    agent: "sample-agent",
    branch: "sample/evidence-preview",
    state: "merged",
    diffStat,
    changedFiles: diff.changedFiles,
    diffHash,
    chosen: true,
  };

  // Truthful: a public, anonymous sample is never a recorded human approval.
  // A high-risk sample therefore surfaces a real gap rather than a fabricated one.
  const governance: SampleEvidenceGovernance = {
    action: "sample.evidence_preview",
    effect: "allow",
    riskTier,
    degraded: false,
  };

  const checksStatus: "pass" | "fail" | "unknown" =
    verification.verdict === "ready" ? "pass" : verification.verdict === "not_ready" ? "fail" : "unknown";
  const checksDetail =
    verification.reason ??
    (verification.verdict === "ready"
      ? `${verification.passingCount || "some"} check(s) reported passing in the pasted output`
      : `${verification.failingCount} check(s) reported failing in the pasted output`);

  const verificationBlock: SampleEvidenceVerification = verification.available
    ? {
        available: true,
        verdict: verification.verdict,
        signals: [{ id: "checks", status: checksStatus, detail: checksDetail }],
        blockers: verification.blockers,
        ...(verification.reason ? { reason: verification.reason } : {}),
      }
    : {
        available: false,
        signals: [],
        blockers: [],
        reason: verification.reason ?? "verification not computed",
      };

  const unsealed: Omit<ConvergenceEvidenceSample, "contentHash"> = {
    schema: CONVERGENCE_EVIDENCE_SCHEMA,
    taskGroup: null,
    chosenWorkspaceId: candidate.workspaceId,
    candidateCount: 1,
    candidates: [candidate],
    governance,
    verification: verificationBlock,
    provenance: {
      actorId: "anonymous-sample",
      mergedAt: now(),
      emittedAt: now(),
    },
  };

  return { ...unsealed, contentHash: computeEvidenceHash(unsealed) };
}

export function verifyEvidenceHash(evidence: ConvergenceEvidenceSample): boolean {
  const { contentHash, ...rest } = evidence;
  return computeEvidenceHash(rest) === contentHash;
}

// ---------------------------------------------------------------------------
// Framework-mapped export (mirrors evidence-export.ts's 6 control derivations)
// ---------------------------------------------------------------------------

export type ControlStatus = "met" | "partial" | "not-evidenced";

export interface EvidenceControl {
  readonly id: string;
  readonly framework: string;
  readonly title: string;
  readonly requirement: string;
  readonly status: ControlStatus;
  readonly evidenceRefs: readonly string[];
  readonly reason?: string;
}

export interface ControlCoverage {
  readonly met: number;
  readonly partial: number;
  readonly notEvidenced: number;
  readonly total: number;
}

const HIGH_RISK_TIERS: readonly string[] = ["high"];

function deriveSoc2Cc81(record: ConvergenceEvidenceSample): EvidenceControl {
  const { governance } = record;
  const highRisk = HIGH_RISK_TIERS.includes(governance.riskTier);
  const refs = ["governance.effect", "governance.riskTier"];
  if (governance.approvalId) refs.push("governance.approvalId");
  const base = {
    id: "SOC2-CC8.1",
    framework: "SOC 2",
    title: "Change management",
    requirement:
      "Changes are authorized through a governed decision and recorded in a tamper-evident audit trail; high-risk changes require a recorded approval.",
    evidenceRefs: refs,
  } as const;
  if (governance.effect !== "allow") {
    return { ...base, status: "not-evidenced", reason: `merge was not governance-allowed (effect='${governance.effect}')` };
  }
  // A public sample never carries a real Merkle audit seal — that is only
  // assigned to a real merge inside a running Recoder instance.
  return { ...base, status: "partial", reason: "this is a public sample — it carries no durable Merkle audit seal (that only exists for a real merge inside Recoder)" };
}

function deriveSoc2Cc72(record: ConvergenceEvidenceSample): EvidenceControl {
  const { verification } = record;
  const base = {
    id: "SOC2-CC7.2",
    framework: "SOC 2",
    title: "Change verification before promotion",
    requirement: "The change is verified (readiness / checks) before it is promoted to the trusted branch.",
    evidenceRefs: ["verification.available", "verification.verdict", "verification.blockers"],
  } as const;
  if (!verification.available) {
    return { ...base, status: "partial", reason: verification.reason ? `pre-merge verification unavailable: ${verification.reason}` : "pre-merge verification was unavailable" };
  }
  if (verification.verdict !== "ready") {
    return {
      ...base,
      status: "partial",
      reason: verification.verdict === "not_ready"
        ? "verification ran but reported failing checks (verdict='not_ready')"
        : "verification output was pasted but no verdict could be determined (verdict='unknown')",
    };
  }
  return { ...base, status: "met" };
}

function deriveEuAiActArt12(record: ConvergenceEvidenceSample, integrityVerified: boolean): EvidenceControl {
  const { provenance, candidates } = record;
  const hasActor = provenance.actorId.trim().length > 0;
  const hasMergedAt = provenance.mergedAt.trim().length > 0;
  const hasRunProvenance = candidates.length > 0 && candidates.every((c) => Boolean(c.diffHash));
  const base = {
    id: "EU-AI-ACT-ART12",
    framework: "EU AI Act",
    title: "Record-keeping (logging)",
    requirement:
      "The system automatically records immutable run logs: the responsible actor, the timestamp, candidate run provenance, and a tamper-evident content hash.",
    evidenceRefs: ["provenance.actorId", "provenance.mergedAt", "candidates[].diffHash", "contentHash"],
  } as const;
  if (!hasActor || !hasMergedAt) {
    return { ...base, status: "partial", reason: "incomplete provenance (actor and/or merge timestamp missing)" };
  }
  if (!integrityVerified) {
    return { ...base, status: "partial", reason: "record contentHash does not verify (tampered or malformed)" };
  }
  if (!hasRunProvenance) {
    return { ...base, status: "partial", reason: "no candidate diff fingerprint recorded (run provenance incomplete)" };
  }
  return { ...base, status: "met" };
}

function deriveEuAiActArt14(record: ConvergenceEvidenceSample): EvidenceControl {
  const { governance } = record;
  const base = {
    id: "EU-AI-ACT-ART14",
    framework: "EU AI Act",
    title: "Human oversight",
    requirement: "High-risk / gated changes are subject to human oversight (an explicit recorded approval), not merged fully autonomously.",
    evidenceRefs: ["governance.approvalId", "governance.riskTier", "governance.effect"],
  } as const;
  if (governance.approvalId) return { ...base, status: "met" };
  if (HIGH_RISK_TIERS.includes(governance.riskTier)) {
    return { ...base, status: "partial", reason: `high-risk change (tier='${governance.riskTier}') auto-allowed without a recorded human approval — this is exactly the gap a real Recoder merge would require an approval to close` };
  }
  return { ...base, status: "not-evidenced", reason: `tier='${governance.riskTier}' — no human oversight was exercised on this sample (and none was required)` };
}

function deriveDoraChangeControl(record: ConvergenceEvidenceSample): EvidenceControl {
  const { candidateCount, verification } = record;
  const base = {
    id: "DORA-ICT-CHANGE",
    framework: "DORA",
    title: "ICT change control",
    requirement: "The ICT change is identified (a recorded candidate change set) and verified before delivery.",
    evidenceRefs: ["candidateCount", "verification.available", "verification.verdict"],
  } as const;
  if (candidateCount < 1) return { ...base, status: "not-evidenced", reason: "no candidate change set recorded" };
  if (!verification.available) {
    return { ...base, status: "partial", reason: verification.reason ? `pre-merge verification unavailable: ${verification.reason}` : "pre-merge verification was unavailable" };
  }
  if (verification.verdict !== "ready") {
    return {
      ...base,
      status: "partial",
      reason: verification.verdict === "not_ready" ? "verification ran but the verdict is not delivery-clean (verdict='not_ready')" : "verification available but no clean verdict was recorded",
    };
  }
  return { ...base, status: "met" };
}

function deriveConvergenceIntegrity(integrityVerified: boolean): EvidenceControl {
  const base = {
    id: "RECODER-CONVERGENCE",
    framework: "Recoder",
    title: "Convergence integrity",
    requirement: "Per-file convergence provenance (which sibling won each contested path, pick or synthesize) is recorded with a verifiable content hash.",
    evidenceRefs: ["convergence.selections", "convergence.fileCount", "contentHash"],
  } as const;
  if (!integrityVerified) return { ...base, status: "partial", reason: "record contentHash does not verify (tampered or malformed)" };
  return { ...base, status: "not-evidenced", reason: "this sample has one candidate — real convergence provenance only exists when Recoder actually runs N agents in parallel on the same task" };
}

function tallyCoverage(controls: readonly EvidenceControl[]): ControlCoverage {
  const met = controls.filter((c) => c.status === "met").length;
  const partial = controls.filter((c) => c.status === "partial").length;
  const notEvidenced = controls.filter((c) => c.status === "not-evidenced").length;
  return { met, partial, notEvidenced, total: controls.length };
}

const STATUS_LABEL: Record<ControlStatus, string> = { met: "MET", partial: "PARTIAL", "not-evidenced": "NOT EVIDENCED" };

function renderSummaryMarkdown(
  record: ConvergenceEvidenceSample,
  controls: readonly EvidenceControl[],
  coverage: ControlCoverage,
  integrityVerified: boolean,
): string {
  const lines: string[] = [
    "# Convergence Evidence Export (SAMPLE)",
    "",
    "> Generated from a public, anonymous paste — not a real governed Recoder merge.",
    "> No audit seal, no recorded human approval. This is what the engine says when you",
    "> feed it exactly what you gave it, nothing more.",
    "",
    `- Changed files: ${record.candidates[0]!.diffStat.filesChanged}`,
    `- Insertions / deletions: +${record.candidates[0]!.diffStat.insertions} / -${record.candidates[0]!.diffStat.deletions}`,
    `- Risk tier: ${record.governance.riskTier}`,
    `- Verification: ${record.verification.available ? (record.verification.verdict ?? "unknown") : "unavailable"}`,
    `- Source record: ${record.schema} (integrity: ${integrityVerified ? "verified" : "UNVERIFIED"})`,
    "",
    `## Control mapping (${coverage.met} met · ${coverage.partial} partial · ${coverage.notEvidenced} not evidenced)`,
    "",
  ];
  for (const c of controls) {
    lines.push(`### [${STATUS_LABEL[c.status]}] ${c.framework} ${c.id} — ${c.title}`);
    lines.push(`- Requirement: ${c.requirement}`);
    lines.push(`- Evidence: ${c.evidenceRefs.join(", ")}`);
    if (c.reason) lines.push(`- Note: ${c.reason}`);
    lines.push("");
  }
  return lines.join("\n");
}

export interface EvidenceSignature {
  readonly algorithm: "ed25519";
  readonly publicKeyPem: string;
  readonly signedContentHash: string;
  readonly signature: string;
  readonly signedAt: string;
}

export interface EvidenceExportSample {
  readonly schema: typeof EVIDENCE_EXPORT_SCHEMA;
  readonly generatedFrom: string;
  readonly evidenceIntegrity: { readonly verified: boolean };
  readonly controls: readonly EvidenceControl[];
  readonly coverage: ControlCoverage;
  readonly summary: string;
  readonly generatedAt: string;
  readonly contentHash: string;
  readonly signature?: EvidenceSignature | null;
}

/** Render the exportable, control-mapped pack from the sample record. PURE. */
export function renderSampleExport(record: ConvergenceEvidenceSample, now: () => string = () => new Date().toISOString()): EvidenceExportSample {
  const integrityVerified = verifyEvidenceHash(record);
  const controls: readonly EvidenceControl[] = [
    deriveSoc2Cc81(record),
    deriveSoc2Cc72(record),
    deriveEuAiActArt12(record, integrityVerified),
    deriveEuAiActArt14(record),
    deriveDoraChangeControl(record),
    deriveConvergenceIntegrity(integrityVerified),
  ];
  const coverage = tallyCoverage(controls);
  const summary = renderSummaryMarkdown(record, controls, coverage, integrityVerified);
  const unsealed: Omit<EvidenceExportSample, "contentHash"> = {
    schema: EVIDENCE_EXPORT_SCHEMA,
    generatedFrom: record.contentHash,
    evidenceIntegrity: { verified: integrityVerified },
    controls,
    coverage,
    summary,
    generatedAt: now(),
  };
  return { ...unsealed, contentHash: sha256Hex(canonicalJson(unsealed)) };
}

export function verifyExportHash(pack: EvidenceExportSample): boolean {
  const { contentHash, signature, ...rest } = pack;
  return sha256Hex(canonicalJson(rest)) === contentHash;
}

// ---------------------------------------------------------------------------
// Ed25519 signing (mirrors evidence-signing.ts exactly — same key format,
// same env var name, so an operator can share one EVIDENCE_SIGNING_KEY
// across the backend and this site if they choose to).
// ---------------------------------------------------------------------------

export function loadEvidenceSigningKey(raw: string | null | undefined): KeyObject | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const pem = value.includes("-----BEGIN") ? value : `-----BEGIN PRIVATE KEY-----\n${wrapBase64(value)}\n-----END PRIVATE KEY-----`;
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "ed25519") return null;
    return key;
  } catch {
    return null;
  }
}

function wrapBase64(b64: string): string {
  return (b64.replace(/\s+/g, "").match(/.{1,64}/g) ?? []).join("\n");
}

export function signSampleExport(pack: EvidenceExportSample, privateKey: KeyObject | null, now: () => string = () => new Date().toISOString()): EvidenceExportSample {
  if (!privateKey) return { ...pack, signature: null };
  try {
    const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
    const signature = cryptoSign(null, new Uint8Array(Buffer.from(pack.contentHash)), privateKey).toString("base64");
    return { ...pack, signature: { algorithm: "ed25519", publicKeyPem, signedContentHash: pack.contentHash, signature, signedAt: now() } };
  } catch {
    return { ...pack, signature: null };
  }
}

export interface EvidenceSignatureVerification {
  readonly signed: boolean;
  readonly valid: boolean;
  readonly reason?: string;
}

export function verifySampleSignature(pack: EvidenceExportSample): EvidenceSignatureVerification {
  const sig = pack.signature;
  if (!sig) return { signed: false, valid: false, reason: "pack is unsigned" };
  if (sig.signedContentHash !== pack.contentHash) {
    return { signed: true, valid: false, reason: "signedContentHash does not match the pack contentHash (tampered)" };
  }
  try {
    const publicKey = createPublicKey(sig.publicKeyPem);
    const ok = cryptoVerify(
      null,
      new Uint8Array(Buffer.from(sig.signedContentHash)),
      publicKey,
      new Uint8Array(Buffer.from(sig.signature, "base64")),
    );
    return ok ? { signed: true, valid: true } : { signed: true, valid: false, reason: "signature does not verify against the embedded public key" };
  } catch (err) {
    return { signed: true, valid: false, reason: err instanceof Error ? err.message : "signature verification error" };
  }
}
