/**
 * @module a2a-openclaw-adapter
 *
 * SFA-010: OpenClaw adapter endpoint for the docker-backend.
 *
 * Receives OpenClaw gateway events via POST /api/a2a/openclaw/events,
 * validates them, maps to canonical TaskEnvelope, stores in-memory,
 * and returns the created task ID + trace_id.
 *
 * Trace propagation:
 * 1. If the event carries trace.trace_id, use it.
 * 2. If W3C traceparent header is present, extract trace_id from it.
 * 3. Fallback: generate a new trace_id.
 *
 * Error handling:
 * - 400 for malformed events (INVALID_ENVELOPE, MISSING_ENVELOPE_FIELD, INVALID_PAYLOAD)
 * - 204 for non-task events (chat.subscribe / chat.unsubscribe)
 * - 422 for valid but unmappable events
 * - 500 for unexpected internal errors
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from './logger.js';
import {
  validateOpenClawEvent,
  mapOpenClawEvent,
  buildA2AError,
  A2AErrorCodeEnum,
  type TaskEnvelope,
  type OpenClawMapperOptions,
  type ValidationResult,
  type OpenClawMapperResult,
} from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger('a2a-openclaw-adapter');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_WORKSPACE_ID =
  process.env.RECODER_OPENCLAW_WORKSPACE_ID || 'ws_openclaw_default';

// ---------------------------------------------------------------------------
// In-memory task store
// ---------------------------------------------------------------------------

/**
 * In-memory store for TaskEnvelopes created by the OpenClaw adapter.
 * Keyed by task ID. In production this would be backed by Redis or Postgres.
 */
const taskStore = new Map<string, TaskEnvelope>();

/** Maximum number of tasks to keep in the in-memory store. */
const MAX_TASK_STORE_SIZE = Number(
  process.env.RECODER_OPENCLAW_MAX_TASKS || 10_000
);

/**
 * Store a TaskEnvelope. Evicts the oldest entry when the store exceeds
 * MAX_TASK_STORE_SIZE (simple FIFO eviction).
 */
function storeTask(envelope: TaskEnvelope): void {
  if (taskStore.size >= MAX_TASK_STORE_SIZE) {
    // Evict the oldest entry (first key in Map insertion order)
    const firstKey = taskStore.keys().next().value;
    if (firstKey !== undefined) {
      taskStore.delete(firstKey);
    }
  }
  taskStore.set(envelope.id, envelope);
}

/**
 * Retrieve a stored TaskEnvelope by ID.
 */
function getTask(id: string): TaskEnvelope | undefined {
  return taskStore.get(id);
}

/**
 * Get store size (useful for diagnostics).
 */
function getTaskStoreSize(): number {
  return taskStore.size;
}

// ---------------------------------------------------------------------------
// W3C Traceparent parsing
// ---------------------------------------------------------------------------

/**
 * W3C traceparent format: version-trace_id-parent_id-trace_flags
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 *
 * We extract the trace_id (32 hex chars) from position 1 of the dash-split.
 */
const TRACEPARENT_REGEX =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

interface ParsedTraceparent {
  version: string;
  trace_id: string;
  parent_id: string;
  trace_flags: string;
}

function parseTraceparent(header: string): ParsedTraceparent | null {
  const match = header.trim().toLowerCase().match(TRACEPARENT_REGEX);
  if (!match) return null;
  return {
    version: match[1],
    trace_id: match[2],
    parent_id: match[3],
    trace_flags: match[4],
  };
}

// ---------------------------------------------------------------------------
// Trace ID resolution
// ---------------------------------------------------------------------------

/**
 * Generate a 32-char hex trace ID.
 */
function generateTraceId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Resolve trace_id with the following priority:
 * 1. Event's trace.trace_id (highest priority -- the event knows its own trace)
 * 2. W3C traceparent header
 * 3. Generated fallback
 */
