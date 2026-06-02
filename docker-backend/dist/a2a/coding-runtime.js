"use strict";
/**
 * @module coding-runtime
 *
 * Abstraction layer for coding runtimes behind docker-backend.
 *
 * Provides a unified interface for:
 *   - Native Mode: current fast XML/action path (Recoder's own)
 *   - Deep Coding Mode: durable runtime with persistent state
 *
 * Each runtime adapter implements the same interface so docker-backend
 * can switch between them per project/thread.
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
exports.registerRuntime = registerRuntime;
exports.getRuntime = getRuntime;
exports.listRuntimes = listRuntimes;
exports.createOpenCodeAdapter = createOpenCodeAdapter;
exports.createNativeAdapter = createNativeAdapter;
exports.createOmoAdapter = createOmoAdapter;
exports.createCodexAdapter = createCodexAdapter;
exports.createClaudeCodeAdapter = createClaudeCodeAdapter;
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('coding-runtime');
// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
const adapters = new Map();
/**
 * Register a runtime adapter.
 */
function registerRuntime(adapter) {
    adapters.set(adapter.type, adapter);
    logger.info({ type: adapter.type }, 'Coding runtime registered');
}
/**
 * Get a runtime adapter by type.
 */
function getRuntime(type) {
    return adapters.get(type);
}
/**
 * List all registered runtime types.
 */
