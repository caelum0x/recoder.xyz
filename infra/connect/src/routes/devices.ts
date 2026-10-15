/**
 * Device-link routes: the MVP "link a desktop" flow (src/auth/link-codes.ts).
 * `/link/start` and `/link/status` are intentionally UNAUTHENTICATED — the
 * desktop calls them before it has any session. `/link/claim`, `/`, and
 * `/:deviceId/revoke` require a session via the same `requireAccount` seam
 * routes/billing.ts uses — there is no "trust a client-supplied accountId"
 * path anywhere in this file.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { ConnectEnv } from '../env.js';
import { connectDb } from '../db/client.js';
import { claimLinkCode, getLinkStatus, listDevices, revokeDevice, startLinkCode } from '../auth/link-codes.js';
import { requireAccount } from '../auth/require-account.js';
import type { ConnectAuth } from '../auth/connect-auth.js';

export interface DeviceRouteDeps {
  readonly auth: ConnectAuth;
}

const startSchema = z.object({
  label: z.string().min(1).max(120),
  platform: z.enum(['macos', 'linux', 'windows']),
  dpopPublicKeyThumbprint: z.string().min(1).max(256).optional(),
});

export function deviceRoutes(deps: DeviceRouteDeps) {
  const app = new Hono<{ Bindings: ConnectEnv }>();

  app.post('/link/start', async (c) => {
    const parsed = startSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', details: parsed.error.issues[0]?.message }, 400);
    }
    const result = await startLinkCode(connectDb(c.env), parsed.data);
    return c.json({ code: result.code, expiresAt: result.expiresAt.toISOString() });
  });

  app.get('/link/status', async (c) => {
    const code = c.req.query('code');
    if (!code) return c.json({ error: 'missing_code' }, 400);
    const status = await getLinkStatus(connectDb(c.env), code);
    return c.json(status);
  });

  app.post('/link/claim', async (c) => {
    const account = await requireAccount(deps.auth, c.req.raw, c.env);
    if (!account) return c.json({ error: 'auth_required' }, 401);
    const parsed = z.object({ code: z.string().min(1).max(32) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const result = await claimLinkCode(connectDb(c.env), parsed.data.code, account.accountId);
    if (!result.ok) return c.json({ error: result.reason }, result.reason === 'not_found' ? 404 : 409);
    return c.json({ deviceId: result.deviceId }, 201);
  });

  app.get('/', async (c) => {
    const account = await requireAccount(deps.auth, c.req.raw, c.env);
    if (!account) return c.json({ error: 'auth_required' }, 401);
    const devices = await listDevices(connectDb(c.env), account.accountId);
    return c.json({
      devices: devices.map((d) => ({
        ...d,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        revokedAt: d.revokedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  });

  app.post('/:deviceId/revoke', async (c) => {
    const account = await requireAccount(deps.auth, c.req.raw, c.env);
    if (!account) return c.json({ error: 'auth_required' }, 401);
    const revoked = await revokeDevice(connectDb(c.env), account.accountId, c.req.param('deviceId'));
    if (!revoked) return c.json({ error: 'not_found' }, 404);
    return c.json({ revoked: true });
  });

  return app;
}
