/**
 * API endpoint for chat history operations
 * Handles saving and loading chats from database
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createChatHistoryDB } from '~/lib/.server/db/chat-history-db';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatHistory');

function getHubApiBaseUrl(context: ActionFunctionArgs['context'] | LoaderFunctionArgs['context']): string {
  const env = resolveEnv(context as any);
  return (
    env.MAIN_SITE_URL ||
    env.APP_URL ||
    'https://recoder.xyz'
  ).replace(/\/$/, '');
}

async function mirrorProjectSnapshotToHub(options: {
  context: ActionFunctionArgs['context'];
  request: Request;
  projectId?: string;
  fileSnapshot?: Record<string, string>;
  title?: string;
  description?: string;
  source?: string;
}) {
  const { context, request, projectId, fileSnapshot, title, description, source } = options;
  if (!projectId || !fileSnapshot || Object.keys(fileSnapshot).length === 0) {
    return;
  }

  const cookie = request.headers.get('Cookie');
  if (!cookie) {
    return;
  }

  try {
    const hubUrl = new URL(`/api/projects/${encodeURIComponent(projectId)}`, getHubApiBaseUrl(context));
    const response = await fetch(hubUrl.toString(), {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        files: fileSnapshot,
        title: title || undefined,
        description: description || undefined,
        source: source || 'web',
      }),
    });

    if (!response.ok) {
      logger.warn('Project snapshot mirror request failed', {
        projectId,
        status: response.status,
      });
    }
  } catch (error) {
    logger.warn('Project snapshot mirror request threw', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// CRITICAL: Access real Node.js env vars at runtime, not build time.
// Vite's node-polyfills plugin replaces ALL `process` references with a shim
// that has empty env. We use a dynamic property access on globalThis to bypass.
function getEnv(): Record<string, string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  return g['process']?.env || {};
}

/**
 * Safely resolve env from context, falling back to real Node.js process.env.
 * Avoids the Vite shim that replaces `process.env` with an empty object.
 */
function resolveEnv(context: any): Record<string, string | undefined> {
  const cfEnv = (context as any)?.cloudflare?.env;
  if (cfEnv && (cfEnv.DATABASE_URL || cfEnv.NEON_DATABASE_URL)) {
    return cfEnv;
  }
  return getEnv();
}

