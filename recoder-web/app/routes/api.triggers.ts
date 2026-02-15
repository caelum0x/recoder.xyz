/**
 * Trigger Operations API
 *
 * Handles trigger management for workflow automation following giselle HTTP router patterns.
 *
 * GET /api/triggers?triggerId=xxx - Get a specific trigger
 * GET /api/triggers?workspaceId=xxx - Get all triggers for a workspace
 * POST /api/triggers - Create/configure a trigger
 * POST /api/triggers?action=resolve - Resolve a trigger
 * POST /api/triggers?action=reconfigureGitHub - Reconfigure GitHub trigger
 * PUT /api/triggers - Update a trigger
 * DELETE /api/triggers - Delete a trigger
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { z } from 'zod';
import {
  addTrigger,
  generateTriggerId,
  getTrigger,
  listTriggersForWorkspace,
  removeTrigger,
  updateTrigger,
} from '~/lib/.server/workspaces/triggers-store';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Triggers');

// Dynamic import for session verification
async function verifySession(request: Request) {
  const { verifySession: verify } = await import('~/lib/auth/session.server');
  return verify(request);
}

// Request body type
interface TriggerRequestBody {
  triggerId?: string;
  trigger?: unknown;
  generation?: { origin?: { type: string; id: string } };
  repositoryNodeId?: string;
  installationId?: number;
  event?: unknown;
}

// Schema definitions
const TriggerId = z.string().min(1).brand<'TriggerId'>();
const WorkspaceId = z.string().min(1);

const TriggerType = z.enum(['manual', 'schedule', 'webhook', 'github', 'api']);

const ScheduleConfig = z.object({
  cron: z.string(),
  timezone: z.string().default('UTC'),
});

const WebhookConfig = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

const GitHubConfig = z.object({
  repositoryNodeId: z.string(),
  installationId: z.number(),
  event: z.object({
    type: z.enum(['push', 'pull_request', 'issue', 'release', 'workflow_dispatch']),
    filters: z.record(z.unknown()).optional(),
  }).optional(),
});

const Trigger = z.object({
  id: TriggerId,
  workspaceId: WorkspaceId,
  name: z.string().optional(),
  type: TriggerType,
  enabled: z.boolean().default(true),
  config: z.union([ScheduleConfig, WebhookConfig, GitHubConfig, z.object({})]).optional(),
  lastTriggeredAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const ConfigureTriggerInput = z.object({
  workspaceId: WorkspaceId,
  name: z.string().optional(),
  type: TriggerType,
  config: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ReconfigureGitHubInput = z.object({
  triggerId: z.string(),
  repositoryNodeId: z.string(),
  installationId: z.number(),
  event: z.object({
    type: z.enum(['push', 'pull_request', 'issue', 'release', 'workflow_dispatch']),
    filters: z.record(z.unknown()).optional(),
  }).optional(),
});

type TriggerType = z.infer<typeof Trigger>;

/**
 * GET /api/triggers
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const triggerId = url.searchParams.get('triggerId');
    const workspaceId = url.searchParams.get('workspaceId');

    // Get specific trigger
    if (triggerId) {
      const trigger = getTrigger(triggerId);
      if (!trigger) {
        return json({ success: false, error: 'Trigger not found' }, { status: 404 });
      }
      return json({ success: true, trigger });
    }

    // Get all triggers for workspace
    if (workspaceId) {
      const triggers = listTriggersForWorkspace(workspaceId);
      return json({ success: true, triggers });
    }

    return json({ success: false, error: 'triggerId or workspaceId required' }, { status: 400 });
  } catch (error) {
    logger.error('[Triggers] Loader error:', error);
    return json({
      success: false,
      error: 'Failed to get triggers',
    }, { status: 500 });
  }
}

/**
 * POST /api/triggers - Configure trigger
 * PUT /api/triggers - Update trigger
 * DELETE /api/triggers - Delete trigger
 */
export async function action({ request }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const actionType = url.searchParams.get('action');
    const body = await request.json() as TriggerRequestBody;

    // Resolve trigger (get trigger info from generation context)
    if (actionType === 'resolve') {
      const generation = body.generation;
      if (!generation) {
        return json({ success: false, error: 'generation required' }, { status: 400 });
      }

      // In production, this would resolve the trigger from the generation context
      // For now, return a placeholder
      const trigger = generation.origin?.type === 'trigger'
        ? getTrigger(generation.origin.id)
        : null;

      return json({ success: true, trigger: trigger || null });
    }

    // Reconfigure GitHub trigger
    if (actionType === 'reconfigureGitHub') {
      const validation = ReconfigureGitHubInput.safeParse(body);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const { triggerId, repositoryNodeId, installationId, event } = validation.data;
      const trigger = getTrigger(triggerId);

      if (!trigger) {
        return json({ success: false, error: 'Trigger not found' }, { status: 404 });
      }

      if (trigger.type !== 'github') {
        return json({ success: false, error: 'Trigger is not a GitHub trigger' }, { status: 400 });
      }

      const updatedTrigger = {
        ...trigger,
        config: {
          repositoryNodeId,
          installationId,
          event,
        },
        updatedAt: new Date().toISOString(),
      };

      updateTrigger(updatedTrigger as any);

      logger.info(`[Triggers] Reconfigured GitHub trigger: ${triggerId}`);
      return json({ success: true, triggerId });
    }

    // POST - Configure new trigger
    if (request.method === 'POST') {
      const validation = ConfigureTriggerInput.safeParse(body.trigger || body);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const triggerId = generateTriggerId();
      const now = new Date().toISOString();

      const newTrigger: TriggerType = {
        id: triggerId as any,
        workspaceId: validation.data.workspaceId,
        name: validation.data.name || `${validation.data.type} trigger`,
        type: validation.data.type,
        enabled: true,
        config: validation.data.config,
        metadata: {
          ...validation.data.metadata,
          userId: session.user.id,
        },
        createdAt: now,
        updatedAt: now,
      };

      addTrigger(newTrigger as any);

      logger.info(`[Triggers] Configured: ${triggerId}`);
      return json({ success: true, triggerId });
    }

    // PUT - Update trigger
    if (request.method === 'PUT') {
      const validation = Trigger.safeParse(body.trigger);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid trigger data',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const trigger = validation.data;
      const existingTrigger = getTrigger(trigger.id);

      if (!existingTrigger) {
        return json({ success: false, error: 'Trigger not found' }, { status: 404 });
      }

      const updatedTrigger: TriggerType = {
        ...trigger,
        updatedAt: new Date().toISOString(),
      };

      updateTrigger(updatedTrigger as any);

      logger.info(`[Triggers] Updated: ${trigger.id}`);
      return json({ success: true, triggerId: trigger.id });
    }

    // DELETE - Delete trigger
    if (request.method === 'DELETE') {
      const triggerId = body.triggerId;

      if (!triggerId) {
        return json({ success: false, error: 'Trigger ID required' }, { status: 400 });
      }

      const trigger = getTrigger(triggerId);

      if (!trigger) {
        return json({ success: false, error: 'Trigger not found' }, { status: 404 });
      }

      removeTrigger(triggerId);

      logger.info(`[Triggers] Deleted: ${triggerId}`);
      return new Response(null, { status: 204 });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('[Triggers] Action error:', error);
    return json({
      success: false,
      error: 'Trigger operation failed',
    }, { status: 500 });
  }
}
