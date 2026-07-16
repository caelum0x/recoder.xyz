/**
 * Social HTTP edges — the `/api/social` control-plane surface:
 *
 *   GET    /                              truthful connectors health per channel (read)
 *   GET    /channels                      configured channels w/ enabled/disabled + reason (read)
 *   GET    /connectors                    list registered connectors (read)
 *   GET    /bindings                      list this owner's chat bindings (read)
 *   POST   /bindings                      bind/allow a chat_ref (mutating)
 *   DELETE /bindings/:connectorId/:chatRef revoke a binding (mutating)
 *   POST   /send                          manual outbound over the ConnectorPort (mutating)
 *   POST   /webhooks/:channel             push-channel webhook ingress (RAW-body HMAC)
 *   GET    /health                        truthful live channel health
 *
 * Security posture:
 *  - reads use `authenticate`; admin writes use `authenticateMutating`; owner is
 *    taken from the resolved `Principal`, never the body;
 *  - `/webhooks/:channel` is UNAUTHENTICATED by session but HOSTILE-BY-DEFAULT: the
 *    channel signature is verified over the RAW body (missing secret ⇒ 401), the
 *    Slack challenge is answered only after verification, and the verified payload
 *    is handed to the inbound pipeline (mention gate → dispatch).
 *
 * Bootstrap MUST mount an all-types `express.raw()` body parser on the `/webhooks`
 * path so `req.body` is the exact bytes the HMAC is computed over.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { ConnectorSecretsPort } from '../ports/connector-secrets.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import { processWebhookDelivery, isWebhookChannel } from '../adapters/webhook-ingress.adapter.js';
import { bindChannelSchema, sendMessageSchema } from '../schema.js';
import { isChannelId, type ChannelId } from '../types.js';
import type { SocialConfig } from '../config.js';
import { buildChannelsView, buildConnectorsView } from './channel-status.js';

/** The verified-webhook handler the composer supplies (normalize → pipeline). */
export type VerifiedWebhookHandler = (channel: ChannelId, parsed: unknown) => Promise<void>;

export interface SocialRouterDeps {
  /** The resolved social config slice (per-channel enable + secret refs). */
  readonly config: SocialConfig;
  readonly repository: SocialRepository;
  readonly secrets: ConnectorSecretsPort;
  readonly channels: ChannelAdapterRegistry;
  readonly middleware: AuthMiddleware;
  /** Live channel health probe (from `buildLiveSocialHealth`). */
  readonly health: () => Promise<unknown>;
  /** Handles a verified webhook payload (normalize + run the inbound pipeline). */
  readonly onVerifiedWebhook: VerifiedWebhookHandler;
}

/** Read the exact raw bytes of the request body (for HMAC verification). */
function rawBodyOf(req: { body?: unknown }): Buffer {
  if (Buffer.isBuffer(req.body)) return req.body;
  const withRaw = req as { rawBody?: Buffer };
  if (Buffer.isBuffer(withRaw.rawBody)) return withRaw.rawBody;
  // Fallback (only valid when a JSON body-parser already ran): re-serialize.
  return Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}), 'utf8');
}

/** Build the `/api/social` router. */
export function buildSocialRoutes(deps: SocialRouterDeps): Router {
  const router = Router();
  const { repository, secrets, channels, middleware } = deps;

  // --- reads -----------------------------------------------------------------

  router.get(
    '/',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, await buildConnectorsView(deps.config, channels));
    }),
  );

  router.get(
    '/channels',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { channels: buildChannelsView(deps.config) });
    }),
  );

  router.get(
    '/connectors',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { connectors: await repository.listConnectors() });
    }),
  );

  router.get(
    '/bindings',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      sendSuccess(res, { bindings: await repository.listBindings(req.principal!.userId) });
    }),
  );

  router.get(
    '/health',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { health: await deps.health() });
    }),
  );

  // --- writes (gated at the identity layer; governance at the module edge) ----

  router.post(
    '/bindings',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const connectorId = requireString(body, 'connectorId');
      const parsed = bindChannelSchema.parse(body);
      const binding = await repository.upsertBinding({
        id: `bind_${connectorId}_${parsed.chatRef}`,
        connectorId,
        userId: req.principal!.userId,
        chatRef: parsed.chatRef,
        allow: parsed.allow,
        ...(parsed.spaceId ? { spaceId: parsed.spaceId } : {}),
        ...(parsed.agentId ? { agentId: parsed.agentId } : {}),
      });
      sendSuccess(res, { binding }, { statusCode: 201 });
    }),
  );

  router.delete(
    '/bindings/:connectorId/:chatRef',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const removed = await repository.removeBinding(req.params.connectorId, req.params.chatRef, req.principal!.userId);
      if (!removed) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'binding not found'));
        return;
      }
      sendSuccess(res, { removed: true });
    }),
  );

  router.post(
    '/send',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const channel = requireString(body, 'channel');
      if (!isChannelId(channel)) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'unknown channel'));
        return;
      }
      const parsed = sendMessageSchema.parse(body);
      const result = await channels.send(channel, {
        target: { channel: channel as never, accountId: 'default', conversationId: parsed.chatRef },
        text: parsed.text,
      });
      if (!result.delivered) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'channel unavailable or not configured'));
        return;
      }
      sendSuccess(res, { delivered: true, messageIds: result.messageIds });
    }),
  );

  // --- webhook ingress (hostile-by-default; RAW-body HMAC) --------------------

  router.post(
    '/webhooks/:channel',
    asyncHandler(async (req, res) => {
      const channel = req.params.channel;
      if (!isWebhookChannel(channel)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'channel does not accept webhooks'));
        return;
      }
      const secret = await secrets.resolve(channel as ChannelId, 'signing');
      const outcome = processWebhookDelivery({
        channel,
        rawBody: rawBodyOf(req),
        secret,
        headers: {
          ...(headerStr(req, 'x-line-signature') ? { lineSignature: headerStr(req, 'x-line-signature') } : {}),
          ...(headerStr(req, 'x-slack-signature') ? { slackSignature: headerStr(req, 'x-slack-signature') } : {}),
          ...(headerStr(req, 'x-slack-request-timestamp')
            ? { slackTimestamp: headerStr(req, 'x-slack-request-timestamp') }
            : {}),
        },
      });

      // Feed the verified payload into the inbound pipeline (fire-and-forget audit
      // is inside the pipeline; a handler fault must not change the ACK status).
      if (outcome.verified && outcome.code !== 'webhook_challenge' && outcome.parsed !== undefined) {
        void deps.onVerifiedWebhook(channel as ChannelId, outcome.parsed).catch(() => undefined);
      }
      res.status(outcome.status).json(outcome.body ?? { success: outcome.verified });
    }),
  );

  return router;
}

function headerStr(req: { headers: Record<string, unknown> }, name: string): string | undefined {
  const v = req.headers[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, `\`${key}\` is required`);
  }
  return value;
}
