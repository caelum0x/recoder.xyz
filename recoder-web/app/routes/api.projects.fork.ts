/**
 * Project Fork API
 * POST /api/projects/fork - Fork a project at a specific point in history
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { verifySession } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectsFork');

interface ForkRequest {
  projectId: string;
  planId: string;
}

interface MessageHistoryEntry {
  type: string;
  message?: string;
  planId?: string;
  [key: string]: unknown;
}

// Adjectives and nouns for random name generation (matching libra pattern)
const adjectives = [
  'swift', 'bright', 'cosmic', 'digital', 'elegant', 'fancy', 'golden', 'happy',
  'ionic', 'jazzy', 'keen', 'lunar', 'modern', 'noble', 'optimal', 'prime',
  'quantum', 'radiant', 'stellar', 'turbo', 'ultra', 'vivid', 'witty', 'zen'
];

const nouns = [
  'app', 'bot', 'cloud', 'dash', 'echo', 'flux', 'grid', 'hub', 'ion', 'jet',
  'kit', 'lab', 'mesh', 'node', 'orb', 'pod', 'quest', 'ray', 'sync', 'tech',
  'unit', 'vibe', 'wave', 'xray', 'yard', 'zone'
];

/**
 * Generate a random project name
 */
function generateRandomProjectName(maxLength: number = 30): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 1000);

  const name = `${adjective}-${noun}-${number}`;
  return name.length <= maxLength ? name : name.substring(0, maxLength);
}

/**
 * Build fork history up to a specific planId
 */
function buildForkHistory(
  messageHistory: string | null,
  targetPlanId: string
): { forkHistory: MessageHistoryEntry[]; initialMessage: string } {
  const forkHistory: MessageHistoryEntry[] = [];
  let initialMessage = '';

  if (!messageHistory) {
    return { forkHistory, initialMessage };
  }

  try {
    const history: MessageHistoryEntry[] = JSON.parse(messageHistory);
    let foundTarget = false;

    for (const entry of history) {
      forkHistory.push(entry);

      // Capture the initial message from the first user message
      if (entry.type === 'user' && entry.message && !initialMessage) {
        initialMessage = entry.message;
      }

      // Stop when we reach the target planId
      if (entry.planId === targetPlanId) {
        foundTarget = true;
        break;
      }
    }

    if (!foundTarget) {
      logger.warn(`[Fork] Target planId ${targetPlanId} not found in history`);
    }

    return { forkHistory, initialMessage };
  } catch (error) {
    logger.error('[Fork] Failed to parse message history:', error);
    return { forkHistory: [], initialMessage: '' };
  }
}

/**
 * POST /api/projects/fork - Fork a project
 * Body: { projectId, planId }
 */
export async function action({ request, context }: ActionFunctionArgs) {
  // Verify authentication
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json() as ForkRequest;
    const { projectId, planId } = body;

    // Validate required fields
    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }
    if (!planId) {
      return json({ success: false, error: 'Plan ID is required' }, { status: 400 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);

    // Fetch source project (allow forking public projects from any user)
    const sourceProject = await projectsDB.getProject(projectId);
    if (!sourceProject) {
      return json({ success: false, error: 'Source project not found' }, { status: 404 });
    }

    // Check access - user can fork their own projects or public projects
    const isOwner = sourceProject.userId === session.user.id;
    const isPublic = !sourceProject.isPrivate;

    if (!isOwner && !isPublic) {
      return json({ success: false, error: 'Cannot fork private project from another user' }, { status: 403 });
    }

    // Build fork history
    const messageHistoryStr = (sourceProject as any).messageHistory || null;
    const { forkHistory, initialMessage } = buildForkHistory(messageHistoryStr, planId);

    // Generate fork name
    const maxForkNameLength = 30;
    const forkSuffix = ' (Fork)';
    let forkName: string;

    if (sourceProject.name.length + forkSuffix.length <= maxForkNameLength) {
      forkName = `${sourceProject.name}${forkSuffix}`;
    } else {
      forkName = generateRandomProjectName(maxForkNameLength);
    }

    // Create the forked project
    const forkedProject = await projectsDB.createProject({
      name: forkName,
      description: sourceProject.description || `Forked from ${sourceProject.name}`,
      type: sourceProject.type || 'web',
      framework: sourceProject.framework || undefined,
      language: sourceProject.language || undefined,
      isPrivate: false, // Forks are public by default
      userId: session.user.id,
      config: sourceProject.config || {},
      metadata: {
        ...(sourceProject.metadata || {}),
        forkedFrom: projectId,
        forkedAt: new Date().toISOString(),
        forkPlanId: planId,
      },
    });

    // Update with fork history (requires custom SQL since ProjectsDB doesn't support messageHistory)
    // For now, store fork metadata in the metadata field
    logger.info(`[Fork] Project forked successfully:`, {
      sourceProjectId: projectId,
      forkedProjectId: forkedProject.id,
      forkPlanId: planId,
      historyLength: forkHistory.length,
    });

    return json({
      success: true,
      project: forkedProject,
      sourceProject: {
        id: projectId,
        name: sourceProject.name,
      },
      forkInfo: {
        planId,
        historyLength: forkHistory.length,
      },
    });
  } catch (error) {
    logger.error('[Fork] Project fork error:', error);
    return json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}
