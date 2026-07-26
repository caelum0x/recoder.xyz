/**
 * Issue-graph read edge — `GET /api/agent-os/issues/ready` — the unblocked
 * open work (`bd ready --json`) the desktop Board picks up from.
 *
 * This is the ISSUE GRAPH, not the squads feature: it is independent of the
 * squads flag and NEVER degrades to a squads-off tombstone. The port is
 * late-bound (`AgentOsModule.attachIssueGraph`) over the memory-owned facet;
 * unattached or graph-down resolves to `{ ready: [] }` (200), never a 404 —
 * so the Board shows a truthful "empty", not "not available".
 */
import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { SquadReadyIssue } from '../ports/squad-issue.port.js';

export interface IssuesReadRoutesDeps {
  /** The module's ready-issue read (degrade-truthful: `[]` when the graph is down). */
  readonly readyIssues: () => Promise<readonly SquadReadyIssue[]>;
  readonly middleware: AuthMiddleware;
}

export function buildIssuesReadRouter(deps: IssuesReadRoutesDeps): Router {
  const { readyIssues, middleware } = deps;
  const router = Router();

  router.get('/issues/ready', middleware.authenticate, async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, { ready: await readyIssues() });
    } catch (error) {
      sendError(
        res,
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          error instanceof Error ? error.message : 'ready-issue read failed',
        ),
      );
    }
  });

  return router;
}
