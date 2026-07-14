/**
 * Connectors bridge entrypoint — boot hook + status router.
 *
 * `startConnectors()` is called from the server boot sequence: it constructs the
 * gateway from env config and starts ingress IF any channel is configured;
 * otherwise it logs "connectors: no channels configured" and stays inert. It
 * never throws into boot — a misconfigured or SDK-less channel degrades to an
 * "unavailable" health entry, never a crash.
 *
 * `createConnectorsRouter()` mounts GET /api/connectors for truthful per-channel
 * health (configured? connected?).
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger';
import { ConnectorsGateway, type ConnectorsHealth, type ChannelHealth } from './gateway.js';
import { loadConnectorsConfig } from './config.js';
import { WEBHOOK_INBOUND_CHANNELS, hasWebhookSecret } from './webhook-channels.js';

const logger = createLogger('connectors');

let gateway: ConnectorsGateway | null = null;

/**
 * Whether the in-process HTTP webhook ingress route has been mounted. Tracked at
 * module scope because the route is mounted during server-route setup, BEFORE
 * `startConnectors()` constructs the gateway during boot — so we remember the
 * intent and apply it to the gateway whenever it is (re)built.
 */
let webhookIngressMounted = false;

/**
 * Record that the in-process webhook ingress route is mounted, and flag the
 * current gateway if one already exists. Idempotent. Called once by the webhook
 * router factory. This is what flips push-only channels (line/slack) to
 * live-inbound-capable in health when their verification secret is configured.
 */
export function markWebhookIngressMounted(): void {
  webhookIngressMounted = true;
  gateway?.markWebhookIngressActive();
}

/**
 * Start the connectors gateway. Idempotent + degrade-safe. Returns the gateway
 * (or null if construction itself failed, which never blocks boot).
 */
export async function startConnectors(): Promise<ConnectorsGateway | null> {
  if (gateway) return gateway;
  try {
    gateway = new ConnectorsGateway();
    // Carry over a webhook ingress that was mounted before the gateway existed.
    if (webhookIngressMounted) gateway.markWebhookIngressActive();
    await gateway.start();
    return gateway;
  } catch (err) {
    // Construction/start must never crash the backend boot.
    logger.error({ err }, 'connectors gateway failed to start (degrading to inert)');
    return gateway;
  }
}

/** Stop the connectors gateway (graceful shutdown / tests) and clear the singleton. */
export async function stopConnectors(): Promise<void> {
  if (!gateway) return;
  await gateway.stop().catch((err) => logger.warn({ err }, 'connectors stop failed'));
  gateway = null;
}

/** Current gateway instance, if started. */
export function getConnectorsGateway(): ConnectorsGateway | null {
  return gateway;
}

/**
 * Truthful connectors health. When the gateway is started, defers to its live
 * per-channel probes. When NOT started, reports a config-derived snapshot so the
 * endpoint still tells the truth about every channel (configured vs not + reason)
 * without contacting any network.
 */
export async function connectorsHealth(): Promise<ConnectorsHealth> {
  if (gateway) return gateway.health();
  // Inert: derive a truthful snapshot straight from the env config.
  let config;
  try {
    config = loadConnectorsConfig();
  } catch (err) {
    logger.warn({ err }, 'connectors config load failed');
    return { active: false, dispatchReady: false, channels: [] };
  }
  const configured: ChannelHealth[] = config.channels.map((c) => {
    // Push-only channels become live-inbound-capable once the webhook ingress is
    // mounted and the channel has its verification secret — even before the
    // gateway is started (the route is up, signatures verify in-process).
    const liveViaWebhook =
      webhookIngressMounted && WEBHOOK_INBOUND_CHANNELS.has(c.channel) && hasWebhookSecret(c.channel);
    return {
      channel: c.channel,
      accountId: c.accountId,
      configured: true,
      available: false, // not started -> no live port yet
      connected: false,
      requiresExternal: c.requiresExternal && !liveViaWebhook,
      reason: liveViaWebhook ? 'configured; live inbound via in-process HTTP webhook ingress' : c.note,
    };
  });
  const unconfigured: ChannelHealth[] = config.unconfigured.map((u) => ({
    channel: u.channel,
    accountId: u.channel,
    configured: false,
    available: false,
    connected: false,
    requiresExternal: false,
    reason: u.reason,
  }));
  return {
    active: false,
    dispatchReady: Boolean(config.dispatch),
    channels: [...configured, ...unconfigured],
  };
}

/** GET /api/connectors — per-channel health (configured? connected?). */
export function createConnectorsRouter(): Router {
  const router = Router();
  router.get('/', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await connectorsHealth() });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'health failed' });
    }
  });
  return router;
}
