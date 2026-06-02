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

import { createLogger } from '../logger';
import type { PromptResult } from './opencode-connector.service';
import type { OmoProviderKeys } from './omo-connector-runtime.service';

const logger = createLogger('coding-runtime');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuntimeType =
  | 'native'
  | 'opencode'
  | 'codex'
  | 'claude-code'
  | 'omo'
  | 'qwen-code'
  | 'gemini-cli';

export interface CodingSession {
  id: string;
  projectId: string;
  sandboxId: string;
  threadId?: string;
  runtimeType: RuntimeType;
  status: 'starting' | 'ready' | 'busy' | 'disposed';
  createdAt: string;
}

export interface RuntimeAdapter {
  type: RuntimeType;
  startSession(params: StartSessionParams): Promise<CodingSession>;
  sendPrompt(params: SendPromptParams): Promise<PromptResult>;
  getState(projectId: string): CodingSession | undefined;
  dispose(projectId: string): Promise<void>;
}

export interface StartSessionParams {
  projectId: string;
  threadId?: string;
  sandboxId: string;
  sandboxExecUrl: string;
  daytonaApiKey: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  executionMode?: 'centralized' | 'sandbox-local';
}

export interface SendPromptParams {
  projectId: string;
  prompt: string;
  sandboxExecUrl: string;
  daytonaApiKey: string;
  agent?: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters = new Map<RuntimeType, RuntimeAdapter>();

/**
 * Register a runtime adapter.
 */
export function registerRuntime(adapter: RuntimeAdapter): void {
  adapters.set(adapter.type, adapter);
  logger.info({ type: adapter.type }, 'Coding runtime registered');
}

/**
 * Get a runtime adapter by type.
 */
export function getRuntime(type: RuntimeType): RuntimeAdapter | undefined {
  return adapters.get(type);
}

/**
 * List all registered runtime types.
 */
export function listRuntimes(): RuntimeType[] {
  return Array.from(adapters.keys());
}

// ---------------------------------------------------------------------------
// Runtime catalog (product-facing metadata)
// ---------------------------------------------------------------------------

export interface RuntimeCatalogEntry {
  type: RuntimeType;
  /** Product display name. */
  label: string;
  /** One-line description for pickers/tooltips. */
  description: string;
  /** Upstream open-source project this backend is built on, if any. */
  basedOn?: string;
  /** Whether the adapter is registered and selectable right now. */
  available: boolean;
}

const RUNTIME_CATALOG: Record<RuntimeType, Omit<RuntimeCatalogEntry, 'available'>> = {
  native: {
    type: 'native',
    label: 'Recoder Native',
    description: 'Fast built-in XML/action pipeline — best for quick, well-scoped edits.',
  },
  opencode: {
    type: 'opencode',
    label: 'OpenCode',
    description: 'Durable terminal coding agent with a broad tool surface.',
    basedOn: 'anomalyco/opencode',
  },
  codex: {
    type: 'codex',
    label: 'Codex',
    description: 'OpenAI Codex CLI agent for autonomous multi-step coding.',
    basedOn: 'openai/codex',
  },
  'claude-code': {
    type: 'claude-code',
    label: 'Claude Code',
    description: 'Anthropic Claude Code — strong at investigation and root-cause debugging.',
  },
  omo: {
    type: 'omo',
    label: 'OMO',
    description: 'Lightweight, fast runtime for short, well-scoped tasks.',
  },
  'qwen-code': {
    type: 'qwen-code',
    label: 'Qwen Code',
    description: 'Cost-efficient terminal coding agent powered by Qwen3-Coder.',
    basedOn: 'QwenLM/qwen-code',
  },
  'gemini-cli': {
    type: 'gemini-cli',
    label: 'Gemini CLI',
    description: 'Large-context terminal agent with generous throughput, ideal for docs and big refactors.',
    basedOn: 'google-gemini/gemini-cli',
  },
};

/**
 * Product-facing catalog of coding runtimes, annotated with whether each is
 * currently registered/selectable. Used by `/api/coding-runtime/runtimes` so
 * UIs can render branded, described backend choices.
 */
export function getRuntimeCatalog(): RuntimeCatalogEntry[] {
  const registered = new Set(listRuntimes());
  return (Object.keys(RUNTIME_CATALOG) as RuntimeType[]).map((type) => ({
    ...RUNTIME_CATALOG[type],
    available: registered.has(type),
  }));
}

type RuntimeProviderKey = keyof OmoProviderKeys;

interface StoredRuntimeConfig {
  model?: string;
  providerKeys?: OmoProviderKeys;
  sandboxId?: string;
  provider?: string;
  apiKey?: string;
}

function inferProviderFromModel(model?: string): RuntimeProviderKey | undefined {
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

function normalizeProvider(provider?: string, model?: string): RuntimeProviderKey | undefined {
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

function buildProviderKeys(provider?: string, apiKey?: string, model?: string): OmoProviderKeys | undefined {
  if (!apiKey) {
    return undefined;
  }

  const normalizedProvider = normalizeProvider(provider, model);
  if (!normalizedProvider) {
    return undefined;
  }

  return { [normalizedProvider]: apiKey };
}

const centralizedOpenCodeConfigs = new Map<string, StoredRuntimeConfig>();
const opencodeExecutionModeByProject = new Map<string, 'centralized' | 'legacy'>();

function shouldFallbackToLegacyOpencode(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up|Bad Gateway|502|503|504|timed out/i.test(message);
}

async function startLegacyOpenCodeSession(params: StartSessionParams): Promise<CodingSession> {
  const { startSession } = await import('./opencode-connector.service.js');
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

async function sendLegacyOpenCodePrompt(params: SendPromptParams): Promise<PromptResult> {
  const { sendPrompt } = await import('./opencode-connector.service.js');
  return sendPrompt(params);
}

// ---------------------------------------------------------------------------
// OpenCode adapter
// ---------------------------------------------------------------------------

export function createOpenCodeAdapter(): RuntimeAdapter {
  const useCentralized = process.env.OPENCODE_MODE === 'centralized' && !!process.env.OPENCODE_SERVICE_URL;

  return {
    type: 'opencode',

    async startSession(params: StartSessionParams): Promise<CodingSession> {
      const forceSandboxLocal = params.executionMode === 'sandbox-local';

      if (useCentralized && !forceSandboxLocal) {
        try {
          const { getOrCreateSession } = await import('./opencode-service-adapter.js');
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
        } catch (error) {
          if (!shouldFallbackToLegacyOpencode(error)) {
            throw error;
          }

          logger.warn(
            { err: error, projectId: params.projectId },
            'Centralized OpenCode session start failed; falling back to sandbox-local OpenCode',
          );
          centralizedOpenCodeConfigs.delete(params.projectId);
          return startLegacyOpenCodeSession(params);
        }
      }

      return startLegacyOpenCodeSession(params);
    },

    async sendPrompt(params: SendPromptParams): Promise<PromptResult> {
      const executionMode = opencodeExecutionModeByProject.get(params.projectId);

      if (useCentralized && executionMode !== 'legacy') {
        const runtimeConfig = centralizedOpenCodeConfigs.get(params.projectId);

        try {
          const { handleOpencodeServicePrompt } = await import('./opencode-service-handler.js');
          const { createRecoderOpencodeClient } = await import('@recoder/shared/opencode-client');
          const { daytonaReadFile, daytonaWriteFile } = await import('../daytona-file-ops.js');
          const client = createRecoderOpencodeClient({
            baseUrl: process.env.OPENCODE_SERVICE_URL!,
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
            readWorkspaceFile: async (path: string) => {
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
            messageId: (result.raw as { info?: { id?: string } } | undefined)?.info?.id || `opencode_${Date.now()}`,
            parts: textParts.map((t: string) => ({ type: 'text' as const, content: t })),
          };
        } catch (error) {
          if (!shouldFallbackToLegacyOpencode(error) && !/without detectable file sync/i.test(error instanceof Error ? error.message : String(error))) {
            throw error;
          }

          logger.warn(
            { err: error, projectId: params.projectId },
            'Centralized OpenCode prompt failed or produced no synced edits; falling back to sandbox-local OpenCode',
          );

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

    getState(projectId: string): CodingSession | undefined {
      const executionMode = opencodeExecutionModeByProject.get(projectId);

      if (useCentralized && executionMode !== 'legacy') {
        // Dynamic import not usable in sync function — check session map
        try {
          const adapter = require('./opencode-service-adapter.js');
          const projects = adapter.getActiveProjects();
          const match = projects.find((p: { projectId: string }) => p.projectId === projectId);
          if (!match) return undefined;
          return {
            id: match.sessionId,
            projectId,
            sandboxId: centralizedOpenCodeConfigs.get(projectId)?.sandboxId || projectId,
            runtimeType: 'opencode',
            status: 'ready',
            createdAt: new Date().toISOString(),
          };
        } catch {
          return undefined;
        }
      }

      try {
        const { getSession } = require('./opencode-connector.service.js');
        const session = getSession(projectId);
        if (!session) return undefined;
        return {
          id: session.id,
          projectId,
          sandboxId: session.sandboxId,
          runtimeType: 'opencode',
          status: session.status,
          createdAt: session.createdAt,
        };
      } catch {
        return undefined;
      }
    },

    async dispose(projectId: string): Promise<void> {
      const executionMode = opencodeExecutionModeByProject.get(projectId);

      if (useCentralized && executionMode !== 'legacy') {
        const { disposeProjectSession } = await import('./opencode-service-adapter.js');
        await disposeProjectSession(projectId);
        centralizedOpenCodeConfigs.delete(projectId);
        opencodeExecutionModeByProject.delete(projectId);
        return;
      }

      const { disposeSession, getSession } = await import('./opencode-connector.service.js');
      const session = getSession(projectId);
      opencodeExecutionModeByProject.delete(projectId);
      centralizedOpenCodeConfigs.delete(projectId);
      if (!session) return;
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

export function createNativeAdapter(): RuntimeAdapter {
  return {
    type: 'native',

    async startSession(params: StartSessionParams): Promise<CodingSession> {
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

    async sendPrompt(_params: SendPromptParams): Promise<PromptResult> {
      // Native mode: prompts go through the existing Recoder chat pipeline
      // This adapter is a passthrough — the actual work happens in server.ts
      return {
        messageId: `native_${Date.now()}`,
        parts: [{ type: 'text', content: 'Native mode: prompt handled by existing pipeline' }],
      };
    },

    getState(projectId: string): CodingSession | undefined {
      return {
        id: `native_${projectId}`,
        projectId,
        sandboxId: projectId,
        runtimeType: 'native',
        status: 'ready',
        createdAt: new Date().toISOString(),
      };
    },

    async dispose(_projectId: string): Promise<void> {
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
const omoProjectSessions = new Map<string, {
  sessionId: string;
  sandboxId: string;
  createdAt: string;
  model?: string;
  providerKeys?: OmoProviderKeys;
}>();

export function createOmoAdapter(): RuntimeAdapter {
  return {
    type: 'omo',

    async startSession(params: StartSessionParams): Promise<CodingSession> {
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

    async sendPrompt(params: SendPromptParams): Promise<PromptResult> {
      const { getOmoConnectorRuntime } = await import('./omo-connector-runtime.service.js');
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

    getState(projectId: string): CodingSession | undefined {
      const session = omoProjectSessions.get(projectId);
      if (!session) return undefined;
      return {
        id: session.sessionId,
        projectId,
        sandboxId: session.sandboxId,
        runtimeType: 'omo',
        status: 'ready',
        createdAt: session.createdAt,
      };
    },

    async dispose(projectId: string): Promise<void> {
      omoProjectSessions.delete(projectId);
    },
  };
}

// ---------------------------------------------------------------------------
// Codex adapter (wraps the real codex-connector-runtime.service)
// ---------------------------------------------------------------------------

const codexProjectSessions = new Map<string, { taskId: string; sandboxId: string; createdAt: string }>();

export function createCodexAdapter(): RuntimeAdapter {
  return {
    type: 'codex',

    async startSession(params: StartSessionParams): Promise<CodingSession> {
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

    async sendPrompt(params: SendPromptParams): Promise<PromptResult> {
      const { getCodexConnectorRuntime } = await import('./codex-connector-runtime.service.js');
      const runtime = getCodexConnectorRuntime();

      if (!runtime.isRunning()) {
        try {
          await runtime.start();
        } catch (err) {
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

    getState(projectId: string): CodingSession | undefined {
      const session = codexProjectSessions.get(projectId);
      if (!session) return undefined;
      return {
        id: session.taskId,
        projectId,
        sandboxId: session.sandboxId,
        runtimeType: 'codex',
        status: 'ready',
        createdAt: session.createdAt,
      };
    },

    async dispose(projectId: string): Promise<void> {
      codexProjectSessions.delete(projectId);
    },
  };
}

// ---------------------------------------------------------------------------
// Claude Code adapter (wraps the real claude-connector-runtime.service)
// ---------------------------------------------------------------------------

const claudeProjectSessions = new Map<string, { taskId: string; sandboxId: string; createdAt: string }>();

export function createClaudeCodeAdapter(): RuntimeAdapter {
  return {
    type: 'claude-code',

    async startSession(params: StartSessionParams): Promise<CodingSession> {
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

    async sendPrompt(params: SendPromptParams): Promise<PromptResult> {
      const { getClaudeConnectorRuntime } = await import('./claude-connector-runtime.service.js');
      const runtime = getClaudeConnectorRuntime();

      if (!runtime.isRunning()) {
        try {
          await runtime.start();
        } catch (err) {
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

    getState(projectId: string): CodingSession | undefined {
      const session = claudeProjectSessions.get(projectId);
      if (!session) return undefined;
      return {
        id: session.taskId,
        projectId,
        sandboxId: session.sandboxId,
        runtimeType: 'claude-code',
        status: 'ready',
        createdAt: session.createdAt,
      };
    },

    async dispose(projectId: string): Promise<void> {
      claudeProjectSessions.delete(projectId);
    },
  };
}

// ---------------------------------------------------------------------------
// CLI agent adapters (Qwen Code / Gemini CLI) — sandbox-local terminal agents
// ---------------------------------------------------------------------------

function createCliAgentAdapter(kind: 'qwen-code' | 'gemini-cli'): RuntimeAdapter {
  const cliSessions = new Map<string, CodingSession>();

  return {
    type: kind,

    async startSession(params: StartSessionParams): Promise<CodingSession> {
      const { startCliAgentSession } = await import('./cli-agent-runtime.service.js');
      const session = await startCliAgentSession({
        kind,
        projectId: params.projectId,
        sandboxId: params.sandboxId,
        model: params.model,
        provider: params.provider,
        apiKey: params.apiKey,
      });

      const coding: CodingSession = {
        id: session.id,
        projectId: params.projectId,
        sandboxId: params.sandboxId,
        threadId: params.threadId,
        runtimeType: kind,
        status: session.status === 'ready' ? 'ready' : 'starting',
        createdAt: session.createdAt,
      };
      cliSessions.set(params.projectId, coding);
      return coding;
    },

    async sendPrompt(params: SendPromptParams): Promise<PromptResult> {
      const { sendCliAgentPrompt } = await import('./cli-agent-runtime.service.js');
      return sendCliAgentPrompt({
        kind,
        projectId: params.projectId,
        prompt: params.prompt,
      });
    },

    getState(projectId: string): CodingSession | undefined {
      return cliSessions.get(projectId);
    },

    async dispose(projectId: string): Promise<void> {
      const { disposeCliAgentSession } = await import('./cli-agent-runtime.service.js');
      disposeCliAgentSession(kind, projectId);
      cliSessions.delete(projectId);
    },
  };
}

export function createQwenCodeAdapter(): RuntimeAdapter {
  return createCliAgentAdapter('qwen-code');
}

export function createGeminiCliAdapter(): RuntimeAdapter {
  return createCliAgentAdapter('gemini-cli');
}

// ---------------------------------------------------------------------------
// Auto-register on import
// ---------------------------------------------------------------------------

registerRuntime(createNativeAdapter());
registerRuntime(createOpenCodeAdapter());
registerRuntime(createOmoAdapter());
registerRuntime(createCodexAdapter());
registerRuntime(createClaudeCodeAdapter());
registerRuntime(createQwenCodeAdapter());
registerRuntime(createGeminiCliAdapter());
