/**
 * @module a2a-openclaw-adapter
 *
 * SFA-010: OpenClaw adapter endpoint for the docker-backend.
 *
 * Receives OpenClaw gateway events via POST /api/a2a/openclaw/events,
 * validates them, maps to canonical TaskEnvelope, stores in-memory,
 * routes to the appropriate internal agent (PM, Agency, or Backend)
 * via the A2A bridge, and returns the created task ID + trace_id.
 *
 * Social channel routing (Task 36):
 * - Messages mentioning project/task/sprint/feature -> recoder_pm
 * - Messages mentioning client/deliverable/quote/invoice -> recoder_agency
 * - Everything else -> recoder_backend (general AI)
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
  RECODER_A2A_PROTOCOL_VERSION,
  RECODER_A2A_ENVELOPE_VERSION,
  type TaskEnvelope,
  type OpenClawMapperOptions,
  type ValidationResult,
  type OpenClawMapperResult,
  type RecoderA2AEnvelope,
  type RecoderPayload,
} from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger('a2a-openclaw-adapter');

// ---------------------------------------------------------------------------
// Native addon (degrade-safe seam)
//
// The claw-code-parity-napi crate compiles to a platform-specific .node file
// whose location is resolved relative to this file at runtime.  If the addon
// is absent (build deferred, unsupported arch, CI, …) we fall back silently
// to the existing subprocess/loopback path — the adapter NEVER regresses.
//
// The .node path follows the napi-rs convention:
//   <crate-root>/claw-code-parity-napi.<arch>.node
// In production the file is placed next to the compiled JS bundle or at the
// path given by CLAW_PARITY_NAPI_PATH.
// ---------------------------------------------------------------------------

interface ClawParityNativeAddon {
  routeMessage(message: string): { targetAgent: string; method: string };
  extractCommands(source: string): Array<{ name: string; source: string }>;
  extractTools(source: string): Array<{ name: string; source: string }>;
  extractBootstrapPlan(source: string): string[];
  extractManifest(repoRoot: string): {
    commands: Array<{ name: string; source: string }>;
    tools: Array<{ name: string; source: string }>;
    bootstrapPhases: string[];
  } | null;
  addonVersion(): string;
}

/**
 * Attempt to load the native NAPI addon.  Returns the module on success or
 * `null` if the .node file is absent or fails to load.
 *
 * We use a plain require() so that the absence of the file is a soft error
 * rather than a hard crash.  The surrounding try/catch ensures the fallback
 * path is always available.
 */
function loadNativeAddon(): ClawParityNativeAddon | null {
  const customPath = process.env['CLAW_PARITY_NAPI_PATH'];
  const candidates: string[] = [];

  if (customPath) {
    candidates.push(customPath);
  }

  const arch = process.arch;           // e.g. "arm64", "x64"
  const platform = process.platform;  // e.g. "darwin", "linux", "win32"

  // napi-rs default output name pattern
  const addonName = `claw-code-parity-napi.${platform}-${arch}.node`;

  // Look next to the compiled JS bundle first, then relative to src/.
  // __dirname is always defined in CJS (module:"commonjs").
  // eslint-disable-next-line no-undef
  const dirRoot = typeof __dirname === 'string' ? __dirname : process.cwd();
  candidates.push(
    `${dirRoot}/../../crates/claw-code-parity/rust/target/release/${addonName}`,
    `${dirRoot}/../../crates/claw-code-parity/rust/target/debug/${addonName}`,
    // Installed location when shipped as a workspace package
    `${dirRoot}/../native/${addonName}`,
    // Relative to CWD for development convenience
    `./native/${addonName}`,
  );

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require(candidate) as ClawParityNativeAddon;
      if (mod && typeof mod.routeMessage === 'function') {
        log.info({ path: candidate }, 'claw-code-parity native addon loaded');
        return mod;
      }
    } catch {
      // Not found at this path — try next candidate
    }
  }

  log.debug(
    { candidates },
    'claw-code-parity native addon not available — using TS fallback path',
  );
  return null;
}

/**
 * Module-level singleton: resolved once at startup.
 * `null` means the addon is absent and we use the TS path.
 */
const _nativeAddon: ClawParityNativeAddon | null = loadNativeAddon();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_WORKSPACE_ID =
  process.env.RECODER_OPENCLAW_WORKSPACE_ID || 'ws_openclaw_default';

// ---------------------------------------------------------------------------
// Social channel routing (Task 36: OpenClaw as social channel hub)
// ---------------------------------------------------------------------------

/**
 * Valid internal agent IDs that OpenClaw messages can be routed to.
 */
type RoutableAgent = 'recoder_pm' | 'recoder_agency' | 'recoder_backend';

