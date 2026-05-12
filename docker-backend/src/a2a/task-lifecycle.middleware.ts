/**
 * @module task-lifecycle.middleware
 *
 * Express middleware for validating A2A task lifecycle requests.
 *
 * These middleware functions sit between the raw HTTP request and the route
 * handlers, ensuring that:
 *
 * 1. Request bodies have the required shape before reaching the service.
 * 2. Referenced tasks exist and are loaded onto `req.taskEnvelope`.
 * 3. Validation errors return structured A2A error responses.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  TaskStateEnum,
  TASK_STATES,
  A2AErrorCodeEnum,
  buildA2AError,
  type TaskEnvelope,
  type TaskState,
  type A2AError,
} from '@recoder/shared/a2a';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-task-middleware');

// ---------------------------------------------------------------------------
// Augment Express Request
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      /** The loaded task envelope, set by `loadTaskEnvelope` middleware. */
      taskEnvelope?: TaskEnvelope;
    }
  }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function sendA2AError(res: Response, httpStatus: number, error: A2AError): void {
  res.status(httpStatus).json({
    success: false,
    error,
  });
}

// ---------------------------------------------------------------------------
// Validate create-task body
// ---------------------------------------------------------------------------

/**
 * Validates the request body for `POST /api/a2a/tasks`.
 *
 * Required fields:
 * - workspace_id (string)
 * - thread_id (string)
 * - requester (object with agent_id, platform)
 * - assignee (object with agent_id, platform), unless `auto_route=true`
 * - connector (object with connector_id, platform, protocol), unless `auto_route=true`
 * - payload (non-null)
 */
export function validateCreateTaskBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    sendA2AError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: 'Request body must be a JSON object',
    }));
    return;
  }

  const issues: string[] = [];
  const wantsAutoRoute = body?.auto_route === true;

  if (!body.workspace_id || typeof body.workspace_id !== 'string') {
    issues.push('workspace_id must be a non-empty string');
  }
  if (!body.thread_id || typeof body.thread_id !== 'string') {
    issues.push('thread_id must be a non-empty string');
  }

  // requester
  if (!body.requester || typeof body.requester !== 'object') {
    issues.push('requester must be an object');
  } else {
    if (!body.requester.agent_id || typeof body.requester.agent_id !== 'string') {
      issues.push('requester.agent_id must be a non-empty string');
    }
    if (!body.requester.platform || typeof body.requester.platform !== 'string') {
      issues.push('requester.platform must be a non-empty string');
    }
  }

  // assignee / connector are optional when the route is asked to auto-route
  if (!wantsAutoRoute) {
    if (!body.assignee || typeof body.assignee !== 'object') {
      issues.push('assignee must be an object');
    } else {
      if (!body.assignee.agent_id || typeof body.assignee.agent_id !== 'string') {
        issues.push('assignee.agent_id must be a non-empty string');
      }
      if (!body.assignee.platform || typeof body.assignee.platform !== 'string') {
        issues.push('assignee.platform must be a non-empty string');
      }
    }

    if (!body.connector || typeof body.connector !== 'object') {
      issues.push('connector must be an object');
    } else {
      if (!body.connector.connector_id || typeof body.connector.connector_id !== 'string') {
        issues.push('connector.connector_id must be a non-empty string');
      }
      if (!body.connector.platform || typeof body.connector.platform !== 'string') {
        issues.push('connector.platform must be a non-empty string');
      }
      if (!body.connector.protocol || typeof body.connector.protocol !== 'string') {
        issues.push('connector.protocol must be a non-empty string');
      }
    }
  } else if (body.routing_hints !== undefined && (typeof body.routing_hints !== 'object' || body.routing_hints === null || Array.isArray(body.routing_hints))) {
    issues.push('routing_hints must be an object when provided');
  }

  // payload
  if (body.payload === undefined || body.payload === null) {
    issues.push('payload is required');
  }

  if (issues.length > 0) {
    sendA2AError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: `Request validation failed: ${issues.join('; ')}`,
      details: { validation_issues: issues },
    }));
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Validate transition body
// ---------------------------------------------------------------------------

const VALID_TASK_STATES = new Set<string>(TASK_STATES as readonly string[]);

/**
 * Validates the request body for `PATCH /api/a2a/tasks/:taskId/transition`.
 *
 * Required fields:
 * - target_state (one of the canonical task states)
 *
 * Optional fields:
 * - reason (string)
 * - triggered_by (string)
 * - result (object, only valid for completed)
 * - error (object, only valid for failed)
 */
export function validateTransitionBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    sendA2AError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: 'Request body must be a JSON object',
    }));
    return;
  }

  const issues: string[] = [];

  if (!body.target_state || typeof body.target_state !== 'string') {
    issues.push('target_state must be a non-empty string');
  } else if (!VALID_TASK_STATES.has(body.target_state)) {
    issues.push(
      `target_state must be one of: ${Array.from(VALID_TASK_STATES).join(', ')}. Got: '${body.target_state}'`,
    );
  }

  if (body.reason !== undefined && typeof body.reason !== 'string') {
    issues.push('reason must be a string when provided');
  }

  if (body.triggered_by !== undefined && typeof body.triggered_by !== 'string') {
    issues.push('triggered_by must be a string when provided');
  }

  if (body.result !== undefined && (typeof body.result !== 'object' || body.result === null)) {
    issues.push('result must be an object when provided');
  }

  if (body.error !== undefined && (typeof body.error !== 'object' || body.error === null)) {
    issues.push('error must be an object when provided');
  }

  // Validate that result is only provided for completed transitions
  if (body.result && body.target_state !== TaskStateEnum.Completed) {
    issues.push('result can only be provided when target_state is "completed"');
  }

  // Validate that error is only provided for failed transitions
  if (body.error && body.target_state !== TaskStateEnum.Failed) {
    issues.push('error can only be provided when target_state is "failed"');
  }

  if (issues.length > 0) {
    sendA2AError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: `Request validation failed: ${issues.join('; ')}`,
      details: { validation_issues: issues },
    }));
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Load task envelope from store
// ---------------------------------------------------------------------------

/**
 * Loads a task envelope from the store and attaches it to the request.
 * Returns 404 if the task does not exist.
 *
 * Expects `req.params.taskId` to be set (via Express route param).
 */
export function loadTaskEnvelope(req: Request, res: Response, next: NextFunction): void {
  const { taskId } = req.params;

  if (!taskId) {
    sendA2AError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.MissingEnvelopeField,
      message: 'taskId parameter is required',
    }));
    return;
  }

  const service = getTaskLifecycleService();
  const result = service.getTask(taskId);

  if (!result.ok) {
    sendA2AError(res, result.httpStatus, result.error);
    return;
  }

  req.taskEnvelope = result.data;
  next();
}

// ---------------------------------------------------------------------------
// Parse JSON text body (for routes mounted behind text middleware)
// ---------------------------------------------------------------------------

/**
 * Some A2A routes are mounted behind `express.text()` for raw payload
 * verification. This middleware parses the text body back into JSON.
 */
export function parseJsonTextBody(req: Request, res: Response, next: NextFunction): void {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      sendA2AError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidPayload,
        message: 'Request body is not valid JSON',
      }));
      return;
    }
  }
  next();
}
