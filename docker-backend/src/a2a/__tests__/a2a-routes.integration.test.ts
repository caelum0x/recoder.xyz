import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const codexRuntime = {
    isRunning: vi.fn(() => false),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    getState: vi.fn(() => ({ status: 'stopped', pid: null, startedAt: null, lastActivity: null })),
    executeTask: vi.fn(async () => ({ taskId: 't1', success: true, resultText: 'ok', raw: {} })),
    getTaskStatus: vi.fn(async () => ({ state: 'working' })),
    cancelTask: vi.fn(async () => ({ cancelled: true })),
    respondToApproval: vi.fn(async () => ({ ok: true })),
  };

  const claudeRuntime = {
    isRunning: vi.fn(() => false),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    registerWithAgentRegistry: vi.fn(() => undefined),
    getState: vi.fn(() => ({ status: 'stopped', pid: null, startedAt: null, lastActivity: null, tools: [] })),
    getTools: vi.fn(() => [{ name: 'Task', description: 'Execute task', inputSchema: { type: 'object' } }]),
    refreshTools: vi.fn(async () => [{ name: 'Task', description: 'Execute task', inputSchema: { type: 'object' } }]),
    executeTask: vi.fn(async () => ({ taskId: 't1', success: true, resultText: 'ok', envelope: {} })),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  };

  const monitor = {
    getAllConnectorsHealth: vi.fn(() => ({
      connectors: [],
      summary: { total: 0, running: 0, stopped: 0, circuitOpen: 0 },
      timestamp: new Date().toISOString(),
    })),
    isRegistered: vi.fn(() => false),
    getConnectorHealth: vi.fn((id: string) => ({ connectorId: id, circuit: { state: 'closed' } })),
    restartConnector: vi.fn(async () => undefined),
    resetCircuit: vi.fn(() => undefined),
    getCircuitStatus: vi.fn(() => ({ state: 'closed', failures: 0 })),
  };

  const fakePattern = {
    patternType: 'direct-handoff',
    execute: vi.fn(async () => ({
      success: true,
      patternType: 'direct-handoff',
      taskIds: ['tsk_a', 'tsk_b'],
      metadata: { taskAId: 'tsk_a', taskBId: 'tsk_b' },
    })),
  };

  const patternRegistry = {
    list: vi.fn(() => ['direct-handoff', 'supervisor', 'competitive']),
    getDetails: vi.fn(() => ([
      { type: 'direct-handoff', description: 'A->B handoff' },
      { type: 'supervisor', description: 'Supervisor orchestration' },
      { type: 'competitive', description: 'Agents race' },
    ])),
    get: vi.fn((type: string) => (type === 'direct-handoff' ? fakePattern : undefined)),
  };

  return {
    codexRuntime,
    claudeRuntime,
    monitor,
    fakePattern,
    patternRegistry,
  };
});

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock('../codex-connector-runtime.service', () => ({
  getCodexConnectorRuntime: () => mocks.codexRuntime,
}));

vi.mock('../claude-connector-runtime.service', () => ({
  getClaudeConnectorRuntime: () => mocks.claudeRuntime,
}));

vi.mock('../connector-health-monitor.service', () => ({
  getConnectorHealthMonitor: () => mocks.monitor,
}));

vi.mock('../patterns/pattern-registry', () => ({
  getPatternRegistry: () => mocks.patternRegistry,
}));

import type { Router } from 'express';
import { codexConnectorRouter } from '../codex-connector.routes';
import { claudeConnectorRouter } from '../claude-connector.routes';
import { contextBridgeRouter } from '../context-bridge.routes';
import { connectorHealthRouter } from '../connector-health.routes';
import { patternRouter } from '../patterns/pattern.routes';
import { sseStreamRouter } from '../sse-stream.router';
import { getA2AEventBus, resetA2AEventBus, A2AEventType } from '../a2a-event-bus';
import { getTaskLifecycleService, resetTaskLifecycleService } from '../task-lifecycle.service';
import { resetContextBridgeService } from '../context-bridge.service';

