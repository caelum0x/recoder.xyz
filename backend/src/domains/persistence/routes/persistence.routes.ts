/**
 * `/internal/persistence/*` edges. All are internal-only: they disclose the full
 * DB schema and can trigger control-plane migrations, so every route sits behind
 * `requireInternal` (constant-time `INTERNAL_SERVICE_KEY` gate; fail-closed —
 * unset key ⇒ 503, missing/bad key ⇒ 401). The edge domain's guard convention is
 * globally overridden to public (bootstrap), so — like every sibling internal
 * router — this router self-gates up front rather than relying on the mount.
 * This file owns the handlers over the module surface.
 */
import { Router, type RequestHandler } from 'express';
import { asyncHandler, sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { PersistenceModule } from './../index.js';

export function registerPersistenceRoutes(module: PersistenceModule, requireInternal?: RequestHandler): Router {
  const router = Router();

  // These edges are worker-to-backend only — gate once, up front, fail-closed.
  // The gate is optional in the type only to keep the uniform `DomainModule`
  // contract; if it is ever wired without one, deny everything rather than
  // serve schema/migrations ungated (fail-closed, never fake-open).
  const gate: RequestHandler =
    requireInternal ??
    ((_req, res) =>
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'internal persistence gate not wired')));
  router.use(gate);

  // GET /internal/persistence/health — pool ping + migration ledger + saturation.
  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const health = await module.health();
      const status = health.status === 'down' ? 503 : 200;
      sendSuccess(res, health, { statusCode: status });
    }),
  );

  // POST /internal/persistence/migrate — apply pending migrations (idempotent).
  router.post(
    '/migrate',
    asyncHandler(async (_req, res) => {
      const report = await module.migrate();
      if (!report.ok) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, report.error ?? 'migration failed'));
        return;
      }
      sendSuccess(res, report);
    }),
  );

  // GET /internal/persistence/migrate/status — applied vs pending (read-only).
  router.get(
    '/migrate/status',
    asyncHandler(async (_req, res) => {
      sendSuccess(res, await module.migrations().status());
    }),
  );

  // GET /internal/persistence/introspect — list application tables.
  router.get(
    '/introspect',
    asyncHandler(async (_req, res) => {
      if (!module.executor().isAvailable()) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable'));
        return;
      }
      sendSuccess(res, { tables: await module.schema().inspectTables() });
    }),
  );

  // GET /internal/persistence/introspect/:schema/:table — columns + indexes.
  router.get(
    '/introspect/:schema/:table',
    asyncHandler(async (req, res) => {
      if (!module.executor().isAvailable()) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable'));
        return;
      }
      const { schema, table } = req.params;
      const inspector = module.schema();
      const [columns, indexes] = await Promise.all([
        inspector.inspectColumns(schema, table),
        inspector.inspectIndexes(schema, table),
      ]);
      sendSuccess(res, { schema, table, columns, indexes });
    }),
  );

  return router;
}