function resolveTraceId(
  eventTraceId: string | undefined,
  traceparentHeader: string | undefined
): { trace_id: string; source: 'event' | 'traceparent' | 'generated' } {
  // Priority 1: Event's own trace_id
  if (eventTraceId && eventTraceId.trim().length > 0) {
    return { trace_id: eventTraceId, source: 'event' };
  }

  // Priority 2: W3C traceparent header
  if (traceparentHeader) {
    const parsed = parseTraceparent(traceparentHeader);
    if (parsed) {
      return { trace_id: parsed.trace_id, source: 'traceparent' };
    }
  }

  // Priority 3: Generate new trace_id
  return { trace_id: generateTraceId(), source: 'generated' };
}

// ---------------------------------------------------------------------------
// Express Router
// ---------------------------------------------------------------------------

const router = Router();

/**
 * POST /events
 *
 * Receive an OpenClaw gateway event, validate, map to TaskEnvelope,
 * store, and return the task ID and trace_id.
 */
router.post('/events', async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Extract traceparent header early for logging
  const traceparentHeader = req.header('traceparent') || undefined;

  // Parse body -- the /api/a2a mount uses express.text() so body may be a string
  let body: unknown;
  try {
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      body = null;
    }
  } catch {
    const trace = resolveTraceId(undefined, traceparentHeader);
    log.warn(
      { trace_id: trace.trace_id, trace_source: trace.source },
      'Received unparseable JSON body'
    );
    res.status(400).json({
      ok: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.InvalidEnvelope,
        message: 'Request body is not valid JSON',
        trace_id: trace.trace_id,
      }),
      trace_id: trace.trace_id,
    });
    return;
  }

  if (body === null || body === undefined) {
    const trace = resolveTraceId(undefined, traceparentHeader);
    log.warn(
      { trace_id: trace.trace_id },
      'Received empty body'
    );
    res.status(400).json({
      ok: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.InvalidEnvelope,
        message: 'Request body is required',
        trace_id: trace.trace_id,
      }),
      trace_id: trace.trace_id,
    });
    return;
  }

  // -------------------------------------------------------------------
  // Step 1: Validate the OpenClaw event
  // -------------------------------------------------------------------
  let validation: ValidationResult;
  try {
    validation = validateOpenClawEvent(body);
  } catch (err) {
    const trace = resolveTraceId(undefined, traceparentHeader);
    log.error(
      { trace_id: trace.trace_id, err },
      'Unexpected error during validation'
    );
    res.status(500).json({
      ok: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Unexpected error during event validation',
        trace_id: trace.trace_id,
      }),
      trace_id: trace.trace_id,
    });
    return;
  }

  if (!validation.ok) {
    // Determine the appropriate HTTP status from the error code
    const errorCode = validation.error.code;
    const httpStatus =
      errorCode === 'INVALID_PAYLOAD' ? 400 : 400;

    const trace = resolveTraceId(undefined, traceparentHeader);

    log.warn(
      {
        trace_id: trace.trace_id,
        error_code: errorCode,
        message: validation.error.message,
        details: validation.error.details,
      },
      'OpenClaw event validation failed'
    );

    res.status(httpStatus).json({
      ok: false,
      error: {
        ...validation.error,
        trace_id: trace.trace_id,
        timestamp: validation.error.timestamp || new Date().toISOString(),
      },
      trace_id: trace.trace_id,
    });
    return;
  }

  const event = validation.event;

  // -------------------------------------------------------------------
  // Step 2: Resolve trace_id
  // -------------------------------------------------------------------
  const eventTraceId = event.trace?.trace_id;
  const { trace_id, source: traceSource } = resolveTraceId(
    eventTraceId,
    traceparentHeader
  );

  log.info(
    {
      trace_id,
      trace_source: traceSource,
      event_type: event.event,
    },
    `Received OpenClaw event: ${event.event}`
  );

  // -------------------------------------------------------------------
  // Step 3: Map the event to a TaskEnvelope
  // -------------------------------------------------------------------
  const mapperOpts: OpenClawMapperOptions = {
    workspace_id: DEFAULT_WORKSPACE_ID,
    trace_id_factory: () => trace_id,
  };

  let mapResult: OpenClawMapperResult;
  try {
    mapResult = mapOpenClawEvent(event, mapperOpts);
  } catch (err) {
    log.error(
      { trace_id, event_type: event.event, err },
      'Unexpected error during event mapping'
    );
    res.status(500).json({
      ok: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Unexpected error during event mapping',
        trace_id,
      }),
      trace_id,
    });
    return;
  }

  // -------------------------------------------------------------------
  // Step 3a: Handle skipped events (chat.subscribe / chat.unsubscribe)
  // -------------------------------------------------------------------
  if (mapResult.ok && 'skipped' in mapResult) {
    log.info(
      { trace_id, event_type: event.event, reason: mapResult.reason },
      'Skipping non-task event'
    );
    res.status(204).end();
    return;
  }

  // -------------------------------------------------------------------
  // Step 3b: Handle mapping failures
  // -------------------------------------------------------------------
  if (!mapResult.ok) {
    log.warn(
      {
        trace_id,
        event_type: event.event,
        error_code: mapResult.error.code,
        message: mapResult.error.message,
      },
      'OpenClaw event mapping failed'
    );
    res.status(422).json({
      ok: false,
      error: {
        ...mapResult.error,
        trace_id,
        timestamp: mapResult.error.timestamp || new Date().toISOString(),
      },
      trace_id,
    });
    return;
  }

  // -------------------------------------------------------------------
  // Step 4: Store the TaskEnvelope
  // -------------------------------------------------------------------
  const envelope = mapResult.envelope;

  try {
    storeTask(envelope);
  } catch (err) {
    log.error(
      { trace_id, task_id: envelope.id, err },
      'Failed to store TaskEnvelope'
    );
    res.status(500).json({
      ok: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Failed to store task envelope',
        trace_id,
      }),
      trace_id,
    });
    return;
  }

  const durationMs = Date.now() - startTime;

  log.info(
    {
      trace_id,
      task_id: envelope.id,
      event_type: event.event,
      state: envelope.state,
      workspace_id: envelope.workspace_id,
      thread_id: envelope.thread_id,
      duration_ms: durationMs,
    },
    `OpenClaw event mapped to task ${envelope.id}`
  );

  // -------------------------------------------------------------------
  // Step 5: Return success response
  // -------------------------------------------------------------------
  res.status(201).json({
    ok: true,
    task_id: envelope.id,
    trace_id: envelope.trace_id,
    thread_id: envelope.thread_id,
    state: envelope.state,
    event_type: event.event,
    created_at: envelope.created_at,
  });
});