type MockReq = EventEmitter & {
  method: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
};

type MockResState = {
  statusCode: number;
  headers: Record<string, string>;
  jsonData: any;
  written: string[];
  ended: boolean;
};

function makeReq(opts: {
  method?: string;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
} = {}): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = opts.method ?? 'GET';
  emitter.body = opts.body ?? {};
  emitter.params = opts.params ?? {};
  emitter.query = opts.query ?? {};
  emitter.headers = opts.headers ?? {};
  return emitter;
}

function makeRes(): { res: any; state: MockResState } {
  const state: MockResState = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    written: [],
    ended: false,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
    },
    getHeader(key: string) {
      return state.headers[key.toLowerCase()];
    },
    json(data: any) {
      state.jsonData = data;
      state.ended = true;
      return res;
    },
    write(chunk: string) {
      state.written.push(chunk);
      return true;
    },
    end() {
      state.ended = true;
      return res;
    },
    flushHeaders: vi.fn(),
  };

  return { res, state };
}

function getRouteStack(router: Router, path: string, method: 'get' | 'post' | 'delete') {
  const middleware = router.stack.filter((l: any) => !l.route).map((l: any) => l.handle);
  const routeLayer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  const routeHandlers = routeLayer.route.stack.map((l: any) => l.handle);
  return [...middleware, ...routeHandlers];
}

async function runStack(
  router: Router,
  path: string,
  method: 'get' | 'post' | 'delete',
  req: MockReq,
  res: any,
): Promise<void> {
  const handlers = getRouteStack(router, path, method);

  for (const handler of handlers) {
    const result = await new Promise<{ nextCalled: boolean }>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        nextCalled = true;
        resolve({ nextCalled: true });
      };

      try {
        const out = handler(req, res, next);
        Promise.resolve(out)
          .then(() => {
            if (!nextCalled) resolve({ nextCalled: false });
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });

    if (!result.nextCalled) break;
  }
}

function parseSse(written: string[]): Array<{ event?: string; data?: any }> {
  const events: Array<{ event?: string; data?: any }> = [];
  const lines = written.join('').split('\n');
  let current: { event?: string; data?: string } = {};

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      current.event = line.slice(7);
      continue;
    }
    if (line.startsWith('data: ')) {
      current.data = line.slice(6);
      continue;
    }
    if (line === '' && (current.event || current.data)) {
      const parsed: { event?: string; data?: any } = { event: current.event };
      if (current.data) {
        try {
          parsed.data = JSON.parse(current.data);
        } catch {
          parsed.data = current.data;
        }
      }
      events.push(parsed);
      current = {};
    }
  }

  return events;
}

