import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
} from '@recoder/shared/a2a';

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

export function createSignedA2AIngressMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.RECODER_A2A_SIGNING_SECRET;
    if (!secret || req.method === 'OPTIONS' || req.path === '/health') {
      next();
      return;
    }

    const timestamp = req.header('x-recoder-a2a-timestamp');
    const signature = req.header('x-recoder-a2a-signature');

    if (!timestamp || !signature) {
      res.status(401).json({
        success: false,
        error: buildA2AError({
          code: A2AErrorCodeEnum.AuthorizationDenied,
          message: 'Missing signed A2A ingress headers',
        }),
      });
      return;
    }

    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS) {
      res.status(401).json({
        success: false,
        error: buildA2AError({
          code: A2AErrorCodeEnum.AuthorizationDenied,
          message: 'Expired or invalid signed A2A ingress timestamp',
        }),
      });
      return;
    }

    const path = (req.originalUrl || req.url).split('?')[0] || '/';
    const expected = expectedSignature({
      secret,
      method: req.method,
      path,
      timestamp,
      body: readRawBody(req),
    });

    if (!timingSafeEqualHex(signature, expected)) {
      res.status(401).json({
        success: false,
        error: buildA2AError({
          code: A2AErrorCodeEnum.AuthorizationDenied,
          message: 'Invalid signed A2A ingress signature',
        }),
      });
      return;
    }

    next();
  };
}
