/**
 * @module rest-adapter.test
 *
 * Tests for the REST protocol adapter.
 * P17-001: REST Protocol Adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../task-lifecycle.service', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}-test-id`),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  RestAdapter,
  buildEnvelope,
  registerRestAdapter,
  getRestAdapter,
  listRestAdapters,
  unregisterRestAdapter,
  resetRestAdapters,
  type RestAdapterConfig,
} from '../adapters/rest-adapter';

import type { RecoderAgentIdentity } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const localIdentity: RecoderAgentIdentity = {
  id: 'docker-backend',
  name: 'Docker Backend',
  platform: 'recoder_backend',
};

const targetAgent: RecoderAgentIdentity = {
  id: 'replit-agent',
  name: 'Replit Agent',
  platform: 'custom',
};

function createConfig(overrides?: Partial<RestAdapterConfig>): RestAdapterConfig {
  return {
    adapterId: 'test-rest',
    baseUrl: 'http://localhost:9999',
    auth: { type: 'none' },
    timeoutMs: 5_000,
    maxRetries: 1,
    retryDelayMs: 100,
    maxRetryDelayMs: 500,
    localIdentity,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RestAdapter', () => {
  let adapter: RestAdapter;

  beforeEach(() => {
    resetRestAdapters();
    adapter = new RestAdapter(createConfig());
    // Reset global fetch mock
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetRestAdapters();
  });

  // -----------------------------------------------------------------------
  // Construction and state
  // -----------------------------------------------------------------------

  it('creates adapter with correct initial state', () => {
    const state = adapter.getState();
    expect(state.adapterId).toBe('test-rest');
    expect(state.status).toBe('idle');
    expect(state.baseUrl).toBe('http://localhost:9999');
    expect(state.totalRequests).toBe(0);
    expect(state.totalErrors).toBe(0);
    expect(state.lastRequestAt).toBeNull();
    expect(state.lastErrorAt).toBeNull();
    expect(state.lastHealthCheck).toBeNull();
  });

  it('exposes adapterId and status', () => {
    expect(adapter.adapterId).toBe('test-rest');
    expect(adapter.status).toBe('idle');
  });

  // -----------------------------------------------------------------------
  // buildEnvelope helper
  // -----------------------------------------------------------------------

  it('builds a valid A2A envelope', () => {
    const envelope = buildEnvelope(
      localIdentity,
      targetAgent,
      'execute',
      [{ kind: 'text', text: 'hello' }],
      'thread-1',
      { foo: 'bar' },
    );

    expect(envelope.from).toEqual(localIdentity);
    expect(envelope.to).toEqual(targetAgent);
    expect(envelope.intent).toBe('execute');
    expect(envelope.payload).toHaveLength(1);
    expect(envelope.payload[0]).toEqual({ kind: 'text', text: 'hello' });
    expect(envelope.threadId).toBe('thread-1');
    expect(envelope.metadata).toEqual({ foo: 'bar' });
    expect(envelope.messageId).toBe('msg-test-id');
    expect(envelope.envelopeVersion).toBeTruthy();
    expect(envelope.protocolVersion).toBeTruthy();
    expect(envelope.createdAt).toBeTruthy();
  });

  it('generates threadId when not provided', () => {
    const envelope = buildEnvelope(localIdentity, targetAgent, 'plan', []);
    expect(envelope.threadId).toBe('thread-test-id');
  });

  // -----------------------------------------------------------------------
  // sendEnvelope — success
  // -----------------------------------------------------------------------

  it('sends envelope and returns success result', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ result: 'Task completed' }),
      text: async () => '{"result":"Task completed"}',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', [{ kind: 'text', text: 'test' }]);
    const result = await adapter.sendEnvelope(envelope);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ result: 'Task completed' });
    expect(result.resultText).toBe('Task completed');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.attempts).toBe(1);

    // Verify fetch was called correctly
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe('http://localhost:9999/a2a/envelope');
    expect(opts?.method).toBe('POST');
    expect(opts?.body).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // sendEnvelope — custom path
  // -----------------------------------------------------------------------

  it('sends to custom path', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    await adapter.sendEnvelope(envelope, { path: '/custom/endpoint' });

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe('http://localhost:9999/custom/endpoint');
  });

  // -----------------------------------------------------------------------
  // sendEnvelope — 4xx non-retryable
  // -----------------------------------------------------------------------

  it('returns failure on 4xx without retrying', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Invalid payload' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    const result = await adapter.sendEnvelope(envelope);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.error).toContain('400');
    expect(result.attempts).toBe(1);
    // Should NOT retry on 4xx
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // sendEnvelope — 5xx retryable
  // -----------------------------------------------------------------------

  it('retries on 5xx and eventually returns failure', async () => {
    const mockResponse = {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'content-type': 'text/plain' }),
      json: async () => { throw new Error('not json'); },
      text: async () => 'Server overloaded',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    const result = await adapter.sendEnvelope(envelope);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2); // 1 initial + 1 retry
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // sendEnvelope — network error with retry
  // -----------------------------------------------------------------------

  it('retries on network error then succeeds', async () => {
    const failResponse = () => Promise.reject(new Error('ECONNREFUSED'));
    const successResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ text: 'Done' }),
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(failResponse)
      .mockResolvedValueOnce(successResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    const result = await adapter.sendEnvelope(envelope);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.resultText).toBe('Done');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // executeTask — convenience method
  // -----------------------------------------------------------------------

  it('executeTask builds envelope and sends', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ result: 'Done' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const result = await adapter.executeTask({
      targetAgent,
      taskId: 'task-001',
      prompt: 'Fix the bug',
    });

    expect(result.success).toBe(true);

    // Verify the body contains an envelope
    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(opts?.body as string);
    expect(body.from).toEqual(localIdentity);
    expect(body.to).toEqual(targetAgent);
    expect(body.intent).toBe('execute');
    expect(body.payload[0].text).toBe('Fix the bug');
    expect(body.metadata?.taskId).toBe('task-001');
  });

  // -----------------------------------------------------------------------
  // Auth headers
  // -----------------------------------------------------------------------

  it('sends bearer auth header', async () => {
    const authedAdapter = new RestAdapter(createConfig({
      auth: { type: 'bearer', token: 'my-token' },
    }));

    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    await authedAdapter.sendEnvelope(envelope);

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer my-token');
  });

  it('sends API key auth header', async () => {
    const authedAdapter = new RestAdapter(createConfig({
      auth: { type: 'api-key', headerName: 'X-Api-Key', key: 'secret-123' },
    }));

    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    await authedAdapter.sendEnvelope(envelope);

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers['X-Api-Key']).toBe('secret-123');
  });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  it('health check returns reachable on 200', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const health = await adapter.checkHealth();

    expect(health.reachable).toBe(true);
    expect(health.statusCode).toBe(200);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.checkedAt).toBeTruthy();

    // State should update
    expect(adapter.status).toBe('active');
    expect(adapter.getState().lastHealthCheck).toBeTruthy();
  });

  it('health check returns unreachable on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const health = await adapter.checkHealth();

    expect(health.reachable).toBe(false);
    expect(health.error).toBe('ECONNREFUSED');
    expect(adapter.status).toBe('unreachable');
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  it('emits request.start and request.success events', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const startEvents: unknown[] = [];
    const successEvents: unknown[] = [];
    adapter.on('request.start', (e) => startEvents.push(e));
    adapter.on('request.success', (e) => successEvents.push(e));

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    await adapter.sendEnvelope(envelope);

    expect(startEvents).toHaveLength(1);
    expect(successEvents).toHaveLength(1);
  });

  it('emits request.error event on all retries exhausted', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const errorEvents: unknown[] = [];
    adapter.on('request.error', (e) => errorEvents.push(e));

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    await adapter.sendEnvelope(envelope);

    expect(errorEvents).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // State tracking
  // -----------------------------------------------------------------------

  it('tracks request and error counts', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fail'));

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    await adapter.sendEnvelope(envelope);
    await adapter.sendEnvelope(envelope);

    const state = adapter.getState();
    expect(state.totalRequests).toBe(2);
    expect(state.totalErrors).toBe(2);
    expect(state.lastRequestAt).toBeTruthy();
    expect(state.lastErrorAt).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // GET request
  // -----------------------------------------------------------------------

  it('getJson sends GET request', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ agents: [] }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const result = await adapter.getJson('http://localhost:9999/api/agents');

    expect(result.success).toBe(true);
    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(opts?.method).toBe('GET');
    expect(opts?.body).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Registry
  // -----------------------------------------------------------------------

  it('registers and retrieves adapters', () => {
    registerRestAdapter(adapter);
    expect(getRestAdapter('test-rest')).toBe(adapter);
    expect(listRestAdapters()).toHaveLength(1);

    unregisterRestAdapter('test-rest');
    expect(getRestAdapter('test-rest')).toBeUndefined();
    expect(listRestAdapters()).toHaveLength(0);
  });

  it('resetRestAdapters clears all', () => {
    registerRestAdapter(adapter);
    registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'test-rest-2' })));
    expect(listRestAdapters()).toHaveLength(2);

    resetRestAdapters();
    expect(listRestAdapters()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 429 retry
  // -----------------------------------------------------------------------

  it('retries on 429 (rate limited)', async () => {
    const rateLimitResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'content-type': 'text/plain' }),
      json: async () => { throw new Error('not json'); },
      text: async () => 'Rate limited',
    };
    const successResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ result: 'ok' }),
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimitResponse as Response)
      .mockResolvedValueOnce(successResponse as Response);

    const envelope = buildEnvelope(localIdentity, targetAgent, 'execute', []);
    const result = await adapter.sendEnvelope(envelope);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });
});
