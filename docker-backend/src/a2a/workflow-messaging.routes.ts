/**
 * @module workflow-messaging.routes
 *
 * HTTP route layer for the A2A workflow engine, agent messaging, and
 * delegation chain services.  Each domain gets its own sub-router and the
 * three are combined into the exported `workflowMessagingRouter`.
 *
 * Mount point (expected):  `/a2a`
 *
 * Routes:
 *   /workflows    — Workflow definition CRUD + execution
 *   /messages     — Agent-to-agent messaging
 *   /delegations  — Delegation chain management
 */

import { Router, type Request, type Response } from 'express';
import { getWorkflowEngine } from './workflow-engine.service';
import { getAgentMessagingService } from './agent-messaging.service';
import { getDelegationChainService } from './delegation-chain.service';

// ---------------------------------------------------------------------------
// Stub executor (used until real connector wiring)
// ---------------------------------------------------------------------------

const stubExecutor = async (agentId: string, prompt: string): Promise<string> => {
  return '[stub] ' + agentId + ': ' + prompt.substring(0, 100);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendSuccess(res: Response, data: unknown, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

function sendError(res: Response, statusCode: number, message: string): void {
  res.status(statusCode).json({ success: false, error: { message } });
}

// ---------------------------------------------------------------------------
// Workflow routes
// ---------------------------------------------------------------------------

const workflowRouter = Router();

/** POST /workflows — Register a workflow definition */
workflowRouter.post('/', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { workflowId, name, description, steps, timeoutMs, errorStrategy } = body;

    if (!workflowId || typeof workflowId !== 'string' || !workflowId.trim()) {
      return sendError(res, 400, 'workflowId is required');
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'name is required');
    }
    if (!Array.isArray(steps)) {
      return sendError(res, 400, 'steps must be an array');
    }

    const engine = getWorkflowEngine();

    if (engine.getWorkflow(workflowId)) {
      return sendError(res, 409, `Workflow ${workflowId} is already registered`);
    }

    engine.registerWorkflow({ workflowId, name, description, steps, timeoutMs, errorStrategy });
    sendSuccess(res, engine.getWorkflow(workflowId), 201);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /workflows — List all workflows */
workflowRouter.get('/', (_req: Request, res: Response) => {
  try {
    const workflows = getWorkflowEngine().listWorkflows();
    sendSuccess(res, workflows);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /workflows/:workflowId — Get a workflow */
workflowRouter.get('/:workflowId', (req: Request, res: Response) => {
  try {
    const workflow = getWorkflowEngine().getWorkflow(req.params.workflowId);
    if (!workflow) {
      return sendError(res, 404, `Workflow not found: ${req.params.workflowId}`);
    }
    sendSuccess(res, workflow);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** DELETE /workflows/:workflowId — Remove a workflow */
workflowRouter.delete('/:workflowId', (req: Request, res: Response) => {
  try {
    const deleted = getWorkflowEngine().removeWorkflow(req.params.workflowId);
    if (!deleted) {
      return sendError(res, 404, `Workflow not found: ${req.params.workflowId}`);
    }
    sendSuccess(res, { removed: true });
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /workflows/:workflowId/execute — Execute a workflow */
workflowRouter.post('/:workflowId/execute', async (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { input } = body;

    if (typeof input !== 'string') {
      return sendError(res, 400, 'input is required and must be a string');
    }

    const engine = getWorkflowEngine();
    const workflow = engine.getWorkflow(req.params.workflowId);
    if (!workflow) {
      return sendError(res, 404, `Workflow not found: ${req.params.workflowId}`);
    }

    const execution = await engine.execute(req.params.workflowId, input, stubExecutor);
    sendSuccess(res, execution, 201);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /workflows/executions/:executionId — Get an execution */
workflowRouter.get('/executions/:executionId', (req: Request, res: Response) => {
  try {
    const execution = getWorkflowEngine().getExecution(req.params.executionId);
    if (!execution) {
      return sendError(res, 404, `Execution not found: ${req.params.executionId}`);
    }
    sendSuccess(res, execution);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /workflows/executions/:executionId/cancel — Cancel an execution */
workflowRouter.post('/executions/:executionId/cancel', (req: Request, res: Response) => {
  try {
    const cancelled = getWorkflowEngine().cancelExecution(req.params.executionId);
    if (!cancelled) {
      return sendError(res, 404, `Execution not found or not cancellable: ${req.params.executionId}`);
    }
    sendSuccess(res, { cancelled: true });
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

// ---------------------------------------------------------------------------
// Messaging routes
// ---------------------------------------------------------------------------

const messagingRouter = Router();

/** POST /messages — Send a message */
messagingRouter.post('/', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { fromAgentId, toAgentId, type, subject, body: msgBody, correlationId, ttlMs, priority, metadata } = body;

    if (!fromAgentId || !toAgentId || !subject || !msgBody) {
      return sendError(res, 400, 'fromAgentId, toAgentId, subject, and body are required');
    }

    const message = getAgentMessagingService().sendMessage({
      fromAgentId,
      toAgentId,
      type: type ?? 'request',
      subject,
      body: msgBody,
      correlationId,
      ttlMs,
      priority,
      metadata,
    });

    sendSuccess(res, message, 201);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /messages/:messageId — Get a message */
messagingRouter.get('/:messageId', (req: Request, res: Response) => {
  try {
    const message = getAgentMessagingService().getMessage(req.params.messageId);
    if (!message) {
      return sendError(res, 404, `Message not found: ${req.params.messageId}`);
    }
    sendSuccess(res, message);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /messages/:messageId/reply — Reply to a message */
messagingRouter.post('/:messageId/reply', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { body: replyBody, type } = body;

    if (!replyBody || typeof replyBody !== 'string') {
      return sendError(res, 400, 'body is required');
    }

    const reply = getAgentMessagingService().reply(req.params.messageId, replyBody, type);
    if (!reply) {
      return sendError(res, 404, `Message not found: ${req.params.messageId}`);
    }
    sendSuccess(res, reply, 201);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /messages/:messageId/delivered — Mark message as delivered */
messagingRouter.post('/:messageId/delivered', (req: Request, res: Response) => {
  try {
    const svc = getAgentMessagingService();
    const message = svc.getMessage(req.params.messageId);
    if (!message) {
      return sendError(res, 404, `Message not found: ${req.params.messageId}`);
    }
    svc.markDelivered(req.params.messageId);
    sendSuccess(res, svc.getMessage(req.params.messageId));
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /messages/:messageId/read — Mark message as read */
messagingRouter.post('/:messageId/read', (req: Request, res: Response) => {
  try {
    const svc = getAgentMessagingService();
    const message = svc.getMessage(req.params.messageId);
    if (!message) {
      return sendError(res, 404, `Message not found: ${req.params.messageId}`);
    }
    svc.markRead(req.params.messageId);
    sendSuccess(res, svc.getMessage(req.params.messageId));
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /messages/inbox/:agentId — Get agent inbox */
messagingRouter.get('/inbox/:agentId', (req: Request, res: Response) => {
  try {
    const { type, from, unreadOnly, limit } = req.query as Record<string, string>;
    const inbox = getAgentMessagingService().getInbox({
      agentId: req.params.agentId,
      type: type as any,
      fromAgentId: from,
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    sendSuccess(res, inbox);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /messages/outbox/:agentId — Get agent outbox */
messagingRouter.get('/outbox/:agentId', (req: Request, res: Response) => {
  try {
    const { limit } = req.query as Record<string, string>;
    const outbox = getAgentMessagingService().getOutbox(
      req.params.agentId,
      limit ? parseInt(limit, 10) : undefined,
    );
    sendSuccess(res, outbox);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /messages/threads/:correlationId — Get conversation thread */
messagingRouter.get('/threads/:correlationId', (req: Request, res: Response) => {
  try {
    const thread = getAgentMessagingService().getThread(req.params.correlationId);
    if (!thread) {
      return sendError(res, 404, `Thread not found: ${req.params.correlationId}`);
    }
    sendSuccess(res, thread);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /messages/unread/:agentId — Get unread count */
messagingRouter.get('/unread/:agentId', (req: Request, res: Response) => {
  try {
    const count = getAgentMessagingService().getUnreadCount(req.params.agentId);
    sendSuccess(res, { agentId: req.params.agentId, unreadCount: count });
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /messages/expire — Trigger message expiry */
messagingRouter.post('/expire', (_req: Request, res: Response) => {
  try {
    const expired = getAgentMessagingService().expireMessages();
    sendSuccess(res, { expiredCount: expired });
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

// ---------------------------------------------------------------------------
// Delegation routes
// ---------------------------------------------------------------------------

const delegationRouter = Router();

/** POST /delegations — Create a delegation */
delegationRouter.post('/', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { fromAgentId, toAgentId, prompt, priority, parentDelegationId, metadata } = body;

    if (!fromAgentId || !toAgentId || !prompt) {
      return sendError(res, 400, 'fromAgentId, toAgentId, and prompt are required');
    }

    const delegation = getDelegationChainService().delegate({
      fromAgentId,
      toAgentId,
      prompt,
      priority,
      parentDelegationId,
      metadata,
    });

    sendSuccess(res, delegation, 201);
  } catch (err: any) {
    const message = err?.message ?? 'Internal error';
    // Policy violations (self-delegation, circular, depth) return 400
    if (message.includes('not allowed') || message.includes('exceeded') || message.includes('Circular')) {
      return sendError(res, 400, message);
    }
    // Parent not found
    if (message.includes('not found')) {
      return sendError(res, 404, message);
    }
    sendError(res, 500, message);
  }
});

/** GET /delegations/:delegationId — Get a delegation */
delegationRouter.get('/:delegationId', (req: Request, res: Response) => {
  try {
    const delegation = getDelegationChainService().getDelegation(req.params.delegationId);
    if (!delegation) {
      return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
    }
    sendSuccess(res, delegation);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /delegations/:delegationId/accept — Accept a delegation */
delegationRouter.post('/:delegationId/accept', (req: Request, res: Response) => {
  try {
    const delegation = getDelegationChainService().accept(req.params.delegationId);
    if (!delegation) {
      return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
    }
    sendSuccess(res, delegation);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /delegations/:delegationId/reject — Reject a delegation */
delegationRouter.post('/:delegationId/reject', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const delegation = getDelegationChainService().reject(req.params.delegationId, body.reason);
    if (!delegation) {
      return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
    }
    sendSuccess(res, delegation);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /delegations/:delegationId/complete — Complete a delegation */
delegationRouter.post('/:delegationId/complete', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { result } = body;

    if (!result || typeof result !== 'string') {
      return sendError(res, 400, 'result is required');
    }

    const delegation = getDelegationChainService().complete(req.params.delegationId, result);
    if (!delegation) {
      return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
    }
    sendSuccess(res, delegation);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /delegations/:delegationId/fail — Fail a delegation */
delegationRouter.post('/:delegationId/fail', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { error } = body;

    if (!error || typeof error !== 'string') {
      return sendError(res, 400, 'error is required');
    }

    const delegation = getDelegationChainService().fail(req.params.delegationId, error);
    if (!delegation) {
      return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
    }
    sendSuccess(res, delegation);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** POST /delegations/:delegationId/cancel — Cancel a delegation */
delegationRouter.post('/:delegationId/cancel', (req: Request, res: Response) => {
  try {
    const delegation = getDelegationChainService().cancel(req.params.delegationId);
    if (!delegation) {
      return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
    }
    sendSuccess(res, delegation);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /delegations/chain/:delegationId — Get full delegation chain */
delegationRouter.get('/chain/:delegationId', (req: Request, res: Response) => {
  try {
    const chain = getDelegationChainService().getChain(req.params.delegationId);
    if (!chain) {
      return sendError(res, 404, `Delegation chain not found: ${req.params.delegationId}`);
    }
    sendSuccess(res, chain);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /delegations/from/:agentId — Get delegations from agent */
delegationRouter.get('/from/:agentId', (req: Request, res: Response) => {
  try {
    const delegations = getDelegationChainService().getDelegationsFrom(req.params.agentId);
    sendSuccess(res, delegations);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

/** GET /delegations/to/:agentId — Get delegations to agent */
delegationRouter.get('/to/:agentId', (req: Request, res: Response) => {
  try {
    const delegations = getDelegationChainService().getDelegationsTo(req.params.agentId);
    sendSuccess(res, delegations);
  } catch (err: any) {
    sendError(res, 500, err?.message ?? 'Internal error');
  }
});

// ---------------------------------------------------------------------------
// Combined router
// ---------------------------------------------------------------------------

export const workflowMessagingRouter = Router();
workflowMessagingRouter.use('/workflows', workflowRouter);
workflowMessagingRouter.use('/messages', messagingRouter);
workflowMessagingRouter.use('/delegations', delegationRouter);
