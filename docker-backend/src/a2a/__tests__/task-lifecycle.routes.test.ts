import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const bridgeAgent = { status: 'online' as 'online' | 'working' | 'idle' };
  const bridge = {
    isAgentOnline: vi.fn(() => false),
    sendToAgent: vi.fn(() => true),
    getAgent: vi.fn(() => bridgeAgent),
  };

  return { bridge, bridgeAgent };
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

vi.mock('../agent-bridge.service', () => ({
  getAgentBridgeService: () => mocks.bridge,
}));

// Avoid disk persistence noise for workspace / task stores in these tests.
vi.mock('../a2a-persistence', () => ({
  loadA2ATasks: () => new Map(),
  saveA2ATasks: () => {},
  saveA2ATasksImmediate: () => {},
  loadA2AWorkspaces: () => new Map(),
  saveA2AWorkspaces: () => {},
  loadA2AApprovals: () => new Map(),
  saveA2AApprovals: () => {},
}));

vi.mock('../a2a-event-bus', () => ({
  getA2AEventBus: () => ({ publish: vi.fn(), subscribeWorkspace: vi.fn(), subscribeGlobal: vi.fn() }),
  A2AEventType: { WorkspaceCreated: 'workspace.created' },
}));

vi.mock('../collaboration.service', () => ({
  getCollaborationSvc: () => ({
    createChannel: () => ({ id: 'chan_test' }),
    listChannels: () => [],
  }),
}));

import type { Router } from 'express';
import { taskLifecycleRouter } from '../task-lifecycle.routes';
import { getTaskLifecycleService, resetTaskLifecycleService } from '../task-lifecycle.service';
import { getWorkspaceService } from '../workspace.service';

type MockReq = EventEmitter & {
  method: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  header: (name: string) => string | undefined;
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
  const headers = opts.headers ?? {};
  emitter.headers = headers;
  emitter.header = (name: string) => headers[name.toLowerCase()] ?? headers[name];
  return emitter;
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
  const state = {
    statusCode: 200,
    jsonData: null as any,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
  };

  return { res, state };
}

