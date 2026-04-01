/**
 * @module canvas.routes
 *
 * Canvas update broadcast endpoint for the A2A system.
 *
 * POST /api/a2a/canvas-update
 *   Body: { projectId: string, threadId?: string, elements: ExcalidrawElement[] }
 *
 * Publishes a canvas.update event to all SSE subscribers watching the project
 * workspace. The recoder-agents CanvasPanel receives this and calls
 * Excalidraw's updateScene() to apply the changes live.
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { createLogger } from '../logger';

const logger = createLogger('a2a-canvas-routes');

export const canvasRouter = Router();

canvasRouter.post('/', (req: Request, res: Response) => {
  const { projectId, threadId, elements } = req.body as {
    projectId?: string;
    threadId?: string;
    elements?: unknown[];
  };

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ success: false, error: 'projectId is required' });
    return;
  }

  if (!Array.isArray(elements)) {
    res.status(400).json({ success: false, error: 'elements must be an array' });
    return;
  }

  getA2AEventBus().publish({
    id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
    type: A2AEventType.CanvasUpdate,
    timestamp: new Date().toISOString(),
    workspaceId: projectId,
    data: {
      projectId,
      threadId: threadId || null,
      elements,
      elementCount: elements.length,
    },
  });

  logger.info({ projectId, threadId, elementCount: elements.length }, 'canvas update published');

  res.json({ success: true, data: { projectId, elementCount: elements.length } });
});