function listRuntimes() {
    return Array.from(adapters.keys());
}
function inferProviderFromModel(model) {
    const normalizedModel = model?.trim().toLowerCase();
    if (!normalizedModel) {
        return undefined;
    }
    if (normalizedModel.startsWith('openrouter/')) {
        return 'openrouter';
    }
    if (normalizedModel.startsWith('openai/')) {
        return 'openai';
    }
    if (normalizedModel.startsWith('anthropic/')) {
        return 'anthropic';
    }
    if (normalizedModel.startsWith('google/') || normalizedModel.startsWith('gemini-') || normalizedModel.startsWith('gemini/')) {
        return 'google';
    }
    return undefined;
}
function normalizeProvider(provider, model) {
    const normalizedProvider = provider?.trim().toLowerCase();
    switch (normalizedProvider) {
        case 'openrouter':
        case 'openai':
        case 'anthropic':
        case 'google':
        case 'gemini':
            return normalizedProvider;
        default:
            return inferProviderFromModel(model);
    }
}
function buildProviderKeys(provider, apiKey, model) {
    if (!apiKey) {
        return undefined;
    }
    const normalizedProvider = normalizeProvider(provider, model);
    if (!normalizedProvider) {
        return undefined;
    }
    return { [normalizedProvider]: apiKey };
}
const centralizedOpenCodeConfigs = new Map();
const opencodeExecutionModeByProject = new Map();
function shouldFallbackToLegacyOpencode(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up|Bad Gateway|502|503|504|timed out/i.test(message);
}
async function startLegacyOpenCodeSession(params) {
    const { startSession } = await Promise.resolve().then(() => __importStar(require('./opencode-connector.service.js')));
    const session = await startSession(params);
    opencodeExecutionModeByProject.set(params.projectId, 'legacy');
    return {
        id: session.id,
        projectId: params.projectId,
        sandboxId: params.sandboxId,
        threadId: params.threadId,
        runtimeType: 'opencode',
        status: session.status === 'ready' ? 'ready' : 'starting',
        createdAt: session.createdAt,
    };
}
async function sendLegacyOpenCodePrompt(params) {
    const { sendPrompt } = await Promise.resolve().then(() => __importStar(require('./opencode-connector.service.js')));
    return sendPrompt(params);
}
// ---------------------------------------------------------------------------
// OpenCode adapter
// ---------------------------------------------------------------------------
function createOpenCodeAdapter() {
    const useCentralized = process.env.OPENCODE_MODE === 'centralized' && !!process.env.OPENCODE_SERVICE_URL;
    return {
        type: 'opencode',
        async startSession(params) {
            const forceSandboxLocal = params.executionMode === 'sandbox-local';
            if (useCentralized && !forceSandboxLocal) {
                try {
                    const { getOrCreateSession } = await Promise.resolve().then(() => __importStar(require('./opencode-service-adapter.js')));
                    const session = await getOrCreateSession(params.projectId, {
                        directory: '/workspace',
                        title: `Project ${params.projectId}`,
                    });
                    centralizedOpenCodeConfigs.set(params.projectId, {
                        model: params.model,
                        providerKeys: buildProviderKeys(params.provider, params.apiKey, params.model),
                        sandboxId: params.sandboxId,
                        provider: params.provider,
                        apiKey: params.apiKey,
                    });
                    opencodeExecutionModeByProject.set(params.projectId, 'centralized');
                    return {
                        id: session.id,
                        projectId: params.projectId,
                        sandboxId: params.sandboxId,
                        threadId: params.threadId,
                        runtimeType: 'opencode',
                        status: 'ready',
                        createdAt: new Date(session.time.created).toISOString(),
                    };
                }
                catch (error) {
                    if (!shouldFallbackToLegacyOpencode(error)) {
                        throw error;
                    }
                    logger.warn({ err: error, projectId: params.projectId }, 'Centralized OpenCode session start failed; falling back to sandbox-local OpenCode');
                    centralizedOpenCodeConfigs.delete(params.projectId);
                    return startLegacyOpenCodeSession(params);
                }
            }
            return startLegacyOpenCodeSession(params);
        },
        async sendPrompt(params) {
            const executionMode = opencodeExecutionModeByProject.get(params.projectId);
            if (useCentralized && executionMode !== 'legacy') {
                const runtimeConfig = centralizedOpenCodeConfigs.get(params.projectId);
                try {
                    const { handleOpencodeServicePrompt } = await Promise.resolve().then(() => __importStar(require('./opencode-service-handler.js')));
                    const { createRecoderOpencodeClient } = await Promise.resolve().then(() => __importStar(require('@recoder/shared/opencode-client')));
                    const { daytonaReadFile, daytonaWriteFile } = await Promise.resolve().then(() => __importStar(require('../daytona-file-ops.js')));
                    const client = createRecoderOpencodeClient({
                        baseUrl: process.env.OPENCODE_SERVICE_URL,
                        password: process.env.OPENCODE_SERVER_PASSWORD,
                        username: process.env.OPENCODE_SERVER_USERNAME,
                    });
                    const result = await handleOpencodeServicePrompt({
                        projectId: params.projectId,
                        prompt: params.prompt,
                        model: runtimeConfig?.model,
                        providerKeys: runtimeConfig?.providerKeys,
                        directory: '/workspace',
                        sandboxId: runtimeConfig?.sandboxId,
                        readWorkspaceFile: async (path) => {
                            const content = await client.readFile(path, '/workspace');
                            return typeof content === 'string' ? content : JSON.stringify(content);
                        },
                        readSandboxFile: daytonaReadFile,
                        writeSandboxFile: daytonaWriteFile,
                    });
                    if (!result.syncedFiles?.length) {
                        throw new Error('Centralized OpenCode completed without detectable file sync');
                    }
                    const textParts = [
                        result.text,
                        result.syncedFiles.length ? `Files changed: ${result.syncedFiles.join(', ')}` : '',
                    ].filter(Boolean);
                    return {
                        messageId: result.raw?.info?.id || `opencode_${Date.now()}`,
                        parts: textParts.map((t) => ({ type: 'text', content: t })),
                    };
                }
                catch (error) {
                    if (!shouldFallbackToLegacyOpencode(error) && !/without detectable file sync/i.test(error instanceof Error ? error.message : String(error))) {
                        throw error;
                    }
                    logger.warn({ err: error, projectId: params.projectId }, 'Centralized OpenCode prompt failed or produced no synced edits; falling back to sandbox-local OpenCode');
                    if (!runtimeConfig?.sandboxId) {
                        throw error;
                    }
                    await startLegacyOpenCodeSession({
                        projectId: params.projectId,
                        sandboxId: runtimeConfig.sandboxId,
                        sandboxExecUrl: params.sandboxExecUrl,
                        daytonaApiKey: params.daytonaApiKey,
                        model: runtimeConfig.model,
                        provider: runtimeConfig.provider,
                        apiKey: runtimeConfig.apiKey,
                    });
                    return sendLegacyOpenCodePrompt(params);
                }
            }
            return sendLegacyOpenCodePrompt(params);
        },
        getState(projectId) {
            const executionMode = opencodeExecutionModeByProject.get(projectId);
            if (useCentralized && executionMode !== 'legacy') {
                // Dynamic import not usable in sync function — check session map
                try {
                    const adapter = require('./opencode-service-adapter.js');
                    const projects = adapter.getActiveProjects();
                    const match = projects.find((p) => p.projectId === projectId);
                    if (!match)
                        return undefined;
                    return {
                        id: match.sessionId,
                        projectId,
                        sandboxId: centralizedOpenCodeConfigs.get(projectId)?.sandboxId || projectId,
                        runtimeType: 'opencode',
                        status: 'ready',
                        createdAt: new Date().toISOString(),
                    };
                }
                catch {
                    return undefined;
                }
            }
            try {
                const { getSession } = require('./opencode-connector.service.js');
                const session = getSession(projectId);
                if (!session)
                    return undefined;
                return {
                    id: session.id,
                    projectId,
                    sandboxId: session.sandboxId,
                    runtimeType: 'opencode',
                    status: session.status,
                    createdAt: session.createdAt,
                };
            }
            catch {
                return undefined;
            }
        },
        async dispose(projectId) {
            const executionMode = opencodeExecutionModeByProject.get(projectId);
            if (useCentralized && executionMode !== 'legacy') {
                const { disposeProjectSession } = await Promise.resolve().then(() => __importStar(require('./opencode-service-adapter.js')));
                await disposeProjectSession(projectId);
                centralizedOpenCodeConfigs.delete(projectId);
                opencodeExecutionModeByProject.delete(projectId);
                return;
            }
            const { disposeSession, getSession } = await Promise.resolve().then(() => __importStar(require('./opencode-connector.service.js')));
            const session = getSession(projectId);
            opencodeExecutionModeByProject.delete(projectId);
            centralizedOpenCodeConfigs.delete(projectId);
            if (!session)
                return;
            await disposeSession({
                projectId,
                sandboxExecUrl: '',
                daytonaApiKey: '',
            });
        },
    };
}
// ---------------------------------------------------------------------------
// Native adapter (placeholder — current Recoder XML/action flow)
// ---------------------------------------------------------------------------
function createNativeAdapter() {
    return {
        type: 'native',
        async startSession(params) {
            return {
                id: `native_${Date.now().toString(36)}`,
                projectId: params.projectId,
                sandboxId: params.sandboxId,
                threadId: params.threadId,
                runtimeType: 'native',
                status: 'ready',
                createdAt: new Date().toISOString(),
            };
        },
        async sendPrompt(_params) {
            // Native mode: prompts go through the existing Recoder chat pipeline
            // This adapter is a passthrough — the actual work happens in server.ts
            return {
                messageId: `native_${Date.now()}`,
                parts: [{ type: 'text', content: 'Native mode: prompt handled by existing pipeline' }],
            };
        },
        getState(projectId) {
            return {
                id: `native_${projectId}`,
                projectId,
                sandboxId: projectId,
                runtimeType: 'native',
                status: 'ready',
                createdAt: new Date().toISOString(),
            };
        },
        async dispose(_projectId) {
            // Native mode has no persistent state to dispose
        },
    };
}
// ---------------------------------------------------------------------------
// OMO (oh-my-openagent) adapter
// ---------------------------------------------------------------------------
/**
 * Per-project session tracker for OMO. Unlike opencode which has durable
 * HTTP sessions, OMO is one-shot per subprocess invocation. We track a
 * virtual session ID for resumption semantics.
 */
