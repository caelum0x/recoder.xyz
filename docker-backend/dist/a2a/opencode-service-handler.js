"use strict";
/**
 * @module opencode-service-handler
 *
 * Extracted pure function that handles a Deep Coding prompt via the
 * centralized opencode service. This is the hot path used by:
 *
 *   - recoder-web   → POST /api/opencode/:projectId (server.ts)
 *   - recoder-agents → POST /api/opencode/:projectId (via backend)
 *   - A2A connector → POST /api/a2a/connectors/opencode/execute
 *
 * After opencode writes files to its local /workspace, this handler
 * syncs them to the Daytona sandbox via daytonaWriteFile so the
 * user's preview sees the changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwardProviderKeys = forwardProviderKeys;
exports.extractResponseText = extractResponseText;
exports.handleOpencodeServicePrompt = handleOpencodeServicePrompt;
const opencode_service_adapter_1 = require("./opencode-service-adapter");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('opencode-service-handler');
const OPENCODE_AGENT_NAMES = new Set(['build', 'explore', 'general', 'plan']);
function toPromptInputModel(model) {
    if (!model) {
        return {};
    }
    const trimmed = model.trim();
    if (!trimmed) {
        return {};
    }
    if (OPENCODE_AGENT_NAMES.has(trimmed)) {
        return { agent: trimmed };
    }
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
        return {
            providerID: trimmed.slice(0, slashIndex),
            modelID: trimmed.slice(slashIndex + 1),
        };
    }
    return {};
}
/**
 * Forward BYOK provider keys to the opencode service.
 * Each key is best-effort — failures are logged but don't block the prompt.
 */
async function forwardProviderKeys(providerKeys) {
    if (!providerKeys)
        return;
    const keyMap = [
        ['openrouter', providerKeys.openrouter],
        ['openai', providerKeys.openai],
        ['anthropic', providerKeys.anthropic],
        ['google', providerKeys.google || providerKeys.gemini],
    ];
    for (const [provider, key] of keyMap) {
        if (key) {
            await (0, opencode_service_adapter_1.setProviderKey)(provider, key).catch(() => { });
        }
    }
}
/**
 * Extract user-readable text from an opencode message's parts.
 * Joins text parts and tool-result parts with double newlines.
 */
function extractResponseText(result) {
    const textParts = result.parts
        .filter((p) => p.type === 'text' || p.type === 'tool-result')
        .map((p) => {
        const record = p;
        return String(record.text || record.content || '');
    })
        .filter(Boolean);
    return textParts.join('\n\n');
}
/**
 * Extract file paths that opencode modified from the message parts.
 * Looks for tool-call parts with file-editing tools (edit, write, create_file).
 */
function extractModifiedFilePaths(result) {
    const paths = new Set();
    const textPathPattern = /(?:\/workspace\/|\/home\/daytona\/)([^\s"'`),:;]+)|`((?:\/workspace\/|\/home\/daytona\/)[^`]+)`/g;
    for (const part of result.parts) {
        const record = part;
        // tool-call parts contain the tool name and arguments
        if (record.type === 'tool-call') {
            const name = String(record.name || record.tool || '');
            const args = (record.args || record.input || {});
            if (['edit', 'write', 'create_file', 'file_edit', 'str_replace_editor'].includes(name)) {
                const filePath = String(args.path || args.file || args.filePath || '');
                if (filePath)
                    paths.add(filePath);
            }
        }
        // file-type parts directly reference a path
        if (record.type === 'file' || record.type === 'patch') {
            const filePath = String(record.path || record.file || '');
            if (filePath)
                paths.add(filePath);
        }
        // Some opencode responses only mention created/edited files in text or
        // reasoning parts instead of structured tool-call metadata or diff output.
        // Extract absolute workspace paths from those messages so we can still
        // sync the changed files back into the sandbox.
        if (record.type === 'text' || record.type === 'reasoning' || record.type === 'tool-result') {
            const content = String(record.text || record.content || '');
            if (!content)
                continue;
            let match;
            while ((match = textPathPattern.exec(content)) !== null) {
                const filePath = match[0].replace(/`/g, '');
                if (filePath)
                    paths.add(filePath);
            }
            textPathPattern.lastIndex = 0;
        }
    }
    return [...paths];
}
/**
 * Sync files that opencode wrote to its /workspace to the Daytona sandbox.
 * Reads each file from opencode's workspace, writes to Daytona.
 */
async function syncFilesToSandbox(input, result) {
    const { sandboxId, readWorkspaceFile, writeSandboxFile, projectId } = input;
    if (!sandboxId || !readWorkspaceFile || !writeSandboxFile)
        return [];
    // Strategy 1: extract file paths from message parts (tool-call args)
    let filePaths = extractModifiedFilePaths(result);
    // Strategy 2: if no paths from parts, try getDiff API
    if (filePaths.length === 0 && result.info.id) {
        try {
            const diffs = await (0, opencode_service_adapter_1.getProjectDiff)(projectId, result.info.id);
            filePaths = diffs
                .map((d) => String(d.path || ''))
                .filter(Boolean);
        }
        catch {
            logger.warn({ projectId }, 'getDiff failed, skipping sandbox sync');
        }
    }
    if (filePaths.length === 0)
        return [];
    const synced = [];
    for (const filePath of filePaths) {
        try {
            // Strip leading /workspace/ or / to get the relative path
            const relativePath = filePath
                .replace(/^\/workspace\//, '')
                .replace(/^\/home\/daytona\//, '')
                .replace(/^\//, '');
            const content = await readWorkspaceFile(relativePath);
            await writeSandboxFile(sandboxId, relativePath, content);
            synced.push(relativePath);
        }
        catch (err) {
            logger.warn({ projectId, filePath, err }, 'Failed to sync file to sandbox');
        }
    }
    if (synced.length > 0) {
        logger.info({ projectId, sandboxId, count: synced.length, files: synced }, 'Synced files to Daytona sandbox');
    }
    return synced;
}
/**
 * Handle a Deep Coding prompt through the centralized opencode service.
 *
 * Flow:
 *   1. Forward BYOK provider keys (openrouter/openai/anthropic/google)
 *   2. Call promptProject() to run the prompt
 *   3. Sync written files to Daytona sandbox (if sandboxId provided)
 *   4. Extract text from the result's parts
 *   5. Return a uniform response shape
 */
async function handleOpencodeServicePrompt(input) {
    await forwardProviderKeys(input.providerKeys);
    const result = await (0, opencode_service_adapter_1.promptProject)(input.projectId, {
        content: input.prompt,
        ...toPromptInputModel(input.model),
    }, { directory: input.directory });
    // Sync files from opencode /workspace → Daytona sandbox
    const syncedFiles = await syncFilesToSandbox(input, result);
    const text = extractResponseText(result);
    return {
        success: true,
        sessionId: result.info.sessionID,
        text,
        output: JSON.stringify(result),
        raw: result,
        syncedFiles,
    };
}
