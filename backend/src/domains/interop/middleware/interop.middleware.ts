/**
 * `interop.middleware` — the Express guard that runs the `InteropChain` on every
 * mounted edge (`authorize → risk → policy → audit`). It is the ONE guard the
 * edge/route table wraps around domain routers so every HTTP call is admitted by
 * governance before its handler runs.
 *
 * Fail-closed truthful mapping (never leaks internals, never fakes admit):
 *   - `!principal`  at authorize  -> 401 `AUTH_REQUIRED`
 *   - gate/evaluator fault (degraded deny) -> 503 `SERVICE_UNAVAILABLE`
 *   - policy deny / needs_approval          -> 403 `AUTHZ_PROJECT_ACCESS_DENIED`
 * On admit, the sealed `InteropDecision` is attached to `req.interopDecision`
 * (audit tip + tier) for downstream handlers and observability.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { GateTarget } from '../../governance/types.js';
import type { InteropChain, InteropContext, InteropDecision } from '../ports/interop-chain.port.js';

// --- Express request augmentation: the admitted edge decision. ---
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      interopDecision?: InteropDecision;
    }
  }
}

/** HTTP methods that mutate state (flow through the gate `decide` + audit seal). */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface InteropGuardOptions {
  /** Map a request to the governed action (dotted `resource.verb`). Defaults to `<method>:<path>`. */
  readonly actionOf?: (req: Request) => string;
  /** Map a request to the concrete governance target. Defaults to `{ path: req.path }`. */
  readonly targetOf?: (req: Request) => GateTarget;
  /** Override write detection (defaults to the HTTP method). */
  readonly isWriteOf?: (req: Request) => boolean;
  readonly logger?: Logger;
}

function defaultAction(req: Request): string {
  return `${req.method.toLowerCase()}:${req.baseUrl}${req.path}`;
}

function buildContext(req: Request, opts: InteropGuardOptions): InteropContext {
  const isWrite = opts.isWriteOf ? opts.isWriteOf(req) : WRITE_METHODS.has(req.method.toUpperCase());
  const requestId = (req as { requestId?: string }).requestId ?? undefined;
  return {
    principal: req.principal ?? null,
    action: opts.actionOf ? opts.actionOf(req) : defaultAction(req),
    target: opts.targetOf ? opts.targetOf(req) : { path: `${req.baseUrl}${req.path}` },
    method: req.method,
    route: `${req.baseUrl}${req.path}`,
    requestId,
    isWrite,
    metadata: { ip: req.ip },
  };
}

/** Map a fail-closed decision to the canonical error envelope. */
function denyResponse(res: Response, decision: InteropDecision, hadPrincipal: boolean): void {
  if (!hadPrincipal && decision.rejectedAt === 'authorize') {
    sendError(res, createError(ErrorCode.AUTH_REQUIRED, decision.reason));
    return;
  }
  if (decision.degraded && decision.tier === 'critical') {
    // A degraded critical deny is the fail-closed signal for a gate/evaluator fault.
    sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, decision.reason));
    return;
  }
  sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, decision.reason));
}

/**
 * Build the interop guard for a chain. Attach it in the edge route table around
 * every domain router. It never throws: an evaluator fault becomes a returned
 * fail-closed deny (503), a rejected policy becomes a 403.
 */
export function interopGuard(chain: InteropChain, options: InteropGuardOptions = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const hadPrincipal = Boolean(req.principal);
    void chain
      .run(buildContext(req, options))
      .then((decision) => {
        if (decision.admit) {
          req.interopDecision = decision;
          return next();
        }
        denyResponse(res, decision, hadPrincipal);
      })
      .catch((err: unknown) => {
        // The chain is fail-closed and should not reject; a rejection here is an
        // unexpected fault — still fail closed rather than calling next().
        options.logger?.error(
          { err: err instanceof Error ? err.message : String(err), path: req.path },
          'interop guard chain rejected unexpectedly — failing closed',
        );
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Edge governance evaluator faulted.'));
      });
  };
}
