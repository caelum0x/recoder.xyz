/**
 * Billing + entitlement + enterprise routes, backed by `@recoder/distribution`.
 *
 *  GET  /status                       → subscription/entitlement/plan + health
 *  GET  /entitlements                 → resolved Polar entitlements for the user
 *  GET  /quota/:kind                  → quota headroom for a usage kind
 *  GET  /health                       → truthful billing-provider readiness
 *  POST /checkout                     → start a hosted Polar checkout
 *  POST /devices                      → register a device (enterprise kill-switch)
 *  GET  /devices                      → list the user's devices
 *  POST /devices/:deviceId/revoke     → revoke a device
 *  POST /orgs/:orgId/seats            → assign an org seat
 *  GET  /orgs/:orgId/seats            → list org seats
 *  POST /orgs/:orgId/seats/:userId/revoke → revoke an org seat
 *
 * The authed user id (`req.userId`, set by docker-backend's authenticateRequest)
 * is the subject. Fail safe: missing keys/identity deny; resolution errors deny.
 *
 * The webhook router is mounted separately at /internal/billing/webhook with a
 * RAW body parser so the Standard-Webhooks signature can be verified.
 */
import { Router, type Request, type Response } from 'express';
import { type Subject, type UsageKind } from '@recoder/distribution';
import type { DistributionModule } from './module.js';
import type { WebhookHeaders } from '@recoder/distribution';
import {
  requireFeature,
  requireParallelWorkspaceHeadroom,
  PARALLEL_WORKSPACE_LIMIT,
} from './entitlement-gate.middleware.js';
import { isTerminalWorkspaceState, type Workspace } from '@recoder/agent-os';
import { listWorkspaces } from '../conductor/workspace-service.js';
import { billingIpcAvailability, billingIpcHealth } from './billing-ipc.js';
import { createLogger } from './log.js';

const logger = createLogger('distribution-billing');

/**
 * Count a user's currently-active (non-terminal) conductor workspaces. This is
 * the live usage the parallel-workspace entitlement gate measures against the
 * per-plan cap. Read-only — it never mutates conductor state.
 */
async function activeWorkspaceCount(userId: string): Promise<number> {
  const all: Workspace[] = await listWorkspaces();
  return all.filter(
    (w) =>
      ownerOf(w) === userId && !isTerminalWorkspaceState(w.state),
  ).length;
}

/** The owning user for a workspace: `createdBy`, falling back to metadata.userId. */
function ownerOf(w: Workspace): string | undefined {
  if (w.createdBy) return w.createdBy;
  const metaUser = w.metadata?.userId;
  return typeof metaUser === 'string' ? metaUser : undefined;
}

interface AuthedRequest extends Request {
  userId?: string;
}

const USAGE_KINDS: readonly UsageKind[] = [
  'cli_request',
  'agent_run',
  'publish',
  'preview',
  'download',
];

function requireUser(req: AuthedRequest, res: Response): string | null {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    res.status(401).json({ success: false, error: 'authentication required' });
    return null;
  }
  return userId;
}

