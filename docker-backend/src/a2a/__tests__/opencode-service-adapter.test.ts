/**
 * Tests for opencode-service-adapter — HTTP client for centralized opencode.
 *
 * Uses vi.stubGlobal to mock fetch and verify the right endpoints are called
 * with the right payloads.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('opencode-service-adapter', () => {
  const ORIGINAL_URL = process.env.OPENCODE_SERVICE_URL;
  const ORIGINAL_PASS = process.env.OPENCODE_SERVER_PASSWORD;

  beforeEach(() => {
    process.env.OPENCODE_SERVICE_URL = 'http://opencode-test:4096';
    process.env.OPENCODE_SERVER_PASSWORD = 'test_password';
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.OPENCODE_SERVICE_URL;
    else process.env.OPENCODE_SERVICE_URL = ORIGINAL_URL;
    if (ORIGINAL_PASS === undefined) delete process.env.OPENCODE_SERVER_PASSWORD;
    else process.env.OPENCODE_SERVER_PASSWORD = ORIGINAL_PASS;
    vi.unstubAllGlobals();
  });

  describe('getOrCreateSession', () => {
    it('creates a new session when none exists', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'sess_new',
          title: 'Recoder project proj_1',
          version: 1,
          time: { created: 1_000, updated: 1_000 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const { getOrCreateSession } = await import('../opencode-service-adapter');
      const session = await getOrCreateSession('proj_1');

      expect(session.id).toBe('sess_new');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const call = mockFetch.mock.calls[0];
      const url = call[0] as string;
      const opts = call[1] as RequestInit;

      expect(url).toContain('/session');
      expect(opts.method).toBe('POST');
      expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect((opts.headers as Record<string, string>)['Authorization']).toContain('Basic ');

      const body = JSON.parse(opts.body as string);
      expect(body.title).toContain('proj_1');
    });

    it('reuses existing session for the same project', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            id: 'sess_reuse',
            version: 1,
            time: { created: 1_000, updated: 1_000 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            id: 'sess_reuse',
            version: 1,
            time: { created: 1_000, updated: 2_000 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        );
      vi.stubGlobal('fetch', mockFetch);

      const { getOrCreateSession } = await import('../opencode-service-adapter');
      const first = await getOrCreateSession('proj_reuse');
      const second = await getOrCreateSession('proj_reuse');

      expect(first.id).toBe('sess_reuse');
      expect(second.id).toBe('sess_reuse');
      // First call creates, second call fetches
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][1]?.method).toBe('POST');
      expect(mockFetch.mock.calls[1][1]?.method).toBe('GET');
    });
  });

  describe('promptProject', () => {
    it('sends prompt to the session after creating it', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            id: 'sess_prompt',
            version: 1,
            time: { created: 1_000, updated: 1_000 },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            info: { id: 'msg_1', sessionID: 'sess_prompt', role: 'assistant', time: { created: 2_000 } },
            parts: [{ id: 'p1', sessionID: 'sess_prompt', messageID: 'msg_1', type: 'text', text: 'Hello' }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        );
      vi.stubGlobal('fetch', mockFetch);

      const { promptProject } = await import('../opencode-service-adapter');
      const result = await promptProject('proj_prompt', { content: 'Hi there' });

      expect(result.info.id).toBe('msg_1');
      expect(result.parts).toHaveLength(1);

      // Second call should be the prompt POST
      const promptCall = mockFetch.mock.calls[1];
      const url = promptCall[0] as string;
      const body = JSON.parse((promptCall[1] as RequestInit).body as string);

      expect(url).toContain('/session/sess_prompt/message');
      expect(body.parts).toEqual([{ type: 'text', text: 'Hi there' }]);
    });
  });

  describe('setProviderKey', () => {
    it('calls PUT /auth/:providerID with API key', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const { setProviderKey } = await import('../opencode-service-adapter');
      await setProviderKey('openrouter', 'sk-or-test-123');

      const call = mockFetch.mock.calls[0];
      const url = call[0] as string;
      const opts = call[1] as RequestInit;

      expect(url).toContain('/auth/openrouter');
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body as string);
      expect(body.type).toBe('api_key');
      expect(body.token).toBe('sk-or-test-123');
    });
  });

  describe('isServiceHealthy', () => {
    it('returns true when /session responds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ));

      const { isServiceHealthy } = await import('../opencode-service-adapter');
      expect(await isServiceHealthy()).toBe(true);
    });

    it('returns false when /session fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

      const { isServiceHealthy } = await import('../opencode-service-adapter');
      expect(await isServiceHealthy()).toBe(false);
    });
  });

  describe('basic auth header', () => {
    it('includes Authorization header when password is set', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const { isServiceHealthy } = await import('../opencode-service-adapter');
      await isServiceHealthy();

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Basic ${Buffer.from('opencode:test_password').toString('base64')}`);
    });
  });
});
