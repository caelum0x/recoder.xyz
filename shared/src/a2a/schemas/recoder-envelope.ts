/**
 * @module recoder-envelope
 *
 * Zod schemas for the Recoder A2A wire envelope (`RecoderA2AEnvelope`) and its
 * payload union (`RecoderPayload`).
 *
 * This module is the single source of truth for *runtime* validation of the
 * envelope. The structural TypeScript interfaces still live in `../types.ts`;
 * this file derives runtime guards from those shapes via Zod so that the
 * compile-time and run-time contracts cannot drift apart.
 *
 * The hand-rolled validators in `../types.ts` delegate here. The public
 * `validate*` / `parse*` / `is*` API in `../types.ts` is unchanged: it keeps
 * the same names, signatures, and `RecoderEnvelopeValidationIssue[]` return
 * shape, but is now Zod-backed.
 *
 * Why a separate file:
 * - Keeps `types.ts` free of a hard dependency on Zod internals.
 * - Lets adapters/services import the schema directly when they want
 *   `safeParse` semantics instead of the issue-list facade.
 *
 * @example
 * ```ts
 * import { RecoderA2AEnvelopeSchema } from '@recoder/shared/a2a/schemas';
 *
 * const result = RecoderA2AEnvelopeSchema.safeParse(raw);
 * if (result.success) {
 *   // result.data is a fully-typed RecoderA2AEnvelope
 * }
 * ```
 */

import { z } from 'zod';

// NOTE: The canonical version/platform/intent constants live in `../types.ts`.
// Re-declaring the closed literal sets *locally* here (rather than importing the
// runtime arrays from `../types`) is deliberate: `../types` delegates its
// validators to this module, so importing its runtime values back would create
// an eval-time import cycle (the constants are declared *after* the validators
// in `types.ts`). These literals are kept in lock-step with `../types` by the
// compile-time assertions at the bottom of this file -- if either side drifts,
// `tsc` fails.

/** Closed set of Recoder agent platforms (mirrors `RECODER_AGENT_PLATFORMS`). */
const PLATFORMS = [
  'recoder',
  'cursor',
  'windsurf',
  'replit',
  'codex',
  'claude_code',
  'recoder_app',
  'recoder_pm',
  'recoder_agency',
  'recoder_backend',
  'recoder_desktop',
  'custom',
] as const;

/** Closed set of envelope intents (mirrors `RECODER_ENVELOPE_INTENTS`). */
const INTENTS = [
  'plan',
  'execute',
  'review',
  'handoff',
  'status',
  'sync',
  'tool_call',
  'tool_result',
  'error',
] as const;

/** Canonical pinned envelope version (mirrors `RECODER_A2A_ENVELOPE_VERSION`). */
const ENVELOPE_VERSION = '2026-02-14';
/** Canonical pinned protocol version (mirrors `RECODER_A2A_PROTOCOL_VERSION`). */
const PROTOCOL_VERSION = '0.3.0';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/**
 * A string that, after trimming, still contains at least one character.
 * Mirrors the legacy `isNonEmptyString` guard exactly (whitespace-only is
 * rejected).
 */
const nonEmptyString = z
  .string()
  .refine((value) => value.trim().length > 0, { message: 'must be a non-empty string' });

/** An ISO-8601 timestamp string that `Date.parse` accepts. */
const isoTimestamp = z
  .string()
  .refine((value) => value.trim().length > 0 && !Number.isNaN(Date.parse(value)), {
    message: 'must be a valid ISO-8601 timestamp string',
  });

// ---------------------------------------------------------------------------
// Agent platform
// ---------------------------------------------------------------------------

/** Enum schema for the closed set of Recoder agent platforms. */
export const RecoderAgentPlatformSchema = z.enum(PLATFORMS);

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

/**
 * Schema for `RecoderAgentIdentity`.
 *
 * `id`, `name`, and `platform` are required; the platform must be one of the
 * known platforms. Optional descriptive fields are validated when present but
 * not required.
 */
export const RecoderAgentIdentitySchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  platform: RecoderAgentPlatformSchema,
  instanceId: z.string().optional(),
  team: z.string().optional(),
  version: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Payload union (tightened, discriminated)
// ---------------------------------------------------------------------------

/** `{ kind: 'text'; text: string }` — a non-empty text part. */
export const RecoderTextPayloadSchema = z.object({
  kind: z.literal('text'),
  text: nonEmptyString,
});

/** `{ kind: 'json'; data: Record<string, unknown> }` — a structured JSON part. */
export const RecoderJsonPayloadSchema = z.object({
  kind: z.literal('json'),
  data: z.record(z.unknown()),
});

