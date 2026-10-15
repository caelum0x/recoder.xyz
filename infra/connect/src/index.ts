/**
 * Recoder Connect Worker entry point.
 */
import { Hono } from 'hono';
import type { ConnectEnv } from './env.js';
import { createConnectAuth } from './auth/connect-auth.js';
import { billingRoutes } from './routes/billing.js';
import { Pool } from 'pg';

const app = new Hono<{ Bindings: ConnectEnv }>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'recoder-connect' }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const pool = new Pool({ connectionString: c.env.HYPERDRIVE.connectionString });
  const auth = createConnectAuth(c.env, pool);
  return auth.handler(c.req.raw);
});

app.route(
  '/billing',
  (() => {
    // Lazily built per-request below (needs c.env), so this route group is a
    // thin re-dispatch rather than a module-level singleton.
    const dispatch = new Hono<{ Bindings: ConnectEnv }>();
    dispatch.all('*', async (c) => {
      const pool = new Pool({ connectionString: c.env.HYPERDRIVE.connectionString });
      const auth = createConnectAuth(c.env, pool);
      const routed = billingRoutes({ auth });
      const url = new URL(c.req.raw.url);
      url.pathname = url.pathname.replace(/^\/billing/, '');
      const subRequest = new Request(url, c.req.raw);
      return routed.fetch(subRequest, c.env);
    });
    return dispatch;
  })(),
);

export default {
  fetch: app.fetch,
};
