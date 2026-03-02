/**
 * @module context-bridge.middleware
 *
 * Express middleware for validating Context Bridge API requests.
 *
 * These middleware functions validate request bodies and parameters
 * before they reach the route handlers, ensuring:
 *
 * 1. Context type is valid.
 * 2. Required fields are present for create/append/transfer operations.
 * 3. Task ID parameters are non-empty.
 */

import type { Request, Response, NextFunction } from 'express';
import { CONTEXT_TYPES, type ContextType } from './context-bridge.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-context-middleware');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function sendError(res: Response, httpStatus: number, message: string, details?: Record<string, unknown>): void {
  res.status(httpStatus).json({
    success: false,
    error: { message, ...(details ? { details } : {}) },
  });
}

// ---------------------------------------------------------------------------
// Parse JSON from text body (A2A routes use express.text())
// ---------------------------------------------------------------------------

/**
 * Middleware to parse JSON from a string body.
 * The parent A2A mount uses `express.text()` so the body arrives as a string.
 * This parses it back into an object. If the body is already an object
 * (e.g. from `express.json()`), it's a no-op.
 */
export function parseContextJsonBody(req: Request, res: Response, next: NextFunction): void {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      sendError(res, 400, 'Invalid JSON in request body');
      return;
    }
  }
  next();
}

// ---------------------------------------------------------------------------
// Validate taskId param
// ---------------------------------------------------------------------------

/**
 * Validates that the `:taskId` route parameter is present and non-empty.
 */
export function validateTaskIdParam(req: Request, res: Response, next: NextFunction): void {
  const { taskId } = req.params;
  if (!taskId || taskId === 'undefined' || taskId === 'null') {
    sendError(res, 400, 'taskId parameter is required');
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Validate context type param
// ---------------------------------------------------------------------------

const VALID_CONTEXT_TYPES = new Set<string>(CONTEXT_TYPES as readonly string[]);

/**
 * Validates that the `:type` route parameter is a valid context type.
 */
export function validateContextTypeParam(req: Request, res: Response, next: NextFunction): void {
  const { type } = req.params;
  if (!type || !VALID_CONTEXT_TYPES.has(type)) {
    sendError(res, 400, `Invalid context type '${type}'. Must be one of: ${CONTEXT_TYPES.join(', ')}`, {
      valid_types: [...CONTEXT_TYPES],
    });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Validate create/append context body
// ---------------------------------------------------------------------------

/**
 * Validates the request body for creating or appending context.
 *
 * Required fields:
 * - type (string, one of CONTEXT_TYPES)
 * - data (non-null, non-undefined)
 */
export function validateCreateContextBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    sendError(res, 400, 'Request body must be a JSON object');
    return;
  }

  const issues: string[] = [];

  if (!body.type || typeof body.type !== 'string') {
    issues.push('type must be a non-empty string');
  } else if (!VALID_CONTEXT_TYPES.has(body.type)) {
    issues.push(`type must be one of: ${CONTEXT_TYPES.join(', ')}`);
  }

  if (body.data === undefined || body.data === null) {
    issues.push('data is required and must not be null');
  }

  if (issues.length > 0) {
    sendError(res, 400, `Request validation failed: ${issues.join('; ')}`, {
      validation_issues: issues,
    });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Validate transfer context body
// ---------------------------------------------------------------------------

/**
 * Validates the request body for transferring context between tasks.
 *
 * Required fields:
 * - fromTaskId (string)
 * - toTaskId (string)
 */
export function validateTransferContextBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    sendError(res, 400, 'Request body must be a JSON object');
    return;
  }

  const issues: string[] = [];

  if (!body.fromTaskId || typeof body.fromTaskId !== 'string') {
    issues.push('fromTaskId must be a non-empty string');
  }

  if (!body.toTaskId || typeof body.toTaskId !== 'string') {
    issues.push('toTaskId must be a non-empty string');
  }

  if (body.fromTaskId && body.toTaskId && body.fromTaskId === body.toTaskId) {
    issues.push('fromTaskId and toTaskId must be different');
  }

  if (issues.length > 0) {
    sendError(res, 400, `Request validation failed: ${issues.join('; ')}`, {
      validation_issues: issues,
    });
    return;
  }

  next();
}
