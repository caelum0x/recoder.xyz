"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecoderA2AEnvelopeValidationError = exports.RECODER_ENVELOPE_INTENTS = exports.RECODER_AGENT_PLATFORMS = exports.RECODER_A2A_ENVELOPE_TEXT_PREFIX = exports.RECODER_A2A_ENVELOPE_VERSION = exports.RECODER_A2A_PROTOCOL_VERSION = void 0;
exports.validateRecoderA2AEnvelope = validateRecoderA2AEnvelope;
exports.isRecoderA2AEnvelope = isRecoderA2AEnvelope;
exports.assertRecoderA2AEnvelope = assertRecoderA2AEnvelope;
exports.parseRecoderA2AEnvelope = parseRecoderA2AEnvelope;
exports.RECODER_A2A_PROTOCOL_VERSION = '0.3.0';
exports.RECODER_A2A_ENVELOPE_VERSION = '2026-02-14';
exports.RECODER_A2A_ENVELOPE_TEXT_PREFIX = 'recoder.a2a.envelope:';
exports.RECODER_AGENT_PLATFORMS = [
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
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function validateIdentity(identity, path, issues) {
    if (!isRecord(identity)) {
        issues.push({ path, message: 'must be an object' });
        return;
    }
    if (!isNonEmptyString(identity.id)) {
        issues.push({ path: `${path}.id`, message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(identity.name)) {
        issues.push({ path: `${path}.name`, message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(identity.platform) ||
        !exports.RECODER_AGENT_PLATFORMS.includes(identity.platform)) {
        issues.push({
            path: `${path}.platform`,
            message: `must be one of ${exports.RECODER_AGENT_PLATFORMS.join(', ')}`,
        });
    }
}
function validatePayload(payload, issues) {
    if (!Array.isArray(payload)) {
        issues.push({ path: 'payload', message: 'must be an array' });
        return;
    }
    payload.forEach((part, index) => {
        const basePath = `payload[${index}]`;
        if (!isRecord(part)) {
            issues.push({ path: basePath, message: 'must be an object' });
            return;
        }
        if (!isNonEmptyString(part.kind)) {
            issues.push({ path: `${basePath}.kind`, message: 'must be a non-empty string' });
            return;
        }
        if (part.kind === 'text' && !isNonEmptyString(part.text)) {
            issues.push({ path: `${basePath}.text`, message: 'must be a non-empty string' });
            return;
        }
        if (part.kind === 'json' && !isRecord(part.data)) {
            issues.push({ path: `${basePath}.data`, message: 'must be an object' });
            return;
        }
        if (part.kind === 'command') {
            if (!isNonEmptyString(part.command)) {
                issues.push({ path: `${basePath}.command`, message: 'must be a non-empty string' });
            }
            if (part.args !== undefined && !Array.isArray(part.args)) {
                issues.push({ path: `${basePath}.args`, message: 'must be an array of strings' });
            }
            return;
        }
        if (part.kind === 'artifact') {
            if (!isNonEmptyString(part.mimeType)) {
                issues.push({ path: `${basePath}.mimeType`, message: 'must be a non-empty string' });
            }
            if (!isNonEmptyString(part.content)) {
                issues.push({ path: `${basePath}.content`, message: 'must be a non-empty string' });
            }
            if (!isNonEmptyString(part.artifactType)) {
                issues.push({
                    path: `${basePath}.artifactType`,
                    message: 'must be one of patch, file, plan, report',
                });
            }
            return;
        }
        if (part.kind !== 'text' && part.kind !== 'json' && part.kind !== 'command' && part.kind !== 'artifact') {
            issues.push({
                path: `${basePath}.kind`,
                message: 'must be one of text, json, command, artifact',
            });
        }
    });
}
function validateRecoderA2AEnvelope(value, options = {}) {
    const issues = [];
    if (!isRecord(value)) {
        return [{ path: '$', message: 'envelope must be an object' }];
    }
    if (!isNonEmptyString(value.envelopeVersion)) {
        issues.push({ path: 'envelopeVersion', message: 'must be a non-empty string' });
    }
    else if (options.strictVersion && value.envelopeVersion !== exports.RECODER_A2A_ENVELOPE_VERSION) {
        issues.push({
            path: 'envelopeVersion',
            message: `must equal ${exports.RECODER_A2A_ENVELOPE_VERSION}`,
        });
    }
    if (!isNonEmptyString(value.protocolVersion)) {
        issues.push({ path: 'protocolVersion', message: 'must be a non-empty string' });
    }
    else if (options.strictVersion && value.protocolVersion !== exports.RECODER_A2A_PROTOCOL_VERSION) {
        issues.push({
            path: 'protocolVersion',
            message: `must equal ${exports.RECODER_A2A_PROTOCOL_VERSION}`,
        });
    }
    if (!isNonEmptyString(value.messageId)) {
        issues.push({ path: 'messageId', message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(value.threadId)) {
        issues.push({ path: 'threadId', message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(value.createdAt) || Number.isNaN(Date.parse(value.createdAt))) {
        issues.push({ path: 'createdAt', message: 'must be a valid ISO-8601 timestamp string' });
    }
    validateIdentity(value.from, 'from', issues);
    validateIdentity(value.to, 'to', issues);
    validatePayload(value.payload, issues);
    if (!isNonEmptyString(value.intent) ||
        !exports.RECODER_ENVELOPE_INTENTS.includes(value.intent)) {
        issues.push({
            path: 'intent',
            message: `must be one of ${exports.RECODER_ENVELOPE_INTENTS.join(', ')}`,
        });
    }
    if (value.metadata !== undefined && !isRecord(value.metadata)) {
        issues.push({ path: 'metadata', message: 'must be an object when provided' });
    }
    if (value.trace !== undefined) {
        if (!isRecord(value.trace)) {
            issues.push({ path: 'trace', message: 'must be an object when provided' });
        }
        else if (!isNonEmptyString(value.trace.traceId)) {
            issues.push({ path: 'trace.traceId', message: 'must be a non-empty string' });
        }
    }
    return issues;
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
