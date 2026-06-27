"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRecoderAgentCard = createRecoderAgentCard;
exports.envelopeToA2ATextPart = envelopeToA2ATextPart;
exports.envelopeToA2AMessage = envelopeToA2AMessage;
exports.a2aTextPartToEnvelope = a2aTextPartToEnvelope;
exports.codexToEnvelope = codexToEnvelope;
exports.envelopeToCodex = envelopeToCodex;
exports.claudeCodeToEnvelope = claudeCodeToEnvelope;
exports.envelopeToClaudeCode = envelopeToClaudeCode;
const types_1 = require("./types");
function extractFirstText(envelope) {
    const payload = envelope.payload;
    const textPart = payload.find((part) => {
        if (!part || typeof part !== 'object')
            return false;
        return part.kind === 'text';
    });
    return textPart?.kind === 'text' ? (textPart.text ?? '') : '';
}
function roleFromIntent(intent) {
    if (intent === 'plan' || intent === 'status' || intent === 'sync') {
        return 'system';
    }
    if (intent === 'tool_call') {
        return 'assistant';
    }
    return 'user';
}
function intentFromRole(role) {
    if (role === 'system') {
        return 'plan';
    }
    if (role === 'assistant') {
        return 'tool_result';
    }
    return 'execute';
}
function intentFromClaudeRole(role) {
    return role === 'assistant' ? 'tool_result' : 'execute';
}
function readClaudeText(content) {
    if (typeof content === 'string') {
        return content;
    }
    return content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
}
function createRecoderAgentCard(input) {
    return {
        name: input.name,
        description: input.description,
        protocolVersion: types_1.RECODER_A2A_PROTOCOL_VERSION,
        version: input.version,
        url: input.url,
        skills: input.skills,
        capabilities: {
            streaming: input.supportsStreaming ?? true,
            pushNotifications: input.supportsPushNotifications ?? false,
        },
        defaultInputModes: input.defaultInputModes ?? ['text'],
        defaultOutputModes: input.defaultOutputModes ?? ['text'],
    };
}
function envelopeToA2ATextPart(envelope) {
    return {
        kind: 'text',
        text: `${types_1.RECODER_A2A_ENVELOPE_TEXT_PREFIX}${JSON.stringify(envelope)}`,
    };
}
function envelopeToA2AMessage(envelope, role = 'agent') {
    return {
        kind: 'message',
        messageId: envelope.messageId,
        role,
        parts: [envelopeToA2ATextPart(envelope)],
        contextId: envelope.threadId,
    };
}
function a2aTextPartToEnvelope(part) {
    if (!part.text.startsWith(types_1.RECODER_A2A_ENVELOPE_TEXT_PREFIX)) {
        throw new Error('A2A text part does not contain a Recoder envelope');
    }
    const raw = part.text.slice(types_1.RECODER_A2A_ENVELOPE_TEXT_PREFIX.length);
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new types_1.RecoderA2AEnvelopeValidationError([
            { path: 'a2a.text', message: 'contains an invalid JSON envelope payload' },
        ]);
    }
    return (0, types_1.parseRecoderA2AEnvelope)(parsed);
}
function codexToEnvelope(input) {
    return {
        envelopeVersion: types_1.RECODER_A2A_ENVELOPE_VERSION,
        protocolVersion: types_1.RECODER_A2A_PROTOCOL_VERSION,
        messageId: input.messageId,
        threadId: input.threadId,
        createdAt: input.now ?? new Date().toISOString(),
        from: input.from,
        to: input.to,
        intent: intentFromRole(input.message.role),
        payload: [{ kind: 'text', text: input.message.content }],
        metadata: input.message.metadata,
    };
}
function envelopeToCodex(envelope) {
    return {
        role: roleFromIntent(envelope.intent),
        content: extractFirstText(envelope),
        metadata: envelope.metadata,
    };
}
function claudeCodeToEnvelope(input) {
    return {
        envelopeVersion: types_1.RECODER_A2A_ENVELOPE_VERSION,
        protocolVersion: types_1.RECODER_A2A_PROTOCOL_VERSION,
        messageId: input.messageId,
        threadId: input.threadId,
        createdAt: input.now ?? new Date().toISOString(),
        from: input.from,
        to: input.to,
        intent: intentFromClaudeRole(input.message.role),
        payload: [{ kind: 'text', text: readClaudeText(input.message.content) }],
        metadata: input.message.metadata,
    };
}
function envelopeToClaudeCode(envelope) {
    return {
        role: envelope.intent === 'tool_result' ? 'assistant' : 'user',
        content: [{ type: 'text', text: extractFirstText(envelope) }],
        metadata: envelope.metadata,
    };
}
