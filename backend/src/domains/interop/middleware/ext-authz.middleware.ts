/**
 * `ext-authz.middleware` — the fail-closed external-authorization gate for
 * UNTRUSTED ingress (A2A envelopes, connector webhooks, envoy `ext_authz`). It
 * consumes the interop `signed-ingress.gate` (signature → identity → policy) and
 * denies on ANY evaluator fault or an unwired verifier.
 *
 * Unlike `interopGuard` (which governs already-authenticated internal edges via
 * the `InteropChain`), THIS gate stands in front of hostile external ingress and
 * proves the envelope itself before any principal is trusted. It reads the raw
 * request body as the untrusted value.
 *
 * Fail-closed: a rejected admission -> the gate's status/`AUTHZ_PROJECT_ACCESS_
 * DENIED`; an unwired/faulting verifier -> `SERVICE_UNAVAILABLE`. Never admits on
 * fault.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { IngressResult } from '../types.js';
import type { SignedIngressGate } from '../wire/signed-ingress.gate.js';

// --- Express request augmentation: the verified ingress payload. ---
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ingress?: IngressResult;
    }
  }
}

export interface ExtAuthzGuardDeps {
  /** The signed-ingress gate (fail-closed admission). */
  readonly gate: SignedIngressGate;
  /** Extract the untrusted value to admit. Default: `req.body`. */
  readonly valueOf?: (req: Request) => unknown;
  readonly logger?: Logger;
}

/** Map an admission status to the canonical error envelope. */
function denyResponse(res: Response, result: IngressResult): void {
  // 5xx statuses (unwired verifier / verifier fault) are a service condition.
  if (result.status >= 500) {
    sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason));
    return;
  }
  if (result.status === 400) {
    sendError(res, createError(ErrorCode.INVALID_INPUT, result.reason));
    return;
  }
  sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, result.reason));
}

/**
 * Build the ext-authz ingress guard. Mount it in FRONT of hostile external
 * ingress routes (A2A rpc/message, connector webhooks). Never throws: any fault
 * becomes a fail-closed deny.
 */
export function extAuthzGuard(deps: ExtAuthzGuardDeps): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = deps.valueOf ? deps.valueOf(req) : (req as { body?: unknown }).body;
    void Promise.resolve(deps.gate.admit(value))
      .then((result) => {
        if (result.admitted) {
          req.ingress = result;
          return next();
        }
        denyResponse(res, result);
      })
      .catch((err: unknown) => {
        // The gate is designed not to throw; a rejection is an unexpected fault —
        // still fail closed.
        deps.logger?.error(
          { err: err instanceof Error ? err.message : String(err), path: req.path },
          'ext-authz gate rejected unexpectedly — failing closed',
        );
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Ingress authorization evaluator faulted.'));
      });
  };
}
