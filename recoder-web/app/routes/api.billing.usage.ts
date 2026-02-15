/**
 * Billing Usage API
 * POST: Record usage event
 * GET: Return usage summary
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BillingUsage');

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = session.user.id;

  try {

    // Return usage summary from database or in-memory tracking
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const databaseUrl = (env as any).DATABASE_URL;

    if (!databaseUrl) {
      return json({
        usage: {
          sandbox_minutes: { used: 0, limit: 1000, percentage: 0 },
          ai_tokens: { used: 0, limit: 5000000, percentage: 0 },
          storage_gb: { used: 0, limit: 10, percentage: 0 },
          deployments: { used: 0, limit: 50, percentage: 0 },
          api_requests: { used: 0, limit: 10000, percentage: 0 },
        },
        period: 'current',
      });
    }

    // Query usage from database
    const { getDatabase } = await import('~/lib/.server/db/client');
    const db = getDatabase(env);

    try {
      const result = await db.execute(
        `SELECT action_type, COUNT(*) as count, SUM(COALESCE(tokens_used, 0)) as total_tokens
        FROM usage_logs
        WHERE user_id = $1
          AND created_at >= DATE_TRUNC('month', NOW())
        GROUP BY action_type`,
        [userId]
      );

      const usageMap: Record<string, number> = {};
      if (Array.isArray(result)) {
        for (const row of result as any[]) {
          usageMap[row.action_type] = Number(row.count);
        }
      }

      return json({
        usage: {
          sandbox_minutes: { used: usageMap['sandbox'] || 0, limit: 1000, percentage: ((usageMap['sandbox'] || 0) / 1000) * 100 },
          ai_tokens: { used: usageMap['ai_request'] || 0, limit: 5000000, percentage: ((usageMap['ai_request'] || 0) / 5000000) * 100 },
          storage_gb: { used: 0, limit: 10, percentage: 0 },
          deployments: { used: usageMap['deployment'] || 0, limit: 50, percentage: ((usageMap['deployment'] || 0) / 50) * 100 },
          api_requests: { used: usageMap['api_request'] || 0, limit: 10000, percentage: ((usageMap['api_request'] || 0) / 10000) * 100 },
        },
        period: 'current',
      });
    } catch (dbError) {
      logger.error('Failed to query usage from database:', dbError);
      return json({
        usage: {
          sandbox_minutes: { used: 0, limit: 1000, percentage: 0 },
          ai_tokens: { used: 0, limit: 5000000, percentage: 0 },
          storage_gb: { used: 0, limit: 10, percentage: 0 },
          deployments: { used: 0, limit: 50, percentage: 0 },
          api_requests: { used: 0, limit: 10000, percentage: 0 },
        },
        period: 'current',
      });
    }
  } catch (error) {
    logger.error('Usage API error:', error);
    return json({ error: 'Failed to fetch usage' }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { events } = body as { events: Array<{ type: string; quantity: number; metadata?: Record<string, unknown> }> };

    if (!events || !Array.isArray(events)) {
      return json({ error: 'Events array required' }, { status: 400 });
    }

    // Try to persist to database
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const databaseUrl = (env as any).DATABASE_URL;

    if (databaseUrl) {
      try {
        const { getDatabase } = await import('~/lib/.server/db/client');
        const db = getDatabase(env);

        for (const event of events) {
          await db.execute(
            `INSERT INTO usage_logs (user_id, action_type, tokens_used, created_at)
            VALUES ($1, $2, $3, NOW())`,
            [session.user.id, String(event.type), Number(event.quantity) || 0]
          );
        }
      } catch (dbError) {
        logger.error('Failed to record usage in database:', dbError);
        // Continue — don't fail the request if DB write fails
      }
    }

    return json({ success: true, recorded: events.length });
  } catch (error) {
    logger.error('Usage recording error:', error);
    return json({ error: 'Failed to record usage' }, { status: 500 });
  }
}
