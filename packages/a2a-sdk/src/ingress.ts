/**
 * Inbound A2A ingress normalization.
 *
 * Single entrypoint for consumers (PM, Agency, gateways) to turn a raw inbound
 * payload — either an already-parsed object or a raw JSON string (e.g. an
 * unparsed request body) — into a validated, canonical `TaskEnvelope`, or a
 * structured list of issues.
 *
 * This is the shared replacement for per-surface envelope parsers: every
 * surface normalizes against the same contract before persistence or intent
 * dispatch, instead of carrying its own divergent shape and validation.
 */

import { validateTaskEnvelope, type ValidationIssue } from './validation';
import type { TaskEnvelope } from './schemas/task-envelope';

export interface NormalizeInboundEnvelopeOptions {
  /** Require `envelope_version` to equal the SDK's `TASK_ENVELOPE_VERSION`. */
  strictVersion?: boolean;
}

/** Discriminated result: a validated envelope, or the issues that blocked it. */
export type NormalizeInboundEnvelopeResult =
  | { ok: true; envelope: TaskEnvelope }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Normalize a raw inbound value into a canonical `TaskEnvelope`.
 *
 * Accepts a parsed object or a raw JSON string. Returns `{ ok: true, envelope }`
 * when the value satisfies the `TaskEnvelope` contract, otherwise
 * `{ ok: false, issues }` with field-level validation issues. Never throws.
 */
export function normalizeInboundEnvelope(
  value: unknown,
  options?: NormalizeInboundEnvelopeOptions,
): NormalizeInboundEnvelopeResult {
  let candidate: unknown = value;

  // Accept a raw JSON string (e.g. an unparsed request body) by parsing first.
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return {
        ok: false,
        issues: [{ path: '$', message: 'invalid JSON: request body could not be parsed' }],
      };
    }
  }

  const result = validateTaskEnvelope(candidate, options);
  if (!result.valid) {
    return { ok: false, issues: result.issues };
  }

  return { ok: true, envelope: candidate as TaskEnvelope };
}
