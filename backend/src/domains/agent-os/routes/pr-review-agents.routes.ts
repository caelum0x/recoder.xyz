import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { createError, ErrorCode, sendError, sendSuccess } from '../../../shared/errors.js';
import type { SquadAutopilotLaunchProfile } from '../ports/squad-autopilot.port.js';
import type { PullRequestReviewAgentService } from '../services/pr-review-agent.service.js';
import type { PullRequestReviewEvent } from '../ports/pr-review-agent.port.js';

export function buildPullRequestReviewAgentsRouter(deps: {
  readonly service: PullRequestReviewAgentService;
  readonly middleware: AuthMiddleware;
}): Router {
  const router = Router();

  router.get('/pr-review-agents', deps.middleware.authenticate, (_req: Request, res: Response) => {
    sendSuccess(res, deps.service.board());
  });

  router.post(
    '/pr-review-agents/control',
    deps.middleware.authenticateMutating,
    async (req: Request, res: Response) => {
      const action = typeof req.body?.action === 'string' ? req.body.action : '';
      if (action !== 'start' && action !== 'pause' && action !== 'scan' && action !== 'configure') {
        sendError(
          res,
          createError(ErrorCode.VALIDATION_ERROR, 'action must be start, pause, scan, or configure'),
        );
        return;
      }

      try {
        const profile = req.body?.profile == null ? undefined : readLaunchProfile(req.body.profile);
        const includeDrafts = typeof req.body?.includeDrafts === 'boolean'
          ? req.body.includeDrafts
          : undefined;
        const reviewerRuntimeIds = Array.isArray(req.body?.reviewerRuntimeIds)
          ? req.body.reviewerRuntimeIds.filter((value: unknown): value is string => typeof value === 'string')
          : undefined;
        await deps.service.configure({
          ...(profile ? { profile } : {}),
          ...(includeDrafts !== undefined ? { includeDrafts } : {}),
          ...(reviewerRuntimeIds ? { reviewerRuntimeIds } : {}),
          operatorId: req.principal!.userId,
        });
        if (action !== 'pause' && deps.service.board().launchProfile == null) {
          sendError(
            res,
            createError(
              ErrorCode.VALIDATION_ERROR,
              'choose a Git repository and installed agent before watching pull requests',
            ),
          );
          return;
        }
        if (action === 'start') await deps.service.setRunning(true);
        if (action === 'pause') await deps.service.setRunning(false);
        const scan = action === 'start' || action === 'scan'
          ? await deps.service.scanOnce()
          : null;
        sendSuccess(res, {
          action,
          ...(scan ? { scan } : {}),
          reviewAgents: deps.service.board(),
        });
      } catch (error) {
        sendError(
          res,
          createError(
            ErrorCode.VALIDATION_ERROR,
            error instanceof Error ? error.message : 'invalid pull-request review configuration',
          ),
        );
      }
    },
  );

  router.get(
    '/pr-review-agents/workspaces/:workspaceId/findings',
    deps.middleware.authenticate,
    async (req: Request, res: Response) => {
      try {
        const findings = await deps.service.findings(req.params.workspaceId, req.principal!.userId);
        if (!findings) {
          sendError(res, createError(ErrorCode.NOT_FOUND, 'pull-request review evidence was not found'));
          return;
        }
        sendSuccess(res, { findings });
      } catch (error) {
        sendError(
          res,
          createError(
            ErrorCode.SERVICE_UNAVAILABLE,
            error instanceof Error ? error.message : 'pull-request review evidence is unavailable',
          ),
        );
      }
    },
  );

  router.post(
    '/pr-review-agents/workspaces/:workspaceId/findings/fix',
    deps.middleware.authenticateMutating,
    async (req: Request, res: Response) => {
      const findingKey = typeof req.body?.findingKey === 'string' ? req.body.findingKey.trim() : '';
      const runtimeId = typeof req.body?.runtimeId === 'string' ? req.body.runtimeId.trim() : undefined;
      if (!findingKey) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'findingKey is required'));
        return;
      }
      try {
        const fix = await deps.service.startFindingFix({
          workspaceId: req.params.workspaceId,
          findingKey,
          ...(runtimeId ? { runtimeId } : {}),
          actorId: req.principal!.userId,
        });
        sendSuccess(res, { fix });
      } catch (error) {
        sendError(
          res,
          createError(
            ErrorCode.SERVICE_UNAVAILABLE,
            error instanceof Error ? error.message : 'finding fix could not be started',
          ),
        );
      }
    },
  );

  router.post(
    '/pr-review-agents/workspaces/:workspaceId/findings/feedback',
    deps.middleware.authenticateMutating,
    async (req: Request, res: Response) => {
      const findingKey = typeof req.body?.findingKey === 'string' ? req.body.findingKey.trim() : '';
      const disposition = typeof req.body?.disposition === 'string' ? req.body.disposition : '';
      if (!findingKey || (disposition !== 'accepted' && disposition !== 'dismissed' && disposition !== 'clear')) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'findingKey and disposition (accepted, dismissed, or clear) are required'));
        return;
      }
      try {
        const feedback = await deps.service.recordFindingFeedback({
          workspaceId: req.params.workspaceId,
          findingKey,
          disposition,
          actorId: req.principal!.userId,
        });
        sendSuccess(res, { feedback });
      } catch (error) {
        sendError(
          res,
          createError(
            ErrorCode.SERVICE_UNAVAILABLE,
            error instanceof Error ? error.message : 'review feedback could not be saved',
          ),
        );
      }
    },
  );

  router.post(
    '/pr-review-agents/workspaces/:workspaceId/publish',
    deps.middleware.authenticateMutating,
    async (req: Request, res: Response) => {
      const event = typeof req.body?.event === 'string' ? req.body.event : '';
      const body = typeof req.body?.body === 'string' ? req.body.body : '';
      const inlineFindings = Array.isArray(req.body?.inlineFindings)
        ? req.body.inlineFindings.flatMap((value: unknown): { key: string; body?: string }[] => {
            if (!value || typeof value !== 'object') return [];
            const row = value as Record<string, unknown>;
            if (typeof row.key !== 'string') return [];
            return [{
              key: row.key,
              ...(typeof row.body === 'string' ? { body: row.body } : {}),
            }];
          })
        : undefined;
      if (event !== 'comment' && event !== 'approve' && event !== 'request_changes') {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'event must be comment, approve, or request_changes'));
        return;
      }
      try {
        const publication = await deps.service.publish({
          workspaceId: req.params.workspaceId,
          event: event as PullRequestReviewEvent,
          body,
          ...(inlineFindings ? { inlineFindings } : {}),
          actorId: req.principal!.userId,
        });
        sendSuccess(res, { publication });
      } catch (error) {
        sendError(
          res,
          createError(
            ErrorCode.SERVICE_UNAVAILABLE,
            error instanceof Error ? error.message : 'pull-request review publication failed',
          ),
        );
      }
    },
  );

  return router;
}

function readLaunchProfile(value: unknown): SquadAutopilotLaunchProfile {
  const profile = value !== null && typeof value === 'object'
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
