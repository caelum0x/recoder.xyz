/**
 * Tests for opencode-service-handler — the extracted Deep Coding prompt
 * handler used by server.ts POST /api/opencode/:projectId and the A2A
 * connector route.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  promptProject: vi.fn(),
  setProviderKey: vi.fn(async () => true),
  getProjectDiff: vi.fn(async () => []),
  getProjectMessages: vi.fn(async () => []),
}));

vi.mock('../opencode-service-adapter', () => ({
  promptProject: mocks.promptProject,
  setProviderKey: mocks.setProviderKey,
  getProjectDiff: mocks.getProjectDiff,
  getProjectMessages: mocks.getProjectMessages,
}));

describe('opencode-service-handler', () => {
  beforeEach(() => {
    mocks.promptProject.mockReset();
    mocks.setProviderKey.mockReset();
    mocks.getProjectDiff.mockReset();
    mocks.getProjectMessages.mockReset();
    mocks.setProviderKey.mockImplementation(async () => true);
    mocks.getProjectDiff.mockImplementation(async () => []);
    mocks.getProjectMessages.mockImplementation(async () => []);
  });

  describe('forwardProviderKeys', () => {
    it('forwards all provided keys', async () => {
      const { forwardProviderKeys } = await import('../opencode-service-handler');

      await forwardProviderKeys({
        openrouter: 'sk-or-1',
        openai: 'sk-openai-1',
        anthropic: 'sk-ant-1',
        google: 'sk-google-1',
      });

      expect(mocks.setProviderKey).toHaveBeenCalledWith('openrouter', 'sk-or-1');
      expect(mocks.setProviderKey).toHaveBeenCalledWith('openai', 'sk-openai-1');
      expect(mocks.setProviderKey).toHaveBeenCalledWith('anthropic', 'sk-ant-1');
      expect(mocks.setProviderKey).toHaveBeenCalledWith('google', 'sk-google-1');
      expect(mocks.setProviderKey).toHaveBeenCalledTimes(4);
    });

    it('skips missing keys', async () => {
      const { forwardProviderKeys } = await import('../opencode-service-handler');

      await forwardProviderKeys({
        openrouter: 'sk-or-1',
        // openai missing
        anthropic: '',  // empty string should also be skipped
      });

      expect(mocks.setProviderKey).toHaveBeenCalledTimes(1);
      expect(mocks.setProviderKey).toHaveBeenCalledWith('openrouter', 'sk-or-1');
    });

    it('prefers google over gemini when both provided', async () => {
      const { forwardProviderKeys } = await import('../opencode-service-handler');

      await forwardProviderKeys({
        google: 'sk-google-priority',
        gemini: 'sk-gemini-fallback',
      });

      expect(mocks.setProviderKey).toHaveBeenCalledWith('google', 'sk-google-priority');
      expect(mocks.setProviderKey).toHaveBeenCalledTimes(1);
    });

    it('falls back to gemini when google is not provided', async () => {
      const { forwardProviderKeys } = await import('../opencode-service-handler');

      await forwardProviderKeys({
        gemini: 'sk-gemini-fallback',
      });

      expect(mocks.setProviderKey).toHaveBeenCalledWith('google', 'sk-gemini-fallback');
    });

    it('swallows setProviderKey errors', async () => {
      const { forwardProviderKeys } = await import('../opencode-service-handler');
      mocks.setProviderKey.mockRejectedValueOnce(new Error('service down'));

      // Should not throw
      await expect(
        forwardProviderKeys({ openrouter: 'sk-or-1', openai: 'sk-openai-1' }),
      ).resolves.toBeUndefined();

      // Second call should still have been attempted
      expect(mocks.setProviderKey).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when no keys provided', async () => {
      const { forwardProviderKeys } = await import('../opencode-service-handler');

      await forwardProviderKeys(undefined);
      expect(mocks.setProviderKey).not.toHaveBeenCalled();
    });
  });

  describe('extractResponseText', () => {
    it('joins text parts with double newlines', async () => {
      const { extractResponseText } = await import('../opencode-service-handler');

      const result = extractResponseText({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'First line' },
          { id: '2', sessionID: 's', messageID: 'm', type: 'text', text: 'Second line' },
        ],
      });

      expect(result).toBe('First line\n\nSecond line');
    });

    it('includes tool-result parts', async () => {
      const { extractResponseText } = await import('../opencode-service-handler');

      const result = extractResponseText({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Running tests' },
          { id: '2', sessionID: 's', messageID: 'm', type: 'tool-result', content: 'All passed' },
        ],
      });

      expect(result).toContain('Running tests');
      expect(result).toContain('All passed');
    });

    it('filters out non-text/non-tool-result parts', async () => {
      const { extractResponseText } = await import('../opencode-service-handler');

      const result = extractResponseText({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'Hello' },
          { id: '2', sessionID: 's', messageID: 'm', type: 'tool-call', name: 'edit' },
          { id: '3', sessionID: 's', messageID: 'm', type: 'step-start', title: 'Phase 1' },
        ],
      });

      expect(result).toBe('Hello');
    });

    it('handles empty parts array', async () => {
      const { extractResponseText } = await import('../opencode-service-handler');

      const result = extractResponseText({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [],
      });

      expect(result).toBe('');
    });

    it('uses text field if present, falls back to content field', async () => {
      const { extractResponseText } = await import('../opencode-service-handler');

      const result = extractResponseText({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          { id: '1', sessionID: 's', messageID: 'm', type: 'text', text: 'From text field' },
          { id: '2', sessionID: 's', messageID: 'm', type: 'text', content: 'From content field' },
        ],
      });

      expect(result).toContain('From text field');
      expect(result).toContain('From content field');
    });
  });

  describe('handleOpencodeServicePrompt', () => {
    it('returns success with sessionId and extracted text', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'msg_1', sessionID: 'sess_handler', role: 'assistant', time: { created: 1000 } },
        parts: [
          { id: 'p1', sessionID: 'sess_handler', messageID: 'msg_1', type: 'text', text: 'Fixed the bug' },
        ],
      });

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      const result = await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'Fix the failing test',
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('sess_handler');
      expect(result.text).toBe('Fixed the bug');
      expect(result.output).toContain('sess_handler');
      expect(result.raw.info.id).toBe('msg_1');
    });

    it('forwards BYOK keys before calling promptProject', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [],
      });

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'test',
        providerKeys: {
          openrouter: 'sk-or',
          anthropic: 'sk-ant',
        },
      });

      expect(mocks.setProviderKey).toHaveBeenCalledWith('openrouter', 'sk-or');
      expect(mocks.setProviderKey).toHaveBeenCalledWith('anthropic', 'sk-ant');
      // Verify order: keys forwarded BEFORE prompt
      const keyCallOrder = mocks.setProviderKey.mock.invocationCallOrder[0];
      const promptCallOrder = mocks.promptProject.mock.invocationCallOrder[0];
      expect(keyCallOrder).toBeLessThan(promptCallOrder);
    });

    it('passes provider/model override in prompt input', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [],
      });

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'test',
        model: 'openrouter/anthropic/claude-sonnet-4.5',
      });

      expect(mocks.promptProject).toHaveBeenCalledWith(
        'proj_1',
        expect.objectContaining({
          content: 'test',
          providerID: 'openrouter',
          modelID: 'anthropic/claude-sonnet-4.5',
        }),
        expect.any(Object),
      );
    });

    it('syncs files discovered from text parts when diff metadata is empty', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          {
            type: 'text',
            text: 'Created `/workspace/hello.txt` with content "hello".',
          },
        ],
      });
      mocks.getProjectDiff.mockResolvedValueOnce([]);
      const readWorkspaceFile = vi.fn().mockResolvedValue('hello');
      const writeSandboxFile = vi.fn().mockResolvedValue(undefined);

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      const result = await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'test',
        sandboxId: 'sbx_1',
        readWorkspaceFile,
        writeSandboxFile,
      });

      expect(readWorkspaceFile).toHaveBeenCalledWith('hello.txt');
      expect(writeSandboxFile).toHaveBeenCalledWith('sbx_1', 'hello.txt', 'hello');
      expect(result.syncedFiles).toEqual(['hello.txt']);
    });

    it('syncs files from patch parts that expose a files array', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'm_patch', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          {
            id: 'p_patch',
            sessionID: 's',
            messageID: 'm_patch',
            type: 'patch',
            hash: 'abc123',
            files: ['src/App.tsx'],
          },
        ],
      });

      const readWorkspaceFile = vi.fn().mockResolvedValue('updated app');
      const writeSandboxFile = vi.fn().mockResolvedValue(undefined);

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      const result = await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'update app',
        sandboxId: 'sbx_1',
        readWorkspaceFile,
        writeSandboxFile,
      });

      expect(readWorkspaceFile).toHaveBeenCalledWith('src/App.tsx');
      expect(writeSandboxFile).toHaveBeenCalledWith('sbx_1', 'src/App.tsx', 'updated app');
      expect(result.syncedFiles).toEqual(['src/App.tsx']);
    });

    it('syncs files from current tool parts using state.input metadata', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'm_tool', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          {
            id: 'p_tool',
            sessionID: 's',
            messageID: 'm_tool',
            type: 'tool',
            tool: 'write',
            state: {
              status: 'completed',
              input: {
                filePath: '/workspace/src/App.tsx',
              },
            },
          },
        ],
      });

      const readWorkspaceFile = vi.fn().mockResolvedValue('tool output');
      const writeSandboxFile = vi.fn().mockResolvedValue(undefined);

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      const result = await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'update app',
        sandboxId: 'sbx_1',
        readWorkspaceFile,
        writeSandboxFile,
      });

      expect(readWorkspaceFile).toHaveBeenCalledWith('src/App.tsx');
      expect(writeSandboxFile).toHaveBeenCalledWith('sbx_1', 'src/App.tsx', 'tool output');
      expect(result.syncedFiles).toEqual(['src/App.tsx']);
    });

    it('loads the canonical stored message when the immediate response omits patch metadata', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'm_hist', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [
          { id: 'reasoning', sessionID: 's', messageID: 'm_hist', type: 'reasoning', text: 'Thinking...' },
        ],
      });
      mocks.getProjectMessages.mockResolvedValueOnce([
        {
          info: { id: 'm_hist', sessionID: 's', role: 'assistant', time: { created: 0 } },
          parts: [
            {
              id: 'p_hist',
              sessionID: 's',
              messageID: 'm_hist',
              type: 'patch',
              hash: 'hist123',
              files: ['src/main.ts'],
            },
          ],
        },
      ]);

      const readWorkspaceFile = vi.fn().mockResolvedValue('history output');
      const writeSandboxFile = vi.fn().mockResolvedValue(undefined);

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      const result = await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'update main',
        sandboxId: 'sbx_1',
        readWorkspaceFile,
        writeSandboxFile,
      });

      expect(mocks.getProjectMessages).toHaveBeenCalledWith('proj_1');
      expect(readWorkspaceFile).toHaveBeenCalledWith('src/main.ts');
      expect(writeSandboxFile).toHaveBeenCalledWith('sbx_1', 'src/main.ts', 'history output');
      expect(result.syncedFiles).toEqual(['src/main.ts']);
    });

    it('passes directory option to promptProject', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'm', sessionID: 's', role: 'assistant', time: { created: 0 } },
        parts: [],
      });

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      await handleOpencodeServicePrompt({
        projectId: 'proj_1',
        prompt: 'test',
        directory: '/custom/workspace',
      });

      expect(mocks.promptProject).toHaveBeenCalledWith(
        'proj_1',
        expect.any(Object),
        expect.objectContaining({ directory: '/custom/workspace' }),
      );
    });

    it('propagates promptProject errors', async () => {
      mocks.promptProject.mockRejectedValueOnce(new Error('opencode unreachable'));

      const { handleOpencodeServicePrompt } = await import('../opencode-service-handler');
      await expect(
        handleOpencodeServicePrompt({ projectId: 'proj_1', prompt: 'test' }),
      ).rejects.toThrow('opencode unreachable');
    });
  });
});