describe('A2A route integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContextBridgeService();
    resetTaskLifecycleService();
    resetA2AEventBus();
  });

  it('returns codex runtime status via GET /status', async () => {
    const req = makeReq({ method: 'GET' });
    const { res, state } = makeRes();
    await runStack(codexConnectorRouter, '/status', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.connector).toBe('codex-cli');
  });

  it('returns 503 on codex execute when connector is not running', async () => {
    mocks.codexRuntime.isRunning.mockReturnValue(false);
    const req = makeReq({
      method: 'POST',
      body: JSON.stringify({ prompt: 'do work', taskId: 't_1' }),
    });
    const { res, state } = makeRes();
    await runStack(codexConnectorRouter, '/execute', 'post', req, res);

    expect(state.statusCode).toBe(503);
    expect(state.jsonData.success).toBe(false);
    expect(state.jsonData.error.message).toMatch(/not running/i);
  });

  it('returns 400 on codex approval without approved boolean', async () => {
    mocks.codexRuntime.isRunning.mockReturnValue(true);
    const req = makeReq({
      method: 'POST',
      params: { approvalId: 'appr_1' },
      body: JSON.stringify({ reason: 'missing approved' }),
    });
    const { res, state } = makeRes();
    await runStack(codexConnectorRouter, '/approval/:approvalId', 'post', req, res);

    expect(state.statusCode).toBe(400);
    expect(state.jsonData.success).toBe(false);
    expect(state.jsonData.error.message).toMatch(/approved/i);
  });

  it('returns 503 on claude tools when connector is not running', async () => {
    mocks.claudeRuntime.isRunning.mockReturnValue(false);
    const req = makeReq({ method: 'GET' });
    const { res, state } = makeRes();
    await runStack(claudeConnectorRouter, '/tools', 'get', req, res);

    expect(state.statusCode).toBe(503);
    expect(state.jsonData.success).toBe(false);
    expect(state.jsonData.error.message).toMatch(/not running/i);
  });

  it('returns 400 on claude call without toolName', async () => {
    mocks.claudeRuntime.isRunning.mockReturnValue(true);
    const req = makeReq({
      method: 'POST',
      body: JSON.stringify({ args: { prompt: 'hello' } }),
    });
    const { res, state } = makeRes();
    await runStack(claudeConnectorRouter, '/call', 'post', req, res);

    expect(state.statusCode).toBe(400);
    expect(state.jsonData.success).toBe(false);
    expect(state.jsonData.error.message).toMatch(/toolName/i);
  });

  it('supports context create/get/getByType/transfer/delete lifecycle', async () => {
    const createReq = makeReq({
      method: 'POST',
      params: { taskId: 'task_a' },
      body: JSON.stringify({ type: 'metadata', data: { foo: 'bar' } }),
    });
    const createRes = makeRes();
    await runStack(contextBridgeRouter, '/:taskId', 'post', createReq, createRes.res);
    expect(createRes.state.statusCode).toBe(201);

    const getReq = makeReq({ method: 'GET', params: { taskId: 'task_a' } });
    const getRes = makeRes();
    await runStack(contextBridgeRouter, '/:taskId', 'get', getReq, getRes.res);
    expect(getRes.state.statusCode).toBe(200);
    expect(getRes.state.jsonData.data.entries).toHaveLength(1);

    const byTypeReq = makeReq({ method: 'GET', params: { taskId: 'task_a', type: 'metadata' } });
    const byTypeRes = makeRes();
    await runStack(contextBridgeRouter, '/:taskId/:type', 'get', byTypeReq, byTypeRes.res);
    expect(byTypeRes.state.statusCode).toBe(200);
    expect(byTypeRes.state.jsonData.data.count).toBe(1);

    const transferReq = makeReq({
      method: 'POST',
      body: JSON.stringify({ fromTaskId: 'task_a', toTaskId: 'task_b' }),
    });
    const transferRes = makeRes();
    await runStack(contextBridgeRouter, '/transfer', 'post', transferReq, transferRes.res);
    expect(transferRes.state.statusCode).toBe(200);
    expect(transferRes.state.jsonData.data.entries_transferred).toBe(1);

    const deleteReq = makeReq({ method: 'DELETE', params: { taskId: 'task_a' } });
    const deleteRes = makeRes();
    await runStack(contextBridgeRouter, '/:taskId', 'delete', deleteReq, deleteRes.res);
    expect(deleteRes.state.statusCode).toBe(200);
    expect(deleteRes.state.jsonData.data.task_id).toBe('task_a');
  });

  it('returns all connectors health via GET /connectors/health', async () => {
    const req = makeReq({ method: 'GET' });
    const { res, state } = makeRes();
    await runStack(connectorHealthRouter, '/connectors/health', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.summary.total).toBe(0);
  });

  it('returns 404 for unknown connector health', async () => {
    mocks.monitor.isRegistered.mockReturnValue(false);
    const req = makeReq({
      method: 'GET',
      params: { connectorId: 'unknown' },
    });
    const { res, state } = makeRes();
    await runStack(connectorHealthRouter, '/connectors/:connectorId/health', 'get', req, res);

    expect(state.statusCode).toBe(404);
    expect(state.jsonData.success).toBe(false);
    expect(state.jsonData.error.code).toBe('CONNECTOR_NOT_FOUND');
  });

  it('restarts a known connector via POST /connectors/:id/restart', async () => {
    mocks.monitor.isRegistered.mockReturnValue(true);
    const req = makeReq({
      method: 'POST',
      params: { connectorId: 'codex-cli' },
      body: JSON.stringify({}),
    });
    const { res, state } = makeRes();
    await runStack(connectorHealthRouter, '/connectors/:connectorId/restart', 'post', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(mocks.monitor.restartConnector).toHaveBeenCalledWith('codex-cli');
  });

  it('lists patterns and executes a pattern', async () => {
    const listReq = makeReq({ method: 'GET' });
    const listRes = makeRes();
    await runStack(patternRouter, '/', 'get', listReq, listRes.res);
    expect(listRes.state.statusCode).toBe(200);
    expect(listRes.state.jsonData.data.count).toBe(3);

    const execReq = makeReq({
      method: 'POST',
      body: JSON.stringify({
        patternType: 'direct-handoff',
        config: {
          workspaceId: 'ws_1',
          threadId: 'thr_1',
          requester: { agent_id: 'u1', platform: 'recoder_web' },
        },
        input: {
          kind: 'direct-handoff',
          prompt: 'Analyze then handoff',
          agentA: { agent_id: 'a1', platform: 'codex' },
          agentB: { agent_id: 'a2', platform: 'claude_code' },
        },
      }),
    });
    const execRes = makeRes();
    await runStack(patternRouter, '/execute', 'post', execReq, execRes.res);

    expect(execRes.state.statusCode).toBe(200);
    expect(execRes.state.jsonData.success).toBe(true);
    expect(execRes.state.jsonData.data.success).toBe(true);
    expect(mocks.fakePattern.execute).toHaveBeenCalledTimes(1);
  });

  it('streams global SSE events and honors type filters', async () => {
    const req = makeReq({
      method: 'GET',
      query: { types: A2AEventType.TaskCompleted },
    });
    const { res, state } = makeRes();
    await runStack(sseStreamRouter, '/events/stream', 'get', req, res);

    const bus = getA2AEventBus();
    bus.publish({
      id: 'evt_1',
      type: A2AEventType.TaskStarted,
      timestamp: new Date().toISOString(),
      taskId: 'task_sse',
      data: { state: 'working' },
    });
    bus.publish({
      id: 'evt_2',
      type: A2AEventType.TaskCompleted,
      timestamp: new Date().toISOString(),
      taskId: 'task_sse',
      data: { state: 'completed' },
    });

    const events = parseSse(state.written);
    const eventTypes = events.map((e) => e.event);
    expect(eventTypes).toContain('stream.connected');
    expect(eventTypes).toContain(A2AEventType.TaskCompleted);
    expect(eventTypes).not.toContain(A2AEventType.TaskStarted);
  });

  it('streams task snapshot from /tasks/:taskId/stream', async () => {
    const lifecycle = getTaskLifecycleService();
    const created = lifecycle.createTask({
      workspace_id: 'ws_sse',
      thread_id: 'thr_sse',
      requester: { agent_id: 'req', platform: 'recoder_web' },
      assignee: { agent_id: 'asg', platform: 'codex' },
      connector: { connector_id: 'codex-cli', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'test' },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const req = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const { res, state } = makeRes();
    await runStack(sseStreamRouter, '/tasks/:taskId/stream', 'get', req, res);

    const events = parseSse(state.written);
    const snapshot = events.find((e) => e.event === 'task.snapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot?.data?.task?.id).toBe(created.data.id);
  });
});

