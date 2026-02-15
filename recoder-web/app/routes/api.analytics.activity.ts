/**
 * Activity Heatmap API
 * Returns activity heatmap data for the analytics dashboard
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AnalyticsActivity');

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const url = new URL(request.url);

    // Admin auth check
    const userId = url.searchParams.get('userId') || request.headers.get('x-user-id');
    const adminIds = ((env as any).ADMIN_USER_IDS || '').split(',').map((id: string) => id.trim()).filter(Boolean);
    if (adminIds.length > 0 && (!userId || !adminIds.includes(userId))) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const databaseUrl = (env as any).DATABASE_URL;
    if (!databaseUrl) {
      return json({
        data: [],
        totalContributions: 0,
        longestStreak: 0,
        currentStreak: 0,
        busiestDay: '',
        busiestDayCount: 0,
      });
    }

    const { getDatabase } = await import('~/lib/.server/db/client');
    const db = getDatabase(env);

    // Get daily activity counts for the past 365 days
    const activityRows = await db.execute(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM usage_logs
      WHERE created_at >= NOW() - INTERVAL '365 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const activity = Array.isArray(activityRows) ? (activityRows as any[]) : [];

    // Calculate max for level scaling
    const maxCount = Math.max(1, ...activity.map(r => Number(r.count)));

    const data = activity.map(row => {
      const count = Number(row.count);
      const level = count === 0 ? 0 : count <= maxCount * 0.25 ? 1 : count <= maxCount * 0.5 ? 2 : count <= maxCount * 0.75 ? 3 : 4;
      return { date: String(row.date), count, level: level as 0 | 1 | 2 | 3 | 4 };
    });

    const totalContributions = data.reduce((sum, d) => sum + d.count, 0);

    // Calculate streaks
    let longestStreak = 0;
    let currentStreak = 0;
    let streak = 0;
    const dateSet = new Set(data.map(d => d.date));
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (dateSet.has(dateStr)) {
        streak++;
        longestStreak = Math.max(longestStreak, streak);
        if (i === 0 || currentStreak > 0) currentStreak = streak;
      } else {
        if (i === 0) currentStreak = 0;
        streak = 0;
      }
    }

    const busiest = data.reduce((max, d) => d.count > max.count ? d : max, { date: '', count: 0, level: 0 as const });

    return json({
      data,
      totalContributions,
      longestStreak,
      currentStreak,
      busiestDay: busiest.date,
      busiestDayCount: busiest.count,
    });
  } catch (error) {
    logger.error('Activity analytics error:', error);
    return json({
      data: [],
      totalContributions: 0,
      longestStreak: 0,
      currentStreak: 0,
      busiestDay: '',
      busiestDayCount: 0,
      error: 'Failed to fetch activity data',
    }, { status: 500 });
  }
}
