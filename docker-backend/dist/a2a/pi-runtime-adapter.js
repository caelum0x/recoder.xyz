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
const PI_SESSION_START_TIMEOUT_MS = 15000;
const PI_PROMPT_TIMEOUT_MS = 45000;
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
async function withTimeout(promise, timeoutMs, label) {
    return await Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
}
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
    const piModule = await withTimeout(loadPiModule(), PI_SESSION_START_TIMEOUT_MS, 'Pi module load');
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
    const sessionResult = await withTimeout(createAgentSession({
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
    }), PI_SESSION_START_TIMEOUT_MS, 'Pi session creation');
    const { session } = sessionResult;
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
    const session = await withTimeout(getOrCreatePiSession(projectId, sandboxId, options), PI_SESSION_START_TIMEOUT_MS, 'Pi session bootstrap');
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
        await withTimeout(session.prompt(buildPiExecutionPrompt(prompt)), PI_PROMPT_TIMEOUT_MS, 'Pi prompt execution');
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