/**
 * GET /api/chat-history - Get user's chat history
 * Query params:
 *   - userId: User ID (optional, for authenticated users)
 *   - anonymousId: Anonymous ID (optional, for anonymous users)
 *   - limit: Max number of chats to return (default: 50)
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    // Support both Cloudflare and Node.js environments
    // CRITICAL: Use resolveEnv() to bypass Vite's process.env shim
    const env = resolveEnv(context);
    const url = new URL(request.url);

    const userId = url.searchParams.get('userId');
    const userEmail = url.searchParams.get('userEmail');
    const userName = url.searchParams.get('userName');
    const anonymousId = url.searchParams.get('anonymousId');
    const urlId = url.searchParams.get('urlId');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    logger.info('📋 [api.chat-history.loader] Request received:', {
      userId,
      userEmail,
      anonymousId,
      urlId,
      limit,
      hasEnv: !!env,
      hasDatabaseUrl: !!env.DATABASE_URL,
    });

    // Gracefully handle missing DATABASE_URL instead of throwing
    if (!env.DATABASE_URL && !env.NEON_DATABASE_URL) {
      logger.warn('📋 [api.chat-history.loader] DATABASE_URL not configured');
      return json({
        success: false,
        error: 'Database not configured',
      }, { status: 503 });
    }

    const chatDB = createChatHistoryDB(env);

    // If urlId is provided, load specific chat with messages and file snapshot
    if (urlId) {
      logger.info('📋 [api.chat-history.loader] Loading specific chat:', urlId);
      const chat = await chatDB.loadChat(urlId);

      if (!chat) {
        return json({ error: 'Chat not found' }, { status: 404 });
      }

      logger.info('📋 [api.chat-history.loader] Chat loaded:', {
        sessionId: chat.id,
        messageCount: chat.messages.length,
        fileCount: Object.keys(chat.fileSnapshot || {}).length,
      });

      return json({
        success: true,
        data: [chat], // Return as array for compatibility
      });
    }

    // Otherwise, return list of chat sessions
    if (!userId && !anonymousId) {
      logger.error('❌ [api.chat-history.loader] No userId or anonymousId provided');
      return json({ error: 'Either userId or anonymousId required' }, { status: 400 });
    }

    logger.info('📋 [api.chat-history.loader] Fetching history...');
    const history = await chatDB.getChatHistory(
      userId || undefined,
      anonymousId || undefined,
      limit,
      userEmail || undefined,
      userName || undefined
    );

    logger.info('📋 [api.chat-history.loader] History fetched:', history.length, 'sessions');

    return json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.error('❌ [api.chat-history.loader] Failed to load chat history:', error);
    if (error instanceof Error) {
      logger.error('❌ [api.chat-history.loader] Error details:', error.message, error.stack);
    }
    return json(
      {
        success: false,
        error: 'Failed to load chat history',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat-history - Save or update a chat
 * DELETE /api/chat-history - Delete a chat session
 * POST /api/chat-history/claim - Claim anonymous sessions for a user
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Support both Cloudflare and Node.js environments
    // CRITICAL: Use resolveEnv() to bypass Vite's process.env shim
    const env = resolveEnv(context);

    // Gracefully handle missing DATABASE_URL instead of throwing
    if (!env.DATABASE_URL && !env.NEON_DATABASE_URL) {
      logger.warn('💾 [api.chat-history.action] DATABASE_URL not configured');
      return json({
        success: false,
        error: 'Database not configured',
      }, { status: 503 });
    }

    const chatDB = createChatHistoryDB(env);
    const url = new URL(request.url);

    // Handle claim endpoint
    if (url.pathname.endsWith('/claim')) {
      const claimBody = await request.json() as {
        anonymousId?: string;
        userId?: string;
        userEmail?: string;
        userName?: string;
      };
      const { anonymousId, userId, userEmail, userName } = claimBody;

      if (!anonymousId || !userId) {
        return json({ error: 'anonymousId and userId required' }, { status: 400 });
      }

      const claimedCount = await chatDB.claimAnonymousSessions(
        anonymousId,
        userId,
        userEmail,
        userName
      );

      return json({
        success: true,
        claimedCount,
        message: `Claimed ${claimedCount} sessions`,
      });
    }

    if (request.method === 'DELETE') {
      // Delete a chat session
      const deleteBody = await request.json() as { sessionId?: string };
      const { sessionId } = deleteBody;

      if (!sessionId) {
        return json({ error: 'sessionId required' }, { status: 400 });
      }

      await chatDB.deleteSession(sessionId);

      return json({
        success: true,
        message: 'Chat deleted successfully',
      });
    }

    // POST - Save chat
    const data = await request.json() as {
      userId?: string;
      userEmail?: string;
      userName?: string;
      anonymousId?: string;
      urlId?: string;
      title?: string;
      description?: string;
      messages?: any[];
      artifactId?: string;
      fileSnapshot?: any;
      projectId?: string;
      source?: string;
      cliVersion?: string;
    };

    const {
      userId,
      userEmail,
      userName,
      anonymousId,
      urlId,
      title,
      description,
      messages,
      artifactId,
      fileSnapshot,
      projectId,
      source,
      cliVersion,
    } = data;

    logger.info('💾 [api.chat-history.action] Save request received:', {
      userId,
      userEmail,
      anonymousId,
      urlId,
      title,
      hasDescription: !!description,
      messageCount: messages?.length || 0,
      artifactId,
      projectId,
      source: source || 'web',
      cliVersion,
      fileCount: fileSnapshot ? Object.keys(fileSnapshot).length : 0,
    });

    if (!urlId) {
      logger.error('❌ [api.chat-history.action] Missing urlId');
      return json({ error: 'urlId required' }, { status: 400 });
    }

    if (!messages || !Array.isArray(messages)) {
      logger.error('❌ [api.chat-history.action] Missing or invalid messages');
      return json({ error: 'messages array required' }, { status: 400 });
    }

    if (!userId && !anonymousId) {
      logger.error('❌ [api.chat-history.action] No userId or anonymousId');
      return json({ error: 'Either userId or anonymousId required' }, { status: 400 });
    }

    logger.info('💾 [api.chat-history.action] Saving to database...');
    const session = await chatDB.saveChat({
      userId,
      userEmail,
      userName,
      anonymousId,
      urlId,
      title,
      description,
      messages,
      artifactId,
      fileSnapshot,
      projectId,
      source: (source as 'web' | 'cli' | undefined) || 'web',
      cliVersion,
    });

    logger.info('✅ [api.chat-history.action] Save successful:', {
      sessionId: session.id,
      urlId: session.urlId,
    });

    await mirrorProjectSnapshotToHub({
      context,
      request,
      projectId,
      fileSnapshot,
      title,
      description,
      source,
    });

    return json({
      success: true,
      data: {
        sessionId: session.id,
        urlId: session.urlId,
      },
    });
  } catch (error) {
    logger.error('Failed to save chat:', error);
    return json(
      {
        success: false,
        error: 'Failed to save chat',
      },
      { status: 500 }
    );
  }
}
