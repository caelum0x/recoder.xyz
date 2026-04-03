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
  return {
    type: 'opencode',

    async startSession(params: StartSessionParams): Promise<CodingSession> {
      const { startSession } = await import('./opencode-connector.service');
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
      const { sendPrompt } = await import('./opencode-connector.service');
      return sendPrompt(params);
    },

    getState(projectId: string): CodingSession | undefined {
      const { getSession } = require('./opencode-connector.service');
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
    },

    async dispose(projectId: string): Promise<void> {
      const { disposeSession, getSession } = await import('./opencode-connector.service');
      const session = getSession(projectId);
      if (!session) return;
      await disposeSession({
        projectId,
        sandboxExecUrl: '', // Caller should provide
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
