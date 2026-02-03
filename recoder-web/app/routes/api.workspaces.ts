/**
 * Workspace Operations API
 *
 * Handles workspace CRUD operations following giselle HTTP router patterns.
 *
 * GET /api/workspaces?workspaceId=xxx - Get a specific workspace
 * GET /api/workspaces?userId=xxx - Get all workspaces for a user
 * POST /api/workspaces - Create a new workspace
 * PUT /api/workspaces - Update an existing workspace
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { z } from 'zod';

// Dynamic import for session verification
async function verifySession(request: Request) {
  const { verifySession: verify } = await import('~/lib/auth/session.server');
  return verify(request);
}

// Request body type
interface WorkspaceRequestBody {
  name?: string;
  description?: string;
  nodes?: unknown[];
  connections?: unknown[];
  metadata?: Record<string, unknown>;
  workspace?: unknown;
  workspaceId?: string;
}

// Schema definitions following giselle protocol patterns
const WorkspaceId = z.string().min(1).brand<'WorkspaceId'>();

const Node = z.object({
  id: z.string(),
  type: z.enum(['operation', 'variable']),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
});

const Connection = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

const Workspace = z.object({
  id: WorkspaceId,
  name: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(Node).default([]),
  connections: z.array(Connection).default([]),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

type WorkspaceType = z.infer<typeof Workspace>;

// In-memory store for development (replace with DB in production)
const workspaceStore = new Map<string, WorkspaceType>();

/**
 * Generate a unique workspace ID
 */
function generateWorkspaceId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * GET /api/workspaces
 *
 * Query params:
 * - workspaceId: Get a specific workspace by ID
 * - userId: Get all workspaces for a user
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const userId = url.searchParams.get('userId');

    // Get specific workspace
    if (workspaceId) {
      const workspace = workspaceStore.get(workspaceId);

      if (!workspace) {
        return json({ success: false, error: 'Workspace not found' }, { status: 404 });
      }

      return json({ success: true, workspace });
    }

    // Get all workspaces for user
    if (userId) {
      const workspaces = Array.from(workspaceStore.values()).filter(
        (ws) => (ws.metadata as any)?.userId === userId
      );
      return json({ success: true, workspaces });
    }

    // Return all workspaces for the current user
    const userWorkspaces = Array.from(workspaceStore.values()).filter(
      (ws) => (ws.metadata as any)?.userId === session.user.id
    );
    return json({ success: true, workspaces: userWorkspaces });
  } catch (error) {
    console.error('[Workspaces] Loader error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get workspaces',
    }, { status: 500 });
  }
}

/**
 * POST /api/workspaces - Create workspace
 * PUT /api/workspaces - Update workspace
 */
export async function action({ request }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json() as WorkspaceRequestBody;

    // POST - Create new workspace
    if (request.method === 'POST') {
      const workspaceId = generateWorkspaceId();
      const now = new Date().toISOString();

      const newWorkspace: WorkspaceType = {
        id: workspaceId as any,
        name: body.name || 'Untitled Workspace',
        description: body.description || '',
        nodes: (body.nodes || []) as any,
        connections: (body.connections || []) as any,
        metadata: {
          ...body.metadata,
          userId: session.user.id,
        },
        createdAt: now,
        updatedAt: now,
      };

      workspaceStore.set(workspaceId, newWorkspace);

      console.log(`[Workspaces] Created workspace: ${workspaceId}`);
      return json({ success: true, workspace: newWorkspace });
    }

    // PUT - Update existing workspace
    if (request.method === 'PUT') {
      const validation = Workspace.safeParse(body.workspace);

      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid workspace data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const workspace = validation.data;
      const existingWorkspace = workspaceStore.get(workspace.id);

      if (!existingWorkspace) {
        return json({ success: false, error: 'Workspace not found' }, { status: 404 });
      }

      // Check ownership
      if ((existingWorkspace.metadata as any)?.userId !== session.user.id) {
        return json({ success: false, error: 'Access denied' }, { status: 403 });
      }

      const updatedWorkspace: WorkspaceType = {
        ...workspace,
        metadata: {
          ...existingWorkspace.metadata,
          ...workspace.metadata,
        },
        updatedAt: new Date().toISOString(),
      };

      workspaceStore.set(workspace.id, updatedWorkspace);

      console.log(`[Workspaces] Updated workspace: ${workspace.id}`);
      return json({ success: true, workspace: updatedWorkspace });
    }

    // DELETE - Delete workspace
    if (request.method === 'DELETE') {
      const workspaceId = body.workspaceId;

      if (!workspaceId) {
        return json({ success: false, error: 'Workspace ID required' }, { status: 400 });
      }

      const existingWorkspace = workspaceStore.get(workspaceId);

      if (!existingWorkspace) {
        return json({ success: false, error: 'Workspace not found' }, { status: 404 });
      }

      // Check ownership
      if ((existingWorkspace.metadata as any)?.userId !== session.user.id) {
        return json({ success: false, error: 'Access denied' }, { status: 403 });
      }

      workspaceStore.delete(workspaceId);

      console.log(`[Workspaces] Deleted workspace: ${workspaceId}`);
      return new Response(null, { status: 204 });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[Workspaces] Action error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Workspace operation failed',
    }, { status: 500 });
  }
}
