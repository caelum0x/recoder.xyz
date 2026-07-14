/**
 * @module sse-stream.router
 *
 * Server-Sent Events (SSE) endpoints for real-time A2A event streaming.
 *
 * Provides three SSE endpoints:
 *
 * | Method | Path                               | Description                          |
 * |--------|------------------------------------|--------------------------------------|
 * | GET    | /tasks/:taskId/stream              | Stream events for a single task      |
 * | GET    | /channels/:channelId/stream        | Stream events for a channel          |
 * | GET    | /events/stream                     | Global stream for all A2A events     |
 *
 * All streams use the standard SSE protocol:
 * - Content-Type: text/event-stream
 * - Cache-Control: no-cache, no-transform
 * - Connection: keep-alive
 * - Heartbeat every 30s to keep connection alive
 * - Proper cleanup on client disconnect
 */

import { Router, type Request, type Response } from 'express';
import {
  getA2AEventBus,
  TERMINAL_TASK_EVENT_TYPES,
  type A2AEvent,
} from './a2a-event-bus';
import {
  A2AErrorCodeEnum,
  buildA2AError,
} from '@recoder/shared/a2a';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getWorkspaceService } from './workspace.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-sse-stream');

/** Heartbeat interval in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface MaybeAuthenticatedRequest extends Request {
  userId?: string;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

/**
 * Configure the response for SSE streaming.
 * Sets all required headers and flushes them to start the stream.
 */
function initSseResponse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }
}

/**
 * Write a single SSE event to the response.
 *
 * Format:
 *   id: <event.id>
 *   event: <event.type>
 *   data: <JSON payload>
 *   \n
 */
function writeSseEvent(res: Response, event: A2AEvent): void {
  if (event.id) {
    res.write(`id: ${event.id}\n`);
  }
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Write a heartbeat comment to keep the connection alive.
 * SSE spec allows comments (lines starting with ':') for keepalive.
 */
function writeHeartbeat(res: Response): void {
  res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
}

/**
 * Start a heartbeat timer for the given response.
 * Returns the interval handle for cleanup.
 */
function startHeartbeat(res: Response): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      writeHeartbeat(res);
    } catch {
      // Connection closed; interval will be cleaned up by the close handler
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Parse a comma-separated type filter from the query string.
 * Returns null if no filter is provided (meaning "all events").
 */
function parseTypeFilter(raw: unknown): Set<string> | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const types = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return types.length > 0 ? new Set(types) : null;
}

function getAuthenticatedUserId(req: Request): string | undefined {
  const userId = (req as MaybeAuthenticatedRequest).userId;
  return typeof userId === 'string' && userId.trim().length > 0 && userId !== 'anonymous'
    ? userId
    : undefined;
}

function sendAuthorizationDenied(res: Response, message: string): void {
  res.status(403).json({
    success: false,
    error: buildA2AError({
      code: A2AErrorCodeEnum.AuthorizationDenied,
      message,
    }),
  });
}

function canAccessWorkspace(req: Request, workspaceId?: string): boolean {
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId || !workspaceId) {
    return true;
  }

  const workspace = getWorkspaceService().get(workspaceId);
  if (!workspace) {
    return true;
  }

  return workspace.ownerId === authenticatedUserId;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const sseStreamRouter = Router();

// ---------------------------------------------------------------------------
// GET /tasks/:taskId/stream -- SSE stream for a single task
// ---------------------------------------------------------------------------

sseStreamRouter.get(
  '/tasks/:taskId/stream',
  (req: Request, res: Response) => {
    const { taskId } = req.params;

    if (!taskId || taskId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_TASK_ID', message: 'taskId parameter is required' },
      });
      return;
    }

    // Verify the task exists before opening the stream
    const service = getTaskLifecycleService();
    const taskResult = service.getTask(taskId);
    if (!taskResult.ok) {
      res.status(taskResult.httpStatus).json({
        success: false,
        error: taskResult.error,
      });
      return;
    }

    if (!canAccessWorkspace(req, taskResult.data.workspace_id)) {
      sendAuthorizationDenied(res, `Task stream access denied: ${taskId}`);
      return;
    }

    logger.info({ task_id: taskId }, 'SSE stream opened for task');

    // Initialize SSE response
    initSseResponse(res);

    // Send the current task state as the initial event
    const initialEvent: A2AEvent = {
      id: `init_${Date.now().toString(36)}`,
      type: 'task.snapshot',
      timestamp: new Date().toISOString(),
      data: { task: taskResult.data },
      taskId,
    };
    writeSseEvent(res, initialEvent);

    // If task is already in a terminal state, close immediately
    const currentState = taskResult.data.state;
    if (
      currentState === 'completed' ||
      currentState === 'failed' ||
      currentState === 'cancelled'
    ) {
      logger.info({ task_id: taskId, state: currentState }, 'task already terminal, closing SSE stream');
      res.end();
      return;
    }

    // Subscribe to task events
    const eventBus = getA2AEventBus();
    const unsubscribe = eventBus.subscribeTask(taskId, (event: A2AEvent) => {
      try {
        writeSseEvent(res, event);

        // Auto-close on terminal state
        if (TERMINAL_TASK_EVENT_TYPES.has(event.type)) {
          logger.info(
            { task_id: taskId, event_type: event.type },
            'terminal event received, closing SSE stream',
          );
          cleanup();
          res.end();
        }
      } catch (err) {
        logger.debug({ task_id: taskId, err }, 'error writing SSE event, cleaning up');
        cleanup();
      }
    });

    // Start heartbeat
    const heartbeatInterval = startHeartbeat(res);

    // Cleanup function
    let cleaned = false;
    function cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeatInterval);
      unsubscribe();
      logger.info({ task_id: taskId }, 'SSE stream closed for task');
    }

    // Handle client disconnect
    req.on('close', cleanup);
  },
);

