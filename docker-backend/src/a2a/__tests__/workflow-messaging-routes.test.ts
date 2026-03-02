/**
 * @module workflow-messaging-routes.test
 *
 * Tests for the A2A workflow, messaging, and delegation route handlers.
 * Uses mock request/response pattern matching orchestration-routes.test.ts.
 *
 * P19-004: Workflow & messaging HTTP routes
 */

import { EventEmitter } from 'events';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../task-lifecycle.service', () => ({
  generateId: vi.fn(
    (prefix: string) =>
      `${prefix}-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { Router } from 'express';
import { workflowMessagingRouter } from '../workflow-messaging.routes';
import { getWorkflowEngine, resetWorkflowEngine } from '../workflow-engine.service';
import {
  getAgentMessagingService,
  resetAgentMessagingService,
  resetIdCounter as resetMsgIdCounter,
} from '../agent-messaging.service';
import {
  getDelegationChainService,
  resetDelegationChainService,
  resetDelegationIdCounter,
} from '../delegation-chain.service';

// ---------------------------------------------------------------------------
// Mock request / response helpers
// ---------------------------------------------------------------------------

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

function makeReq(
  opts: {
    method?: string;
    body?: any;
    params?: Record<string, string>;
    query?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): MockReq {
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

// ---------------------------------------------------------------------------
// Route stack runner
// ---------------------------------------------------------------------------

function getSubRouterStack(
  mainRouter: Router,
  subPrefix: string,
  routePath: string,
  method: 'get' | 'post' | 'delete',
): Function[] {
  const subRouterLayer = (mainRouter as any).stack.find(
    (l: any) => l.name === 'router' && l.regexp.test(subPrefix),
  );
  if (!subRouterLayer) {
    throw new Error(`No sub-router matching prefix "${subPrefix}"`);
  }
  const subRouter = subRouterLayer.handle;

  const middleware = (subRouter as any).stack
    .filter((l: any) => !l.route)
    .map((l: any) => l.handle);

  const routeLayer = (subRouter as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method],
  );
  if (!routeLayer) {
    throw new Error(
      `No route for ${method.toUpperCase()} ${routePath} in sub-router "${subPrefix}"`,
    );
  }
  const routeHandlers = routeLayer.route.stack.map((l: any) => l.handle);
  return [...middleware, ...routeHandlers];
}

async function runSubStack(
  mainRouter: Router,
  subPrefix: string,
  routePath: string,
  method: 'get' | 'post' | 'delete',
  req: MockReq,
  res: any,
): Promise<void> {
  const handlers = getSubRouterStack(mainRouter, subPrefix, routePath, method);

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Workflow-messaging routes', () => {
  beforeEach(() => {
    resetWorkflowEngine();
    resetAgentMessagingService();
    resetMsgIdCounter();
    resetDelegationChainService();
    resetDelegationIdCounter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetWorkflowEngine();
    resetAgentMessagingService();
    resetDelegationChainService();
  });

  // =========================================================================
  // Workflow routes
  // =========================================================================

  describe('Workflow routes', () => {
    const prefix = '/workflows';

    // 1. POST /workflows registers
    it('POST / registers a workflow definition', async () => {
      const req = makeReq({
        method: 'POST',
        body: {
          workflowId: 'wf-1',
          name: 'Test Workflow',
          steps: [{ type: 'task', stepId: 's1', agentId: 'agent-a', prompt: 'do stuff' }],
        },
      });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.workflowId).toBe('wf-1');
      expect(state.jsonData.data.name).toBe('Test Workflow');
    });

    // 2. GET /workflows lists
    it('GET / lists all registered workflows', async () => {
      const engine = getWorkflowEngine();
      engine.registerWorkflow({ workflowId: 'wf-a', name: 'A', steps: [] });
      engine.registerWorkflow({ workflowId: 'wf-b', name: 'B', steps: [] });

      const req = makeReq({ method: 'GET' });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data).toHaveLength(2);
    });

    // 3. GET /workflows/:id returns specific
    it('GET /:workflowId returns a specific workflow', async () => {
      const engine = getWorkflowEngine();
      engine.registerWorkflow({ workflowId: 'wf-x', name: 'X', steps: [] });

      const req = makeReq({ method: 'GET', params: { workflowId: 'wf-x' } });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/:workflowId', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.data.workflowId).toBe('wf-x');
    });

    // 4. POST /workflows/:id/execute returns execution
    it('POST /:workflowId/execute returns execution result', async () => {
      const engine = getWorkflowEngine();
      engine.registerWorkflow({
        workflowId: 'wf-exec',
        name: 'Exec Test',
        steps: [{ type: 'task', stepId: 's1', agentId: 'agent-1', prompt: 'hello' }],
      });

      const req = makeReq({
        method: 'POST',
        params: { workflowId: 'wf-exec' },
        body: { input: 'test input' },
      });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/:workflowId/execute', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.workflowId).toBe('wf-exec');
      expect(state.jsonData.data.status).toBeDefined();
      expect(state.jsonData.data.executionId).toBeDefined();
    });

    // 15. 404 for unknown workflow
    it('GET /:workflowId returns 404 for unknown workflow', async () => {
      const req = makeReq({ method: 'GET', params: { workflowId: 'nope' } });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/:workflowId', 'get', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toContain('not found');
    });

    // 20. DELETE /workflows/:id removes workflow
    it('DELETE /:workflowId removes a workflow', async () => {
      const engine = getWorkflowEngine();
      engine.registerWorkflow({ workflowId: 'wf-del', name: 'Delete Me', steps: [] });

      const req = makeReq({ method: 'DELETE', params: { workflowId: 'wf-del' } });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/:workflowId', 'delete', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.removed).toBe(true);

      // Verify it is gone
      expect(engine.getWorkflow('wf-del')).toBeUndefined();
    });
  });

  // =========================================================================
  // Messaging routes
  // =========================================================================

  describe('Messaging routes', () => {
    const prefix = '/messages';

    // Helper to send a message via the service (bypassing routes)
    function sendTestMessage(overrides: Record<string, any> = {}) {
      return getAgentMessagingService().sendMessage({
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        type: 'request',
        subject: 'Test',
        body: 'Hello',
        correlationId: 'corr-1',
        ...overrides,
      });
    }

    // 5. POST /messages sends message
    it('POST / sends a message', async () => {
      const req = makeReq({
        method: 'POST',
        body: {
          fromAgentId: 'agent-a',
          toAgentId: 'agent-b',
          type: 'request',
          subject: 'Greetings',
          body: 'Hello world',
        },
      });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.fromAgentId).toBe('agent-a');
      expect(state.jsonData.data.toAgentId).toBe('agent-b');
      expect(state.jsonData.data.subject).toBe('Greetings');
      expect(state.jsonData.data.messageId).toBeDefined();
    });

    // 6. GET /messages/inbox/:agentId returns inbox
    it('GET /inbox/:agentId returns agent inbox', async () => {
      sendTestMessage();
      sendTestMessage({ subject: 'Second' });

      const req = makeReq({ method: 'GET', params: { agentId: 'agent-b' }, query: {} });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/inbox/:agentId', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data).toHaveLength(2);
    });

    // 7. POST /messages/:id/reply creates reply
    it('POST /:messageId/reply creates a reply', async () => {
      const original = sendTestMessage();

      const req = makeReq({
        method: 'POST',
        params: { messageId: original.messageId },
        body: { body: 'Got it!', type: 'response' },
      });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/:messageId/reply', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      // Reply swaps from/to
      expect(state.jsonData.data.fromAgentId).toBe('agent-b');
      expect(state.jsonData.data.toAgentId).toBe('agent-a');
      expect(state.jsonData.data.body).toBe('Got it!');
    });

    // 8. GET /messages/threads/:correlationId returns thread
    it('GET /threads/:correlationId returns conversation thread', async () => {
      const msg = sendTestMessage({ correlationId: 'thread-abc' });
      getAgentMessagingService().reply(msg.messageId, 'Reply!');

      const req = makeReq({
        method: 'GET',
        params: { correlationId: 'thread-abc' },
      });
      const { res, state } = makeRes();

      await runSubStack(
        workflowMessagingRouter,
        prefix,
        '/threads/:correlationId',
        'get',
        req,
        res,
      );

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.correlationId).toBe('thread-abc');
      expect(state.jsonData.data.messages.length).toBeGreaterThanOrEqual(2);
    });

    // 9. GET /messages/unread/:agentId returns count
    it('GET /unread/:agentId returns unread count', async () => {
      sendTestMessage();
      sendTestMessage({ subject: 'Another' });

      const req = makeReq({ method: 'GET', params: { agentId: 'agent-b' } });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/unread/:agentId', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.unreadCount).toBe(2);
    });

    // 16. 404 for unknown message
    it('GET /:messageId returns 404 for unknown message', async () => {
      const req = makeReq({ method: 'GET', params: { messageId: 'no-such-msg' } });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/:messageId', 'get', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toContain('not found');
    });

    // 18. POST /messages/:id/delivered marks delivered
    it('POST /:messageId/delivered marks message as delivered', async () => {
      const msg = sendTestMessage();

      const req = makeReq({
        method: 'POST',
        params: { messageId: msg.messageId },
      });
      const { res, state } = makeRes();

      await runSubStack(
        workflowMessagingRouter,
        prefix,
        '/:messageId/delivered',
        'post',
        req,
        res,
      );

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.deliveryStatus).toBe('delivered');
      expect(state.jsonData.data.deliveredAt).toBeDefined();
    });

    // 19. POST /messages/:id/read marks read
    it('POST /:messageId/read marks message as read', async () => {
      const msg = sendTestMessage();

      const req = makeReq({
        method: 'POST',
        params: { messageId: msg.messageId },
      });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/:messageId/read', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.deliveryStatus).toBe('read');
      expect(state.jsonData.data.readAt).toBeDefined();
    });
  });

  // =========================================================================
  // Delegation routes
  // =========================================================================

  describe('Delegation routes', () => {
    const prefix = '/delegations';

    function createTestDelegation(overrides: Record<string, any> = {}) {
      return getDelegationChainService().delegate({
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        prompt: 'Do this task',
        ...overrides,
      });
    }

    // 10. POST /delegations creates delegation
    it('POST / creates a delegation', async () => {
      const req = makeReq({
        method: 'POST',
        body: {
          fromAgentId: 'agent-x',
          toAgentId: 'agent-y',
          prompt: 'Please handle this',
        },
      });
      const { res, state } = makeRes();

      await runSubStack(workflowMessagingRouter, prefix, '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.fromAgentId).toBe('agent-x');
      expect(state.jsonData.data.toAgentId).toBe('agent-y');
      expect(state.jsonData.data.status).toBe('pending');
      expect(state.jsonData.data.delegationId).toBeDefined();
    });

    // 11. POST /delegations/:id/accept accepts
    it('POST /:delegationId/accept accepts a delegation', async () => {
      const dlg = createTestDelegation();

      const req = makeReq({
        method: 'POST',
        params: { delegationId: dlg.delegationId },
      });
      const { res, state } = makeRes();

      await runSubStack(
        workflowMessagingRouter,
        prefix,
        '/:delegationId/accept',
        'post',
        req,
        res,
      );

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.status).toBe('accepted');
      expect(state.jsonData.data.acceptedAt).toBeDefined();
    });

    // 12. POST /delegations/:id/complete completes
    it('POST /:delegationId/complete completes a delegation', async () => {
      const dlg = createTestDelegation();
      getDelegationChainService().accept(dlg.delegationId);

      const req = makeReq({
        method: 'POST',
        params: { delegationId: dlg.delegationId },
        body: { result: 'Task done successfully' },
      });
      const { res, state } = makeRes();

      await runSubStack(
        workflowMessagingRouter,
        prefix,
        '/:delegationId/complete',
        'post',
        req,
        res,
      );

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.status).toBe('completed');
      expect(state.jsonData.data.result).toBe('Task done successfully');
    });

    // 13. GET /delegations/chain/:id returns chain
    it('GET /chain/:delegationId returns full delegation chain', async () => {
      const root = createTestDelegation();

      const req = makeReq({
        method: 'GET',
        params: { delegationId: root.delegationId },
      });
      const { res, state } = makeRes();

      await runSubStack(
        workflowMessagingRouter,
        prefix,
        '/chain/:delegationId',
        'get',
        req,
        res,
      );

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.rootDelegationId).toBe(root.delegationId);
      expect(state.jsonData.data.delegations).toHaveLength(1);
    });

    // 14. GET /delegations/from/:agentId returns delegations
    it('GET /from/:agentId returns delegations from agent', async () => {
      createTestDelegation({ fromAgentId: 'from-agent' });
      createTestDelegation({ fromAgentId: 'from-agent', toAgentId: 'agent-c' });

      const req = makeReq({ method: 'GET', params: { agentId: 'from-agent' } });
      const { res, state } = makeRes();

      await runSubStack(
        workflowMessagingRouter,
        prefix,
        '/from/:agentId',
        'get',
        req,
        res,
      );

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data).toHaveLength(2);
    });

    // 17. 404 for unknown delegation
    it('GET /:delegationId returns 404 for unknown delegation', async () => {
      const req = makeReq({ method: 'GET', params: { delegationId: 'no-such-dlg' } });
      const { res, state } = makeRes();

      await runSubStack(
        workflowMessagingRouter,
        prefix,
        '/:delegationId',
        'get',
        req,
        res,
      );

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toContain('not found');
    });
  });
});
