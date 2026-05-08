import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const bridgeAgent = { status: 'online' as 'online' | 'working' | 'idle' };
  const bridge = {
    isAgentOnline: vi.fn(() => false),
    sendToAgent: vi.fn(() => true),
    getAgent: vi.fn(() => bridgeAgent),
    getSessionsForAgent: vi.fn(() => []),
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

import type { Router } from 'express';
import { taskLifecycleRouter } from '../task-lifecycle.routes';
import { getTaskLifecycleService, resetTaskLifecycleService } from '../task-lifecycle.service';
import { getApprovalGateService, resetApprovalGateService } from '../approval-gate.service';
import { getDelegationChainService, resetDelegationChainService } from '../delegation-chain.service';

type MockReq = EventEmitter & {
  method: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
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

function getRouteStack(router: Router, path: string, method: 'post' | 'get') {
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
  method: 'post' | 'get',
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
    resetApprovalGateService();
    resetDelegationChainService();
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

  it('returns unified task context with audit, approval, and delegation linkage', async () => {
    const service = getTaskLifecycleService();
    const created = service.createTask({
      workspace_id: 'ws_ctx',
      thread_id: 'thread_ctx',
      requester: { agent_id: 'agent-a', platform: 'recoder_pm' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'codex-1', platform: 'codex', protocol: 'jsonrpc' },
      payload: { kind: 'text', text: 'Context task' },
      metadata: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const approval = getApprovalGateService().createRequest({
      workspaceId: 'ws_ctx',
      requestingAgentId: 'agent-a',
      targetAgentId: 'agent-b',
      action: 'delegate',
      details: { sourceTaskId: created.data.id },
      timeoutMs: 10_000,
    });
    const delegation = getDelegationChainService().delegate({
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      prompt: 'Please handle this',
      metadata: {
        sourceTaskId: created.data.id,
        approvalId: approval.approvalId,
      },
    });

    service.updateTaskMetadata(created.data.id, {
      metadataPatch: {
        approval: { approvalId: approval.approvalId, status: approval.status },
        handoff: { delegationId: delegation.delegationId, status: delegation.status },
      },
      triggeredBy: 'test',
      reason: 'Link approval and delegation',
    });

    const req = makeReq({
      method: 'GET',
      params: { taskId: created.data.id },
    });
    const { res, state } = makeRes();

    await runStack(taskLifecycleRouter, '/:taskId/context', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.task.id).toBe(created.data.id);
    expect(state.jsonData.data.links.approval.approvalId).toBe(approval.approvalId);
    expect(state.jsonData.data.links.delegation.delegationId).toBe(delegation.delegationId);
    expect(state.jsonData.data.links.delegationChain.rootDelegationId).toBe(delegation.delegationId);
    expect(Array.isArray(state.jsonData.data.audit)).toBe(true);
    expect(state.jsonData.data.assignee.agentId).toBe('agent-b');
    expect(Array.isArray(state.jsonData.data.assignee.localBridgeSessions)).toBe(true);
    expect(Array.isArray(state.jsonData.data.assignee.pairedBridgeSessions)).toBe(true);
    expect(state.jsonData.data.runtime.evidenceCount).toBe(0);
  });
});
