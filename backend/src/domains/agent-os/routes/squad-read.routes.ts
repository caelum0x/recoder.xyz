/**
 * Squads read-only introspection surface (owner decision: squads are NEVER
 * mutated over HTTP/MCP — this router exposes reads only, no create/assign):
 *   - `GET /squads`                    — list cohorts (optional `?spaceId=`);
 *   - `GET /squads/:squadId`           — one cohort + its members;
 *   - `GET /squads/:squadId/members`   — members with role + weight;
 *   - `GET /squads/:squadId/activity`  — recorded routing decisions.
 *
 * Truthful throughout: when the squads feature is off the router degrades to
 * `{ enabled:false, reason }` (never a faked empty board); an unknown squad is a
 * 404; an infra fault is a truthful 503. Complements `squad-board.routes.ts`
 * (the cockpit board feed) — the literal `/squads/board` path is registered by
 * the board router first, so it always wins over `/squads/:squadId` here.
 */
import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { SquadService } from '../services/squad.service.js';

export interface SquadReadRoutesDeps {
  /** Null when the squads feature flag is off. */
  readonly squads: SquadService | null;
  readonly middleware: AuthMiddleware;
}

const DISABLED_REASON = 'squads feature is disabled by config';

function fail(res: Response, error: unknown): void {
  sendError(
    res,
    createError(
      ErrorCode.SERVICE_UNAVAILABLE,
      error instanceof Error ? error.message : 'squad read failed',
    ),
  );
}

export function buildSquadReadRouter(deps: SquadReadRoutesDeps): Router {
  const { squads, middleware } = deps;
  const router = Router();
  const read = middleware.authenticate;

  router.get('/squads', read, async (req: Request, res: Response) => {
    try {
      if (!squads) {
        sendSuccess(res, { enabled: false, reason: DISABLED_REASON, squads: [] });
        return;
      }
      const spaceId = typeof req.query.spaceId === 'string' ? req.query.spaceId : undefined;
      sendSuccess(res, { enabled: true, squads: await squads.listSquads(spaceId) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/squads/:squadId', read, async (req: Request, res: Response) => {
    try {
      if (!squads) {
        sendSuccess(res, { enabled: false, reason: DISABLED_REASON });
        return;
      }
      const squad = await squads.getSquad(req.params.squadId);
      if (!squad) {
        sendError(res, createError(ErrorCode.NOT_FOUND, `squad not found: ${req.params.squadId}`));
        return;
      }
      sendSuccess(res, { enabled: true, squad, members: await squads.listMembers(squad.squadId) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/squads/:squadId/members', read, async (req: Request, res: Response) => {
    try {
      if (!squads) {
        sendSuccess(res, { enabled: false, reason: DISABLED_REASON, members: [] });
        return;
      }
      const squad = await squads.getSquad(req.params.squadId);
      if (!squad) {
        sendError(res, createError(ErrorCode.NOT_FOUND, `squad not found: ${req.params.squadId}`));
        return;
      }
      sendSuccess(res, { enabled: true, members: await squads.listMembers(squad.squadId) });
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/squads/:squadId/activity', read, async (req: Request, res: Response) => {
    try {
      if (!squads) {
        sendSuccess(res, { enabled: false, reason: DISABLED_REASON, activity: [] });
        return;
      }
      const squad = await squads.getSquad(req.params.squadId);
      if (!squad) {
        sendError(res, createError(ErrorCode.NOT_FOUND, `squad not found: ${req.params.squadId}`));
        return;
      }
      sendSuccess(res, { enabled: true, activity: await squads.listActivity(squad.squadId) });
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
