/**
 * `GET /api/agent-os/squads/board` — the squads board read model (docs/modules/
 * squads.md `board`; the cockpit board feed). Truthful throughout:
 *  - squads feature off      ⇒ `enabled:false` with the reason (no faked board);
 *  - squads not composed     ⇒ `autopilot:null` with the reason;
 *  - autopilot composed      ⇒ the live board (seam health, last tick, entries,
 *    and the `bd stale` stalled-work read — explicit control-plane state).
 * Squad membership/routing remains read-only. The narrow control edge below
 * only starts, pauses, or manually ticks this process's bounded dispatch loop;
 * it cannot mutate a squad, route, budget, or existing workspace.
 */
import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { SquadAutopilotService } from '../services/squad-autopilot.service.js';
import type { SquadService } from '../services/squad.service.js';
import type { SquadAutopilotLaunchProfile } from '../ports/squad-autopilot.port.js';

export interface SquadBoardRoutesDeps {
  /** Null when the squads feature flag is off. */
  readonly squads: SquadService | null;
  /** Null only when squads are not composed. A paused loop remains inspectable. */
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

  router.post('/squads/board/control', middleware.authenticateMutating, async (req: Request, res: Response) => {
    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    if (action !== 'start' && action !== 'pause' && action !== 'scan') {
      sendError(
        res,
        createError(ErrorCode.VALIDATION_ERROR, 'action must be start, pause, or scan'),
      );
      return;
    }
    if (!autopilot) {
      sendError(
        res,
        createError(ErrorCode.SERVICE_UNAVAILABLE, 'background agents are unavailable'),
      );
      return;
    }
    if (action !== 'pause' && req.body?.profile != null) {
      try {
        await autopilot.configure(readLaunchProfile(req.body.profile));
      } catch (error) {
        sendError(
          res,
          createError(
            ErrorCode.VALIDATION_ERROR,
            error instanceof Error ? error.message : 'invalid background-agent launch profile',
          ),
        );
        return;
      }
    }
    try {
      if (action !== 'pause' && (await autopilot.board()).launchProfile == null) {
        sendError(
          res,
          createError(
            ErrorCode.VALIDATION_ERROR,
            'choose a repository and agent before starting background work',
          ),
        );
        return;
      }
      if (action === 'start') await autopilot.setRunning(true);
      if (action === 'pause') await autopilot.setRunning(false);
      // Start means start working now, not one interval from now.
      const tick = action === 'scan' || action === 'start'
        ? await autopilot.scanOnce()
        : null;
      sendSuccess(res, {
        action,
        ...(tick ? { tick } : {}),
        autopilot: await autopilot.board(),
      });
    } catch (error) {
      sendError(
        res,
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          error instanceof Error ? error.message : 'background-agent control failed',
        ),
      );
    }
  });

  return router;
}

function readLaunchProfile(value: unknown): SquadAutopilotLaunchProfile {
  const profile = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const text = (field: string): string =>
    typeof profile[field] === 'string' ? profile[field].trim() : '';
  return {
    repoPath: text('repoPath'),
    spaceId: text('spaceId'),
    projectId: text('projectId'),
    runtimeId: text('runtimeId'),
  };
}
