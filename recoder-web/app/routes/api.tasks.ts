/**
 * Task Operations API
 *
 * Handles task management following giselle HTTP router patterns.
 * Tasks are persisted to Neon PostgreSQL so they survive restarts.
 * SSE streams remain in-memory (ephemeral by nature).
 *
 * GET /api/tasks?workspaceId=xxx - Get all tasks for a workspace
 * GET /api/tasks?taskId=xxx - Get a specific task
 * GET /api/tasks?workspaceId=xxx&inprogress=true - Get in-progress task
 * POST /api/tasks - Create a new task
 * PUT /api/tasks - Update/patch a task
 * POST /api/tasks/start - Start a task
 * POST /api/tasks/stream - Stream task updates (SSE)
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createSql } from '~/lib/.server/db/pg-pool';
import { z } from 'zod';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Tasks');

// Dynamic import for session verification
async function verifySession(request: Request) {
  const { verifySession: verify } = await import('~/lib/auth/session.server');
  return verify(request);
}

// Schema definitions
const TaskId = z.string().min(1).brand<'TaskId'>();
const WorkspaceId = z.string().min(1);

const TaskStatus = z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'cancelled']);

const Task = z.object({
  id: TaskId,
  workspaceId: WorkspaceId,
  name: z.string().optional(),
  status: TaskStatus.default('pending'),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const CreateTaskInput = z.object({
  workspaceId: WorkspaceId,
  name: z.string().optional(),
  input: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const StartTaskInput = z.object({
  taskId: z.string(),
  input: z.record(z.unknown()).optional(),
});

const PatchTaskInput = z.object({
  taskId: z.string(),
  patches: z.array(z.object({
    op: z.enum(['add', 'remove', 'replace']),
    path: z.string(),
    value: z.unknown().optional(),
  })),
});

type TaskType = z.infer<typeof Task>;

// SSE streams remain in-memory (ephemeral by nature)
const taskStreams = new Map<string, Set<ReadableStreamDefaultController>>();

// Track whether the tasks table has been ensured for this process
let tableEnsured = false;

/**
 * Get a Neon SQL client from request context
 */
function getDatabaseUrl(context: any): string | null {
  const env = context?.cloudflare?.env || process.env || {};
  return (env as any).DATABASE_URL || process.env.DATABASE_URL || null;
}

/**
 * Ensure the workspace_tasks table exists (idempotent, runs once per process)
 */