/**
 * Keyword sets for routing decisions.
 * Order matters: PM and Agency keywords are checked first;
 * if neither match, the message falls through to recoder_backend.
 */
const PM_KEYWORDS = [
  'project', 'task', 'sprint', 'feature', 'milestone',
  'backlog', 'epic', 'story', 'kanban', 'roadmap',
  'ticket', 'priority', 'release', 'changelog',
];
const AGENCY_KEYWORDS = [
  'client', 'deliverable', 'quote', 'invoice', 'proposal',
  'brief', 'agency', 'contract', 'billing', 'sow', 'scope',
  'revision', 'approval',
];

/**
 * Route an OpenClaw message to the appropriate internal agent based on
 * keyword analysis of the message text.
 *
 * Priority: PM keywords > Agency keywords > Backend (fallback).
 * If the message contains keywords from both PM and Agency, PM wins
 * (task management is typically the higher-urgency routing target).
 *
 * Seam: when the claw-code-parity native addon is present the routing
 * decision is made in-process via Rust (zero IPC overhead).  When the
 * addon is absent the existing pure-TS keyword logic is used as a
 * degrade-safe fallback — behaviour is identical, only the execution
 * path differs.
 */
function routeOpenClawMessage(message: string): RoutableAgent {
  // --- Native in-process path (preferred) ---
  if (_nativeAddon !== null) {
    try {
      const result = _nativeAddon.routeMessage(message);
      const agent = result.targetAgent as RoutableAgent;
      // Validate the returned agent is one of the known routable agents
      if (
        agent === 'recoder_pm' ||
        agent === 'recoder_agency' ||
        agent === 'recoder_backend'
      ) {
        return agent;
      }
      // Unexpected value — fall through to TS path
      log.warn(
        { native_result: result },
        'Native addon returned unexpected agent — falling back to TS router',
      );
    } catch (err) {
      log.warn({ err }, 'Native addon routeMessage threw — falling back to TS router');
    }
  }

  // --- Pure-TS fallback path (always available) ---
  const lower = message.toLowerCase();

  const hasPm = PM_KEYWORDS.some((kw) => lower.includes(kw));
  const hasAgency = AGENCY_KEYWORDS.some((kw) => lower.includes(kw));

  if (hasPm) return 'recoder_pm';
  if (hasAgency) return 'recoder_agency';
  return 'recoder_backend';
}

/**
 * Extract text content from a TaskEnvelope payload for routing analysis.
 * Handles single and array payloads, and multiple payload kinds.
 */
function extractTextFromEnvelope(envelope: TaskEnvelope): string {
  const payloads: RecoderPayload[] = Array.isArray(envelope.payload)
    ? envelope.payload
    : [envelope.payload];

  const parts: string[] = [];
  for (const p of payloads) {
    if (p.kind === 'text') {
      parts.push(p.text);
    } else if (p.kind === 'command') {
      parts.push(p.command);
    } else if (p.kind === 'json' && p.data) {
      // Attempt to extract text-like fields from JSON payloads
      const d = p.data as Record<string, unknown>;
      if (typeof d.text === 'string') parts.push(d.text);
      if (typeof d.message === 'string') parts.push(d.message);
      if (typeof d.phase === 'string') parts.push(d.phase);
    }
  }

  return parts.join(' ');
}

/**
 * Dispatch a TaskEnvelope to the target agent via the internal A2A bridge.
 * This posts to the local /api/a2a/envelope endpoint which handles
 * signing, registry lookup, and forwarding.
 *
 * Fire-and-forget: dispatch failures are logged but do not block the
 * response to OpenClaw. The task is already stored and can be retried.
 */
