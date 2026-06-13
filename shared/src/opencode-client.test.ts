/**
 * Tests for the shared opencode HTTP client.
 *
 * This client is used by any package that needs to talk to an opencode
 * HTTP service — docker-backend, recoder-agents, etc.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecoderOpencodeClient } from './opencode-client';

describe('opencode-client', () => {
  const baseUrl = 'http://opencode-test:4096';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ping', () => {
    it('returns true when /session responds ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      expect(await client.ping()).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('returns false on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('network'));
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      expect(await client.ping()).toBe(false);
    });

    it('returns false on non-2xx status', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      expect(await client.ping()).toBe(false);
    });
  });

  describe('createSession', () => {
    it('POSTs /session with title and optional parent', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'sess_1',
            version: 1,
            time: { created: 1_000, updated: 1_000 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      const session = await client.createSession({ directory: '/workspace', title: 'My Session' });

      expect(session.id).toBe('sess_1');
      const call = mockFetch.mock.calls[0];
      const url = new URL(call[0] as string);
      const opts = call[1] as RequestInit;

      expect(url.pathname).toBe('/session');
      expect(url.searchParams.get('directory')).toBe('/workspace');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body as string);
      expect(body.title).toBe('My Session');
    });
  });

  describe('prompt', () => {
    it('POSTs /session/:id/message with prompt content', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            info: { id: 'msg_1', sessionID: 'sess_1', role: 'assistant', time: { created: 2_000 } },
            parts: [{ id: 'p1', sessionID: 'sess_1', messageID: 'msg_1', type: 'text' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      const result = await client.prompt('sess_1', { content: 'Fix the bug' });

      expect(result.info.id).toBe('msg_1');
      const call = mockFetch.mock.calls[0];
      const url = new URL(call[0] as string);
      expect(url.pathname).toBe('/session/sess_1/message');

      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.parts).toEqual([{ type: 'text', text: 'Fix the bug' }]);
    });

    it('throws a clear error when a JSON response is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      await expect(client.prompt('sess_1', { content: 'Fix the bug' })).rejects.toThrow(
        /returned empty JSON body/,
      );
    });
  });

  describe('readFile', () => {
    it('reads file content from /file/content and unwraps the content field', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'text',
            content: 'export const ready = true;\n',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      const content = await client.readFile('src/app.ts', '/workspace');

      expect(content).toBe('export const ready = true;\n');
      const call = mockFetch.mock.calls[0];
      const url = new URL(call[0] as string);
      expect(url.pathname).toBe('/file/content');
      expect(url.searchParams.get('path')).toBe('src/app.ts');
      expect(url.searchParams.get('directory')).toBe('/workspace');
    });
  });

  describe('basic auth', () => {
    it('adds Authorization header when password is set', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({
        baseUrl,
        password: 'secret123',
        fetchFn: mockFetch,
      });

      await client.ping();

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBeTruthy();
      expect(headers.Authorization).toMatch(/^Basic /);
    });

    it('uses custom username', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({
        baseUrl,
        username: 'alice',
        password: 'secret',
        fetchFn: mockFetch,
      });

      await client.ping();

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
      const expected = btoa('alice:secret');
      expect(headers.Authorization).toBe(`Basic ${expected}`);
    });

    it('omits Authorization when no password', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      await client.ping();

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('setAuth', () => {
    it('PUTs /auth/:providerID with credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      await client.setAuth('openrouter', { type: 'api_key', token: 'sk-or-123' });

      const call = mockFetch.mock.calls[0];
      const url = new URL(call[0] as string);
      const opts = call[1] as RequestInit;

      expect(url.pathname).toBe('/auth/openrouter');
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body as string);
      expect(body.type).toBe('api_key');
      expect(body.token).toBe('sk-or-123');
    });
  });

  describe('abortSession', () => {
    it('POSTs /session/:id/abort', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      await client.abortSession('sess_abort');

      const call = mockFetch.mock.calls[0];
      const url = new URL(call[0] as string);
      expect(url.pathname).toBe('/session/sess_abort/abort');
      expect((call[1] as RequestInit).method).toBe('POST');
    });
  });

  describe('deleteSession', () => {
    it('DELETEs /session/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      await client.deleteSession('sess_del');

      const call = mockFetch.mock.calls[0];
      const url = new URL(call[0] as string);
      expect(url.pathname).toBe('/session/sess_del');
      expect((call[1] as RequestInit).method).toBe('DELETE');
    });
  });

  describe('listSessions', () => {
    it('supports query params for filters', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      await client.listSessions({ roots: true, search: 'fix', limit: 10 });

      const call = mockFetch.mock.calls[0];
      const url = new URL(call[0] as string);
      expect(url.searchParams.get('roots')).toBe('true');
      expect(url.searchParams.get('search')).toBe('fix');
      expect(url.searchParams.get('limit')).toBe('10');
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
      const client = createRecoderOpencodeClient({ baseUrl, fetchFn: mockFetch });

      await expect(client.getSession('missing')).rejects.toThrow(/404/);
    });
  });
});
