/**
 * Tests for coding-runtime — the abstraction layer for coding runtimes
 * (native, opencode, codex, claude-code).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerRuntime,
  getRuntime,
  listRuntimes,
  createNativeAdapter,
  createOpenCodeAdapter,
  type RuntimeAdapter,
  type StartSessionParams,
  type SendPromptParams,
} from '../coding-runtime';

describe('coding-runtime', () => {
  describe('registry', () => {
    it('lists registered runtimes', () => {
      const runtimes = listRuntimes();
      // All 5 runtimes are auto-registered on module import
      expect(runtimes).toContain('native');
      expect(runtimes).toContain('opencode');
      expect(runtimes).toContain('omo');
      expect(runtimes).toContain('codex');
      expect(runtimes).toContain('claude-code');
    });

    it('codex adapter is registered with full implementation', () => {
      const codex = getRuntime('codex');
      expect(codex).toBeDefined();
      expect(codex?.type).toBe('codex');
      expect(typeof codex?.startSession).toBe('function');
      expect(typeof codex?.sendPrompt).toBe('function');
      expect(typeof codex?.getState).toBe('function');
      expect(typeof codex?.dispose).toBe('function');
    });

    it('claude-code adapter is registered with full implementation', () => {
      const claude = getRuntime('claude-code');
      expect(claude).toBeDefined();
      expect(claude?.type).toBe('claude-code');
      expect(typeof claude?.startSession).toBe('function');
      expect(typeof claude?.sendPrompt).toBe('function');
      expect(typeof claude?.getState).toBe('function');
      expect(typeof claude?.dispose).toBe('function');
    });

    it('codex startSession tracks project state', async () => {
      const codex = getRuntime('codex')!;
      const session = await codex.startSession({
        projectId: 'proj_codex_test',
        sandboxId: 'sbx_1',
        sandboxExecUrl: 'http://test/exec',
        daytonaApiKey: 'key',
      });
      expect(session.runtimeType).toBe('codex');
      expect(session.projectId).toBe('proj_codex_test');

      const state = codex.getState('proj_codex_test');
      expect(state?.runtimeType).toBe('codex');

      await codex.dispose('proj_codex_test');
      expect(codex.getState('proj_codex_test')).toBeUndefined();
    });

    it('claude-code startSession tracks project state', async () => {
      const claude = getRuntime('claude-code')!;
      const session = await claude.startSession({
        projectId: 'proj_claude_test',
        sandboxId: 'sbx_1',
        sandboxExecUrl: 'http://test/exec',
        daytonaApiKey: 'key',
      });
      expect(session.runtimeType).toBe('claude-code');
      expect(session.projectId).toBe('proj_claude_test');

      const state = claude.getState('proj_claude_test');
      expect(state?.runtimeType).toBe('claude-code');

      await claude.dispose('proj_claude_test');
      expect(claude.getState('proj_claude_test')).toBeUndefined();
    });

    it('getRuntime returns the registered adapter', () => {
      const native = getRuntime('native');
      expect(native).toBeDefined();
      expect(native?.type).toBe('native');

      const opencode = getRuntime('opencode');
      expect(opencode).toBeDefined();
      expect(opencode?.type).toBe('opencode');
    });

    it('returns undefined for unknown runtime', () => {
      const unknown = getRuntime('doesnotexist' as never);
      expect(unknown).toBeUndefined();
    });

    it('allows registering custom adapters', () => {
      const custom: RuntimeAdapter = {
        type: 'codex',
        async startSession(params: StartSessionParams) {
          return {
            id: 'codex_test',
            projectId: params.projectId,
            sandboxId: params.sandboxId,
            runtimeType: 'codex',
            status: 'ready' as const,
            createdAt: new Date().toISOString(),
          };
        },
        async sendPrompt(_params: SendPromptParams) {
          return {
            messageId: 'msg_codex_1',
            parts: [{ type: 'text', content: 'codex response' }],
          };
        },
        getState() {
          return undefined;
        },
        async dispose() {
          // no-op
        },
      };

      registerRuntime(custom);
      const fetched = getRuntime('codex');
      expect(fetched?.type).toBe('codex');
    });
  });

  describe('native adapter', () => {
    const adapter = createNativeAdapter();

    it('has type "native"', () => {
      expect(adapter.type).toBe('native');
    });

    it('startSession returns a ready session', async () => {
      const session = await adapter.startSession({
        projectId: 'proj_native',
        sandboxId: 'sbx_1',
        sandboxExecUrl: 'http://test/exec',
        daytonaApiKey: 'key',
      });

      expect(session.projectId).toBe('proj_native');
      expect(session.sandboxId).toBe('sbx_1');
      expect(session.runtimeType).toBe('native');
      expect(session.status).toBe('ready');
      expect(session.id).toMatch(/^native_/);
    });

    it('sendPrompt returns passthrough message', async () => {
      const result = await adapter.sendPrompt({
        projectId: 'proj_native',
        prompt: 'hello',
        sandboxExecUrl: 'http://test/exec',
        daytonaApiKey: 'key',
      });

      expect(result.messageId).toMatch(/^native_/);
      expect(result.parts[0].type).toBe('text');
    });

    it('getState returns session info', () => {
      const state = adapter.getState('proj_native_state');
      expect(state?.runtimeType).toBe('native');
      expect(state?.status).toBe('ready');
      expect(state?.projectId).toBe('proj_native_state');
    });

    it('dispose is a no-op', async () => {
      await expect(adapter.dispose('proj_any')).resolves.toBeUndefined();
    });
  });

  describe('opencode adapter', () => {
    const ORIGINAL_URL = process.env.OPENCODE_SERVICE_URL;

    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      if (ORIGINAL_URL === undefined) delete process.env.OPENCODE_SERVICE_URL;
      else process.env.OPENCODE_SERVICE_URL = ORIGINAL_URL;
      vi.unstubAllGlobals();
    });

    it('has type "opencode"', () => {
      const adapter = createOpenCodeAdapter();
      expect(adapter.type).toBe('opencode');
    });

    it('uses centralized service when OPENCODE_SERVICE_URL is set', async () => {
      process.env.OPENCODE_SERVICE_URL = 'http://opencode-test:4096';

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          id: 'sess_centralized',
          version: 1,
          time: { created: 1_000, updated: 1_000 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const { createOpenCodeAdapter: freshCreateOpenCodeAdapter } = await import('../coding-runtime');
      const adapter = freshCreateOpenCodeAdapter();

      const session = await adapter.startSession({
        projectId: 'proj_centralized',
        sandboxId: 'sbx_1',
        sandboxExecUrl: 'http://test/exec',
        daytonaApiKey: 'key',
      });

      expect(session.runtimeType).toBe('opencode');
      expect(session.status).toBe('ready');
      expect(session.id).toBe('sess_centralized');
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