function getRouteStack(router: Router, path: string, method: 'post') {
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
  method: 'post',
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

describe('taskLifecycleRouter bridge dispatch', () => {
  beforeEach(() => {
    resetTaskLifecycleService();
    vi.clearAllMocks();
    mocks.bridgeAgent.status = 'online';
    mocks.bridge.getAgent.mockReturnValue(mocks.bridgeAgent);
    mocks.bridge.sendToAgent.mockReturnValue(true);
  });

  it('dispatches REST-created MCP tasks to online bridge agents', async () => {
    mocks.bridge.isAgentOnline.mockReturnValue(true);

    const req = makeReq({
      method: 'POST',
      body: {
        workspace_id: 'ws_default',
        thread_id: 'thread_123',
        requester: { agent_id: 'claude_code', platform: 'claude_code' },
        assignee: { agent_id: 'codex', platform: 'codex' },
        connector: { connector_id: 'mcp-bridge', platform: 'recoder', protocol: 'websocket' },
        payload: { intent: 'execute', task: 'hello from claude' },
      },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/', 'post', req, res);

    expect(state.statusCode).toBe(201);
    expect(mocks.bridge.sendToAgent).toHaveBeenCalledTimes(1);
    expect(mocks.bridge.sendToAgent).toHaveBeenCalledWith(
      'codex',
      expect.objectContaining({
        type: 'task.assigned',
        prompt: 'hello from claude',
        intent: 'execute',
        context: expect.objectContaining({
          source: 'a2a-rest',
          from: 'claude_code',
          workspace_id: 'ws_default',
          thread_id: 'thread_123',
        }),
      }),
    );
    expect(mocks.bridgeAgent.status).toBe('working');
  });

  it('does not dispatch REST-created tasks when the assignee is offline', async () => {
    mocks.bridge.isAgentOnline.mockReturnValue(false);

    const req = makeReq({
      method: 'POST',
      body: {
        workspace_id: 'ws_default',
        thread_id: 'thread_123',
        requester: { agent_id: 'claude_code', platform: 'claude_code' },
        assignee: { agent_id: 'codex', platform: 'codex' },
        connector: { connector_id: 'mcp-bridge', platform: 'recoder', protocol: 'websocket' },
        payload: { kind: 'text', text: 'plain text payload' },
      },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/', 'post', req, res);

    expect(state.statusCode).toBe(201);
    expect(mocks.bridge.sendToAgent).not.toHaveBeenCalled();
    expect(mocks.bridgeAgent.status).toBe('online');
  });
});

describe('taskLifecycleRouter PM-decision auth + workspace authorization', () => {
  const ADMIN_TOKEN = 'test-admin-token';
  let taskId: string;
  let workspaceId: string;

  beforeEach(() => {
    resetTaskLifecycleService();
    vi.clearAllMocks();
    process.env.RECODER_A2A_ADMIN_TOKEN = ADMIN_TOKEN;
    delete process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES;
    delete process.env.RECODER_A2A_ADMIN_TOKEN_SCOPE;

    // Create a workspace owned by a known agent, then a working task in it.
    const ws = getWorkspaceService().create({
      name: 'auth-ws',
      projectId: 'proj_1',
      ownerId: 'owner-agent',
    });
    workspaceId = ws.workspaceId;

    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: workspaceId,
      thread_id: 'thread_auth',
      requester: { agent_id: 'owner-agent', platform: 'recoder_pm' },
      assignee: { agent_id: 'codex', platform: 'codex' },
      connector: { connector_id: 'c1', platform: 'codex', protocol: 'rest' },
      payload: { kind: 'text', text: 'do work' },
    });
    if (!created.ok) throw new Error('failed to create task');
    taskId = created.data.id;
    service.startTask(taskId, 'owner-agent');
  });

  it('rejects an unauthenticated reject with 401', async () => {
    const req = makeReq({ method: 'POST', params: { taskId }, body: { reason: 'nope' } });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/reject', 'post', req, res);

    expect(state.statusCode).toBe(401);
    expect(state.jsonData?.error?.code).toBe('AUTHENTICATION_FAILED');
  });

  it('rejects an unauthenticated handoff with 401', async () => {
    const req = makeReq({
      method: 'POST',
      params: { taskId },
      body: { assignee: { agent_id: 'claude', platform: 'claude_code' } },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/handoff', 'post', req, res);

    expect(state.statusCode).toBe(401);
  });

  it('denies an authenticated agent that does not own the workspace (403)', async () => {
    const req = makeReq({
      method: 'POST',
      params: { taskId },
      headers: { authorization: 'Bearer agent-token', 'x-recoder-a2a-agent-id': 'intruder-agent' },
      body: { reason: 'nope' },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/reject', 'post', req, res);

    expect(state.statusCode).toBe(403);
    expect(state.jsonData?.error?.code).toBe('AUTHORIZATION_DENIED');
  });

  it('allows the workspace owner agent to reject (200)', async () => {
    const req = makeReq({
      method: 'POST',
      params: { taskId },
      headers: { authorization: 'Bearer agent-token', 'x-recoder-a2a-agent-id': 'owner-agent' },
      body: { reason: 'out of scope', triggered_by: 'owner-agent' },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/reject', 'post', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData?.success).toBe(true);
    expect(state.jsonData?.data?.state).toBe('cancelled');
  });

  it('allows an admin-token caller to reject regardless of ownership (200)', async () => {
    const req = makeReq({
      method: 'POST',
      params: { taskId },
      headers: { 'x-recoder-a2a-admin-token': ADMIN_TOKEN },
      body: { reason: 'admin override' },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/reject', 'post', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData?.data?.state).toBe('cancelled');
  });
});
