import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
} from '@recoder/shared/a2a';
import {
  isSignedEnvelope,
  verifyInboundEnvelopeThroughInteropGate,
} from './interop-gate.adapter';
import { toEd25519PublicKey, type Ed25519PublicKey } from '@recoder/interop';

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

function readRawBody(req: Request): string {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function expectedSignature(input: {
  secret: string;
  method: string;
  path: string;
  timestamp: string;
  body: string;
}): string {
  const payload = `${input.method.toUpperCase()}\n${input.path}\n${input.timestamp}\n${input.body}`;
  return crypto.createHmac('sha256', input.secret).update(payload).digest('hex');
}

function denyAuthorization(res: Response, message: string, status = 401): void {
  res.status(status).json({
    success: false,
    error: buildA2AError({
      code: A2AErrorCodeEnum.AuthorizationDenied,
      message,
    }),
  });
}

/**
 * Resolve ed25519 public keys for inbound signed envelopes from the environment.
 *
 * `RECODER_A2A_ED25519_KEYS` is a JSON map of `{ "<key_id>": "<pubkey>" }` where the
 * value is a PEM/SPKI string or a raw 32-byte ed25519 public key (hex/base64). The
 * resolver is parsed once and reused; an unknown key_id is a clean DENY (null),
 * never a throw — matching the interop gate's hostile-by-default contract.
 */
function buildEd25519Resolver(): ((keyId: string) => Ed25519PublicKey | null) | undefined {
  const raw = process.env.RECODER_A2A_ED25519_KEYS;
  if (!raw) return undefined;
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw) as Record<string, string>;
  } catch {
    return undefined;
  }
  return (keyId: string): Ed25519PublicKey | null => {
    const value = parsed[keyId];
    if (!value) return null;
    try {
      // Validate/coerce eagerly so a malformed configured key is a DENY, not a throw.
      return toEd25519PublicKey(value);
    } catch {
      return null;
    }
  };
}

/**
 * A2A signed-ingress middleware.
 *
 * Two complementary admission paths, both additive and degrade-safe:
 *
 *  1. SIGNED ENVELOPE (owned interop gate): when the request body is a well-formed
 *     `SignedEnvelope`, it is verified THROUGH `@recoder/interop`'s signed-ingress
 *     gate — real HMAC-SHA256 (via a2a-sdk) or real ed25519 (interop's asymmetric
 *     verifier). A present-but-invalid signature is ALWAYS rejected here, regardless
 *     of flags: an attacker cannot downgrade by sending a bad signature.
 *
 *  2. LEGACY HEADER HMAC: the pre-existing `x-recoder-a2a-signature` header scheme,
 *     gated by `RECODER_A2A_SIGNING_SECRET`. Preserved verbatim for backward compat.
 *
 * Backward compatibility: unsigned/legacy traffic that is currently allowed stays
 * allowed. Strict mode (`RECODER_A2A_STRICT_INGRESS=true`) additionally REQUIRES a
 * valid signed envelope on privileged (non-GET, non-OPTIONS) requests.
 */
export function createSignedA2AIngressMiddleware() {
  const ed25519Resolver = buildEd25519Resolver();

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS' || req.path === '/health') {
      next();
      return;
    }

    const strictMode = process.env.RECODER_A2A_STRICT_INGRESS === 'true';
    const hmacSecret = process.env.RECODER_A2A_SIGNING_SECRET;
    const body = req.body;

    // --- Path 1: signed envelope present → ALWAYS verify through interop gate -----
    if (isSignedEnvelope(body)) {
      const result = verifyInboundEnvelopeThroughInteropGate(body, {
        hmacSecret,
        resolveEd25519Key: ed25519Resolver,
      });
      if (!result.admitted) {
        denyAuthorization(
          res,
          `Signed A2A envelope rejected by interop gate (${result.stage}): ${result.reason}`,
          result.status >= 400 && result.status < 600 ? result.status : 401,
        );
        return;
      }
      // Verified payload is now trusted; expose it for downstream handlers.
      (req as Request & { a2aVerifiedPayload?: unknown }).a2aVerifiedPayload = result.payload;
      next();
      return;
    }

    // --- No signed envelope on the body ------------------------------------------

    // Legacy header-HMAC scheme (only when a signing secret is configured).
    if (hmacSecret) {
      const timestamp = req.header('x-recoder-a2a-timestamp');
      const signature = req.header('x-recoder-a2a-signature');

      if (timestamp || signature) {
        if (!timestamp || !signature) {
          denyAuthorization(res, 'Missing signed A2A ingress headers');
          return;
        }
        const timestampMs = Date.parse(timestamp);
        if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS) {
          denyAuthorization(res, 'Expired or invalid signed A2A ingress timestamp');
          return;
        }
        const path = (req.originalUrl || req.url).split('?')[0] || '/';
        const expected = expectedSignature({
          secret: hmacSecret,
          method: req.method,
          path,
          timestamp,
          body: readRawBody(req),
        });
        if (!timingSafeEqualHex(signature, expected)) {
          denyAuthorization(res, 'Invalid signed A2A ingress signature');
          return;
        }
        next();
        return;
      }

      // Secret configured but no header signature: legacy behavior required them.
      denyAuthorization(res, 'Missing signed A2A ingress headers');
      return;
    }

    // No signing secret + no signed envelope. Strict mode rejects privileged calls.
    if (strictMode && req.method !== 'GET' && req.method !== 'HEAD') {
      denyAuthorization(res, 'A2A strict ingress requires a signed envelope');
      return;
    }

    next();
  };
}
