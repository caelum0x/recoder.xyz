/**
 * `GET /api/agent-os/squads/board` — the squads board read model (docs/modules/
 * squads.md `board`; the cockpit board feed). Truthful throughout:
 *  - squads feature off      ⇒ `enabled:false` with the reason (no faked board);
 *  - autopilot not composed  ⇒ `autopilot:null` with the reason, squads still listed;
 *  - autopilot composed      ⇒ the live board (seam health, last tick, entries,
 *    and the `bd stale` stalled-work read — explicit control-plane state).
 * Read-only; the owner decision keeps squad mutations OFF the MCP surface and
 * this board is likewise a pure read model.
 */
import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { SquadAutopilotService } from '../services/squad-autopilot.service.js';
import type { SquadService } from '../services/squad.service.js';

export interface SquadBoardRoutesDeps {
  /** Null when the squads feature flag is off. */
  readonly squads: SquadService | null;
  /** Null when the autopilot is not composed (feature off / not enabled). */
  readonly autopilot: SquadAutopilotService | null;
  readonly middleware: AuthMiddleware;
}

export function buildSquadBoardRouter(deps: SquadBoardRoutesDeps): Router {
  const { squads, autopilot, middleware } = deps;
  const router = Router();

  router.get('/squads/board', middleware.authenticate, async (_req: Request, res: Response) => {
    try {
      if (!squads) {
        sendSuccess(res, {
          enabled: false,
          reason: 'squads feature is disabled by config',
          squads: [],
          autopilot: null,
        });
        return;
      }
      const squadList = await squads.listSquads();
      if (!autopilot) {
        sendSuccess(res, {
          enabled: true,
          squads: squadList,
          autopilot: null,
          reason: 'squad autopilot is not enabled',
        });
        return;
      }
      sendSuccess(res, { enabled: true, squads: squadList, autopilot: await autopilot.board() });
    } catch (error) {
      sendError(
        res,
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          error instanceof Error ? error.message : 'squad board read failed',
        ),
      );
    }
  });

  return router;
}
