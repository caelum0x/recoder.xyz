/**
 * Task Operations API
 *
 * Handles task management following giselle HTTP router patterns.
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
import { z } from 'zod';

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

// In-memory store (replace with DB in production)
const taskStore = new Map<string, TaskType>();
const taskStreams = new Map<string, Set<ReadableStreamDefaultController>>();

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
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get('taskId');
    const workspaceId = url.searchParams.get('workspaceId');
    const inprogress = url.searchParams.get('inprogress') === 'true';
    const stream = url.searchParams.get('stream') === 'true';

    // Stream task updates (SSE)
    if (taskId && stream) {
      const task = taskStore.get(taskId);
      if (!task) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }

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
      const task = taskStore.get(taskId);
      if (!task) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }
      return json({ success: true, task });
    }

    // Get in-progress task for workspace
    if (workspaceId && inprogress) {
      const task = Array.from(taskStore.values()).find(
        (t) => t.workspaceId === workspaceId && (t.status === 'running' || t.status === 'queued')
      );
      return json({ success: true, task: task || null });
    }

    // Get all tasks for workspace
    if (workspaceId) {
      const tasks = Array.from(taskStore.values()).filter(
        (t) => t.workspaceId === workspaceId
      );
      return json({ success: true, tasks });
    }

    return json({ success: false, error: 'workspaceId or taskId required' }, { status: 400 });
  } catch (error) {
    console.error('[Tasks] Loader error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tasks',
    }, { status: 500 });
  }
}

/**
 * POST /api/tasks - Create task
 * PUT /api/tasks - Patch task
 */
export async function action({ request }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
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
        const task = taskStore.get(taskId);

        if (!task) {
          return json({ success: false, error: 'Task not found' }, { status: 404 });
        }

        // Update task status to running
        const updatedTask: TaskType = {
          ...task,
          status: 'running',
          input: { ...task.input, ...input },
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        taskStore.set(taskId, updatedTask);
        broadcastTaskUpdate(taskId, { type: 'status', task: updatedTask });

        console.log(`[Tasks] Started task: ${taskId}`);
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

        const newTask: TaskType = {
          id: taskId as any,
          workspaceId: validation.data.workspaceId,
          name: validation.data.name || 'Untitled Task',
          status: 'running',
          input: validation.data.input,
          metadata: {
            ...validation.data.metadata,
            userId: session.user.id,
          },
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        taskStore.set(taskId, newTask);
        broadcastTaskUpdate(taskId, { type: 'created', task: newTask });

        console.log(`[Tasks] Created and started task: ${taskId}`);
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

      const newTask: TaskType = {
        id: taskId as any,
        workspaceId: validation.data.workspaceId,
        name: validation.data.name || 'Untitled Task',
        status: 'pending',
        input: validation.data.input,
        metadata: {
          ...validation.data.metadata,
          userId: session.user.id,
        },
        createdAt: now,
        updatedAt: now,
      };

      taskStore.set(taskId, newTask);

      console.log(`[Tasks] Created task: ${taskId}`);
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
      const task = taskStore.get(taskId);

      if (!task) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }

      const patchedTask = applyPatches(task, patches as Array<{ op: string; path: string; value?: unknown }>);
      patchedTask.updatedAt = new Date().toISOString();

      // If status changed to completed or failed, set completedAt
      if (
        (patchedTask.status === 'completed' || patchedTask.status === 'failed') &&
        !patchedTask.completedAt
      ) {
        patchedTask.completedAt = new Date().toISOString();
      }

      taskStore.set(taskId, patchedTask);
      broadcastTaskUpdate(taskId, { type: 'patched', task: patchedTask });

      console.log(`[Tasks] Patched task: ${taskId}`);
      return json({ success: true, task: patchedTask });
    }

    // DELETE - Cancel/delete task
    if (request.method === 'DELETE') {
      const taskId = (body as { taskId?: string }).taskId;

      if (!taskId) {
        return json({ success: false, error: 'Task ID required' }, { status: 400 });
      }

      const task = taskStore.get(taskId);

      if (!task) {
        return json({ success: false, error: 'Task not found' }, { status: 404 });
      }

      // Update status to cancelled
      const cancelledTask: TaskType = {
        ...task,
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      taskStore.set(taskId, cancelledTask);
      broadcastTaskUpdate(taskId, { type: 'cancelled', task: cancelledTask });

      console.log(`[Tasks] Cancelled task: ${taskId}`);
      return new Response(null, { status: 204 });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[Tasks] Action error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Task operation failed',
    }, { status: 500 });
  }
}
