/**
 * `PreviewVerifyPort` — the conductor's seam onto a LIVE browser verification of
 * a workspace's stored preview URL. It is what turns "preview stored" (the
 * `setPreviewUrl` gated write persists `metadata.previewUrl`) into "preview
 * VERIFIED": one run navigates the preview, asserts expected text, captures an
 * evidence screenshot, and returns a verification-summary — the evidence the
 * {@link import('../services/preview-verify.service.js')} seals into the durable
 * governance audit chain.
 *
 * The conductor depends ONLY on this lean port; the composer wires a concrete
 * adapter over the engines domain's browser-use `EngineClientPort` + the shared
 * `executeBrowserVerification` executor. The conductor never imports an engine
 * `dist/` or the `@recoder/browser-verification` contracts directly.
 *
 * TRUTHFUL DEGRADE LAW (inherited from the executor): `verify` NEVER throws and
 * NEVER fabricates a verdict — no engine wired / engine down ⇒ a `skipped`
 * outcome with `degraded:true` and the real reason (browsing proved nothing, so
 * a missing Chrome/sidecar is a truthful skip, never a faked pass, never a block).
 */

/** One text assertion: `expected` must appear in the preview page's visible text. */
export interface PreviewVerifyAssertion {
  readonly expected: string;
  /** Optional human label for what the assertion targets (e.g. a selector hint). */
  readonly target?: string;
}

/** The verification request for one preview page. */
export interface PreviewVerifyRequest {
  /** The workspace the preview belongs to (evidence provenance). */
  readonly workspaceId: string;
  /** The preview page to verify (the persisted `metadata.previewUrl`). */
  readonly url: string;
  /** Task the evidence artifacts belong to (defaults to the workspace/adhoc). */
  readonly taskId?: string;
  /** Text assertions evaluated against the page's extracted visible text. */
  readonly assertions?: readonly PreviewVerifyAssertion[];
  /** Capture an evidence screenshot artifact (default true). */
  readonly screenshot?: boolean;
  /**
   * Per-run browser deadline (ms). Absent ⇒ the concrete adapter's bounded
   * default ({@link import('../adapters/browser-preview-verify.adapter.js')}
   * `DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS`). This is the hung-page guard: EVERY
   * conductor verify — including the fire-and-forget auto-fire that re-fires on
   * each dev-server port restart — is deadline-bounded, so a hung navigate can
   * never accumulate leaked promises. A breach resolves to `skipped(degraded)`
   * with a `timeout` reason within the deadline, never a fabricated verdict.
   */
  readonly timeoutMs?: number;
}

/** The truthful status of one check or the whole verification. */
export type PreviewCheckStatus = 'passed' | 'failed' | 'skipped';

/** One check line in the verification (open / assert / screenshot). */
export interface PreviewVerifyCheck {
  readonly tool: string;
  readonly status: PreviewCheckStatus;
  readonly message?: string;
}

/** A lean evidence artifact (screenshot / verification-summary) the run produced. */
export interface PreviewEvidenceArtifact {
  readonly artifactId: string;
  readonly kind: 'screenshot' | 'verification_summary';
  readonly summary: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** The outcome of one preview verification run + its truthful degrade posture. */
export interface PreviewVerification {
  readonly status: PreviewCheckStatus;
  /** True when the browser engine was unavailable — the run proved NOTHING. */
  readonly degraded: boolean;
  /** The engine's real failure reason when the run degraded. */
  readonly reason?: string;
  /** A one-glance human summary (the verification-summary artifact's text). */
  readonly summary: string;
  readonly checks: readonly PreviewVerifyCheck[];
  readonly artifacts: readonly PreviewEvidenceArtifact[];
}

/** The seam the preview-verify service drives; the composer wires one concrete impl. */
export interface PreviewVerifyPort {
  verify(request: PreviewVerifyRequest): Promise<PreviewVerification>;
}

/**
 * The COMPACT, workspace-addressable verification summary the write-back seam
 * persists onto the workspace record (`metadata.previewVerification`). The audit
 * Merkle chain seals every verification but is NOT queryable by `workspaceId`;
 * this record is, so a later read edge can project it. The screenshot PNG is NOT
 * retained — only its opaque `screenshotArtifactId` is sealed (the image is
 * returned once then garbage-collected). A real screenshot artifact store is a
 * SEPARATE future item. A `skipped(degraded)` run still persists a record (with
 * its reason) — a truthful skip is readable, never a fabricated pass.
 */
export interface PreviewVerificationRecord {
  readonly status: PreviewCheckStatus;
  /** ISO timestamp the verification was sealed (write-back time). */
  readonly checkedAt: string;
  /** One-glance human summary (the verification-summary artifact's text). */
  readonly summary: string;
  /** True when the browser engine was unavailable — the run proved NOTHING. */
  readonly degraded: boolean;
  /** The engine's real failure/skip reason when the run degraded or failed. */
  readonly reason?: string;
  readonly checks: readonly PreviewVerifyCheck[];
  /** The opaque sealed screenshot artifact id (NOT a fetchable image in this cut). */
  readonly screenshotArtifactId?: string;
}

/**
 * The projected READ model the `GET …/preview-verification` edge returns — a pure
 * projection over the persisted {@link PreviewVerificationRecord}. `screenshotRef`
 * is ALWAYS `null` in this cut: the screenshot PNG is not retained (only an opaque
 * artifact id is sealed), so the cockpit shows "screenshot not retained", never a
 * broken image. A real screenshot artifact store is a separate future item.
 */
export interface PreviewVerificationView {
  readonly workspaceId: string;
  readonly status: PreviewCheckStatus;
  readonly checkedAt: string;
  readonly summary: string;
  readonly degraded: boolean;
  readonly reason?: string;
  readonly checks: readonly PreviewVerifyCheck[];
  readonly screenshotRef: string | null;
}
