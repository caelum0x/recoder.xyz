/**
 * @module canvas.routes
 *
 * Unified canvas update broadcast endpoint for the A2A system.
 *
 * Mounted at /api/a2a/canvas-update (with auth middleware applied by server.ts).
 *
 * POST /
 *   Body: { projectId: string, threadId?: string, elements: ExcalidrawElement[] }
 *
 * Responsibilities:
 * - validate project/thread payload
 * - publish a CanvasUpdate event to the A2A event bus
 * - broadcast the update to bridge-connected UI clients in the workspace
 * - optionally relay to recoder-agents' SSE fanout endpoint for CanvasPanel
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { getAgentBridgeService } from './agent-bridge.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-canvas-routes');

export interface CanvasRouterOptions {
  canvasHandlerUrl?: string;
  internalServiceKey?: string;
  relayFetch?: typeof fetch;
}

interface CanvasUpdateBody {
  projectId?: string;
  threadId?: string;
  elements?: unknown[];
}

function publishCanvasEvent(projectId: string, threadId: string | null, elements: unknown[]): void {
  getA2AEventBus().publish({
    id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
    type: A2AEventType.CanvasUpdate,
    timestamp: new Date().toISOString(),
    workspaceId: projectId,
    data: {
      projectId,
      threadId,
      elements,
      elementCount: elements.length,
    },
  });
}

function broadcastCanvasUpdate(projectId: string, threadId: string | null, elements: unknown[]): void {
  getAgentBridgeService().broadcastToWorkspace(projectId, {
    type: 'canvas_update',
    projectId,
    threadId: threadId ?? '',
    elements,
    timestamp: Date.now(),
  } as any);
}

async function relayCanvasUpdate(
  options: CanvasRouterOptions,
  body: { projectId: string; threadId: string; elements: unknown[] },
): Promise<void> {
  const relayUrl = (options.canvasHandlerUrl || '').trim();
  if (!relayUrl) return;

  const relay = options.relayFetch ?? fetch;

  const response = await relay(relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.internalServiceKey || ''}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`canvas handler relay failed with status ${response.status}`);
  }
}

export function createCanvasRouter(options: CanvasRouterOptions = {}): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { projectId, threadId, elements } = req.body as CanvasUpdateBody;

    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ success: false, error: 'projectId is required' });
      return;
    }

    if (!Array.isArray(elements)) {
      res.status(400).json({ success: false, error: 'elements must be an array' });
      return;
    }

    const normalizedThreadId =
      typeof threadId === 'string' && threadId.trim().length > 0 ? threadId.trim() : null;

    publishCanvasEvent(projectId, normalizedThreadId, elements);
    broadcastCanvasUpdate(projectId, normalizedThreadId, elements);

    let relayed = false;

    if (normalizedThreadId) {
      try {
        await relayCanvasUpdate(options, {
          projectId,
          threadId: normalizedThreadId,
          elements,
        });
        relayed = true;
      } catch (err) {
        logger.warn(
          { err, url: options.canvasHandlerUrl, projectId, threadId: normalizedThreadId },
          'canvas handler relay failed (non-fatal)',
        );
      }
    }

    logger.info(
      { projectId, threadId: normalizedThreadId, elementCount: elements.length },
      'canvas update processed',
    );

    res.json({
      success: true,
      data: {
        projectId,
        threadId: normalizedThreadId,
        elementCount: elements.length,
        relayed,
      },
    });
  });

  return router;
}
