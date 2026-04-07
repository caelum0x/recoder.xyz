"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOpencodeSandboxCommand = buildOpencodeSandboxCommand;
exports.parseOpencodeSandboxOutput = parseOpencodeSandboxOutput;
const DEFAULT_OPENCODE_MODEL = process.env.OPENCODE_MODEL || 'openrouter/anthropic/claude-sonnet-4.5';
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
function buildEnvAssignments(keys) {
    if (!keys) {
        return [];
    }
    const assignments = [];
    if (keys.openrouter) {
        assignments.push(`OPENROUTER_API_KEY=${shellQuote(keys.openrouter)}`);
    }
    if (keys.openai) {
        assignments.push(`OPENAI_API_KEY=${shellQuote(keys.openai)}`);
    }
    if (keys.anthropic) {
        assignments.push(`ANTHROPIC_API_KEY=${shellQuote(keys.anthropic)}`);
    }
    const geminiKey = keys.google || keys.gemini;
    if (geminiKey) {
        assignments.push(`GEMINI_API_KEY=${shellQuote(geminiKey)}`);
    }
    return assignments;
}
function buildOpencodeSandboxCommand(options) {
    const cwd = options.cwd || '/workspace';
    const parts = [...buildEnvAssignments(options.providerKeys)];
    parts.push('opencode', 'run', '--format', 'json', '--dir', shellQuote(cwd));
    if (options.sessionId) {
        parts.push('--session', shellQuote(options.sessionId));
    }
    else if (options.continueSession) {
        parts.push('--continue');
    }
    parts.push('--model', shellQuote(options.model || DEFAULT_OPENCODE_MODEL));
    parts.push(shellQuote(options.prompt));
    return parts.join(' ');
}
function extractTextFromEvent(value) {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const event = value;
    const part = event.part;
    if (event.type === 'text' && part && typeof part === 'object') {
        const text = part.text;
        return typeof text === 'string' && text.trim().length > 0 ? text.trim() : undefined;
    }
    if (event.type === 'error') {
        const error = event.error;
        if (typeof error === 'string' && error.trim()) {
            return error.trim();
        }
        if (error && typeof error === 'object') {
            const record = error;
            if (typeof record.message === 'string' && record.message.trim()) {
                return record.message.trim();
            }
        }
    }
    if (event.type === 'tool_use' && part && typeof part === 'object') {
        const record = part;
        const tool = typeof record.tool === 'string' ? record.tool : undefined;
        const state = record.state && typeof record.state === 'object'
            ? record.state
            : undefined;
        const status = typeof state?.status === 'string' ? state.status : undefined;
        if (tool && status) {
            return `[tool:${tool}] ${status}`;
        }
    }
    return undefined;
}
function parseOpencodeSandboxOutput(output) {
    const textChunks = [];
    const errorChunks = [];
    let sessionId;
    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        try {
            const parsed = JSON.parse(line);
            if (typeof parsed.sessionID === 'string' && parsed.sessionID.trim()) {
                sessionId = parsed.sessionID.trim();
            }
            const chunk = extractTextFromEvent(parsed);
            if (!chunk) {
                continue;
            }
            if (parsed.type === 'error') {
                errorChunks.push(chunk);
            }
            else {
                textChunks.push(chunk);
            }
        }
        catch {
            textChunks.push(line);
        }
    }
    return {
        sessionId,
        text: textChunks.join('\n\n').trim(),
        error: errorChunks.join('\n').trim() || undefined,
        rawText: output,
    };
}
