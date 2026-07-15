/**
 * Inference control routes — model discovery, truthful gateway health, a governed
 * buffered completion, per-user usage + BYOK provider-key metadata. Mounted by the
 * composer; paths resolve under the inference base.
 *
 *   GET    /inference/models              — routable model catalog (enabled)
 *   GET    /inference/health              — truthful delivery-ladder health
 *   POST   /inference/complete            — buffered completion (auth; accounted)
 *   GET    /inference/usage               — the caller's recent usage + totals
 *   GET    /inference/keys                — the caller's BYOK provider-key metadata
 *   POST   /inference/keys/:provider/rotate — bump key_version (metadata only)
 *   DELETE /inference/keys/:provider      — delete a provider-key metadata row
 *
 * SECURITY: no key material is ever returned — `/keys` surfaces metadata only.
 * Mutating routes require a real (non-anonymous) principal; usage + keys are
 * app-layer scoped to `principal.userId`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { ProviderKeyRepository, ProviderKeyCache } from '../ports/provider-keys.port.js';
import type { UsageLedgerRepository } from '../ports/usage-ledger.port.js';
import type { InferenceRoutingService } from '../services/inference-routing.service.js';
import type { InferenceMessage, InferenceRole } from '../types.js';

export interface InferenceRoutesDeps {
  readonly gateway: InferenceGatewayPort;
  readonly routing: Pick<InferenceRoutingService, 'complete'>;
  readonly catalog: ModelCatalogRepository;
  readonly ledger: UsageLedgerRepository;
  readonly providerKeys: ProviderKeyRepository;
  readonly keyCache: ProviderKeyCache;
  readonly mw: AuthMiddleware;
}

const roleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
const completeBodySchema = z.object({
  model: z.string().trim().min(1),
  messages: z
    .array(z.object({ role: roleSchema, content: z.string() }))
    .min(1),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
});

const providerSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9._-]+$/i, 'provider may contain only letters, digits, and . _ -');

/** Build the inference control router. */
export function buildInferenceRouter(deps: InferenceRoutesDeps): Router {
  const { gateway, routing, catalog, ledger, providerKeys, keyCache, mw } = deps;
  const router = Router();

  router.get(
    '/inference/models',
    mw.authenticate,
    asyncHandler(async (_req, res) => {
      const models = await catalog.list({ enabledOnly: true });
      sendSuccess(res, { count: models.length, models });
    }),
  );

  router.get(
    '/inference/health',
    mw.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { health: await gateway.health() });
    }),
  );

  router.post(
    '/inference/complete',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = completeBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const messages: InferenceMessage[] = parsed.data.messages.map((m) => ({
        role: m.role as InferenceRole,
        content: m.content,
      }));
      const result = await routing.complete({
        model: parsed.data.model,
        messages,
        ...(parsed.data.temperature !== undefined ? { temperature: parsed.data.temperature } : {}),
        ...(parsed.data.maxTokens !== undefined ? { maxTokens: parsed.data.maxTokens } : {}),
        ...(req.principal?.userId ? { userId: req.principal.userId } : {}),
      });
      if (!result.routed) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'no inference tier available'));
        return;
      }
      sendSuccess(res, { result });
    }),
  );

  router.get(
    '/inference/usage',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const userId = req.principal?.userId ?? '';
      const [recent, totals] = await Promise.all([
        ledger.recentForUser(userId, 50),
        ledger.totalsForUser(userId),
      ]);
      sendSuccess(res, { totals, recent });
    }),
  );

  router.get(
    '/inference/keys',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const keys = await providerKeys.listForUser(req.principal?.userId ?? '');
      // Metadata only — never the ciphertext or plaintext key.
      sendSuccess(res, { keys });
    }),
  );

  router.post(
    '/inference/keys/:provider/rotate',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = providerSchema.safeParse(req.params.provider);
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, parsed.error.issues[0]?.message ?? 'invalid provider'));
        return;
      }
      const userId = req.principal?.userId ?? '';
      const rotated = await providerKeys.rotate(userId, parsed.data);
      if (!rotated) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'provider key not found'));
        return;
      }
      // Drop the cached plaintext so the next call re-fetches the rotated key.
      keyCache.invalidate(userId);
      sendSuccess(res, { key: rotated });
    }),
  );

  router.delete(
    '/inference/keys/:provider',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = providerSchema.safeParse(req.params.provider);
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, parsed.error.issues[0]?.message ?? 'invalid provider'));
        return;
      }
      const userId = req.principal?.userId ?? '';
      const removed = await providerKeys.delete(userId, parsed.data);
      if (!removed) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'provider key not found or already deleted'));
        return;
      }
      keyCache.invalidate(userId);
      sendSuccess(res, { provider: parsed.data, deleted: true });
    }),
  );

  return router;
}
