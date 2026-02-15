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
import { copySecretsToWorkspace } from '~/lib/.server/workspaces/workspace-vault-store';
import { copyTriggersToWorkspace } from '~/lib/.server/workspaces/triggers-store';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Workspaces');

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
  sourceWorkspaceId?: string;
  newWorkspaceName?: string;
  includeTriggers?: boolean;
  includeSecrets?: boolean;
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

const DuplicateWorkspaceInput = z.object({
  sourceWorkspaceId: z.string().min(1),
  newWorkspaceName: z.string().trim().min(1).optional(),
  includeTriggers: z.boolean().optional(),
  includeSecrets: z.boolean().optional(),
});

// In-memory store for development (replace with DB in production)
const workspaceStore = new Map<string, WorkspaceType>();

export function __resetWorkspaceStoreForTests(): void {
  workspaceStore.clear();
}

export function __getWorkspaceStoreForTests(): Map<string, WorkspaceType> {
  return workspaceStore;
}

/**
 * Generate a unique workspace ID
 */
function generateWorkspaceId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateNodeId(): string {
  return `nd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateConnectionId(): string {
  return `con_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
    logger.error('[Workspaces] Loader error:', error);
    return json({
      success: false,
      error: 'Failed to get workspaces',
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
    const url = new URL(request.url);
    const actionType = url.searchParams.get('action');
    const body = await request.json() as WorkspaceRequestBody;

    // POST - Create new workspace
    if (request.method === 'POST') {
      if (actionType === 'duplicate') {
        const validation = DuplicateWorkspaceInput.safeParse(body);
        if (!validation.success) {
          return json({
            success: false,
            error: 'Invalid duplicate request',
            details: validation.error.errors,
          }, { status: 400 });
        }

        const sourceWorkspace = workspaceStore.get(validation.data.sourceWorkspaceId);
        if (!sourceWorkspace) {
          return json({ success: false, error: 'Source workspace not found' }, { status: 404 });
        }
        if ((sourceWorkspace.metadata as any)?.userId !== session.user.id) {
          return json({ success: false, error: 'Access denied' }, { status: 403 });
        }

        const nodeIdMap = new Map<string, string>();
        for (const node of sourceWorkspace.nodes) {
          nodeIdMap.set(node.id, generateNodeId());
        }

        const remapByMaps = (value: unknown, maps: Array<Map<string, string> | Record<string, string>>): unknown => {
          if (typeof value === 'string') {
            for (const mapLike of maps) {
              if (mapLike instanceof Map) {
                const mapped = mapLike.get(value);
                if (mapped) return mapped;
              } else if (mapLike[value]) {
                return mapLike[value];
              }
            }
            return value;
          }
          if (Array.isArray(value)) {
            return value.map((item) => remapByMaps(item, maps));
          }
          if (value && typeof value === 'object') {
            const next: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
              next[k] = remapByMaps(v, maps);
            }
            return next;
          }
          return value;
        };

        const duplicatedNodes = sourceWorkspace.nodes.map((node) => ({
          ...node,
          id: nodeIdMap.get(node.id) || node.id,
          data: remapByMaps(node.data, [nodeIdMap]) as Record<string, unknown>,
        }));

        const duplicatedConnections = sourceWorkspace.connections.map((connection) => ({
          ...connection,
          id: generateConnectionId(),
          source: nodeIdMap.get(connection.source) || connection.source,
          target: nodeIdMap.get(connection.target) || connection.target,
        }));

        const workspaceId = generateWorkspaceId();
        const now = new Date().toISOString();
        const includeSecrets = Boolean(validation.data.includeSecrets);
        const includeTriggers = Boolean(validation.data.includeTriggers);

        const newWorkspace: WorkspaceType = {
          id: workspaceId as any,
          name: validation.data.newWorkspaceName || `${sourceWorkspace.name || 'Workspace'} (copy)`,
          description: sourceWorkspace.description || '',
          nodes: duplicatedNodes as any,
          connections: duplicatedConnections as any,
          metadata: {
            ...(sourceWorkspace.metadata || {}),
            userId: session.user.id,
            copiedFromWorkspaceId: sourceWorkspace.id,
            copiedAt: now,
            copyPolicy: {
              includeTriggers,
              includeSecrets,
            },
            idMap: {
              nodeIdMap: Object.fromEntries(nodeIdMap.entries()),
            },
          },
          createdAt: now,
          updatedAt: now,
        };

        workspaceStore.set(workspaceId, newWorkspace);

        let copiedSecrets = 0;
        let copiedTriggers = 0;
        let triggerIdMap: Record<string, string> = {};
        if (includeSecrets) {
          copiedSecrets = copySecretsToWorkspace(sourceWorkspace.id, workspaceId, session.user.id).copied;
        }
        if (includeTriggers) {
          const copiedTriggerResult = copyTriggersToWorkspace(sourceWorkspace.id, workspaceId, session.user.id);
          copiedTriggers = copiedTriggerResult.copied;
          triggerIdMap = copiedTriggerResult.idMap;
        }

        if (Object.keys(triggerIdMap).length > 0) {
          newWorkspace.nodes = newWorkspace.nodes.map((node) => ({
            ...node,
            data: remapByMaps(node.data, [triggerIdMap]) as Record<string, unknown>,
          }));
          newWorkspace.metadata = {
            ...(newWorkspace.metadata || {}),
            idMap: {
              ...((newWorkspace.metadata as any)?.idMap || {}),
              triggerIdMap,
            },
          };
          workspaceStore.set(workspaceId, newWorkspace);
        }

        return json({
          success: true,
          workspace: newWorkspace,
          linkedAssetCopy: {
            copiedSecrets,
            copiedTriggers,
            triggerIdMap,
          },
        });
      }

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

      logger.info(`[Workspaces] Created workspace: ${workspaceId}`);
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

      logger.info(`[Workspaces] Updated workspace: ${workspace.id}`);
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

      logger.info(`[Workspaces] Deleted workspace: ${workspaceId}`);
      return new Response(null, { status: 204 });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('[Workspaces] Action error:', error);
    return json({
      success: false,
      error: 'Workspace operation failed',
    }, { status: 500 });
  }
}
