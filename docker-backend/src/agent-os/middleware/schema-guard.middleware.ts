/**
 * Agent OS ingress schema guards.
 *
 * Enforces the canonical `@recoder/agent-schemas` guards at the docker-backend
 * boundary for `/api/agent-os` and `/api/conductor` request bodies. This runs
 * IN-PROCESS on the real request call stack (mounted directly on each router),
 * BEFORE the controller persists anything — so a malformed canonical entity is
 * rejected fast with a clear 400 instead of being stored under an `undefined`
 * key or silently corrupting control-plane state.
 *
 * Guarantees:
 * - ADDITIVE: success response shapes are unchanged. Valid bodies pass through
 *   untouched (the guards only read, never mutate `req.body`).
 * - DEGRADE-SAFE: if the guard itself throws (e.g. the schema package fails to
 *   load), we log and fall through to prior behavior rather than 500-ing the
 *   request. A guard never blocks a launch because of its own failure.
 */
import type { NextFunction, Request, Response } from 'express';
import type { SchemaGuard, SchemaIssue } from '@recoder/agent-schemas';
import { logger } from '../../logger.js';

/**
 * Build an Express middleware that validates `req.body` against a canonical
 * `@recoder/agent-schemas` guard. Only the request body is validated — path
 * params, query, and success responses are left untouched.
 *
 * The `select` function lets callers point the guard at a nested body field
 * (e.g. conductor `/workspaces/plan` carries the TaskSpec under `body.task`).
 * When `select` returns `undefined`, validation is skipped (the route's own
 * handler decides whether the field is required), so this guard never
 * second-guesses optional-body routes.
 */
export function validateBody<T>(
  guard: SchemaGuard<T>,
  options: { select?: (body: unknown) => unknown } = {},
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let result;
    try {
      const target = options.select ? options.select(req.body) : req.body;
      // An absent optional sub-field is not an ingress error: defer to the
      // route handler (it returns its own clear 400 when the field is required).
      if (options.select && (target === undefined || target === null)) {
        next();
        return;
      }
      result = guard.parse(target);
    } catch (err) {
      // Degrade-safe: a guard failure must never crash a request or block a
      // launch. Log and preserve prior (un-guarded) behavior.
      logger.warn(
        { component: 'agent-os', guard: guard.name, err: err instanceof Error ? err.message : String(err) },
        'schema guard threw; passing request through un-guarded',
      );
      next();
      return;
    }

    if (result.ok) {
      next();
      return;
    }

    res.status(400).json({
      success: false,
      error: `Invalid ${guard.name} request body: ${formatIssues(result.issues)}`,
      issues: result.issues,
    });
  };
}

function formatIssues(issues: SchemaIssue[]): string {
  if (issues.length === 0) {
    return 'failed schema validation';
  }
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}
