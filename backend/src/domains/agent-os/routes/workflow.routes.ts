/**
 * `/api/agent-os/workflows` — workflow-definition CRUD + run dispatch. COMPOSES
 * the frozen `@recoder/agent-workflows` contracts (validation + the
 * `WorkflowDriver` dispatch seam) via {@link WorkflowService}; legality and
 * execution are never re-derived here.
 *
 * Posture (mirrors the agent-os CRUD edge table):
 *  - reads behind `middleware.authenticate`, writes behind
 *    `middleware.authenticateMutating` (never an anonymous principal);
 *  - every body/param is zod-validated at the boundary BEFORE domain code;
 *  - unknown id ⇒ 404; a structurally-invalid definition ⇒ 400
 *    (`VALIDATION_ERROR` from the package's `validateWorkflowDefinition`);
 *  - dispatch with NO driver wired ⇒ truthful `{ dispatched:false,
 *    status:'not_configured' }` (200) — never a faked launch;
 *  - infra faults ⇒ truthful 503 (`SERVICE_UNAVAILABLE`).
 */
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { WorkflowDefinition } from '@recoder/agent-workflows';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { validateBody, validateParams } from '../../../http/middleware/validate.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import { WorkflowService, WorkflowValidationError } from '../services/workflow.service.js';
import { workflowDefinitionSchema, workflowIdParamSchema } from './workflow.schemas.js';

export interface WorkflowRoutesDeps {
  readonly workflows: WorkflowService;
  readonly middleware: AuthMiddleware;
}

/** Wrap a handler so an infra fault surfaces as a truthful 503 (never a raw stack). */
function handle(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => {
    void fn(req, res).catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof WorkflowValidationError) {
        sendError(
          res,
          createError(ErrorCode.VALIDATION_ERROR, error.message, {
            details: { errors: error.errors },
          }),
        );
        return;
      }
      sendError(
        res,
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          error instanceof Error ? error.message : 'workflow request failed',
        ),
      );
    });
  };
}

function notFound(res: Response, workflowId: string): void {
  sendError(res, createError(ErrorCode.NOT_FOUND, `workflow not found: ${workflowId}`));
}

export function buildWorkflowRouter(deps: WorkflowRoutesDeps): Router {
  const { workflows, middleware } = deps;
  const router = Router();
  const read = middleware.authenticate;
  const write = middleware.authenticateMutating;

  router.get('/workflows', read, handle(async (_req, res) => {
    sendSuccess(res, {
      dispatchConfigured: workflows.dispatchConfigured,
      workflows: await workflows.list(),
    });
  }));

  router.get(
    '/workflows/:workflowId',
    read,
    validateParams(workflowIdParamSchema),
    handle(async (req, res) => {
      const definition = await workflows.get(req.params.workflowId);
      if (!definition) return notFound(res, req.params.workflowId);
      sendSuccess(res, definition);
    }),
  );

  router.post(
    '/workflows',
    write,
    validateBody(workflowDefinitionSchema),
    handle(async (req, res) => {
      // The zod schema guarantees the WorkflowDefinition shape; the service then
      // runs the package's `validateWorkflowDefinition` (dependency legality).
      const saved = await workflows.save(req.body as WorkflowDefinition);
      sendSuccess(res, saved);
    }),
  );

  router.delete(
    '/workflows/:workflowId',
    write,
    validateParams(workflowIdParamSchema),
    handle(async (req, res) => {
      const deleted = await workflows.delete(req.params.workflowId);
      if (!deleted) return notFound(res, req.params.workflowId);
      sendSuccess(res, { workflowId: req.params.workflowId, deleted: true });
    }),
  );

  router.post(
    '/workflows/:workflowId/dispatch',
    write,
    validateParams(workflowIdParamSchema),
    handle(async (req, res) => {
      const definition = await workflows.get(req.params.workflowId);
      if (!definition) return notFound(res, req.params.workflowId);
      sendSuccess(res, await workflows.dispatch(definition));
    }),
  );

  return router;
}
