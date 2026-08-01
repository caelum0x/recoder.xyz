/**
 * Signed PREVIEW-VERIFICATION evidence pack (BE-6.2) — turn the outcome of a
 * governed browser preview verification (navigate → assert → screenshot) into a
 * portable, content-hashed, SIGNED artifact an auditor (or a CI gate) can carry.
 *
 * This is the "evidence-attach" half of the preview-verify + evidence-signing
 * composition: `verifyWorkspacePreview` already runs the browser adapter and SEALS
 * the summary + artifact ids into the durable governance audit Merkle chain; that
 * chain is not queryable by workspace and cannot be exported. This pure renderer
 * lifts the SAME verification outcome into a self-contained pack, content-hashes it
 * over its canonical form, then {@link signPreviewEvidence} attaches a DETACHED
 * Ed25519 signature over that stable hash — reusing the SHARED
 * {@link buildDetachedSignature} primitive the convergence-evidence export uses.
 *
 * PURE + degrade-truthful (mirrors `evidence-export.ts`): no I/O, no network. The
 * pack faithfully carries the verification's real `status`/`degraded`/`reason`, so a
 * `skipped(degraded)` run yields a truthful skipped-but-signed pack — NEVER a
 * fabricated pass. An absent/malformed signing key ⇒ an UNSIGNED pack
 * (`signature: null`), never a thrown error and never a forged signature.
 */
import { createHash } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import { canonicalJson } from './convergence-evidence.js';
import type { EvidenceSignature } from './evidence-export.js';
import { buildDetachedSignature } from './evidence-signing.js';
import type { PreviewVerification, PreviewVerifyCheck } from '../ports/preview-verify.port.js';

/** Versioned schema tag for the preview-evidence pack (bump on shape changes). */
export const PREVIEW_EVIDENCE_SCHEMA = 'recoder.preview-evidence/v1' as const;

/** The subject the verification evidence is bound to (provenance). */
export interface PreviewEvidenceSubject {
  /** The workspace whose stored preview URL was verified. */
  readonly workspaceId: string;
  /** The preview page that was navigated + asserted. */
  readonly url: string;
  /** The task the evidence artifacts belong to (when the workspace carries one). */
  readonly taskId?: string;
}

/** The portable, content-hashed, optionally-signed preview verification pack. */
export interface PreviewEvidencePack {
  readonly schema: typeof PREVIEW_EVIDENCE_SCHEMA;
  readonly subject: PreviewEvidenceSubject;
  /** The verification's truthful overall status (`passed`/`failed`/`skipped`). */
  readonly status: PreviewVerification['status'];
  /** True when the browser engine was unavailable — the run proved NOTHING. */
  readonly degraded: boolean;
  /** The engine's real failure/skip reason when the run degraded or failed. */
  readonly reason?: string;
  /** The one-glance human summary (the verification-summary artifact's text). */
  readonly summary: string;
  readonly checks: readonly PreviewVerifyCheck[];
  /** The opaque sealed evidence artifact ids (screenshot / verification-summary). */
  readonly artifactIds: readonly string[];
  readonly generatedAt: string;
  /** SHA-256 over this pack MINUS `contentHash` AND `signature` — the integrity seal. */
  readonly contentHash: string;
  /**
   * OPTIONAL detached Ed25519 signature over {@link contentHash}. Present only when a
   * signing key is configured; `null`/absent otherwise (never a fabricated sig). NOT
   * part of `contentHash` — an unsigned and a signed pack share the same contentHash.
   */
  readonly signature?: EvidenceSignature | null;
}

/** The verification outcome + its provenance, lifted into a signable pack. */
export interface RenderPreviewEvidenceInput {
  readonly workspaceId: string;
  readonly url: string;
  readonly taskId?: string;
  readonly verification: PreviewVerification;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Render a preview verification outcome into a content-hashed evidence pack. PURE +
 * degrade-truthful: the pack mirrors the verification's real status/degrade posture
 * (never a fabricated `passed`). Inject `now` for a stable, testable hash. Sign the
 * result with {@link signPreviewEvidence} to seal it.
 */
export function renderPreviewEvidence(
  input: RenderPreviewEvidenceInput,
  options?: { readonly now?: () => string },
): PreviewEvidencePack {
  const now = options?.now ?? (() => new Date().toISOString());
  const verification = input.verification;
  const subject: PreviewEvidenceSubject = {
    workspaceId: input.workspaceId,
    url: input.url,
    ...(input.taskId ? { taskId: input.taskId } : {}),
  };
  const unsealed: Omit<PreviewEvidencePack, 'contentHash' | 'signature'> = {
    schema: PREVIEW_EVIDENCE_SCHEMA,
    subject,
    status: verification.status,
    degraded: verification.degraded,
    ...(verification.reason !== undefined ? { reason: verification.reason } : {}),
    summary: verification.summary,
    checks: verification.checks.map((check) => ({
      tool: check.tool,
      status: check.status,
      ...(check.message !== undefined ? { message: check.message } : {}),
    })),
    artifactIds: verification.artifacts.map((artifact) => artifact.artifactId),
    generatedAt: now(),
  };
  return { ...unsealed, contentHash: sha256Hex(canonicalJson(unsealed)) };
}

/**
 * Attach a DETACHED Ed25519 signature over `pack.contentHash`, reusing the shared
 * {@link buildDetachedSignature} primitive. `null` key ⇒ the pack is returned
 * unsigned (`signature: null`). Never throws for a signing fault — a failure
 * degrades to an unsigned pack with a truthful warning, never a forged signature.
 */
export function signPreviewEvidence(
  pack: PreviewEvidencePack,
  options: { readonly privateKey: KeyObject | null; readonly now?: () => string; readonly logger?: Logger },
): PreviewEvidencePack {
  const { privateKey } = options;
  if (!privateKey) return { ...pack, signature: null };
  try {
    const now = options.now ?? (() => new Date().toISOString());
    return { ...pack, signature: buildDetachedSignature(pack.contentHash, privateKey, now) };
  } catch (err) {
    options.logger?.warn({ err }, 'preview evidence signing failed — returning UNSIGNED pack');
    return { ...pack, signature: null };
  }
}

/**
 * Re-verify a preview-evidence pack's own `contentHash` (tamper check): recompute
 * over the pack minus `contentHash` AND the detached `signature`, and compare.
 * Mirrors `verifyExportHash`.
 */
export function verifyPreviewEvidenceHash(pack: PreviewEvidencePack): boolean {
  const { contentHash, signature, ...rest } = pack;
  return sha256Hex(canonicalJson(rest)) === contentHash;
}
