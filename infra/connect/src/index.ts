/**
 * Recoder Connect Worker entry point.
 */
import { Hono } from 'hono';
import type { ConnectEnv } from './env.js';
import { createConnectAuth } from './auth/connect-auth.js';
import {
  buildMobileDeepLink,
  extractSessionCookieValue,
  renderMobileCompletePage,
  resolveRemoteScheme,
} from './auth/mobile-complete.js';
import { billingRoutes } from './routes/billing.js';
import { deviceRoutes } from './routes/devices.js';
import { Pool } from 'pg';

const app = new Hono<{ Bindings: ConnectEnv }>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'recoder-connect' }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const pool = new Pool({ connectionString: c.env.HYPERDRIVE.connectionString });
  const auth = createConnectAuth(c.env, pool);
  return auth.handler(c.req.raw);
});

/**
 * Mobile magic-link completion — see src/auth/mobile-complete.ts for the
 * full handshake. `callbackURL={CONNECT_URL}/link/mobile-complete` is
 * same-origin as CONNECT_URL, so Better Auth's magic-link verify redirect
 * reaches this route with the just-set session cookie already attached.
 */
app.get('/link/mobile-complete', async (c) => {
  const pool = new Pool({ connectionString: c.env.HYPERDRIVE.connectionString });
  const auth = createConnectAuth(c.env, pool);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const token = extractSessionCookieValue(c.req.raw.headers);
  if (!session?.user?.email || !token) {
    return c.html(renderMobileCompletePage({ ok: false }), 401);
  }
  const deepLink = buildMobileDeepLink({
    scheme: resolveRemoteScheme(c.env),
    token,
    email: session.user.email,
  });
  return c.html(renderMobileCompletePage({ ok: true, deepLink }));
});

/**
 * Mounts a sub-router that needs `{ auth }` built per-request (it needs
 * `c.env`, which isn't available at module scope) under `prefix`, stripping
 * the prefix before re-dispatching. Shared by `/billing` and `/devices` so
 * the per-request auth-instance wiring lives in exactly one place.
 */
function mountAuthedRoutes<Deps extends { auth: ReturnType<typeof createConnectAuth> }>(
  prefix: string,
  buildRoutes: (deps: Deps) => Hono<{ Bindings: ConnectEnv }>,
): Hono<{ Bindings: ConnectEnv }> {
  const dispatch = new Hono<{ Bindings: ConnectEnv }>();
  dispatch.all('*', async (c) => {
    const pool = new Pool({ connectionString: c.env.HYPERDRIVE.connectionString });
    const auth = createConnectAuth(c.env, pool);
    const routed = buildRoutes({ auth } as Deps);
    const url = new URL(c.req.raw.url);
    url.pathname = url.pathname.replace(new RegExp(`^${prefix}`), '');
    const subRequest = new Request(url, c.req.raw);
    return routed.fetch(subRequest, c.env);
  });
  return dispatch;
}

app.route('/billing', mountAuthedRoutes('/billing', billingRoutes));
app.route('/devices', mountAuthedRoutes('/devices', deviceRoutes));

export default {
  fetch: app.fetch,
};