/** `{ kind: 'command'; command: string; args?: string[]; cwd?: string }`. */
export const RecoderCommandPayloadSchema = z.object({
  kind: z.literal('command'),
  command: nonEmptyString,
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
});

/**
 * `{ kind: 'artifact'; artifactType; mimeType; content; path? }`.
 *
 * `artifactType` is tightened from the legacy "any non-empty string" check to
 * the closed literal union actually declared by `RecoderArtifactPayload`.
 */
export const RecoderArtifactPayloadSchema = z.object({
  kind: z.literal('artifact'),
  artifactType: z.enum(['patch', 'file', 'plan', 'report']),
  mimeType: nonEmptyString,
  content: nonEmptyString,
  path: z.string().optional(),
});

/**
 * The tightened `RecoderPayload` discriminated union.
 *
 * Previously the wire envelope accepted `RecoderPayload[] | unknown[]`, so any
 * object with a `kind` string slipped through. This discriminated union closes
 * that hole: the `kind` discriminant must be one of the four known literals and
 * each branch is validated against its own shape.
 */
export const RecoderPayloadSchema = z.discriminatedUnion('kind', [
  RecoderTextPayloadSchema,
  RecoderJsonPayloadSchema,
  RecoderCommandPayloadSchema,
  RecoderArtifactPayloadSchema,
]);

/** Inferred type for a single payload part. Structurally equals `RecoderPayload`. */
export type RecoderPayloadInput = z.infer<typeof RecoderPayloadSchema>;

// ---------------------------------------------------------------------------
// Trace context
// ---------------------------------------------------------------------------

/** Schema for the optional W3C-style trace context. */
export const RecoderEnvelopeTraceSchema = z.object({
  traceId: nonEmptyString,
  parentMessageId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/**
 * Build the base envelope schema.
 *
 * Version fields are always required and non-empty. When `strictVersion` is
 * set, they must additionally equal the canonical pinned versions — matching
 * the legacy `options.strictVersion` behavior.
 */
function buildEnvelopeSchema(strictVersion: boolean) {
  const envelopeVersion = strictVersion ? z.literal(ENVELOPE_VERSION) : nonEmptyString;
  const protocolVersion = strictVersion ? z.literal(PROTOCOL_VERSION) : nonEmptyString;

  return z.object({
    envelopeVersion,
    protocolVersion,
    messageId: nonEmptyString,
    threadId: nonEmptyString,
    createdAt: isoTimestamp,
    from: RecoderAgentIdentitySchema,
    to: RecoderAgentIdentitySchema,
    intent: z.enum(INTENTS),
    payload: z.array(RecoderPayloadSchema),
    metadata: z.record(z.unknown()).optional(),
    trace: RecoderEnvelopeTraceSchema.optional(),
  });
}

/**
 * Canonical Zod schema for `RecoderA2AEnvelope` (non-strict version check).
 *
 * This is the schema exported for direct consumption. Version fields are
 * required but not pinned to the canonical constant; use
 * {@link RecoderA2AEnvelopeStrictSchema} when exact version pinning is needed.
 */
export const RecoderA2AEnvelopeSchema = buildEnvelopeSchema(false);

/**
 * Strict variant of {@link RecoderA2AEnvelopeSchema} that additionally pins the
 * envelope/protocol versions to the canonical constants. Used when callers pass
 * `{ strictVersion: true }`.
 */
export const RecoderA2AEnvelopeStrictSchema = buildEnvelopeSchema(true);

/** Inferred type for a validated envelope. Structurally equals `RecoderA2AEnvelope`. */
export type RecoderA2AEnvelopeInput = z.infer<typeof RecoderA2AEnvelopeSchema>;

/**
 * Select the appropriate envelope schema for the given options.
 *
 * @param strictVersion - When true, pins version fields to canonical values.
 */
export function getRecoderA2AEnvelopeSchema(strictVersion: boolean) {
  return strictVersion ? RecoderA2AEnvelopeStrictSchema : RecoderA2AEnvelopeSchema;
}

// Compile-time drift guards that pin these schemas to the canonical interfaces
// in `../types.ts` live in a dedicated, side-effect-free module
// (`./recoder-envelope.guards.ts`). They are intentionally kept out of this file
// so that this module has *zero* dependency on `../types` -- avoiding an
// import cycle, since `../types` imports its validator backing from here.

/** Local literal sets exported for the drift guards to compare against. */
export const __PLATFORMS = PLATFORMS;
export const __INTENTS = INTENTS;
export const __ENVELOPE_VERSION = ENVELOPE_VERSION;
export const __PROTOCOL_VERSION = PROTOCOL_VERSION;
