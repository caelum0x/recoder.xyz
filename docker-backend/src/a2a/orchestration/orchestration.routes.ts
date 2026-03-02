/**
 * @module orchestration/orchestration.routes
 *
 * HTTP route layer for the A2A orchestration patterns (pipeline, scatter-gather,
 * supervisor). Each pattern is exposed under its own sub-router, and the three
 * sub-routers are combined into a single `orchestrationRouter`.
 *
 * Mount point (expected):  `/a2a/orchestration`
 *
 * Routes:
 *   /pipelines       — Pipeline CRUD + execution
 *   /scatter-gather   — Scatter-gather CRUD + execution
 *   /supervisors      — Supervisor CRUD + lifecycle
 */

import { Router, type Request, type Response } from 'express';
import { getPipelineOrchestrator } from './pipeline';
import { getScatterGatherOrchestrator } from './scatter-gather';
import { getSupervisorOrchestrator } from './supervisor';

// ---------------------------------------------------------------------------
// Stub executors (used in the HTTP layer until real connector wiring)
// ---------------------------------------------------------------------------

/**
 * Stub agent executor — returns a placeholder response.
 * In production, this callback is replaced with the actual connector runtime.
 */
const stubExecutor = async (agentId: string, prompt: string): Promise<string> => {
  return `[stub] Agent ${agentId} would process: ${prompt.substring(0, 100)}`;
};

/**
 * Stub child-start callback for supervisor lifecycle.
 */
