"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecoderA2AEnvelopeValidationError = exports.RECODER_ENVELOPE_INTENTS = exports.RECODER_AGENT_PLATFORMS = exports.RECODER_ARTIFACT_TYPES = exports.getRecoderA2AEnvelopeSchema = exports.RecoderA2AEnvelopeStrictSchema = exports.RecoderA2AEnvelopeSchema = exports.RecoderEnvelopeTraceSchema = exports.RecoderAgentPlatformSchema = exports.RecoderAgentIdentitySchema = exports.RecoderArtifactPayloadSchema = exports.RecoderCommandPayloadSchema = exports.RecoderJsonPayloadSchema = exports.RecoderTextPayloadSchema = exports.RecoderPayloadSchema = exports.RECODER_A2A_ENVELOPE_TEXT_PREFIX = exports.RECODER_A2A_ENVELOPE_VERSION = exports.RECODER_A2A_PROTOCOL_VERSION = void 0;
exports.validateRecoderA2AEnvelope = validateRecoderA2AEnvelope;
exports.isRecoderA2AEnvelope = isRecoderA2AEnvelope;
exports.assertRecoderA2AEnvelope = assertRecoderA2AEnvelope;
exports.parseRecoderA2AEnvelope = parseRecoderA2AEnvelope;
// Internal alias so the validator can use the schema selector without clashing
// with the public re-export of the same name below (a name that is both
// imported and re-exported breaks live-binding forwarding under some bundlers).
const recoder_envelope_1 = require("./schemas/recoder-envelope");
exports.RECODER_A2A_PROTOCOL_VERSION = '0.3.0';
exports.RECODER_A2A_ENVELOPE_VERSION = '2026-02-14';
exports.RECODER_A2A_ENVELOPE_TEXT_PREFIX = 'recoder.a2a.envelope:';
// Re-export the Zod schemas + inferred types that back the validators below, so
// consumers can use `safeParse` semantics directly and so the schema is part of
// the public `@recoder/shared/a2a` surface.
//
// NOTE: these are pure re-exports (no local `import` of the same names) so the
// live bindings forward correctly under both Node's CJS interop and the
// bundler/SSR transforms used by consumers.
var recoder_envelope_2 = require("./schemas/recoder-envelope");
Object.defineProperty(exports, "RecoderPayloadSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderPayloadSchema; } });
Object.defineProperty(exports, "RecoderTextPayloadSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderTextPayloadSchema; } });
Object.defineProperty(exports, "RecoderJsonPayloadSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderJsonPayloadSchema; } });
Object.defineProperty(exports, "RecoderCommandPayloadSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderCommandPayloadSchema; } });
Object.defineProperty(exports, "RecoderArtifactPayloadSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderArtifactPayloadSchema; } });
Object.defineProperty(exports, "RecoderAgentIdentitySchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderAgentIdentitySchema; } });
Object.defineProperty(exports, "RecoderAgentPlatformSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderAgentPlatformSchema; } });
Object.defineProperty(exports, "RecoderEnvelopeTraceSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderEnvelopeTraceSchema; } });
Object.defineProperty(exports, "RecoderA2AEnvelopeSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderA2AEnvelopeSchema; } });
Object.defineProperty(exports, "RecoderA2AEnvelopeStrictSchema", { enumerable: true, get: function () { return recoder_envelope_2.RecoderA2AEnvelopeStrictSchema; } });
Object.defineProperty(exports, "getRecoderA2AEnvelopeSchema", { enumerable: true, get: function () { return recoder_envelope_2.getRecoderA2AEnvelopeSchema; } });
/** Closed set of artifact payload types. */
exports.RECODER_ARTIFACT_TYPES = ['patch', 'file', 'plan', 'report'];
exports.RECODER_AGENT_PLATFORMS = [
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
];
exports.RECODER_ENVELOPE_INTENTS = [
    'plan',
    'execute',
    'review',
    'handoff',
    'status',
    'sync',
    'tool_call',
    'tool_result',
    'error',
];
class RecoderA2AEnvelopeValidationError extends Error {
    issues;
    constructor(issues, message = 'Invalid Recoder A2A envelope') {
        super(message);
        this.name = 'RecoderA2AEnvelopeValidationError';
        this.issues = issues;
    }
}
exports.RecoderA2AEnvelopeValidationError = RecoderA2AEnvelopeValidationError;
/**
 * Convert a Zod issue path (array of string/number segments) into the legacy
 * dotted path notation used by `RecoderEnvelopeValidationIssue`:
 * - object keys are joined with `.`
 * - array indices use `[n]` bracket notation
 *
 * Example: `['payload', 0, 'text']` -> `payload[0].text`.
 */
function zodPathToString(path) {
    let out = '';
    for (const segment of path) {
        if (typeof segment === 'number') {
            out += `[${segment}]`;
        }
        else {
            out += out.length === 0 ? segment : `.${segment}`;
        }
    }
    return out;
}
/**
 * Validate an unknown value against the canonical Recoder A2A envelope schema.
 *
 * Zod-backed: structural validation is delegated to `RecoderA2AEnvelopeSchema`
 * (and its strict variant when `options.strictVersion` is set). The function
 * signature and return shape are unchanged from the previous hand-rolled
 * implementation -- it returns a flat list of `{ path, message }` issues and
 * never throws -- so existing callers continue to work without modification.
 *
 * @param value - The raw, untrusted value to validate.
 * @param options - When `strictVersion` is true, the envelope/protocol version
 *   fields must equal the canonical pinned constants.
 * @returns An array of validation issues; empty when the value is a valid
 *   `RecoderA2AEnvelope`.
 */
function validateRecoderA2AEnvelope(value, options = {}) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [{ path: '$', message: 'envelope must be an object' }];
    }
    const schema = (0, recoder_envelope_1.getRecoderA2AEnvelopeSchema)(options.strictVersion === true);
    const result = schema.safeParse(value);
    if (result.success) {
        return [];
    }
    return result.error.issues.map((issue) => {
        const path = zodPathToString(issue.path);
        return {
            path: path.length > 0 ? path : '$',
            message: issue.message,
        };
    });
}
function isRecoderA2AEnvelope(value) {
    return validateRecoderA2AEnvelope(value).length === 0;
}
function assertRecoderA2AEnvelope(value, options) {
    const issues = validateRecoderA2AEnvelope(value, options);
    if (issues.length > 0) {
        throw new RecoderA2AEnvelopeValidationError(issues);
    }
}
function parseRecoderA2AEnvelope(value, options) {
    assertRecoderA2AEnvelope(value, options);
    return value;
}
