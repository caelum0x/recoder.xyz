/**
 * Governance secrets routes — encrypted-at-rest secret management for the
 * authenticated caller. Mount under `/api/agent-os` (paths resolve to
 * `/api/agent-os/secrets`).
 *
 *   GET    /secrets              — list the caller's secret refs (metadata only)
 *   GET    /secrets/:ref         — metadata for one ref (exists + key_version)
 *   POST   /secrets              — set a secret (body { ref, value }) — governance write
 *   POST   /secrets/:ref/rotate  — re-encrypt under a fresh nonce/version — governance write
 *   DELETE /secrets/:ref         — delete a secret the caller owns — governance write
 *
 * SECURITY: the decrypted plaintext is NEVER returned over HTTP — only
 * server-side domains read it through the `SecretsPort`. These edges surface
 * metadata only. Every route is session-gated via `authenticateMutating` (a
 * real, non-anonymous principal); secrets are scoped app-layer to
 * `principal.userId`. When the vault master key is absent the service rejects
 * with `SERVICE_UNAVAILABLE` (503) — never a faked write, never a plaintext store.
 *
 * `:ref` path params are URL-encoded by the client (e.g. `byok%2Fopenai`); Express
 * decodes them into `req.params.ref`. Every ref is re-validated at the boundary.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  ErrorCode,
  createError,
  sendError,
  sendSuccess,
  asyncHandler,
} from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { SecretsPort } from '../ports/secrets.port.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { SecretRef } from '../types.js';

export interface GovernanceSecretsRouterDeps {
  readonly secrets: SecretsPort;
  readonly mw: AuthMiddleware;
  readonly logger: Logger;
}

/** Logical secret ref: dotted/pathy name, no whitespace, bounded length. */
const refSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:/-]+$/, 'ref may contain only letters, digits, and . _ : / -');

/** `POST /secrets` body. */
const setBodySchema = z.object({
  ref: refSchema,
  value: z.string().min(1).max(64 * 1024),
});

/** The owning user for a secret operation (never anonymous past the guard). */
function ownerId(req: Request): string {
  return req.principal?.userId ?? '';
}

/** Metadata-only view of a secret ref (no ciphertext, no plaintext). */
function toPublic(ref: SecretRef): {
  ref: string;
  keyVersion: number;
  rotatedAt: string | null;
  createdAt: string;
} {
  return {
    ref: ref.ref,
    keyVersion: ref.keyVersion,
    rotatedAt: ref.rotatedAt ?? null,
    createdAt: ref.createdAt,
  };
}

/** Build the governance-secrets router (mount at `/api/agent-os`). */
export function buildGovernanceSecretsRouter(deps: GovernanceSecretsRouterDeps): Router {
  const { secrets, mw } = deps;
  const router = Router();

  router.get(
    '/secrets',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const refs = await secrets.list(ownerId(req));
      sendSuccess(res, { secrets: refs.map(toPublic) });
    }),
  );

  router.get(
    '/secrets/:ref',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = refSchema.safeParse(req.params.ref);
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, parsed.error.issues[0]?.message ?? 'invalid ref'));
        return;
      }
      const owner = ownerId(req);
      const found = (await secrets.list(owner)).find((r) => r.ref === parsed.data);
      if (!found) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'secret not found'));
        return;
      }
      sendSuccess(res, { secret: toPublic(found) });
    }),
  );

  router.post(
    '/secrets',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = setBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const stored = await secrets.set(ownerId(req), parsed.data.ref, parsed.data.value);
      // The plaintext is stored encrypted and is never echoed back.
      sendSuccess(res, { secret: toPublic(stored) }, { statusCode: 201 });
    }),
  );

  router.post(
    '/secrets/:ref/rotate',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = refSchema.safeParse(req.params.ref);
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, parsed.error.issues[0]?.message ?? 'invalid ref'));
        return;
      }
      const rotated = await secrets.rotate(ownerId(req), parsed.data);
      if (!rotated) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'secret not found'));
        return;
      }
      sendSuccess(res, { secret: toPublic(rotated) });
    }),
  );

  router.delete(
    '/secrets/:ref',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = refSchema.safeParse(req.params.ref);
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, parsed.error.issues[0]?.message ?? 'invalid ref'));
        return;
      }
      const removed = await secrets.delete(ownerId(req), parsed.data);
      if (!removed) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'secret not found or already deleted'));
        return;
      }
      sendSuccess(res, { ref: parsed.data, deleted: true });
    }),
  );

  return router;
}
