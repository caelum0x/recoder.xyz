/**
 * Spawn Task API - Create subtasks for complex operations
 * Used by the AI to delegate work to specialized modes
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { v4 as uuidv4 } from 'uuid';

// In-memory task store (could be moved to Redis/database for production)
const tasks = new Map<string, {
  id: string;
  description: string;
  mode: string;
  context?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: number;
}>();

export async function action({ request }: ActionFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');

  const session = await verifySession(request);
  if (!session?.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { taskDescription, mode, context } = await request.json<{
    taskDescription: string;
    mode?: string;
    context?: string;
  }>();

  if (!taskDescription) {
    return json({ error: 'Task description is required' }, { status: 400 });
  }

  const taskId = `task-${uuidv4().slice(0, 8)}`;

  // Create the task
  tasks.set(taskId, {
    id: taskId,
    description: taskDescription,
    mode: mode || 'code',
    context,
    status: 'pending',
    createdAt: Date.now(),
  });

  // In a real implementation, this would trigger an async job
  // For now, we mark it as pending and return immediately
  console.log(`[Spawn Task] Created task ${taskId}:`, {
    description: taskDescription,
    mode,
  });

  return json({
    success: true,
    taskId,
    status: 'pending',
    message: `Task "${taskDescription}" has been queued with ${mode || 'code'} mode.`,
  });
}

export async function loader({ request }: ActionFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');

  const session = await verifySession(request);
  if (!session?.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  if (taskId) {
    const task = tasks.get(taskId);
    if (!task) {
      return json({ error: 'Task not found' }, { status: 404 });
    }
    return json({ task });
  }

  // Return all tasks
  return json({
    tasks: Array.from(tasks.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50),
  });
}
