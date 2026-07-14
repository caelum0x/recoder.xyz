import type { Router } from 'express';
import { describe, expect, it } from 'vitest';

import { createPolicyEvaluateRouter } from './policy-evaluate.routes';
import { createMemoryCandidateRouter } from './memory-candidate.routes';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';

// Minimal request/response harness that drives the real Express router stack,
// mirroring the existing code-graph-user.routes.test.ts pattern. This proves the
// @recoder/agent-policy and @recoder/agent-memory packages are reachable and
// exercised from product control-plane routes (not just imported).

interface MockReq {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
}

function makeReq(opts: { body?: Record<string, unknown>; params?: Record<string, string>; query?: Record<string, string> } = {}): MockReq {
  return {
    method: 'POST',
    body: opts.body ?? {},
    params: opts.params ?? {},
    query: opts.query ?? {},
    headers: {},
  };
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
  const state = { statusCode: 200, jsonData: null as any };
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
  const routeLayer = router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return (routeLayer as any).route.stack.map((layer: any) => layer.handle);
}

async function runStack(router: Router, path: string, method: 'post' | 'get', req: MockReq, res: any): Promise<void> {
  const handlers = getRouteStack(router, path, method);
  for (const handler of handlers) {
    const result = await new Promise<{ nextCalled: boolean }>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: unknown) => {
        if (err) return reject(err);
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

// A real AgentProfile whose permission policy denies file writes by default and
// requires approval for branch.push — enough for the engine to make real,
// differentiated decisions.
function makeActor(): Record<string, unknown> {
  return {
    agentId: 'agent-smoke',
    displayName: 'Smoke Agent',
    vendorSurface: 'claude_code',
    connectorId: 'connector-smoke',
    runtimeKind: 'claude_code',
    capabilities: [],
    tools: [],
    supportedTaskIntents: ['feature_delivery'],
    permissions: {
      defaultFileEffect: 'allow',
      pathRules: [
        { glob: 'app/**', effect: 'deny', reason: 'protected app surface' },
      ],
      toolRules: [],
      allowNetwork: false,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: false,
    },
    approvalPolicy: {
      mode: 'policy',
      requiredRules: [],
      allowAutoApprovalForLowRisk: false,
    },
    memoryScope: 'space',
    cwdPolicy: { mode: 'repo_root', allowedRoots: ['/work'] },
    health: { status: 'healthy', message: 'ok', checkedAt: '2026-01-01T00:00:00.000Z' },
    lastSeenAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('agent-os policy + memory control-plane wiring', () => {
  describe('createPolicyEvaluateRouter (@recoder/agent-policy)', () => {
    it('POST /evaluate returns a real PolicyDecision (allow on permitted file read)', async () => {
      const repo = new InMemoryAgentOsRepository();
      const router = createPolicyEvaluateRouter(repo);
      const { res, state } = makeRes();

      await runStack(
        router,
        '/evaluate',
        'post',
        makeReq({ body: { actor: makeActor(), action: 'file.read', target: { path: 'README.md' } } }),
        res,
      );

      expect(state.jsonData?.success).toBe(true);
      const decision = state.jsonData?.data;
      expect(['allow', 'deny', 'needs_approval']).toContain(decision?.effect);
      expect(decision?.effect).toBe('allow');
      expect(typeof decision?.decisionId).toBe('string');
      expect(decision?.actorAgentId).toBe('agent-smoke');
      expect(decision?.action).toBe('file.read');

      // The decision was additively persisted to the repository.
      const stored = await repo.listPolicyDecisions();
      expect(stored.some((d) => d.decisionId === decision.decisionId)).toBe(true);
    });

    it('POST /evaluate denies a write to a deny-glob path (real engine ruling)', async () => {
      const repo = new InMemoryAgentOsRepository();
      const router = createPolicyEvaluateRouter(repo);
      const { res, state } = makeRes();

      await runStack(
        router,
        '/evaluate',
        'post',
        makeReq({ body: { actor: makeActor(), action: 'file.write', target: { path: 'app/secret.ts' } } }),
        res,
      );

      const decision = state.jsonData?.data;
      expect(state.jsonData?.success).toBe(true);
      expect(decision?.effect).toBe('deny');
    });

    it('POST /evaluate 400s when actor is missing', async () => {
      const repo = new InMemoryAgentOsRepository();
      const router = createPolicyEvaluateRouter(repo);
      const { res, state } = makeRes();

      await runStack(router, '/evaluate', 'post', makeReq({ body: { action: 'file.read' } }), res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData?.success).toBe(false);
    });
  });

  describe('createMemoryCandidateRouter (@recoder/agent-memory)', () => {
    it('proposes a candidate WITH evidence then lists it', async () => {
      const repo = new InMemoryAgentOsRepository();
      const router = createMemoryCandidateRouter(repo);

      const propose = makeRes();
      await runStack(
        router,
        '/candidates',
        'post',
        makeReq({
          body: {
            candidateId: 'mc-smoke-1',
            scope: 'space',
            title: 'Prefer pnpm in monorepo',
            body: 'Always use pnpm with --filter for workspace installs.',
            evidence: { taskId: 'task-1', artifactId: 'artifact-1' },
            proposedBy: 'agent-smoke',
          },
        }),
        propose.res,
      );

      expect(propose.state.statusCode).toBe(201);
      expect(propose.state.jsonData?.success).toBe(true);
      expect(propose.state.jsonData?.data?.candidateId).toBe('mc-smoke-1');
      expect(propose.state.jsonData?.data?.status).toBe('candidate_created');

      const list = makeRes();
      await runStack(router, '/candidates', 'get', makeReq({ query: {} }), list.res);
      expect(list.state.jsonData?.success).toBe(true);
      const ids = (list.state.jsonData?.data ?? []).map((c: any) => c.candidateId);
      expect(ids).toContain('mc-smoke-1');
    });

    it('rejects a proposal that lacks evidence (lifecycle guard)', async () => {
      const repo = new InMemoryAgentOsRepository();
      const router = createMemoryCandidateRouter(repo);
      const { res, state } = makeRes();

      await runStack(
        router,
        '/candidates',
        'post',
        makeReq({ body: { scope: 'space', title: 't', body: 'b', proposedBy: 'agent-smoke' } }),
        res,
      );

      expect(state.statusCode).toBe(400);
      expect(state.jsonData?.success).toBe(false);
    });

    it('accept review materializes a durable MemoryItem (never written directly)', async () => {
      const repo = new InMemoryAgentOsRepository();
      const router = createMemoryCandidateRouter(repo);

      await runStack(
        router,
        '/candidates',
        'post',
        makeReq({
          body: {
            candidateId: 'mc-smoke-2',
            scope: 'space',
            title: 'Title',
            body: 'Body',
            evidence: { taskId: 'task-9', artifactId: 'artifact-9' },
            proposedBy: 'agent-smoke',
          },
        }),
        makeRes().res,
      );

      const review = makeRes();
      await runStack(
        router,
        '/candidates/:candidateId/review',
        'post',
        makeReq({ params: { candidateId: 'mc-smoke-2' }, body: { accepted: true, reviewedBy: 'reviewer-1' } }),
        review.res,
      );

      expect(review.state.jsonData?.success).toBe(true);
      expect(review.state.jsonData?.data?.candidate?.status).toBe('accepted');
      expect(review.state.jsonData?.data?.memory?.title).toBe('Title');

      const items = await repo.listMemoryItems();
      expect(items.length).toBe(1);
      expect(items[0].body).toBe('Body');
    });
  });
});
