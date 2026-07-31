/**
 * Inference control routes — model discovery, truthful gateway health, a governed
 * buffered completion, per-user usage + BYOK provider-key metadata. Mounted by the
 * composer; paths resolve under the inference base.
 *
 *   GET    /inference/models              — routable model catalog (enabled)
 *   GET    /inference/health              — truthful delivery-ladder health
 *   POST   /inference/complete            — buffered completion (auth; accounted)
 *   POST   /inference/feedback            — attach a feedback signal to an inference_id
 *   GET    /inference/usage               — the caller's recent usage + totals
 *   GET    /inference/keys                — the caller's BYOK provider-key metadata
 *   PUT    /inference/keys/:provider      — GOVERNED key write: encrypt + store the
 *                                           caller's BYOK key (governance `decide`
 *                                           gates it; vault-down fails closed)
 *   POST   /inference/keys/:provider/rotate — bump key_version (metadata only)
 *   DELETE /inference/keys/:provider      — delete the key (secret + metadata + cache)
 *
 * SECURITY: no key material is ever returned or logged — `/keys` surfaces
 * metadata only; the PUT body's `key` value goes straight into the resolver's
 * encrypted store and is never echoed (not even in validation errors). Mutating
 * routes require a real (non-anonymous) principal; usage + keys are app-layer
 * scoped to `principal.userId`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { ProviderKeyRepository, ProviderKeyCache } from '../ports/provider-keys.port.js';
import type { ByokKeyResolver, InferenceKeyWriteGate } from '../ports/byok-resolver.port.js';
import type { UsageLedgerRepository } from '../ports/usage-ledger.port.js';
import type { InferenceRoutingService } from '../services/inference-routing.service.js';
import type { InferenceMessage, InferenceRole } from '../types.js';

export interface InferenceRoutesDeps {
  readonly gateway: InferenceGatewayPort;
  readonly routing: Pick<InferenceRoutingService, 'complete' | 'feedback'>;
  readonly catalog: ModelCatalogRepository;
  readonly ledger: UsageLedgerRepository;
  readonly providerKeys: ProviderKeyRepository;
  readonly keyCache: ProviderKeyCache;
  /** The BYOK key resolver (encrypted store + cache) behind the key-write route. */
  readonly resolver: ByokKeyResolver;
  /**
   * Lazy accessor for the governance gate governing key writes (the gate is
   * wired post-construction by bootstrap). Resolving `undefined` ⇒
   * `PUT /inference/keys/:provider` fails CLOSED with a truthful 503 (a secret
   * write is a governed mutation — never allowed ungoverned by default).
   */
  readonly getGate: () => InferenceKeyWriteGate | undefined;
  readonly mw: AuthMiddleware;
  /**
   * Solo/desktop mode (bootstrap-injected from `RECODER_SOLO_MODE`): the single
   * local owner has no sign-in plane, so the cross-tenant feedback ownership guard
   * fails OPEN for them (never locks the embedded desktop user out of feedback).
   */
  readonly soloMode?: boolean;
}

const roleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

// OPTIONAL task-intent context the pal routing brain uses to pick provider/model/
// rung. Bounded strings; `taskSpec` is passed through (pal coerces + validates it).
const routingHintSchema = z
  .object({
    taskId: z.string().trim().min(1).max(256).optional(),
    intent: z.string().trim().min(1).max(64).optional(),
    title: z.string().max(512).optional(),
    goal: z.string().max(4096).optional(),
    taskSpec: z.record(z.string(), z.unknown()).optional(),
  })
  .optional();

const completeBodySchema = z.object({
  model: z.string().trim().min(1),
  messages: z
    .array(z.object({ role: roleSchema, content: z.string() }))
    .min(1),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  routingHint: routingHintSchema,
});

const feedbackBodySchema = z.object({
  inferenceId: z.string().trim().min(1),
  metricName: z.string().trim().min(1).max(128),
  value: z.union([z.boolean(), z.number(), z.string().max(10_000)]),
});

const providerSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9._-]+$/i, 'provider may contain only letters, digits, and . _ -');

// The key value is validated by LENGTH ONLY with fixed messages — a zod refine
// echoing the received value could leak key material into an error envelope.
const keyWriteBodySchema = z.object({
  key: z
    .string({ message: 'key must be a string' })
    .trim()
    .min(8, { message: 'key must be at least 8 characters' })
    .max(4096, { message: 'key must be at most 4096 characters' }),
});

