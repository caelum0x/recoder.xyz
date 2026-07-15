/**
 * The ONE sanctioned inbound-validation entry point. Everything untrusted (body,
 * query, params) is parsed with a zod schema at this boundary BEFORE any domain
 * handler runs; on failure it returns the canonical `VALIDATION_ERROR` envelope
 * carrying the offending field paths (never a stack or the raw input). On success
 * the parsed, coerced value REPLACES the request field so handlers see typed,
 * sanitized data.
 *
 * Security posture (AGENTS.md): never trust external data — validate at the
 * system boundary, fail fast with a clear message, and surface field-level
 * detail without leaking internals.
 */
import type { Request, RequestHandler } from 'express';
import type { ZodError, ZodType } from 'zod';
import { ErrorCode, createError, sendError } from '../../shared/errors.js';

/** Which part of the request a validator targets. */
type Source = 'body' | 'query' | 'params';

/** Flatten a `ZodError` into `{ path, message }[]` (no input values echoed). */
function fieldIssues(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

/** Assign the parsed value back onto the request field (query/params are read-only getters on some setups). */
function assign(req: Request, source: Source, value: unknown): void {
  if (source === 'query') {
    // Express 5 exposes `query` as a getter; define a writable own property.
    Object.defineProperty(req, 'query', { value, writable: true, configurable: true, enumerable: true });
    return;
  }
  (req as Record<Source, unknown>)[source] = value;
}

/** Build a boundary validator for one request source. */
function validate<T>(source: Source, schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      sendError(
        res,
        createError(ErrorCode.VALIDATION_ERROR, `Invalid request ${source}.`, {
          details: { source, fields: fieldIssues(result.error) },
        }),
      );
      return;
    }
    assign(req, source, result.data);
    next();
  };
}

/** Validate + narrow `req.body` against `schema`. */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return validate('body', schema);
}

/** Validate + narrow `req.query` against `schema`. */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return validate('query', schema);
}

/** Validate + narrow `req.params` against `schema`. */
export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return validate('params', schema);
}