async function dispatchToAgent(
  envelope: TaskEnvelope,
  targetAgent: RoutableAgent,
  traceId: string,
): Promise<{ dispatched: boolean; agent: RoutableAgent; error?: string }> {
  const backendPort = process.env.PORT || '3001';
  const baseUrl = `http://127.0.0.1:${backendPort}`;

  // Build a RecoderA2AEnvelope from the TaskEnvelope for the bridge
  const a2aEnvelope: RecoderA2AEnvelope = {
    envelopeVersion: RECODER_A2A_ENVELOPE_VERSION,
    protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
    messageId: envelope.id,
    threadId: envelope.thread_id,
    createdAt: envelope.created_at,
    from: {
      id: 'openclaw-gateway',
      name: 'OpenClaw Gateway',
      platform: 'custom',
    },
    to: {
      id: targetAgent,
      name: targetAgent,
      platform: targetAgent as any,
    },
    intent: 'execute',
    payload: Array.isArray(envelope.payload)
      ? envelope.payload
      : [envelope.payload],
    metadata: {
      source: 'openclaw',
      routed_by: 'keyword_router',
      original_task_id: envelope.id,
      workspace_id: envelope.workspace_id,
    },
    trace: {
      traceId,
    },
  };

  try {
    const response = await fetch(`${baseUrl}/api/a2a/envelope`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-recoder-a2a-agent-id': 'openclaw-gateway',
      },
      body: JSON.stringify(a2aEnvelope),
    });

    if (!response.ok) {
      const body = await response.text();
      log.warn(
        {
          trace_id: traceId,
          target_agent: targetAgent,
          status: response.status,
          body,
        },
        `A2A dispatch to ${targetAgent} returned non-OK status`,
      );
      return {
        dispatched: false,
        agent: targetAgent,
        error: `HTTP ${response.status}`,
      };
    }

    log.info(
      { trace_id: traceId, target_agent: targetAgent, task_id: envelope.id },
      `Dispatched OpenClaw task to ${targetAgent}`,
    );
    return { dispatched: true, agent: targetAgent };
  } catch (err) {
    log.warn(
      { trace_id: traceId, target_agent: targetAgent, err },
      `Failed to dispatch to ${targetAgent} (non-fatal)`,
    );
    return { dispatched: false, agent: targetAgent, error: 'fetch_failed' };
  }
}

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
  // Fallback should never be reached on Node 22+, but keep it safe
  return Date.now().toString(16) + 'x'.repeat(16).replace(/x/g, () =>
    ((crypto.getRandomValues(new Uint8Array(1))[0]) & 0xf).toString(16)
  );
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

  // -------------------------------------------------------------------
  // Step 4.5: Route to internal agent via A2A bridge (Task 36)
  // -------------------------------------------------------------------
  const messageText = extractTextFromEnvelope(envelope);
  const targetAgent = routeOpenClawMessage(messageText);

  // Fire-and-forget: dispatch to the target agent through A2A bridge.
  // We do not await this — the response is returned immediately with
  // the routing decision, and the dispatch happens asynchronously.
  const dispatchPromise = dispatchToAgent(envelope, targetAgent, trace_id)
    .catch((err) => {
      log.warn(
        { err, task_id: envelope.id, target_agent: targetAgent },
        'A2A bridge dispatch failed (non-fatal)',
      );
      return { dispatched: false, agent: targetAgent, error: 'dispatch_exception' } as const;
    });

  // Also forward via the Platform Hub for webhook-based delivery
  // (secondary path for PM/Agency apps that expose webhook endpoints)
  import('./openclaw-platform-hub.js')
    .then(({ processOpenClawEvent }) => {
      processOpenClawEvent({
        type: event.event || 'chat.message',
        channel: (event as any).channel || 'unknown',
        from: {
          id: (event as any).from?.id || (event as any).sender?.id || 'unknown',
          name: (event as any).from?.name || (event as any).sender?.name,
          phone: (event as any).from?.phone,
        },
        content: (event as any).text || (event as any).content || '',
        timestamp: envelope.created_at || new Date().toISOString(),
        threadId: envelope.thread_id,
        metadata: (event as any).metadata,
      }).catch((err: unknown) => {
        log.warn({ err, task_id: envelope.id }, 'Platform hub forwarding failed');
      });
    })
    .catch(() => { /* hub not available — ignore */ });

  const durationMs = Date.now() - startTime;

  log.info(
    {
      trace_id,
      task_id: envelope.id,
      event_type: event.event,
      state: envelope.state,
      workspace_id: envelope.workspace_id,
      thread_id: envelope.thread_id,
      routed_to: targetAgent,
      duration_ms: durationMs,
    },
    `OpenClaw event mapped to task ${envelope.id}, routed to ${targetAgent}`,
  );

  // -------------------------------------------------------------------
  // Step 5: Return success response with routing info
  // -------------------------------------------------------------------

  // Wait briefly for dispatch result to include in response (50ms max)
  let dispatchResult: { dispatched: boolean; agent: RoutableAgent; error?: string } | undefined;
  try {
    dispatchResult = await Promise.race([
      dispatchPromise,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 50)),
    ]);
  } catch {
    // Ignore — dispatch is best-effort
  }

  res.status(201).json({
    ok: true,
    task_id: envelope.id,
    trace_id: envelope.trace_id,
    thread_id: envelope.thread_id,
    state: envelope.state,
    event_type: event.event,
    created_at: envelope.created_at,
    routed_to: targetAgent,
    dispatch: dispatchResult
      ? { dispatched: dispatchResult.dispatched, error: dispatchResult.error }
      : { dispatched: 'pending' },
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
  routeOpenClawMessage as __testRouteOpenClawMessage,
  extractTextFromEnvelope as __testExtractTextFromEnvelope,
  // Native addon seam -- exported so tests can inspect / override the addon
  _nativeAddon as __testNativeAddon,
  loadNativeAddon as __testLoadNativeAddon,
};