// ---------------------------------------------------------------------------
// GET /channels/:channelId/stream -- SSE stream for channel messages
// ---------------------------------------------------------------------------

sseStreamRouter.get(
  '/channels/:channelId/stream',
  (req: Request, res: Response) => {
    const { channelId } = req.params;

    if (!channelId || channelId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_CHANNEL_ID', message: 'channelId parameter is required' },
      });
      return;
    }

    const workspace = getWorkspaceService().list().find((candidate) => candidate.defaultChannelId === channelId);
    if (!canAccessWorkspace(req, workspace?.workspaceId)) {
      sendAuthorizationDenied(res, `Channel stream access denied: ${channelId}`);
      return;
    }

    logger.info({ channel_id: channelId }, 'SSE stream opened for channel');

    // Initialize SSE response
    initSseResponse(res);

    // Send a connected event
    const connectedEvent: A2AEvent = {
      id: `init_${Date.now().toString(36)}`,
      type: 'channel.connected',
      timestamp: new Date().toISOString(),
      data: { channelId },
      channelId,
    };
    writeSseEvent(res, connectedEvent);

    // Subscribe to channel events
    const eventBus = getA2AEventBus();
    const unsubscribe = eventBus.subscribeChannel(channelId, (event: A2AEvent) => {
      try {
        writeSseEvent(res, event);
      } catch (err) {
        logger.debug({ channel_id: channelId, err }, 'error writing SSE event, cleaning up');
        cleanup();
      }
    });

    // Start heartbeat
    const heartbeatInterval = startHeartbeat(res);

    // Cleanup function
    let cleaned = false;
    function cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeatInterval);
      unsubscribe();
      logger.info({ channel_id: channelId }, 'SSE stream closed for channel');
    }

    // Handle client disconnect
    req.on('close', cleanup);
  },
);

// ---------------------------------------------------------------------------
// GET /events/stream -- Global SSE stream for all A2A events
// ---------------------------------------------------------------------------

sseStreamRouter.get(
  '/events/stream',
  (req: Request, res: Response) => {
    if (!canAccessWorkspace(req)) {
      sendAuthorizationDenied(res, 'Global stream access denied');
      return;
    }

    // Parse optional type filter from query string
    const typeFilter = parseTypeFilter(req.query.types);

    logger.info(
      { filter: typeFilter ? Array.from(typeFilter) : 'all' },
      'global SSE stream opened',
    );

    // Initialize SSE response
    initSseResponse(res);

    // Send a connected event
    const connectedEvent: A2AEvent = {
      id: `init_${Date.now().toString(36)}`,
      type: 'stream.connected',
      timestamp: new Date().toISOString(),
      data: {
        filter: typeFilter ? Array.from(typeFilter) : null,
      },
    };
    writeSseEvent(res, connectedEvent);

    // Subscribe to global events
    const eventBus = getA2AEventBus();
    const unsubscribe = eventBus.subscribeGlobal((event: A2AEvent) => {
      // Apply type filter if specified
      if (typeFilter && !typeFilter.has(event.type)) {
        return;
      }

      try {
        writeSseEvent(res, event);
      } catch (err) {
        logger.debug({ err }, 'error writing SSE event on global stream, cleaning up');
        cleanup();
      }
    });

    // Start heartbeat
    const heartbeatInterval = startHeartbeat(res);

    // Cleanup function
    let cleaned = false;
    function cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeatInterval);
      unsubscribe();
      logger.info('global SSE stream closed');
    }

    // Handle client disconnect
    req.on('close', cleanup);
  },
);