/**
 * Operator bypass for the cross-tenant feedback ownership guard: an `internal`
 * service-to-service caller or an `admin`/`internal`-scoped principal (mirrors
 * `isPrivilegedPrincipal` in agent-os space-authz). Absent principal ⇒ not
 * privileged. NEVER derived from the request body.
 */
function isPrivilegedPrincipal(principal: { kind?: string; scopes?: readonly string[] } | undefined): boolean {
  if (!principal) return false;
  return principal.kind === 'internal' || (principal.scopes?.includes('admin') ?? false) || (principal.scopes?.includes('internal') ?? false);
}

/** Build the inference control router. */
export function buildInferenceRouter(deps: InferenceRoutesDeps): Router {
  const { gateway, routing, catalog, ledger, providerKeys, keyCache, resolver, getGate, mw } = deps;
  const soloMode = deps.soloMode ?? false;
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
        // pal routing brain fires when the caller supplies task-intent context.
        ...(parsed.data.routingHint ? { routingHint: parsed.data.routingHint } : {}),
      });
      if (!result.routed) {
        // Pre-dispatch entitlement refusal: a truthful 429 (QUOTA_EXCEEDED),
        // never a 503 over an over-quota subject.
        if (result.denied === 'quota') {
          sendError(res, createError(ErrorCode.QUOTA_EXCEEDED, result.reason ?? 'inference token quota exceeded'));
          return;
        }
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'no inference tier available'));
        return;
      }
      sendSuccess(res, { result });
    }),
  );

  router.post(
    '/inference/feedback',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = feedbackBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      // Cross-tenant ownership is enforced in the routing service; the bypass flag
      // is derived from the RESOLVED principal (admin/internal) or solo mode — NEVER
      // from the request body — so an ordinary caller can only attach a signal to an
      // inference IT produced.
      const bypassOwnershipCheck = soloMode || isPrivilegedPrincipal(req.principal);
      const result = await routing.feedback({
        inferenceId: parsed.data.inferenceId,
        metricName: parsed.data.metricName,
        value: parsed.data.value,
        ...(req.principal?.userId ? { userId: req.principal.userId } : {}),
        ...(bypassOwnershipCheck ? { bypassOwnershipCheck: true } : {}),
      });
      if (!result.routed) {
        // No-oracle refusal: an inference the caller does not own is a 404,
        // indistinguishable from a genuinely-missing id (never confirms it exists
        // for another tenant).
        if (result.denied === 'not_found') {
          sendError(res, createError(ErrorCode.NOT_FOUND, 'inference not found'));
          return;
        }
        // Truthful degrade: no feedback-capable tier is bound — never a faked accept.
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'no feedback-capable inference tier available'));
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

  router.put(
    '/inference/keys/:provider',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const provider = providerSchema.safeParse(req.params.provider);
      if (!provider.success) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, provider.error.issues[0]?.message ?? 'invalid provider'));
        return;
      }
      const body = keyWriteBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        // Fixed messages only — never echo the received key material.
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, body.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'a real principal is required to store a provider key'));
        return;
      }

      // GOVERNED WRITE: a secret mutation must pass the gate. No gate wired ⇒
      // fail CLOSED with a truthful 503 (never an ungoverned secret write).
      const gate = getGate();
      if (!gate) {
        sendError(
          res,
          createError(ErrorCode.SERVICE_UNAVAILABLE, 'BYOK key writes are disabled: the governance gate is not wired'),
        );
        return;
      }
      const verdict = await gate.decide('inference.key.write', principal, {
        target: { toolName: 'inference.key.write' },
        metadata: { provider: provider.data },
      });
      if (verdict.effect !== 'allow') {
        sendError(
          res,
          createError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            `provider key write ${verdict.effect === 'needs_approval' ? 'requires approval' : 'denied'}: ${verdict.reason}`,
          ),
        );
        return;
      }

      const stored = await resolver.store(principal.userId, provider.data, body.data.key);
      if (!stored.stored) {
        // Truthful fail-closed degrade (vault down / secrets seam unwired).
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, stored.reason));
        return;
      }
      // Metadata only — never the key material.
      sendSuccess(res, { provider: provider.data, stored: true, key: stored.record });
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
      // Removes the encrypted secret + the metadata row + the cached entry.
      const removed = await resolver.remove(userId, parsed.data);
      if (!removed) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'provider key not found or already deleted'));
        return;
      }
      sendSuccess(res, { provider: parsed.data, deleted: true });
    }),
  );

  return router;
}