async function ensureTasksTable(sql: ReturnType<typeof createSql>): Promise<void> {
  if (tableEnsured) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS workspace_tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        input JSONB,
        output JSONB,
        error TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_workspace_tasks_workspace ON workspace_tasks(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_workspace_tasks_status ON workspace_tasks(workspace_id, status)`;
    tableEnsured = true;
  } catch (error) {
    logger.error('[Tasks] Failed to ensure tasks table:', error);
    throw error;
  }
}

/**
 * Convert a database row to a TaskType object
 */
function rowToTask(row: any): TaskType {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name || undefined,
    status: row.status,
    input: row.input || undefined,
    output: row.output || undefined,
    error: row.error || undefined,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    metadata: row.metadata || undefined,
  };
}

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Apply JSON patches to an object
 */
function applyPatches(obj: any, patches: Array<{ op: string; path: string; value?: unknown }>): any {
  const result = { ...obj };

  for (const patch of patches) {
    const pathParts = patch.path.split('/').filter(Boolean);
    let current = result;

    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!(pathParts[i] in current)) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }

    const lastKey = pathParts[pathParts.length - 1];

    switch (patch.op) {
      case 'add':
      case 'replace':
        current[lastKey] = patch.value;
        break;
      case 'remove':
        delete current[lastKey];
        break;
    }
  }

  return result;
}

/**
 * Broadcast update to all task stream subscribers
 */
function broadcastTaskUpdate(taskId: string, data: any) {
  const controllers = taskStreams.get(taskId);
  if (!controllers) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  controllers.forEach((controller) => {
    try {
      controller.enqueue(encoded);
    } catch (e) {
      // Controller may be closed
      controllers.delete(controller);
    }
  });
}

/**
 * GET /api/tasks
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const databaseUrl = getDatabaseUrl(context);
    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const sql = createSql(databaseUrl);
    await ensureTasksTable(sql);

    const url = new URL(request.url);
    const taskId = url.searchParams.get('taskId');
    const workspaceId = url.searchParams.get('workspaceId');
    const inprogress = url.searchParams.get('inprogress') === 'true';
    const stream = url.searchParams.get('stream') === 'true';

    // Stream task updates (SSE) - uses DB for initial state, in-memory for live updates
    if (taskId && stream) {
      const rows = await sql`SELECT * FROM workspace_tasks WHERE id = ${taskId}` as any[];
      if (!rows || rows.length === 0) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }
      const task = rowToTask(rows[0]);

      // Set up SSE stream
      let controller: ReadableStreamDefaultController;

      const readable = new ReadableStream({
        start(c) {
          controller = c;

          // Register this controller for task updates
          if (!taskStreams.has(taskId)) {
            taskStreams.set(taskId, new Set());
          }
          taskStreams.get(taskId)!.add(controller);

          // Send initial task state
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'init', task })}\n\n`));
        },
        cancel() {
          // Unregister controller when client disconnects
          taskStreams.get(taskId)?.delete(controller);
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    // Get specific task
    if (taskId) {
      const rows = await sql`SELECT * FROM workspace_tasks WHERE id = ${taskId}` as any[];
      if (!rows || rows.length === 0) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }
      return json({ success: true, task: rowToTask(rows[0]) });
    }

    // Get in-progress task for workspace
    if (workspaceId && inprogress) {
      const rows = await sql`
        SELECT * FROM workspace_tasks
        WHERE workspace_id = ${workspaceId}
          AND status IN ('running', 'queued')
        ORDER BY created_at DESC
        LIMIT 1
      ` as any[];
      return json({ success: true, task: rows && rows.length > 0 ? rowToTask(rows[0]) : null });
    }

    // Get all tasks for workspace
    if (workspaceId) {
      const rows = await sql`
        SELECT * FROM workspace_tasks
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
      ` as any[];
      return json({ success: true, tasks: (rows || []).map(rowToTask) });
    }

    return json({ success: false, error: 'workspaceId or taskId required' }, { status: 400 });
  } catch (error) {
    logger.error('[Tasks] Loader error:', error);
    return json({
      success: false,
      error: 'Failed to get tasks',
    }, { status: 500 });
  }
}

