/**
 * `/internal/persistence/*` edges. All are internal-only; the edge domain
 * (Phase 4) applies the `INTERNAL_SERVICE_KEY` gate + interop chain when it
 * mounts this router, and write edges additionally pass the governance gate
 * (Phase 3). This file owns only the handlers over the module surface.
 */
import { Router } from 'express';
import { asyncHandler, sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { PersistenceModule } from './../index.js';

export function registerPersistenceRoutes(module: PersistenceModule): Router {
  const router = Router();

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