const omoProjectSessions = new Map();
function createOmoAdapter() {
    return {
        type: 'omo',
        async startSession(params) {
            const sessionId = `omo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            omoProjectSessions.set(params.projectId, {
                sessionId,
                sandboxId: params.sandboxId,
                createdAt: new Date().toISOString(),
                model: params.model,
                providerKeys: buildProviderKeys(params.provider, params.apiKey, params.model),
            });
            return {
                id: sessionId,
                projectId: params.projectId,
                sandboxId: params.sandboxId,
                threadId: params.threadId,
                runtimeType: 'omo',
                status: 'ready',
                createdAt: new Date().toISOString(),
            };
        },
        async sendPrompt(params) {
            const { getOmoConnectorRuntime } = await Promise.resolve().then(() => __importStar(require('./omo-connector-runtime.service.js')));
            const runtime = getOmoConnectorRuntime();
            const session = omoProjectSessions.get(params.projectId);
            const result = await runtime.executeTask({
                taskId: `omo_task_${Date.now().toString(36)}`,
                prompt: params.prompt,
                model: session?.model,
                sessionId: session?.sessionId,
                continueSession: Boolean(session),
                providerKeys: session?.providerKeys,
            });
            // Update session ID if OMO returned a new one
            if (result.sessionId && session) {
                session.sessionId = result.sessionId;
            }
            return {
                messageId: result.taskId,
                parts: [
                    {
                        type: 'text',
                        content: result.resultText || (result.error ?? 'OMO returned no output'),
                    },
                ],
            };
        },
        getState(projectId) {
            const session = omoProjectSessions.get(projectId);
            if (!session)
                return undefined;
            return {
                id: session.sessionId,
                projectId,
                sandboxId: session.sandboxId,
                runtimeType: 'omo',
                status: 'ready',
                createdAt: session.createdAt,
            };
        },
        async dispose(projectId) {
            omoProjectSessions.delete(projectId);
        },
    };
}
// ---------------------------------------------------------------------------
// Codex adapter (wraps the real codex-connector-runtime.service)
// ---------------------------------------------------------------------------
const codexProjectSessions = new Map();
function createCodexAdapter() {
    return {
        type: 'codex',
        async startSession(params) {
            const sessionId = `codex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            codexProjectSessions.set(params.projectId, {
                taskId: sessionId,
                sandboxId: params.sandboxId,
                createdAt: new Date().toISOString(),
            });
            return {
                id: sessionId,
                projectId: params.projectId,
                sandboxId: params.sandboxId,
                threadId: params.threadId,
                runtimeType: 'codex',
                status: 'ready',
                createdAt: new Date().toISOString(),
            };
        },
        async sendPrompt(params) {
            const { getCodexConnectorRuntime } = await Promise.resolve().then(() => __importStar(require('./codex-connector-runtime.service.js')));
            const runtime = getCodexConnectorRuntime();
            if (!runtime.isRunning()) {
                try {
                    await runtime.start();
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return {
                        messageId: `codex_err_${Date.now()}`,
                        parts: [{ type: 'text', content: `Failed to start Codex connector: ${msg}` }],
                    };
                }
            }
            const taskId = `codex_task_${Date.now().toString(36)}`;
            const result = await runtime.executeTask({
                taskId,
                prompt: params.prompt,
                requester: {
                    id: 'docker-backend',
                    name: 'Docker Backend',
                    platform: 'custom',
                },
                workspaceId: params.projectId,
            });
            return {
                messageId: result.taskId,
                parts: [
                    {
                        type: 'text',
                        content: result.success
                            ? (result.resultText ?? '[codex returned no output]')
                            : `Codex task failed: ${result.error ?? 'unknown error'}`,
                    },
                ],
            };
        },
        getState(projectId) {
            const session = codexProjectSessions.get(projectId);
            if (!session)
                return undefined;
            return {
                id: session.taskId,
                projectId,
                sandboxId: session.sandboxId,
                runtimeType: 'codex',
                status: 'ready',
                createdAt: session.createdAt,
            };
        },
        async dispose(projectId) {
            codexProjectSessions.delete(projectId);
        },
    };
}
// ---------------------------------------------------------------------------
// Claude Code adapter (wraps the real claude-connector-runtime.service)
// ---------------------------------------------------------------------------
const claudeProjectSessions = new Map();
function createClaudeCodeAdapter() {
    return {
        type: 'claude-code',
        async startSession(params) {
            const sessionId = `claude_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            claudeProjectSessions.set(params.projectId, {
                taskId: sessionId,
                sandboxId: params.sandboxId,
                createdAt: new Date().toISOString(),
            });
            return {
                id: sessionId,
                projectId: params.projectId,
                sandboxId: params.sandboxId,
                threadId: params.threadId,
                runtimeType: 'claude-code',
                status: 'ready',
                createdAt: new Date().toISOString(),
            };
        },
        async sendPrompt(params) {
            const { getClaudeConnectorRuntime } = await Promise.resolve().then(() => __importStar(require('./claude-connector-runtime.service.js')));
            const runtime = getClaudeConnectorRuntime();
            if (!runtime.isRunning()) {
                try {
                    await runtime.start();
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    return {
                        messageId: `claude_err_${Date.now()}`,
                        parts: [{ type: 'text', content: `Failed to start Claude Code connector: ${msg}` }],
                    };
                }
            }
            const taskId = `claude_task_${Date.now().toString(36)}`;
            const result = await runtime.executeTask({
                taskId,
                prompt: params.prompt,
                requester: {
                    id: 'docker-backend',
                    name: 'Docker Backend',
                    platform: 'custom',
                },
                workspaceId: params.projectId,
            });
            return {
                messageId: result.taskId,
                parts: [
                    {
                        type: 'text',
                        content: result.success
                            ? (result.resultText ?? '[claude-code returned no output]')
                            : `Claude Code task failed: ${result.error ?? 'unknown error'}`,
                    },
                ],
            };
        },
        getState(projectId) {
            const session = claudeProjectSessions.get(projectId);
            if (!session)
                return undefined;
            return {
                id: session.taskId,
                projectId,
                sandboxId: session.sandboxId,
                runtimeType: 'claude-code',
                status: 'ready',
                createdAt: session.createdAt,
            };
        },
        async dispose(projectId) {
            claudeProjectSessions.delete(projectId);
        },
    };
}
// ---------------------------------------------------------------------------
// Auto-register on import
// ---------------------------------------------------------------------------
registerRuntime(createNativeAdapter());
registerRuntime(createOpenCodeAdapter());
registerRuntime(createOmoAdapter());
registerRuntime(createCodexAdapter());
registerRuntime(createClaudeCodeAdapter());