export function createBillingRouter(mod: DistributionModule): Router {
  const router = Router();

  // GET /status — the authed user's plan, entitlements summary, and health.
  router.get('/status', async (req: AuthedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const subject: Subject = { subjectId: userId, kind: 'user' };
    try {
      const profile = await mod.auth.getUserProfile(userId);
      const entitlements = await mod.resolver.resolve(subject);
      const health = await mod.billing.health();
      res.json({
        success: true,
        data: {
          userId,
          plan: profile?.plan ?? 'free',
          entitlements,
          billingHealth: health,
        },
      });
    } catch (e) {
      logger.error('status failed', { error: e instanceof Error ? e.message : String(e) });
      res.status(500).json({ success: false, error: 'failed to resolve billing status' });
    }
  });

  // GET /entitlements — resolved (granted) entitlements for the user.
  router.get('/entitlements', async (req: AuthedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const subject: Subject = { subjectId: userId, kind: 'user' };
    const entitlements = await mod.resolver.resolve(subject);
    res.json({ success: true, data: entitlements });
  });

  // GET /quota/:kind — quota headroom for a usage kind.
  router.get('/quota/:kind', async (req: AuthedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const kind = req.params.kind as UsageKind;
    if (!USAGE_KINDS.includes(kind)) {
      res.status(400).json({ success: false, error: `unknown usage kind '${kind}'` });
      return;
    }
    const subject: Subject = { subjectId: userId, kind: 'user' };
    const decision = await mod.billing.checkQuota(subject, kind);
    res.json({ success: true, data: decision });
  });

  // GET /health — truthful provider readiness (no token → unhealthy).
  router.get('/health', async (_req: Request, res: Response) => {
    const health = await mod.billing.health();
    res.json({ success: true, data: health });
  });

  // GET /ipc-health — the optional py/recoder-billing IPC connect seam. Reports
  // whether BILLING_BASE_URL is configured and, if so, probes the engine's
  // `/internal/agent-os/billing/health`. Additive: the default Polar path above
  // is unaffected. Degrade-safe — unset URL / unreachable → not-healthy, never
  // a faked success.
  router.get('/ipc-health', async (_req: Request, res: Response) => {
    const availability = billingIpcAvailability();
    const health = await billingIpcHealth();
    res.json({ success: true, data: { ...availability, ...health } });
  });

  // POST /checkout — start a hosted Polar checkout for a product.
  router.post('/checkout', async (req: AuthedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const productId = req.body?.productId;
    const successUrl = req.body?.successUrl;
    if (typeof productId !== 'string' || typeof successUrl !== 'string') {
      res.status(400).json({ success: false, error: 'productId and successUrl are required' });
      return;
    }
    try {
      const result = await mod.billing.startCheckout({
        subjectId: userId,
        productId,
        successUrl,
        ...(typeof req.body?.customerEmail === 'string'
          ? { customerEmail: req.body.customerEmail }
          : {}),
      });
      res.json({ success: true, data: result });
    } catch (e) {
      logger.warn('checkout failed (likely missing POLAR_ACCESS_TOKEN)', {
        error: e instanceof Error ? e.message : String(e),
      });
      res.status(503).json({ success: false, error: 'checkout unavailable', code: 'provider_unavailable' });
    }
  });

  // ---- Device registry (enterprise kill-switch) ----

  router.post('/devices', (req: AuthedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { fingerprint, name, orgId, entitlementKey } = req.body ?? {};
    if (typeof fingerprint !== 'string' || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'fingerprint and name are required' });
      return;
    }
    const result = mod.devices.register({
      userId,
      rawFingerprint: fingerprint,
      name,
      ...(typeof orgId === 'string' ? { orgId } : {}),
      ...(typeof entitlementKey === 'string' ? { entitlementKey } : {}),
    });
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error.message, code: result.error.code });
      return;
    }
    res.status(201).json({ success: true, data: result.value });
  });

  router.get('/devices', (req: AuthedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    res.json({ success: true, data: mod.devices.listByUser(userId) });
  });

  router.post('/devices/:deviceId/revoke', (req: AuthedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const deviceId = req.params.deviceId;
    const device = mod.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      res.status(404).json({ success: false, error: 'device not found' });
      return;
    }
    const result = mod.devices.revoke({ deviceId, revokedBy: userId });
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error.message, code: result.error.code });
      return;
    }
    res.json({ success: true, data: result.value });
  });

  // ---- Org seats ----

  router.post('/orgs/:orgId/seats', async (req: AuthedRequest, res: Response) => {
    const adminId = requireUser(req, res);
    if (!adminId) return;
    const orgId = req.params.orgId;
    const targetUserId = req.body?.userId;
    if (typeof targetUserId !== 'string' || targetUserId.length === 0) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    const result = await mod.seats.assignSeat({ orgId, userId: targetUserId, assignedBy: adminId });
    if (!result.ok) {
      const status = result.error.code === 'entitlement_denied' ? 402 : 400;
      res.status(status).json({ success: false, error: result.error.message, code: result.error.code });
      return;
    }
    res.status(201).json({ success: true, data: result.value });
  });

  router.get('/orgs/:orgId/seats', (req: AuthedRequest, res: Response) => {
    const adminId = requireUser(req, res);
    if (!adminId) return;
    const includeRevoked = req.query.includeRevoked === 'true';
    res.json({
      success: true,
      data: mod.seats.listSeats(req.params.orgId, { includeRevoked }),
    });
  });

  router.post('/orgs/:orgId/seats/:userId/revoke', async (req: AuthedRequest, res: Response) => {
    const adminId = requireUser(req, res);
    if (!adminId) return;
    const result = await mod.seats.revokeSeat({
      orgId: req.params.orgId,
      userId: req.params.userId,
      revokedBy: adminId,
    });
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error.message, code: result.error.code });
      return;
    }
    res.json({ success: true, data: result.value });
  });

  // ---- Entitlement-gated premium capability ----

  // GET /capability/cloud-sync — gated on the `usage_metering` feature (cloud
  // sync is a paid capability). Free plans are denied with upgrade_required;
  // resolver errors fail safe to deny.
  router.get(
    '/capability/cloud-sync',
    requireFeature(mod, 'usage_metering'),
    (_req: Request, res: Response) => {
      res.json({ success: true, data: { capability: 'cloud-sync', allowed: true } });
    },
  );

  // GET /capability/parallel-workspaces/preflight — a real plan gate over the
  // live conductor workspace count. Under-plan → 200 allow; over-plan →
  // 402 upgrade_required. Conductor clients call this before starting a session.
  router.get(
    '/capability/parallel-workspaces/preflight',
    requireParallelWorkspaceHeadroom(mod, activeWorkspaceCount),
    async (req: Request & { distributionPlan?: string }, res: Response) => {
      const plan = req.distributionPlan ?? 'free';
      res.json({
        success: true,
        data: {
          capability: 'parallel-workspaces',
          allowed: true,
          plan,
          limit: PARALLEL_WORKSPACE_LIMIT[plan as keyof typeof PARALLEL_WORKSPACE_LIMIT],
        },
      });
    },
  );

  return router;
}

/**
 * The Polar webhook router. Mounted with a RAW body parser so the
 * Standard-Webhooks signature is verified over the exact bytes. A missing
 * secret, a bad signature, a stale timestamp, or a malformed body all deny.
 */
export function createBillingWebhookRouter(mod: DistributionModule): Router {
  const router = Router();
  router.post('/', async (req: Request, res: Response) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});

    const headers: WebhookHeaders = {
      id: header(req, 'webhook-id'),
      timestamp: header(req, 'webhook-timestamp'),
      signature: header(req, 'webhook-signature'),
    };

    const result = await mod.webhookHandler.process({ rawBody, headers });
    if (!result.ok) {
      // Untrusted/invalid webhooks are denied with 4xx — never a faked 200 ok.
      const status = result.error.code === 'webhook_untrusted' ? 401 : 400;
      logger.warn('webhook denied', { code: result.error.code, message: result.error.message });
      res.status(status).json({ success: false, error: result.error.message, code: result.error.code });
      return;
    }
    res.json({
      success: true,
      data: {
        change: result.value.change.kind,
        subjectId: result.value.change.subjectId,
        emitted: result.value.emitted,
        deduped: result.value.deduped,
      },
    });
  });
  return router;
}

function header(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}
