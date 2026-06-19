import { EventEmitter } from 'node:events';
import type { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AgentProfile } from '@recoder/agent-os';
import { createAgentMcpRouter } from './mcp-control.routes';

type MockReq = EventEmitter & {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
};

function makeReq(opts: {
  method?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = opts.method ?? 'GET';
  emitter.body = opts.body ?? {};
  emitter.params = opts.params ?? {};
  emitter.query = {};
  emitter.headers = {};
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
  const middleware = router.stack.filter((layer: any) => !layer.route).map((layer: any) => layer.handle);
  const routeLayer = router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return [...middleware, ...routeLayer.route.stack.map((layer: any) => layer.handle)];
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
        Promise.resolve(handler(req, res, next))
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

const actor: AgentProfile = {
  agentId: 'agent-codex',
  displayName: 'Codex',
  vendorSurface: 'codex',
  connectorId: 'codex:local',
  runtimeKind: 'local',
  capabilities: [],
  tools: [{ toolName: 'github.pr.create', modes: ['execute'] }],
  supportedTaskIntents: ['feature_delivery'],
  permissions: {
    defaultFileEffect: 'deny',
    pathRules: [],
    toolRules: [],
    allowNetwork: true,
    allowShell: true,
    allowGitWrite: true,
    allowPrCreation: false,
    allowSecretsAccess: false,
    maxParallelSubagents: 1,
    writeLockRequired: true,
  },
  approvalPolicy: {
    mode: 'policy',
    requiredRules: [],
    allowAutoApprovalForLowRisk: false,
  },
  memoryScope: 'repo',
  cwdPolicy: {
    mode: 'repo_root',
    allowedRoots: ['/workspace/repo'],
  },
  health: {
    status: 'healthy',
    checkedAt: '2026-06-13T00:00:00.000Z',
  },
  lastSeenAt: '2026-06-13T00:00:00.000Z',
};

describe('Agent OS MCP control routes', () => {
  it('checks MCP tool policy and records audit hook events before execution', async () => {
    const recordAuditEvent = vi.fn();
    const recordPolicyDecision = vi.fn();
    const router = createAgentMcpRouter({ recordAuditEvent, recordPolicyDecision });
    const req = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.github', toolName: 'github.pr.create' },
      body: {
        actor,
        task: {
          taskId: 'task-1',
          title: 'Open PR',
          intent: 'feature_delivery',
          goal: 'Open a PR',
          spaceId: 'space-1',
          targetPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: [],
          verification: { commands: [] },
          approvalRequired: [],
          artifactRequired: [],
        },
        args: { title: 'PR' },
      },
    });
    const { res, state } = makeRes();

    await runStack(router, '/tools/:serverId/:toolName/check', 'post', req, res);

    expect(state.statusCode).toBe(202);
    expect(state.jsonData.data.requiresApproval).toBe(true);
    expect(state.jsonData.data.policyDecision).toMatchObject({
      effect: 'needs_approval',
      action: 'tool.call',
      actorAgentId: 'agent-codex',
      taskId: 'task-1',
    });
    expect(recordPolicyDecision).toHaveBeenCalledWith(state.jsonData.data.policyDecision);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          serverId: 'recoder.github',
          toolName: 'github.pr.create',
          status: 'needs_approval',
        }),
      }),
    );
  });

  it('rejects MCP checks without an actor profile', async () => {
    const router = createAgentMcpRouter();
    const req = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.github', toolName: 'github.pr.create' },
      body: {},
    });
    const { res, state } = makeRes();

    await runStack(router, '/tools/:serverId/:toolName/check', 'post', req, res);

    expect(state.statusCode).toBe(400);
    expect(state.jsonData.error).toBe('actor AgentProfile is required');
  });
});
