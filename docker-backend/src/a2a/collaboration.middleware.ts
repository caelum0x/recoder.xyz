/**
 * @module collaboration.middleware
 *
 * Express middleware for validating AMB (Agent Messaging Bus) collaboration
 * requests: channels, threads, and messages.
 *
 * Follows the same validation pattern as `task-lifecycle.middleware.ts`:
 *   - Collect all issues into an array
 *   - Return a structured A2A error response with the full list
 *   - Call `next()` only when the body is valid
 */

import type { Request, Response, NextFunction } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function sendValidationError(res: Response, httpStatus: number, error: A2AError): void {
  res.status(httpStatus).json({ success: false, error });
}

// ---------------------------------------------------------------------------
// Validate create-channel body
// ---------------------------------------------------------------------------

const VALID_SCOPES = new Set(['channel', 'dm']);

/**
 * Validates `POST /api/a2a/channels` body.
 *
 * Required fields:
 * - name (string, non-empty)
 * - scope ('channel' | 'dm')
 * - memberAgentIds (array of non-empty strings, at least 1)
 */
export function validateCreateChannelBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: 'Request body must be a JSON object',
    }));
    return;
  }

  const issues: string[] = [];

  if (!body.name || typeof body.name !== 'string') {
    issues.push('name must be a non-empty string');
  }

  if (!body.scope || typeof body.scope !== 'string') {
    issues.push('scope must be a non-empty string');
  } else if (!VALID_SCOPES.has(body.scope)) {
    issues.push(`scope must be one of: ${[...VALID_SCOPES].join(', ')}. Got: '${body.scope}'`);
  }

  if (!Array.isArray(body.memberAgentIds)) {
    issues.push('memberAgentIds must be an array');
  } else {
    if (body.memberAgentIds.length === 0) {
      issues.push('memberAgentIds must contain at least one agent ID');
    }
    for (let i = 0; i < body.memberAgentIds.length; i++) {
      if (!body.memberAgentIds[i] || typeof body.memberAgentIds[i] !== 'string') {
        issues.push(`memberAgentIds[${i}] must be a non-empty string`);
      }
    }
  }

  if (issues.length > 0) {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: `Request validation failed: ${issues.join('; ')}`,
      details: { validation_issues: issues },
    }));
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Validate create-thread body
// ---------------------------------------------------------------------------

/**
 * Validates `POST /api/a2a/channels/:channelId/threads` body.
 *
 * Required fields:
 * - title (string, non-empty)
 */
export function validateCreateThreadBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: 'Request body must be a JSON object',
    }));
    return;
  }

  const issues: string[] = [];

  if (!body.title || typeof body.title !== 'string') {
    issues.push('title must be a non-empty string');
  }

  if (issues.length > 0) {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: `Request validation failed: ${issues.join('; ')}`,
      details: { validation_issues: issues },
    }));
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Validate send-message body
// ---------------------------------------------------------------------------

/**
 * Validates `POST /api/a2a/channels/:channelId/threads/:threadId/messages` body.
 *
 * Required fields:
 * - senderAgentId (string, non-empty)
 * - text (string, non-empty)
 */
export function validateSendMessageBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: 'Request body must be a JSON object',
    }));
    return;
  }

  const issues: string[] = [];

  if (!body.senderAgentId || typeof body.senderAgentId !== 'string') {
    issues.push('senderAgentId must be a non-empty string');
  }

  if (!body.text || typeof body.text !== 'string') {
    issues.push('text must be a non-empty string');
  }

  if (issues.length > 0) {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.InvalidEnvelope,
      message: `Request validation failed: ${issues.join('; ')}`,
      details: { validation_issues: issues },
    }));
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Validate channelId param
// ---------------------------------------------------------------------------

/**
 * Validates that `req.params.channelId` is present and non-empty.
 */
export function validateChannelIdParam(req: Request, res: Response, next: NextFunction): void {
  const { channelId } = req.params;
  if (!channelId || channelId === 'undefined') {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.MissingEnvelopeField,
      message: 'channelId parameter is required',
    }));
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Validate threadId param
// ---------------------------------------------------------------------------

/**
 * Validates that `req.params.threadId` is present and non-empty.
 */
export function validateThreadIdParam(req: Request, res: Response, next: NextFunction): void {
  const { threadId } = req.params;
  if (!threadId || threadId === 'undefined') {
    sendValidationError(res, 400, buildA2AError({
      code: A2AErrorCodeEnum.MissingEnvelopeField,
      message: 'threadId parameter is required',
    }));
    return;
  }
  next();
}
