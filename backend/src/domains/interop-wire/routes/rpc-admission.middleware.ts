/**
 * `rpc-admission.middleware` — the fail-closed admission guard the composer
 * mounts in FRONT of the A2A `POST /rpc` dispatcher. With the interop skeleton
 * no longer shadowing `/api/a2a`, this wire is publicly reachable, so the edge
 * must stay GOVERNED by the same signed-ingress posture as `/ingress`:
 *
 *   - a bare JSON-RPC 2.0 body is admitted ONLY in the explicit local-dev
 *     posture (`!requireSigned && allowInsecure`) — production denies it,
 *   - anything else is treated as an untrusted SIGNED ENVELOPE whose payload is
 *     the JSON-RPC request: the frozen signed-ingress gate verifies it
 *     (HMAC → expiry → skew, fail-closed) and ONLY the verified payload is
 *     dispatched (`req.body` is replaced with it),
 *   - any gate fault / malformed payload is a truthful deny — never an admit.
 *
 * Mirrors the interop domain's `ext-authz.middleware` deny mapping so the wire
 * answers with the canonical error envelope. Never throws on untrusted input.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ErrorCode, createError, sendError } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { IngressResult } from '../types.js';
import type { SignedIngressGate } from '../wire/signed-ingress.gate.js';

// --- Express request augmentation: the verified A2A sender from admission. ---
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The cryptographically-verified A2A sender (present only on the signed path). */
      a2aSigner?: { readonly keyId: string; readonly from?: string };
    }
  }
}

/** The signing posture the guard enforces (mirrors `InteropWireConfig`). */
export interface RpcAdmissionPosture {
  /** Reject unsigned calls (forced on in production). */
  readonly requireSigned: boolean;
  /** Allow bare (unsigned) JSON-RPC in local dev only (never in production). */
  readonly allowInsecure: boolean;
}

export interface RpcAdmissionGuardDeps {
  /** The frozen signed-ingress gate (fail-closed envelope admission). */
  readonly ingress: SignedIngressGate;
  readonly posture: RpcAdmissionPosture;
  readonly logger?: Logger;
}

/** Structural check for a bare JSON-RPC 2.0 request body. */
function isJsonRpcRequest(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.jsonrpc === '2.0' && typeof v.method === 'string';
}

/** Map a denied admission onto the canonical error envelope (as ext-authz does). */
function denyResponse(res: Response, result: IngressResult): void {
  // 5xx statuses (missing secret / verifier fault) are a service condition.
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
 * Build the `POST /rpc` admission guard. Fail-closed: only an explicitly
 * insecure dev posture admits bare JSON-RPC; everything else must arrive as a
 * verified signed envelope wrapping the JSON-RPC request.
 */
export function createRpcAdmissionGuard(deps: RpcAdmissionGuardDeps): RequestHandler {
  const { ingress, posture, logger } = deps;
  const insecureDevPosture = !posture.requireSigned && posture.allowInsecure;

  return (req: Request, res: Response, next: NextFunction): void => {
    const body: unknown = (req as { body?: unknown }).body;

    if (isJsonRpcRequest(body)) {
      if (insecureDevPosture) return next();
      sendError(
        res,
        createError(
          ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
          'Bare JSON-RPC is not admitted on this wire — wrap the call in a signed A2A envelope.',
        ),
      );
      return;
    }

    void Promise.resolve(ingress.admit(body))
      .then((result) => {
        if (!result.admitted) {
          denyResponse(res, result);
          return;
        }
        if (!isJsonRpcRequest(result.payload)) {
          sendError(
            res,
            createError(ErrorCode.INVALID_INPUT, 'Admitted envelope payload is not a JSON-RPC 2.0 request.'),
          );
          return;
        }
        // Dispatch ONLY the verified payload — never the raw wire body — and
        // carry the verified sender identity so the handler scopes ownership by
        // the proven signer, not a caller-supplied `params.userId`.
        req.body = result.payload;
        req.a2aSigner = result.signer;
        next();
      })
      .catch((err: unknown) => {
        // The gate is designed not to throw; an unexpected fault still fails closed.
        logger?.error(
          { err: err instanceof Error ? err.message : String(err), path: req.path },
          'rpc admission gate rejected unexpectedly — failing closed',
        );
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'RPC admission evaluator faulted.'));
      });
  };
}
