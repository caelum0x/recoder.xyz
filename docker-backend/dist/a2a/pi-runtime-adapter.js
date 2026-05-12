"use strict";
/**
 * @module pi-runtime-adapter
 *
 * Bridges pi-coding-agent SDK to Daytona sandboxes.
 *
 * Creates Pi agent sessions with custom tool operations that route
 * all file I/O and shell execution through Daytona APIs — the agent
 * thinks it's editing /home/daytona/* locally but everything goes
 * through daytonaWriteFile/daytonaReadFile/daytonaExec.
 *
 * This replaces the fragile chat-XML-action-runner pipeline with a
 * proper coding agent that has direct sandbox access.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreatePiSession = getOrCreatePiSession;
exports.promptPiSession = promptPiSession;
exports.disposePiSession = disposePiSession;
exports.isPiRuntimeAvailable = isPiRuntimeAvailable;
exports.getActivePiSessions = getActivePiSessions;
const logger_js_1 = require("../logger.js");
const daytona_file_ops_js_1 = require("../daytona-file-ops.js");
const fs_1 = require("fs");
const path_1 = require("path");
const url_1 = require("url");
const logger = (0, logger_js_1.createLogger)('pi-runtime');
// ── Daytona-backed Operations ───────────────────────────────────────
const DAYTONA_CWD = '/home/daytona';
async function loadPiModule() {
    const candidates = [
        (0, path_1.join)(process.cwd(), '..', 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
        (0, path_1.join)(process.cwd(), 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
        (0, path_1.join)(__dirname, '..', '..', 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
    ];
    const modulePath = candidates.find((candidate) => (0, fs_1.existsSync)(candidate));
    if (!modulePath) {
        throw new Error('Pi runtime dist/index.js not found in node_modules');
    }
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return dynamicImport((0, url_1.pathToFileURL)(modulePath).href);
}
function buildPiExecutionPrompt(userPrompt) {
    return [
        'You are a coding agent with direct file and shell tools inside the current Daytona workspace.',
        'You must make changes by using the available tools, not by returning XML, pseudo-actions, or code snippets.',
        'Never output <recoderAction>, <recoderArtifact>, markdown code fences, or hypothetical edits.',
        'Apply the change directly to the workspace files and only return a short plain-text summary after the edits are complete.',
        '',
        'User request:',
        userPrompt,
    ].join('\n');
}
async function applyLegacyRecoderFileActions(sandboxId, responseText) {
    const appliedFiles = [];
    const isPlaceholderPath = (value) => value.includes('[') || value.includes(']');
    const candidateExistingFiles = ['src/App.tsx', 'src/main.tsx', 'src/main.jsx', 'src/App.jsx'];
    const actionRegex = /<recoderAction\s+type="file"\s+filePath="([^"]+)"\s*>([\s\S]*?)<\/recoderAction>/gi;
    const replaceRegex = /<recoderAction\s+type="str_replace"\s+filePath="([^"]+)"\s+oldString="([^"]*)"\s+newString="([^"]*)"\s*>[\s\S]*?<\/recoderAction>/gi;
    for (const match of responseText.matchAll(actionRegex)) {
        const filePath = match[1]?.trim();
        const fileContent = match[2];
        if (!filePath || fileContent == null || isPlaceholderPath(filePath))
            continue;
        const normalizedContent = fileContent.replace(/^\n+|\n+$/g, '');
        await (0, daytona_file_ops_js_1.daytonaWriteFile)(sandboxId, filePath, normalizedContent);
        appliedFiles.push(filePath);
        logger.warn({ sandboxId, filePath }, 'Applied legacy recoderAction file output via Daytona fallback');
    }
    for (const match of responseText.matchAll(replaceRegex)) {
        const filePath = match[1]?.trim();
        const oldString = match[2] ?? '';
        const newString = match[3] ?? '';
        if (!filePath || !oldString || isPlaceholderPath(filePath))
            continue;
        const currentContent = await (0, daytona_file_ops_js_1.daytonaReadFile)(sandboxId, filePath);
        if (!currentContent.includes(oldString))
            continue;
        const updatedContent = currentContent.replace(oldString, newString);
        await (0, daytona_file_ops_js_1.daytonaWriteFile)(sandboxId, filePath, updatedContent);
        appliedFiles.push(filePath);
        logger.warn({ sandboxId, filePath }, 'Applied legacy recoderAction str_replace output via Daytona fallback');
    }
    if (appliedFiles.length === 0) {
        const referencedFiles = Array.from(new Set(Array.from(responseText.matchAll(/filePath="([^"]+)"/g)).map((match) => match[1]?.trim()).filter(Boolean)));
        const codeBlocks = Array.from(responseText.matchAll(/```(?:[\w-]+)?\n([\s\S]*?)```/g))
            .map((match) => match[1]?.trim())
            .filter(Boolean);
        const candidateBlock = codeBlocks.reverse().find((block) => {
            return !block.startsWith('<recoder') && (block.includes('export default') || block.includes('function App'));
        });
        const validReferencedFiles = referencedFiles.filter((filePath) => !isPlaceholderPath(filePath));
        let fallbackTarget = validReferencedFiles.length === 1 ? validReferencedFiles[0] : '';
        if (!fallbackTarget && candidateBlock) {
            for (const candidate of candidateExistingFiles) {
                try {
                    const existing = await (0, daytona_file_ops_js_1.daytonaReadFile)(sandboxId, candidate);
                    if (!existing)
                        continue;
                    if ((candidate.endsWith('App.tsx') || candidate.endsWith('App.jsx'))
                        && (candidateBlock.includes('function App') || candidateBlock.includes('export default App'))) {
                        fallbackTarget = candidate;
                        break;
                    }
                    if ((candidate.endsWith('main.tsx') || candidate.endsWith('main.jsx'))
                        && (candidateBlock.includes('createRoot') || candidateBlock.includes('ReactDOM'))) {
                        fallbackTarget = candidate;
                        break;
                    }
                }
                catch {
                    // candidate file not present in this sandbox
                }
            }
        }
        if (fallbackTarget && candidateBlock) {
            await (0, daytona_file_ops_js_1.daytonaWriteFile)(sandboxId, fallbackTarget, candidateBlock);
            appliedFiles.push(fallbackTarget);
            logger.warn({ sandboxId, filePath: fallbackTarget }, 'Applied legacy fenced code fallback via Daytona');
        }
    }
    return appliedFiles;
}
/** ReadOperations backed by Daytona */
function createDaytonaReadOps(sandboxId) {
    return {
        readFile: async (absolutePath) => {
            const relativePath = absolutePath.replace(/^\/home\/daytona\//, '').replace(/^\//, '');
            const content = await (0, daytona_file_ops_js_1.daytonaReadFile)(sandboxId, relativePath);
            return Buffer.from(content, 'utf-8');
        },
        access: async (absolutePath) => {
            const relativePath = absolutePath.replace(/^\/home\/daytona\//, '').replace(/^\//, '');
            try {
                await (0, daytona_file_ops_js_1.daytonaReadFile)(sandboxId, relativePath);
            }
            catch {
                throw new Error(`ENOENT: no such file: ${absolutePath}`);
            }
        },
        detectImageMimeType: async (_path) => null,
    };
}
/** WriteOperations backed by Daytona */
function createDaytonaWriteOps(sandboxId) {
    return {
        writeFile: async (absolutePath, content) => {
            const relativePath = absolutePath.replace(/^\/home\/daytona\//, '').replace(/^\//, '');
            await (0, daytona_file_ops_js_1.daytonaWriteFile)(sandboxId, relativePath, content);
            logger.debug({ sandboxId, path: relativePath }, 'Pi wrote file via Daytona');
        },
        mkdir: async (dir) => {
            // Skip mkdir for the root workspace dir itself — it always exists
            const relativePath = dir.replace(/^\/home\/daytona\/?/, '').replace(/^\//, '');
            if (!relativePath || relativePath === '.')
                return;
            await (0, daytona_file_ops_js_1.daytonaCreateFolder)(sandboxId, relativePath);
        },
    };
}
/** EditOperations backed by Daytona (read + write) */
function createDaytonaEditOps(sandboxId) {
    const readOps = createDaytonaReadOps(sandboxId);
    const writeOps = createDaytonaWriteOps(sandboxId);
    return {
        readFile: readOps.readFile,
        writeFile: writeOps.writeFile,
        access: readOps.access,
    };
}
/** BashOperations backed by Daytona */
function createDaytonaBashOps(sandboxId) {
    return {
        exec: async (command, cwd, options) => {
            try {
                const result = await (0, daytona_file_ops_js_1.daytonaExec)(sandboxId, command, {
                    cwd,
                    timeoutSecs: options.timeout || 120,
                });
                // Send output to Pi's streaming callback
                if (result.output) {
                    options.onData(Buffer.from(result.output, 'utf-8'));
                }
                return { exitCode: result.exitCode ?? 0 };
            }
            catch (err) {
                options.onData(Buffer.from(`Error: ${err.message}\n`, 'utf-8'));
                return { exitCode: 1 };
            }
        },
    };
}
/** Map projectId → PiSession */
const activeSessions = new Map();
/** Session TTL: 30 minutes */
const SESSION_TTL_MS = 30 * 60 * 1000;
/**
 * Get or create a Pi coding agent session for a project's Daytona sandbox.
 */
async function getOrCreatePiSession(projectId, sandboxId, options) {
    const modelKey = options?.model?.trim() || 'default';
    // Check for existing valid session
    const existing = activeSessions.get(projectId);
    if (existing && existing.sandboxId === sandboxId && existing.modelKey === modelKey) {
        const age = Date.now() - existing.createdAt;
        if (age < SESSION_TTL_MS) {
            return existing.session;
        }
        // Expired — dispose and recreate
        try {
            existing.session?.dispose?.();
        }
        catch { /* best effort */ }
        activeSessions.delete(projectId);
    }
    logger.info({ projectId, sandboxId }, 'Creating Pi coding agent session');
    // Load the ESM-only Pi package by absolute file URL so CommonJS output
    // does not collapse this into require(), which breaks on the package exports map.
    const piModule = await loadPiModule();
    const { AuthStorage, ModelRegistry, createAgentSession, createReadToolDefinition, createBashToolDefinition, createEditToolDefinition, createWriteToolDefinition, } = piModule;
    const SessionManager = piModule.SessionManager;
    const authStorage = AuthStorage.inMemory();
    const providerMap = [
        ['openrouter', options?.providerKeys?.openrouter],
        ['openai', options?.providerKeys?.openai],
        ['anthropic', options?.providerKeys?.anthropic],
        ['google', options?.providerKeys?.google],
    ];
    for (const [provider, key] of providerMap) {
        if (key?.trim()) {
            authStorage.set(provider, { type: 'api_key', key: key.trim() });
        }
    }
    const modelRegistry = ModelRegistry.create(authStorage);
    let selectedModel = undefined;
    const requestedModel = options?.model?.trim();
    if (requestedModel) {
        const slashIndex = requestedModel.indexOf('/');
        if (slashIndex > 0 && slashIndex < requestedModel.length - 1) {
            const provider = requestedModel.slice(0, slashIndex);
            const modelId = requestedModel.slice(slashIndex + 1);
            selectedModel = modelRegistry.find(provider, modelId);
        }
    }
    if (!selectedModel) {
        selectedModel = modelRegistry.getAvailable()[0];
    }
    const readOps = createDaytonaReadOps(sandboxId);
    const writeOps = createDaytonaWriteOps(sandboxId);
    const editOps = createDaytonaEditOps(sandboxId);
    const bashOps = createDaytonaBashOps(sandboxId);
    // Use customTools with ToolDefinitions (not AgentTool) — this bypasses
    // the allTools global registry and ensures our Daytona-backed operations
    // are actually used instead of the default fs implementations.
    const { session } = await createAgentSession({
        cwd: DAYTONA_CWD,
        authStorage,
        modelRegistry,
        model: selectedModel,
        tools: [], // disable built-in tools
        customTools: [
            createWriteToolDefinition(DAYTONA_CWD, { operations: writeOps }),
            createReadToolDefinition(DAYTONA_CWD, { operations: readOps }),
            createEditToolDefinition(DAYTONA_CWD, { operations: editOps }),
            createBashToolDefinition(DAYTONA_CWD, { operations: bashOps }),
        ],
        sessionManager: SessionManager?.inMemory?.() ?? undefined,
    });
    const piSession = {
        sessionPromise: Promise.resolve(session),
        session,
        sandboxId,
        projectId,
        createdAt: Date.now(),
        modelKey,
    };
    activeSessions.set(projectId, piSession);
    logger.info({ projectId, sandboxId }, 'Pi session created');
    return session;
}
/**
 * Send a prompt to the Pi coding agent for a project.
 * Returns the assistant's text response after all tool calls complete.
 */
async function promptPiSession(projectId, sandboxId, prompt, options) {
    const session = await getOrCreatePiSession(projectId, sandboxId, options);
    const textParts = [];
    const filesChanged = [];
    // Subscribe to events to collect results
    const unsubscribe = session.subscribe((event) => {
        if (event.type === 'message_end' && event.message?.role === 'assistant') {
            for (const content of event.message.content || []) {
                if (content.type === 'text') {
                    textParts.push(content.text);
                }
            }
        }
        // Track file writes from tool executions
        if (event.type === 'tool_execution_end') {
            const toolName = event.toolName || event.name;
            if (toolName === 'write' || toolName === 'edit') {
                const path = event.args?.path || event.input?.path;
                if (path)
                    filesChanged.push(path);
            }
        }
    });
    try {
        await session.prompt(buildPiExecutionPrompt(prompt));
        if (filesChanged.length === 0 && textParts.length > 0) {
            const legacyWrites = await applyLegacyRecoderFileActions(sandboxId, textParts.join('\n\n'));
            filesChanged.push(...legacyWrites);
        }
        return {
            success: true,
            text: textParts.join('\n\n'),
            filesChanged,
        };
    }
    catch (err) {
        logger.error({ projectId, err }, 'Pi prompt failed');
        return {
            success: false,
            text: `Error: ${err.message}`,
            filesChanged,
        };
    }
    finally {
        unsubscribe();
    }
}
/**
 * Dispose a project's Pi session.
 */
function disposePiSession(projectId) {
    const existing = activeSessions.get(projectId);
    if (existing) {
        try {
            existing.session?.dispose?.();
        }
        catch { /* best effort */ }
        activeSessions.delete(projectId);
        logger.info({ projectId }, 'Pi session disposed');
    }
}
/**
 * Check if Pi runtime is available (package installed).
 */
async function isPiRuntimeAvailable() {
    try {
        await loadPiModule();
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Get active Pi sessions info.
 */
function getActivePiSessions() {
    return Array.from(activeSessions.entries()).map(([projectId, s]) => ({
        projectId,
        sandboxId: s.sandboxId,
        ageMs: Date.now() - s.createdAt,
    }));
}
