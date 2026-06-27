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
import { ConnectorsGateway, type ConnectorsHealth } from './gateway.js';

const logger = createLogger('connectors');

let gateway: ConnectorsGateway | null = null;

/**
 * Start the connectors gateway. Idempotent + degrade-safe. Returns the gateway
 * (or null if construction itself failed, which never blocks boot).
 */
export async function startConnectors(): Promise<ConnectorsGateway | null> {
  if (gateway) return gateway;
  try {
    gateway = new ConnectorsGateway();
    await gateway.start();
    return gateway;
  } catch (err) {
    // Construction/start must never crash the backend boot.
    logger.error({ err }, 'connectors gateway failed to start (degrading to inert)');
    return gateway;
  }
}

/** Stop the connectors gateway (graceful shutdown / tests). */
export async function stopConnectors(): Promise<void> {
  if (!gateway) return;
  await gateway.stop().catch((err) => logger.warn({ err }, 'connectors stop failed'));
}

/** Current gateway instance, if started. */
export function getConnectorsGateway(): ConnectorsGateway | null {
  return gateway;
}

/** Truthful connectors health. When not started, reports inert with no channels. */
export async function connectorsHealth(): Promise<ConnectorsHealth> {
  if (!gateway) return { active: false, dispatchReady: false, channels: [] };
  return gateway.health();
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