const stubStartChild = async (_childId: string, _agentId: string): Promise<void> => {
  // Stub: in production this would start the actual agent process
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendSuccess(res: Response, data: unknown, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

function sendError(res: Response, statusCode: number, message: string): void {
  res.status(statusCode).json({ success: false, error: { message } });
}

// ---------------------------------------------------------------------------
// Pipeline routes
// ---------------------------------------------------------------------------

const pipelineRouter = Router();

/** POST /pipelines — Register a pipeline definition */
pipelineRouter.post('/', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { pipelineId, name, steps, errorStrategy } = body;

    if (!pipelineId || typeof pipelineId !== 'string' || !pipelineId.trim()) {
      return sendError(res, 400, 'pipelineId is required');
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'name is required');
    }
    if (!Array.isArray(steps)) {
      return sendError(res, 400, 'steps must be an array');
    }

    const orchestrator = getPipelineOrchestrator();

    // Check for duplicates
    if (orchestrator.getPipeline(pipelineId)) {
      return sendError(res, 409, `Pipeline ${pipelineId} is already registered`);
    }

    orchestrator.registerPipeline({
      pipelineId,
      name,
      steps,
      errorStrategy: errorStrategy ?? 'fail-fast',
    });

    const definition = orchestrator.getPipeline(pipelineId)!;
    sendSuccess(res, definition, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /pipelines — List all pipelines */
pipelineRouter.get('/', (_req: Request, res: Response) => {
  try {
    const orchestrator = getPipelineOrchestrator();
    const pipelines = orchestrator.listPipelines();
    sendSuccess(res, { pipelines, count: pipelines.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /pipelines/executions/:executionId — Get a specific execution */
pipelineRouter.get('/executions/:executionId', (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const orchestrator = getPipelineOrchestrator();
    const execution = orchestrator.getExecution(executionId);

    if (!execution) {
      return sendError(res, 404, `Execution ${executionId} not found`);
    }

    sendSuccess(res, execution);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /pipelines/:pipelineId — Get a pipeline definition */
pipelineRouter.get('/:pipelineId', (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const orchestrator = getPipelineOrchestrator();
    const definition = orchestrator.getPipeline(pipelineId);

    if (!definition) {
      return sendError(res, 404, `Pipeline ${pipelineId} not found`);
    }

    sendSuccess(res, definition);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** DELETE /pipelines/:pipelineId — Remove a pipeline */
pipelineRouter.delete('/:pipelineId', (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const orchestrator = getPipelineOrchestrator();
    const removed = orchestrator.removePipeline(pipelineId);

    if (!removed) {
      return sendError(res, 404, `Pipeline ${pipelineId} not found`);
    }

    sendSuccess(res, { pipelineId, removed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** POST /pipelines/:pipelineId/execute — Execute a pipeline */
pipelineRouter.post('/:pipelineId/execute', async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { input } = body;

    if (input === undefined || input === null || typeof input !== 'string') {
      return sendError(res, 400, 'input is required and must be a string');
    }

    const orchestrator = getPipelineOrchestrator();

    if (!orchestrator.getPipeline(pipelineId)) {
      return sendError(res, 404, `Pipeline ${pipelineId} not found`);
    }

    const execution = await orchestrator.execute(pipelineId, input, stubExecutor);
    sendSuccess(res, execution);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /pipelines/:pipelineId/executions — List executions for a pipeline */
pipelineRouter.get('/:pipelineId/executions', (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const orchestrator = getPipelineOrchestrator();

    if (!orchestrator.getPipeline(pipelineId)) {
      return sendError(res, 404, `Pipeline ${pipelineId} not found`);
    }

    const executions = orchestrator.listExecutions(pipelineId);
    sendSuccess(res, { executions, count: executions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** POST /pipelines/executions/:executionId/cancel — Cancel a running execution */
pipelineRouter.post('/executions/:executionId/cancel', (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const orchestrator = getPipelineOrchestrator();
    const execution = orchestrator.getExecution(executionId);

    if (!execution) {
      return sendError(res, 404, `Execution ${executionId} not found`);
    }

    const cancelled = orchestrator.cancelExecution(executionId);

    if (!cancelled) {
      return sendError(res, 409, `Execution ${executionId} is not in a cancellable state`);
    }

    sendSuccess(res, { executionId, cancelled: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

// ---------------------------------------------------------------------------
// Scatter-Gather routes
// ---------------------------------------------------------------------------

const scatterGatherRouter = Router();

/** POST /scatter-gather — Register a scatter-gather pattern */
scatterGatherRouter.post('/', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { patternId, name, targets, gatherStrategy, requiredResults, timeoutMs, quorumThreshold } = body;

    if (!patternId || typeof patternId !== 'string' || !patternId.trim()) {
      return sendError(res, 400, 'patternId is required');
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'name is required');
    }
    if (!Array.isArray(targets)) {
      return sendError(res, 400, 'targets must be an array');
    }

    const orchestrator = getScatterGatherOrchestrator();

    if (orchestrator.getPattern(patternId)) {
      return sendError(res, 409, `Pattern ${patternId} is already registered`);
    }

    orchestrator.registerPattern({
      patternId,
      name,
      targets,
      gatherStrategy: gatherStrategy ?? 'wait-all',
      requiredResults,
      timeoutMs,
      quorumThreshold,
    });

    const definition = orchestrator.getPattern(patternId)!;
    sendSuccess(res, definition, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /scatter-gather — List all patterns */
scatterGatherRouter.get('/', (_req: Request, res: Response) => {
  try {
    const orchestrator = getScatterGatherOrchestrator();
    const patterns = orchestrator.listPatterns();
    sendSuccess(res, { patterns, count: patterns.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /scatter-gather/executions/:executionId — Get a specific execution */
scatterGatherRouter.get('/executions/:executionId', (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const orchestrator = getScatterGatherOrchestrator();
    const execution = orchestrator.getExecution(executionId);

    if (!execution) {
      return sendError(res, 404, `Execution ${executionId} not found`);
    }

    sendSuccess(res, execution);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /scatter-gather/:patternId — Get a pattern */
scatterGatherRouter.get('/:patternId', (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const orchestrator = getScatterGatherOrchestrator();
    const pattern = orchestrator.getPattern(patternId);

    if (!pattern) {
      return sendError(res, 404, `Pattern ${patternId} not found`);
    }

    sendSuccess(res, pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** DELETE /scatter-gather/:patternId — Remove a pattern */
scatterGatherRouter.delete('/:patternId', (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const orchestrator = getScatterGatherOrchestrator();
    const removed = orchestrator.removePattern(patternId);

    if (!removed) {
      return sendError(res, 404, `Pattern ${patternId} not found`);
    }

    sendSuccess(res, { patternId, removed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** POST /scatter-gather/:patternId/execute — Execute pattern */
scatterGatherRouter.post('/:patternId/execute', async (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return sendError(res, 400, 'prompt is required and must be a string');
    }

    const orchestrator = getScatterGatherOrchestrator();

    if (!orchestrator.getPattern(patternId)) {
      return sendError(res, 404, `Pattern ${patternId} not found`);
    }

    const execution = await orchestrator.execute(patternId, prompt, stubExecutor);
    sendSuccess(res, execution);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /scatter-gather/:patternId/executions — List executions */
scatterGatherRouter.get('/:patternId/executions', (req: Request, res: Response) => {
  try {
    const { patternId } = req.params;
    const orchestrator = getScatterGatherOrchestrator();

    if (!orchestrator.getPattern(patternId)) {
      return sendError(res, 404, `Pattern ${patternId} not found`);
    }

    const executions = orchestrator.listExecutions(patternId);
    sendSuccess(res, { executions, count: executions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

// ---------------------------------------------------------------------------
// Supervisor routes
// ---------------------------------------------------------------------------

const supervisorRouter = Router();

/** POST /supervisors — Register a supervisor */
supervisorRouter.post('/', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { supervisorId, name, children, strategy, maxTotalRestarts } = body;

    if (!supervisorId || typeof supervisorId !== 'string' || !supervisorId.trim()) {
      return sendError(res, 400, 'supervisorId is required');
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'name is required');
    }
    if (!Array.isArray(children)) {
      return sendError(res, 400, 'children must be an array');
    }

    const orchestrator = getSupervisorOrchestrator();

    if (orchestrator.getSupervisor(supervisorId)) {
      return sendError(res, 409, `Supervisor ${supervisorId} is already registered`);
    }

    orchestrator.registerSupervisor({
      supervisorId,
      name,
      children,
      strategy: strategy ?? 'one-for-one',
      maxTotalRestarts,
    });

    const definition = orchestrator.getSupervisor(supervisorId)!;
    sendSuccess(res, definition, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /supervisors — List all supervisors */
supervisorRouter.get('/', (_req: Request, res: Response) => {
  try {
    const orchestrator = getSupervisorOrchestrator();
    const supervisors = orchestrator.listSupervisors();
    sendSuccess(res, { supervisors, count: supervisors.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /supervisors/:supervisorId — Get a supervisor */
supervisorRouter.get('/:supervisorId', (req: Request, res: Response) => {
  try {
    const { supervisorId } = req.params;
    const orchestrator = getSupervisorOrchestrator();
    const definition = orchestrator.getSupervisor(supervisorId);

    if (!definition) {
      return sendError(res, 404, `Supervisor ${supervisorId} not found`);
    }

    sendSuccess(res, definition);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** DELETE /supervisors/:supervisorId — Remove a supervisor */
supervisorRouter.delete('/:supervisorId', (req: Request, res: Response) => {
  try {
    const { supervisorId } = req.params;
    const orchestrator = getSupervisorOrchestrator();
    const removed = orchestrator.removeSupervisor(supervisorId);

    if (!removed) {
      return sendError(res, 404, `Supervisor ${supervisorId} not found`);
    }

    sendSuccess(res, { supervisorId, removed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** POST /supervisors/:supervisorId/start — Start a supervisor */
supervisorRouter.post('/:supervisorId/start', async (req: Request, res: Response) => {
  try {
    const { supervisorId } = req.params;
    const orchestrator = getSupervisorOrchestrator();

    if (!orchestrator.getSupervisor(supervisorId)) {
      return sendError(res, 404, `Supervisor ${supervisorId} not found`);
    }

    const state = await orchestrator.start(supervisorId, stubStartChild);
    sendSuccess(res, state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** POST /supervisors/:supervisorId/stop — Stop a supervisor */
supervisorRouter.post('/:supervisorId/stop', (req: Request, res: Response) => {
  try {
    const { supervisorId } = req.params;
    const orchestrator = getSupervisorOrchestrator();

    if (!orchestrator.getSupervisor(supervisorId)) {
      return sendError(res, 404, `Supervisor ${supervisorId} not found`);
    }

    const state = orchestrator.stop(supervisorId);
    sendSuccess(res, state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** GET /supervisors/:supervisorId/state — Get supervisor state */
supervisorRouter.get('/:supervisorId/state', (req: Request, res: Response) => {
  try {
    const { supervisorId } = req.params;
    const orchestrator = getSupervisorOrchestrator();
    const state = orchestrator.getState(supervisorId);

    if (!state) {
      return sendError(res, 404, `Supervisor ${supervisorId} not found`);
    }

    sendSuccess(res, state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

/** POST /supervisors/:supervisorId/children/:childId/fail — Report child failure */
supervisorRouter.post('/:supervisorId/children/:childId/fail', async (req: Request, res: Response) => {
  try {
    const { supervisorId, childId } = req.params;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { error } = body;

    const orchestrator = getSupervisorOrchestrator();

    if (!orchestrator.getSupervisor(supervisorId)) {
      return sendError(res, 404, `Supervisor ${supervisorId} not found`);
    }

    const state = orchestrator.getState(supervisorId);
    const childExists = state?.children.some((c) => c.childId === childId);
    if (!childExists) {
      return sendError(res, 404, `Child ${childId} not found in supervisor ${supervisorId}`);
    }

    await orchestrator.reportChildFailure(
      supervisorId,
      childId,
      error ?? 'Unknown error',
      stubStartChild,
    );

    const updatedState = orchestrator.getState(supervisorId);
    sendSuccess(res, updatedState);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, message);
  }
});

// ---------------------------------------------------------------------------
// Combined orchestration router
// ---------------------------------------------------------------------------

export const orchestrationRouter = Router();
orchestrationRouter.use('/pipelines', pipelineRouter);
orchestrationRouter.use('/scatter-gather', scatterGatherRouter);
orchestrationRouter.use('/supervisors', supervisorRouter);
