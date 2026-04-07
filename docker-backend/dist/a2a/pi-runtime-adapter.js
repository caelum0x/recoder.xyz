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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreatePiSession = getOrCreatePiSession;
exports.promptPiSession = promptPiSession;
exports.disposePiSession = disposePiSession;
exports.isPiRuntimeAvailable = isPiRuntimeAvailable;
exports.getActivePiSessions = getActivePiSessions;
const logger_js_1 = require("../logger.js");
const daytona_file_ops_js_1 = require("../daytona-file-ops.js");
const logger = (0, logger_js_1.createLogger)('pi-runtime');
// ── Daytona-backed Operations ───────────────────────────────────────
const DAYTONA_CWD = '/home/daytona';
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
    // Check for existing valid session
    const existing = activeSessions.get(projectId);
    if (existing && existing.sandboxId === sandboxId) {
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
    // Dynamic import to avoid hard dependency at module load time
    const piModule = await Promise.resolve().then(() => __importStar(require('@mariozechner/pi-coding-agent')));
    const { createAgentSession, createReadToolDefinition, createBashToolDefinition, createEditToolDefinition, createWriteToolDefinition, } = piModule;
    const SessionManager = piModule.SessionManager;
    const readOps = createDaytonaReadOps(sandboxId);
    const writeOps = createDaytonaWriteOps(sandboxId);
    const editOps = createDaytonaEditOps(sandboxId);
    const bashOps = createDaytonaBashOps(sandboxId);
    // Use customTools with ToolDefinitions (not AgentTool) — this bypasses
    // the allTools global registry and ensures our Daytona-backed operations
    // are actually used instead of the default fs implementations.
    const { session } = await createAgentSession({
        cwd: DAYTONA_CWD,
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
        await session.prompt(prompt);
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
        await Promise.resolve().then(() => __importStar(require('@mariozechner/pi-coding-agent')));
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
