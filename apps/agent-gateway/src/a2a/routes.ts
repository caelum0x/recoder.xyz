import type { Router } from 'express';
import express from 'express';
import { createAgentGatewayCard, isExtendedAgentCardAuthorized } from './agent-card';
import { A2AMessageHandler, type A2AMessageInput } from './message-handler';
import { encodeServerSentEvent } from './task-subscription';
import { verifyGatewaySignedEnvelope } from './signed-envelope';

export type A2ARouteMount = {
  path: string;
  router: Router;
};

export function mountA2ARoutes(app: { use(path: string, router: Router): unknown }, routes: A2ARouteMount[]): void {
  for (const route of routes) {
    app.use(route.path, route.router);
  }
}

export type A2ARouterOptions = {
  handler?: A2AMessageHandler;
  requireSignedEnvelope?: boolean;
  signingSecret?: string;
};

function unwrapPayload<T>(body: unknown, options: A2ARouterOptions): T {
  const verification = verifyGatewaySignedEnvelope<T>(body, {
    secret: options.signingSecret ?? process.env.RECODER_A2A_SHARED_SECRET,
    requireSignature: options.requireSignedEnvelope ?? process.env.RECODER_A2A_REQUIRE_SIGNATURE === 'true',
  });
  if (!verification.ok) {
    const error = new Error(verification.error);
    (error as Error & { status?: number }).status = verification.status;
    throw error;
  }
  return verification.payload;
}

export function createA2ARouter(options: A2ARouterOptions = {}): Router {
  const router = express.Router();
  const handler = options.handler ?? new A2AMessageHandler();

  router.get('/.well-known/agent-card.json', (req, res) => {
    const authorized = isExtendedAgentCardAuthorized(req.headers);
    res.json(createAgentGatewayCard({
      baseUrl: `${req.protocol}://${req.get('host')}`,
      includeExtended: authorized,
    }));
  });

  router.get('/api/a2a/agents', (_req, res) => {
    res.json({
      success: true,
      data: [createAgentGatewayCard()],
    });
  });

  router.post('/api/a2a/message', (req, res) => {
    try {
      const payload = unwrapPayload<A2AMessageInput>(req.body, options);
      const task = handler.sendMessage(payload);
      res.status(202).json({ success: true, data: task });
    } catch (error) {
      res.status((error as Error & { status?: number }).status ?? 400).json({
        success: false,
        error: error instanceof Error ? error.message : 'invalid_a2a_message',
      });
    }
  });

  router.post('/api/a2a/message/stream', (req, res) => {
    try {
      const payload = unwrapPayload<A2AMessageInput>(req.body, options);
      const task = handler.sendMessage(payload);
      const started = handler.startTask(task.id);
      res.json({ success: true, data: started, stream: `/api/a2a/tasks/${task.id}/subscribe` });
    } catch (error) {
      res.status((error as Error & { status?: number }).status ?? 400).json({
        success: false,
        error: error instanceof Error ? error.message : 'invalid_a2a_stream_message',
      });
    }
  });

  router.get('/api/a2a/tasks', (_req, res) => {
    res.json({ success: true, data: handler.listTasks() });
  });

  router.get('/api/a2a/tasks/:taskId', (req, res) => {
    const task = handler.getTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ success: false, error: 'a2a_task_not_found' });
      return;
    }
    res.json({ success: true, data: task });
  });

  router.post('/api/a2a/tasks/:taskId/cancel', (req, res) => {
    try {
      res.json({ success: true, data: handler.cancelTask(req.params.taskId) });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : 'a2a_task_not_found',
      });
    }
  });

  router.get('/api/a2a/tasks/:taskId/subscribe', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const existing = handler.getTask(req.params.taskId);
    if (existing) {
      res.write(encodeServerSentEvent({ type: 'task.updated', task: existing }));
    }

    const unsubscribe = handler.subscriptionHub.subscribe(req.params.taskId, (event) => {
      res.write(encodeServerSentEvent(event));
    });

    req.on('close', unsubscribe);
  });

  router.post('/api/a2a/artifacts', (req, res) => {
    try {
      const payload = unwrapPayload<{ taskId: string; artifact: Parameters<typeof handler.attachArtifact>[0]['artifact'] }>(req.body, options);
      res.status(201).json({ success: true, data: handler.attachArtifact(payload) });
    } catch (error) {
      res.status((error as Error & { status?: number }).status ?? 400).json({
        success: false,
        error: error instanceof Error ? error.message : 'invalid_a2a_artifact',
      });
    }
  });

  router.post('/api/a2a/push-notifications', (_req, res) => {
    res.status(202).json({
      success: true,
      data: {
        status: 'accepted',
        message: 'Push notification config accepted by Agent OS gateway scaffold.',
      },
    });
  });

  return router;
}
