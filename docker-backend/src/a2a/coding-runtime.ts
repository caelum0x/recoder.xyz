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

const logger = createLogger('coding-runtime');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuntimeType = 'native' | 'opencode' | 'codex' | 'claude-code';

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
// OpenCode adapter
// ---------------------------------------------------------------------------

export function createOpenCodeAdapter(): RuntimeAdapter {
  const useCentralized = !!process.env.OPENCODE_SERVICE_URL;

  return {
    type: 'opencode',

    async startSession(params: StartSessionParams): Promise<CodingSession> {
      if (useCentralized) {
        const { getOrCreateSession } = await import('./opencode-service-adapter.js');
        const session = await getOrCreateSession(params.projectId, {
          directory: '/workspace',
          title: `Project ${params.projectId}`,
        });
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

      const { startSession } = await import('./opencode-connector.service.js');
      const session = await startSession(params);
      return {
        id: session.id,
        projectId: params.projectId,
        sandboxId: params.sandboxId,
        threadId: params.threadId,
        runtimeType: 'opencode',
        status: session.status === 'ready' ? 'ready' : 'starting',
        createdAt: session.createdAt,
      };
    },

    async sendPrompt(params: SendPromptParams): Promise<PromptResult> {
      if (useCentralized) {
        const { promptProject } = await import('./opencode-service-adapter.js');
        const result = await promptProject(params.projectId, {
          content: params.prompt,
          agent: params.agent,
        });

        const textParts = result.parts
          .filter((p: Record<string, unknown>) => p.type === 'text')
          .map((p: Record<string, unknown>) => String(p.text || p.content || ''))
          .filter(Boolean);

        return {
          messageId: result.info.id,
          parts: textParts.map((t: string) => ({ type: 'text' as const, content: t })),
        };
      }

      const { sendPrompt } = await import('./opencode-connector.service.js');
      return sendPrompt(params);
    },

    getState(projectId: string): CodingSession | undefined {
      if (useCentralized) {
        // Dynamic import not usable in sync function — check session map
        try {
          const adapter = require('./opencode-service-adapter.js');
          const projects = adapter.getActiveProjects();
          const match = projects.find((p: { projectId: string }) => p.projectId === projectId);
          if (!match) return undefined;
          return {
            id: match.sessionId,
            projectId,
            sandboxId: projectId,
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
      if (useCentralized) {
        const { disposeProjectSession } = await import('./opencode-service-adapter.js');
        await disposeProjectSession(projectId);
        return;
      }

      const { disposeSession, getSession } = await import('./opencode-connector.service.js');
      const session = getSession(projectId);
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
// Auto-register on import
// ---------------------------------------------------------------------------

registerRuntime(createNativeAdapter());
registerRuntime(createOpenCodeAdapter());
