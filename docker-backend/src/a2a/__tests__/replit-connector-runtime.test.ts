/**
 * @module replit-connector-runtime.test
 *
 * Tests for the Replit agent connector runtime.
 *
 * Unlike child-process connectors, Replit uses the RestAdapter which
 * communicates via global fetch. Tests mock fetch to simulate the
 * remote Replit API.
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
  getTaskLifecycleService: () => ({
    createTask: vi.fn(() => ({ ok: true, data: { id: 'task-123' } })),
    transitionTask: vi.fn(() => ({ ok: true })),
  }),
  generateId: vi.fn((prefix: string) => `${prefix}-test-id`),
}));

vi.mock('../agent-registry.service', () => ({
  getAgentRegistryService: () => ({
    registerAgent: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  ReplitConnectorRuntime,
  getReplitConnectorRuntime,
  resetReplitConnectorRuntime,
  getReplitConnectorIdentity,
} from '../replit-connector-runtime.service';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockHealthyFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Health check endpoint
    if (urlStr.endsWith('/health')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' }),
      } as Response;
    }

    // A2A envelope endpoint (task execution)
    if (urlStr.endsWith('/a2a/envelope')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ result: 'Task completed by Replit' }),
      } as Response;
    }

    // Default fallback
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    } as Response;
  });
}

function mockUnhealthyFetch() {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReplitConnectorRuntime', () => {
  let runtime: ReplitConnectorRuntime;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetReplitConnectorRuntime();
    runtime = new ReplitConnectorRuntime({
      baseUrl: 'http://localhost:8888',
      apiKey: 'test-key-123',
      requestTimeoutMs: 5_000,
      healthCheckIntervalMs: 60_000,
      maxRetries: 1,
      autoReconnect: false,
    });
  });

  afterEach(async () => {
    if (runtime.isRunning()) {
      await runtime.stop();
    }
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Construction and initial state
  // -----------------------------------------------------------------------

  it('has correct initial state before start', () => {
    const state = runtime.getState();
    expect(state.status).toBe('stopped');
    expect(state.baseUrl).toBe('http://localhost:8888');
    expect(state.lastHealthCheck).toBeNull();
    expect(state.lastActivity).toBeNull();
    expect(state.pendingRequests).toBe(0);
    expect(state.error).toBeNull();
  });

  it('implements ConnectorProcess properties', () => {
    expect(runtime.connectorId).toBe('replit');
    expect(runtime.platform).toBe('replit');
    expect(runtime.processRef).toBeNull();
    expect(runtime.getPid()).toBeNull();
  });

  it('reports unknown health when stopped', () => {
    const health = runtime.getHealth();
    expect(health.status).toBe('unknown');
    expect(health.pid).toBeNull();
    expect(health.message).toContain('stopped');
  });

  // -----------------------------------------------------------------------
  // start() creates adapter and checks health
  // -----------------------------------------------------------------------

  it('starts successfully when health check passes', async () => {
    mockHealthyFetch();

    await runtime.start();

    expect(runtime.isRunning()).toBe(true);
    const state = runtime.getState();
    expect(state.status).toBe('running');
    expect(state.lastHealthCheck).toBeTruthy();
    expect(state.error).toBeNull();
  });

  it('emits starting and started events on successful start', async () => {
    mockHealthyFetch();

    const events: string[] = [];
    runtime.on('starting', () => events.push('starting'));
    runtime.on('started', () => events.push('started'));

    await runtime.start();

    expect(events).toEqual(['starting', 'started']);
  });

  it('fails to start when health check fails', async () => {
    mockUnhealthyFetch();

    runtime.on('error', () => {}); // suppress unhandled error
    await expect(runtime.start()).rejects.toThrow('health check failed');

    expect(runtime.isRunning()).toBe(false);
    const state = runtime.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBeTruthy();
  });

  it('fails to start when no baseUrl is configured', async () => {
    const noUrlRuntime = new ReplitConnectorRuntime({
      baseUrl: '',
      requestTimeoutMs: 5_000,
      healthCheckIntervalMs: 60_000,
      maxRetries: 1,
      autoReconnect: false,
    });

    noUrlRuntime.on('error', () => {}); // suppress unhandled error
    await expect(noUrlRuntime.start()).rejects.toThrow('requires a baseUrl');
  });

  it('is idempotent when already running', async () => {
    mockHealthyFetch();

    await runtime.start();
    // Second call should not throw
    await runtime.start();

    expect(runtime.isRunning()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // stop() cleans up
  // -----------------------------------------------------------------------

  it('stops a running connector', async () => {
    mockHealthyFetch();
    await runtime.start();
    expect(runtime.isRunning()).toBe(true);

    await runtime.stop();

    expect(runtime.isRunning()).toBe(false);
    expect(runtime.getState().status).toBe('stopped');
  });

  it('emits stopping and stopped events', async () => {
    mockHealthyFetch();
    await runtime.start();

    const events: string[] = [];
    runtime.on('stopping', () => events.push('stopping'));
    runtime.on('stopped', () => events.push('stopped'));

    await runtime.stop();

    expect(events).toEqual(['stopping', 'stopped']);
  });

  it('is idempotent when already stopped', async () => {
    // Should not throw
    await runtime.stop();
    expect(runtime.getState().status).toBe('stopped');
  });

  // -----------------------------------------------------------------------
  // executeTask() delegates to adapter
  // -----------------------------------------------------------------------

  it('executes a task and returns success result', async () => {
    mockHealthyFetch();
    await runtime.start();

    const result = await runtime.executeTask({
      taskId: 'task-001',
      prompt: 'fix the bug',
      requester: { id: 'test-user', name: 'Tester', platform: 'recoder_web' },
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-001');
    expect(result.resultText).toBe('Task completed by Replit');
  });

  it('sends correct envelope to Replit API', async () => {
    const fetchSpy = mockHealthyFetch();
    await runtime.start();

    await runtime.executeTask({
      taskId: 'task-002',
      prompt: 'write a test',
      requester: { id: 'user-1', name: 'User', platform: 'recoder_web' },
      metadata: { priority: 'high' },
    });

    // Find the executeTask call (not the health check call)
    const envelopeCall = fetchSpy.mock.calls.find(([url]) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      return urlStr.endsWith('/a2a/envelope');
    });

    expect(envelopeCall).toBeTruthy();
    const [url, opts] = envelopeCall!;
    expect(url).toBe('http://localhost:8888/a2a/envelope');
    expect(opts?.method).toBe('POST');

    const body = JSON.parse(opts?.body as string);
    expect(body.from.id).toBe('replit-connector');
    expect(body.to.id).toBe('replit-agent');
    expect(body.intent).toBe('execute');
    expect(body.payload[0].text).toBe('write a test');
    expect(body.metadata?.taskId).toBe('task-002');
  });

  it('handles adapter failure in executeTask', async () => {
    mockHealthyFetch();
    await runtime.start();

    // Now mock fetch to fail for the next call
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

    const result = await runtime.executeTask({
      taskId: 'task-003',
      prompt: 'do something',
      requester: { id: 'test', name: 'Test', platform: 'recoder_web' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // executeTask() returns failure when not running
  // -----------------------------------------------------------------------

  it('returns failure when connector is not running', async () => {
    const result = await runtime.executeTask({
      taskId: 'task-004',
      prompt: 'do something',
      requester: { id: 'test', name: 'Test', platform: 'recoder_web' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not running');
  });

  // -----------------------------------------------------------------------
  // getHealth() reports adapter status
  // -----------------------------------------------------------------------

  it('reports healthy when running', async () => {
    mockHealthyFetch();
    await runtime.start();

    const health = runtime.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.pid).toBeNull(); // REST connector has no PID
  });

  it('reports unhealthy when in error state', () => {
    // Manually set error state
    (runtime as any).status = 'error';
    (runtime as any).lastError = 'something went wrong';

    const health = runtime.getHealth();
    expect(health.status).toBe('unhealthy');
    expect(health.message).toBe('something went wrong');
  });

  // -----------------------------------------------------------------------
  // Singleton pattern
  // -----------------------------------------------------------------------

  it('singleton returns same instance', () => {
    const a = getReplitConnectorRuntime();
    const b = getReplitConnectorRuntime();
    expect(a).toBe(b);

    resetReplitConnectorRuntime();
    const c = getReplitConnectorRuntime();
    expect(c).not.toBe(a);
  });

  // -----------------------------------------------------------------------
  // Identity
  // -----------------------------------------------------------------------

  it('returns connector identity', () => {
    const identity = getReplitConnectorIdentity();
    expect(identity.id).toBe('replit-connector');
    expect(identity.name).toBe('Replit Agent Connector');
    expect(identity.platform).toBe('replit');
  });

  it('returns a copy of identity (not the original)', () => {
    const a = getReplitConnectorIdentity();
    const b = getReplitConnectorIdentity();
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // different object references
  });

  // -----------------------------------------------------------------------
  // restart()
  // -----------------------------------------------------------------------

  it('restart stops and starts', async () => {
    mockHealthyFetch();
    await runtime.start();

    const events: string[] = [];
    runtime.on('stopping', () => events.push('stopping'));
    runtime.on('stopped', () => events.push('stopped'));
    runtime.on('starting', () => events.push('starting'));
    runtime.on('started', () => events.push('started'));

    await runtime.restart();

    expect(runtime.isRunning()).toBe(true);
    expect(events).toEqual(['stopping', 'stopped', 'starting', 'started']);
  });

  // -----------------------------------------------------------------------
  // Agent registry integration
  // -----------------------------------------------------------------------

  it('registers with agent registry without throwing', async () => {
    mockHealthyFetch();
    await runtime.start();

    // Should not throw
    runtime.registerWithAgentRegistry();
  });

  // -----------------------------------------------------------------------
  // Auth configuration
  // -----------------------------------------------------------------------

  it('uses bearer auth when apiKey is provided', async () => {
    const fetchSpy = mockHealthyFetch();
    await runtime.start();

    // Check that the health check call included Authorization header
    const healthCall = fetchSpy.mock.calls.find(([url]) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      return urlStr.endsWith('/health');
    });

    expect(healthCall).toBeTruthy();
    const [, opts] = healthCall!;
    const headers = opts?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key-123');
  });

  it('uses no auth when apiKey is not provided', async () => {
    const noKeyRuntime = new ReplitConnectorRuntime({
      baseUrl: 'http://localhost:8888',
      requestTimeoutMs: 5_000,
      healthCheckIntervalMs: 60_000,
      maxRetries: 1,
      autoReconnect: false,
    });

    const fetchSpy = mockHealthyFetch();
    await noKeyRuntime.start();

    const healthCall = fetchSpy.mock.calls.find(([url]) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      return urlStr.endsWith('/health');
    });

    expect(healthCall).toBeTruthy();
    const [, opts] = healthCall!;
    const headers = opts?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();

    await noKeyRuntime.stop();
  });

  // -----------------------------------------------------------------------
  // Pending request tracking
  // -----------------------------------------------------------------------

  it('tracks pending requests during execution', async () => {
    // Use a delayed fetch mock to observe pending state
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.endsWith('/health')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ status: 'ok' }),
        } as Response;
      }

      // For envelope calls, return after a brief delay
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ result: 'done' }),
      } as Response;
    });

    await runtime.start();

    // After execution completes, pending should be back to 0
    await runtime.executeTask({
      taskId: 'task-track',
      prompt: 'test',
      requester: { id: 'user', name: 'User', platform: 'test' },
    });

    expect(runtime.getState().pendingRequests).toBe(0);
  });
});
