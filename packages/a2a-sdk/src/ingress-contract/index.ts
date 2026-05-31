/**
 * Crypto-free inbound A2A ingress contract — consumer entrypoint.
 *
 * This directory-index subpath is the single import surface that the
 * legacy-wire surfaces (recoder-pm, recoder-agency) use to validate inbound
 * A2A envelopes against the shared canonical contract WITHOUT pulling any
 * `node:crypto`-using module (so it resolves cleanly under Next/Turbopack).
 *
 * It re-exports the pure ingress helpers and adds `validateInboundA2AEnvelope`:
 * a one-call wrapper that adapts a legacy RecoderA2AEnvelope-shaped body onto
 * the canonical `TaskEnvelope`, validates it, and on failure returns a canonical
 * A2AError from the shared error taxonomy (instead of a surface-local shape).
 */

import {
  adaptLegacyEnvelopeToTaskEnvelope,
  type AdaptLegacyEnvelopeOptions,
  type LegacyInboundEnvelope,
} from '../envelope-adapters';
import {
  normalizeInboundEnvelope,
  type NormalizeInboundEnvelopeOptions,
  type NormalizeInboundEnvelopeResult,
} from '../ingress';
import { buildA2AError, A2AErrorCodeEnum } from '../schemas/error-taxonomy';
import type { A2AError } from '../schemas/error-taxonomy';
import type { TaskEnvelope } from '../schemas/task-envelope';
import type { ValidationIssue } from '../validation';

export {
  adaptLegacyEnvelopeToTaskEnvelope,
  type AdaptLegacyEnvelopeOptions,
  type LegacyInboundEnvelope,
} from '../envelope-adapters';
export {
  normalizeInboundEnvelope,
  type NormalizeInboundEnvelopeOptions,
  type NormalizeInboundEnvelopeResult,
} from '../ingress';
export { buildA2AError, A2AErrorCodeEnum } from '../schemas/error-taxonomy';
export type { A2AError, A2AErrorCode } from '../schemas/error-taxonomy';

export interface ValidateInboundA2AEnvelopeOptions
  extends AdaptLegacyEnvelopeOptions,
    NormalizeInboundEnvelopeOptions {}

/**
 * Platforms the canonical validator accepts. Legacy wire platforms outside this
 * set (e.g. `cursor`, `windsurf`, `replit`, `recoder`) are normalized to
 * `custom` so adopting the shared contract does not reject envelopes the legacy
 * surfaces already accepted (matches the per-surface gateway behavior).
 */
const CANONICAL_PLATFORMS = new Set([
  'codex',
  'claude_code',
  'recoder_web',
  'recoder_pm',
  'recoder_agency',
  'recoder_backend',
  'recoder_desktop',
  'custom',
]);

function normalizeLegacyPlatform(platform: string): string {
  return CANONICAL_PLATFORMS.has(platform) ? platform : 'custom';
}

function normalizeLegacyEnvelope(body: LegacyInboundEnvelope): LegacyInboundEnvelope {
  return {
    ...body,
    from: { ...body.from, platform: normalizeLegacyPlatform(body.from.platform) },
    to: { ...body.to, platform: normalizeLegacyPlatform(body.to.platform) },
  };
}

/** Discriminated result: the canonical envelope, or a canonical A2A error. */
export type ValidateInboundA2AEnvelopeResult =
  | { ok: true; envelope: TaskEnvelope }
  | { ok: false; error: A2AError; issues: ValidationIssue[] };

/**
 * Validate a legacy-shaped inbound A2A body against the shared canonical
 * contract.
 *
 * Pipeline: `normalizeInboundEnvelope(adaptLegacyEnvelopeToTaskEnvelope(body))`.
 * `workspace_id` / `thread_id` / `trace_id` are preserved through the adapter
 * (trace_id falls back to messageId when the legacy `trace` block is absent).
 *
 * On failure returns a canonical `A2AError` (code `INVALID_ENVELOPE`) carrying
 * the field-level validation issues, so every surface emits the same error
 * shape instead of a surface-local one.
 */
export function validateInboundA2AEnvelope(
  body: LegacyInboundEnvelope,
  options: ValidateInboundA2AEnvelopeOptions,
): ValidateInboundA2AEnvelopeResult {
  const adapted = adaptLegacyEnvelopeToTaskEnvelope(normalizeLegacyEnvelope(body), options);
  const result: NormalizeInboundEnvelopeResult = normalizeInboundEnvelope(adapted, {
    strictVersion: options.strictVersion,
  });

  if (result.ok) {
    return { ok: true, envelope: result.envelope };
  }

  const error = buildA2AError({
    code: A2AErrorCodeEnum.InvalidEnvelope,
    message: 'Inbound A2A envelope failed canonical validation',
    details: { issues: result.issues },
    trace_id: adapted.trace_id,
  });

  return { ok: false, error, issues: result.issues };
}