/**
 * GET /events/:taskId
 *
 * Retrieve a stored TaskEnvelope by task ID.
 * Included for diagnostics and integration testing.
 */
router.get('/events/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const traceparentHeader = req.header('traceparent') || undefined;
  const { trace_id } = resolveTraceId(undefined, traceparentHeader);

  const envelope = getTask(taskId);
  if (!envelope) {
    log.info({ trace_id, task_id: taskId }, 'Task not found');
    res.status(404).json({
      ok: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Task ${taskId} not found`,
        trace_id,
      }),
      trace_id,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    task: envelope,
    trace_id: envelope.trace_id,
  });
});

/**
 * GET /status
 *
 * Adapter health / diagnostics endpoint.
 */
router.get('/status', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    adapter: 'openclaw',
    task_store_size: getTaskStoreSize(),
    max_task_store_size: MAX_TASK_STORE_SIZE,
    workspace_id: DEFAULT_WORKSPACE_ID,
  });
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { router as openclawAdapterRouter };

// Test helpers -- exported for unit tests
export {
  taskStore as __testTaskStore,
  storeTask as __testStoreTask,
  getTask as __testGetTask,
  parseTraceparent as __testParseTraceparent,
  resolveTraceId as __testResolveTraceId,
  generateTraceId as __testGenerateTraceId,
};
