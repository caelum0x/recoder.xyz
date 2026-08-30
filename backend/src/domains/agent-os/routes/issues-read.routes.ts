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
import type {
  SquadIssueCreateInput,
  SquadReadyIssue,
} from '../ports/squad-issue.port.js';

export interface IssuesReadRoutesDeps {
  /** The module's ready-issue read (degrade-truthful: `[]` when the graph is down). */
  readonly readyIssues: () => Promise<readonly SquadReadyIssue[]>;
  readonly createIssue?: (
    input: SquadIssueCreateInput,
    actor: string,
  ) => Promise<{ id: string } | null>;
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

  router.post('/issues', middleware.authenticateMutating, async (req: Request, res: Response) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const labels = typeof req.body?.labels === 'string' ? req.body.labels.trim() : '';
    const discoveredFrom =
      typeof req.body?.discoveredFrom === 'string'
        ? req.body.discoveredFrom.trim()
        : '';
    if (!title || title.length > 240) {
      sendError(
        res,
        createError(
          ErrorCode.VALIDATION_ERROR,
          'issue title is required and must be at most 240 characters',
        ),
      );
      return;
    }
    if (description.length > 20_000 || labels.length > 1_000) {
      sendError(
        res,
        createError(ErrorCode.VALIDATION_ERROR, 'issue description or labels are too long'),
      );
      return;
    }
    if (!deps.createIssue) {
      sendError(
        res,
        createError(ErrorCode.SERVICE_UNAVAILABLE, 'issue creation is unavailable'),
      );
      return;
    }
    try {
      const issue = await deps.createIssue(
        {
          title,
          ...(description ? { description } : {}),
          ...(labels ? { labels } : {}),
          ...(discoveredFrom ? { discoveredFrom } : {}),
        },
        `recoder:${req.principal!.userId}`,
      );
      if (!issue) {
        sendError(
          res,
          createError(ErrorCode.SERVICE_UNAVAILABLE, 'Beads did not create the issue'),
        );
        return;
      }
      sendSuccess(res, { issue }, { statusCode: 201 });
    } catch (error) {
      sendError(
        res,
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          error instanceof Error ? error.message : 'issue creation failed',
        ),
      );
    }
  });

  return router;
}
