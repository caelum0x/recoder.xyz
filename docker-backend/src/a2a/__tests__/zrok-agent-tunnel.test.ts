/**
 * Tests for zrok-agent-tunnel — inbox push notification system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerAgentEndpoint,
  deregisterAgentEndpoint,
  getAgentEndpoint,
  listAgentEndpoints,
  pushToAgent,
} from '../zrok-agent-tunnel';

describe('zrok-agent-tunnel', () => {
  beforeEach(() => {
    // Clear endpoints before each test
    for (const e of listAgentEndpoints()) {
      deregisterAgentEndpoint(e.agentId);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('registerAgentEndpoint', () => {
    it('registers a callback URL for an agent', () => {
      registerAgentEndpoint('agent_1', 'http://localhost:8080/inbox');
      const endpoint = getAgentEndpoint('agent_1');

      expect(endpoint).toBeTruthy();
      expect(endpoint?.agentId).toBe('agent_1');
      expect(endpoint?.callbackUrl).toBe('http://localhost:8080/inbox');
      expect(endpoint?.pushCount).toBe(0);
      expect(endpoint?.failCount).toBe(0);
    });

    it('supports optional sessionId', () => {
      registerAgentEndpoint('agent_2', 'http://localhost:8080', 'sess_abc');
      const endpoint = getAgentEndpoint('agent_2');
      expect(endpoint?.sessionId).toBe('sess_abc');
    });

    it('overwrites previous registration for same agentId', () => {
      registerAgentEndpoint('agent_3', 'http://localhost:8080/v1');
      registerAgentEndpoint('agent_3', 'http://localhost:8080/v2');

      const endpoint = getAgentEndpoint('agent_3');
      expect(endpoint?.callbackUrl).toBe('http://localhost:8080/v2');
      expect(listAgentEndpoints().filter((e) => e.agentId === 'agent_3')).toHaveLength(1);
    });
  });

  describe('deregisterAgentEndpoint', () => {
    it('removes a registered endpoint', () => {
      registerAgentEndpoint('agent_4', 'http://localhost:8080');
      expect(getAgentEndpoint('agent_4')).toBeTruthy();

      deregisterAgentEndpoint('agent_4');
      expect(getAgentEndpoint('agent_4')).toBeUndefined();
    });

    it('is a no-op for unknown agent', () => {
      expect(() => deregisterAgentEndpoint('unknown')).not.toThrow();
    });
  });

  describe('pushToAgent', () => {
    it('returns false when no endpoint registered', async () => {
      const ok = await pushToAgent('no_endpoint', { type: 'test', data: {} });
      expect(ok).toBe(false);
    });

    it('POSTs event to callback URL on success', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response('ok', { status: 200 }),
      );
      vi.stubGlobal('fetch', mockFetch);

      registerAgentEndpoint('agent_push', 'http://localhost:8080/inbox');
      const ok = await pushToAgent('agent_push', {
        type: 'inbox.new',
        data: { message: 'hello' },
      });

      expect(ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:8080/inbox');
      const opts = call[1] as RequestInit;
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body as string);
      expect(body.type).toBe('inbox.new');
      expect(body.data.message).toBe('hello');
    });

    it('increments pushCount on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));

      registerAgentEndpoint('agent_count', 'http://localhost:8080/inbox');
      await pushToAgent('agent_count', { type: 'test', data: {} });
      await pushToAgent('agent_count', { type: 'test', data: {} });

      const endpoint = getAgentEndpoint('agent_count');
      expect(endpoint?.pushCount).toBe(2);
      expect(endpoint?.failCount).toBe(0);
    });

    it('increments failCount on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 500 })));

      registerAgentEndpoint('agent_fail', 'http://localhost:8080/inbox');
      const ok = await pushToAgent('agent_fail', { type: 'test', data: {} });

      expect(ok).toBe(false);
      const endpoint = getAgentEndpoint('agent_fail');
      expect(endpoint?.failCount).toBe(1);
    });

    it('increments failCount on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

      registerAgentEndpoint('agent_err', 'http://localhost:8080/inbox');
      const ok = await pushToAgent('agent_err', { type: 'test', data: {} });

      expect(ok).toBe(false);
      const endpoint = getAgentEndpoint('agent_err');
      expect(endpoint?.failCount).toBe(1);
    });
  });

  describe('listAgentEndpoints', () => {
    it('returns all registered endpoints', () => {
      registerAgentEndpoint('agent_a', 'http://localhost:8080');
      registerAgentEndpoint('agent_b', 'http://localhost:8081');
      registerAgentEndpoint('agent_c', 'http://localhost:8082');

      const all = listAgentEndpoints();
      expect(all).toHaveLength(3);
      expect(all.map((e) => e.agentId).sort()).toEqual(['agent_a', 'agent_b', 'agent_c']);
    });

    it('returns empty array when none registered', () => {
      expect(listAgentEndpoints()).toHaveLength(0);
    });
  });
});