/**
 * POST /api/tasks - Create task
 * PUT /api/tasks - Patch task
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const databaseUrl = getDatabaseUrl(context);
    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const sql = createSql(databaseUrl);
    await ensureTasksTable(sql);

    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const body = await request.json();

    // POST - Create new task
    if (request.method === 'POST') {
      // Handle start action
      if (action === 'start') {
        const validation = StartTaskInput.safeParse(body);
        if (!validation.success) {
          return json({
            success: false,
            error: 'Invalid input',
            details: validation.error.errors,
          }, { status: 400 });
        }

        const { taskId, input } = validation.data;

        // Read existing task from DB
        const rows = await sql`SELECT * FROM workspace_tasks WHERE id = ${taskId}` as any[];
        if (!rows || rows.length === 0) {
          return json({ success: false, error: 'Task not found' }, { status: 404 });
        }

        const existingTask = rowToTask(rows[0]);

        // Merge input and update status
        const mergedInput = { ...existingTask.input, ...input };
        const now = new Date().toISOString();

        await sql`
          UPDATE workspace_tasks
          SET status = 'running',
              input = ${JSON.stringify(mergedInput)},
              started_at = ${now},
              updated_at = ${now}
          WHERE id = ${taskId}
        `;

        const updatedTask: TaskType = {
          ...existingTask,
          status: 'running',
          input: mergedInput,
          startedAt: now,
          updatedAt: now,
        };

        broadcastTaskUpdate(taskId, { type: 'status', task: updatedTask });

        logger.info(`[Tasks] Started task: ${taskId}`);
        return new Response(null, { status: 204 });
      }

      // Handle createAndStart action
      if (action === 'createAndStart') {
        const validation = CreateTaskInput.safeParse(body);
        if (!validation.success) {
          return json({
            success: false,
            error: 'Invalid input',
            details: validation.error.errors,
          }, { status: 400 });
        }

        const taskId = generateTaskId();
        const now = new Date().toISOString();
        const metadata = { ...validation.data.metadata, userId: session.user.id };

        await sql`
          INSERT INTO workspace_tasks (id, workspace_id, name, status, input, metadata, started_at, created_at, updated_at)
          VALUES (
            ${taskId},
            ${validation.data.workspaceId},
            ${validation.data.name || 'Untitled Task'},
            'running',
            ${JSON.stringify(validation.data.input || {})},
            ${JSON.stringify(metadata)},
            ${now},
            ${now},
            ${now}
          )
        `;

        const newTask: TaskType = {
          id: taskId as any,
          workspaceId: validation.data.workspaceId,
          name: validation.data.name || 'Untitled Task',
          status: 'running',
          input: validation.data.input,
          metadata,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        broadcastTaskUpdate(taskId, { type: 'created', task: newTask });

        logger.info(`[Tasks] Created and started task: ${taskId}`);
        return new Response(null, { status: 204 });
      }

      // Default: Create task
      const validation = CreateTaskInput.safeParse(body);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const taskId = generateTaskId();
      const now = new Date().toISOString();
      const metadata = { ...validation.data.metadata, userId: session.user.id };

      await sql`
        INSERT INTO workspace_tasks (id, workspace_id, name, status, input, metadata, created_at, updated_at)
        VALUES (
          ${taskId},
          ${validation.data.workspaceId},
          ${validation.data.name || 'Untitled Task'},
          'pending',
          ${JSON.stringify(validation.data.input || {})},
          ${JSON.stringify(metadata)},
          ${now},
          ${now}
        )
      `;

      const newTask: TaskType = {
        id: taskId as any,
        workspaceId: validation.data.workspaceId,
        name: validation.data.name || 'Untitled Task',
        status: 'pending',
        input: validation.data.input,
        metadata,
        createdAt: now,
        updatedAt: now,
      };

      logger.info(`[Tasks] Created task: ${taskId}`);
      return json({ success: true, task: newTask });
    }

    // PUT - Patch task
    if (request.method === 'PUT') {
      const validation = PatchTaskInput.safeParse(body);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const { taskId, patches } = validation.data;

      // Read existing task from DB
      const rows = await sql`SELECT * FROM workspace_tasks WHERE id = ${taskId}` as any[];
      if (!rows || rows.length === 0) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }

      const task = rowToTask(rows[0]);
      const patchedTask = applyPatches(task, patches as Array<{ op: string; path: string; value?: unknown }>);
      patchedTask.updatedAt = new Date().toISOString();

      // If status changed to completed or failed, set completedAt
      if (
        (patchedTask.status === 'completed' || patchedTask.status === 'failed') &&
        !patchedTask.completedAt
      ) {
        patchedTask.completedAt = new Date().toISOString();
      }

      // Write patched task back to DB
      await sql`
        UPDATE workspace_tasks
        SET status = ${patchedTask.status},
            name = ${patchedTask.name || null},
            input = ${JSON.stringify(patchedTask.input || {})},
            output = ${JSON.stringify(patchedTask.output || {})},
            error = ${patchedTask.error || null},
            started_at = ${patchedTask.startedAt || null},
            completed_at = ${patchedTask.completedAt || null},
            updated_at = ${patchedTask.updatedAt},
            metadata = ${JSON.stringify(patchedTask.metadata || {})}
        WHERE id = ${taskId}
      `;

      broadcastTaskUpdate(taskId, { type: 'patched', task: patchedTask });

      logger.info(`[Tasks] Patched task: ${taskId}`);
      return json({ success: true, task: patchedTask });
    }

    // DELETE - Cancel/delete task
    if (request.method === 'DELETE') {
      const taskId = (body as { taskId?: string }).taskId;

      if (!taskId) {
        return json({ success: false, error: 'Task ID required' }, { status: 400 });
      }

      // Read existing task from DB
      const rows = await sql`SELECT * FROM workspace_tasks WHERE id = ${taskId}` as any[];
      if (!rows || rows.length === 0) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }

      const now = new Date().toISOString();

      // Update status to cancelled in DB
      await sql`
        UPDATE workspace_tasks
        SET status = 'cancelled',
            completed_at = ${now},
            updated_at = ${now}
        WHERE id = ${taskId}
      `;

      const cancelledTask: TaskType = {
        ...rowToTask(rows[0]),
        status: 'cancelled',
        completedAt: now,
        updatedAt: now,
      };

      broadcastTaskUpdate(taskId, { type: 'cancelled', task: cancelledTask });

      logger.info(`[Tasks] Cancelled task: ${taskId}`);
      return new Response(null, { status: 204 });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('[Tasks] Action error:', error);
    return json({
      success: false,
      error: 'Task operation failed',
    }, { status: 500 });
  }
}
