/**
 * Admin KPI Dashboard API
 *
 * GET /api/admin/kpi
 *
 * Protected by `x-admin-secret` header matching ADMIN_SECRET env var.
 * Returns weekly metrics across users, engagement, revenue and email.
 *
 * The codebase has TWO logical user populations stored in a single `users`
 * table. "Web users" are those with a Better Auth `account` row; "CLI users"
 * are those with at least one `cli_sessions` row.  We query both separately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function startOfWeek(weeksAgo = 0): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - weeksAgo * 7);
  return monday;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// Safe wrapper — some tables may not be migrated yet.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Auth gate
  const secret = request.headers.get('x-admin-secret');
  if (!ADMIN_SECRET || !secret || secret !== ADMIN_SECRET) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Provide x-admin-secret header.' },
      { status: 401 },
    );
  }

  const thisWeekStart = startOfWeek(0);
  const lastWeekStart = startOfWeek(1);

  // -----------------------------------------------------------------------
  // 1. USERS — from the single `users` table
  // -----------------------------------------------------------------------
  const totalUsers = await safe(() => prisma.users.count(), 0);
  const usersThisWeek = await safe(
    () => prisma.users.count({ where: { createdAt: { gte: thisWeekStart } } }),
    0,
  );
  const usersLastWeek = await safe(
    () =>
      prisma.users.count({
        where: {
          createdAt: { gte: lastWeekStart, lt: thisWeekStart },
        },
      }),
    0,
  );

  // -----------------------------------------------------------------------
  // 2. WEB USERS — users who have a Better Auth `account` row
  // -----------------------------------------------------------------------
  const webUsersTotal = await safe(
    () =>
      prisma.users.count({
        where: { accounts: { some: {} } },
      }),
    0,
  );
  const webUsersThisWeek = await safe(
    () =>
      prisma.accounts.count({
        where: { createdAt: { gte: thisWeekStart } },
      }),
    0,
  );
  const webUsersLastWeek = await safe(
    () =>
      prisma.accounts.count({
        where: {
          createdAt: { gte: lastWeekStart, lt: thisWeekStart },
        },
      }),
    0,
  );

  // -----------------------------------------------------------------------
  // 3. CLI USERS — users who have at least one `cli_sessions` row
  // -----------------------------------------------------------------------
  const cliUsersTotal = await safe(
    () =>
      prisma.users.count({
        where: { cli_sessions: { some: {} } },
      }),
    0,
  );
  const cliSessionsThisWeek = await safe(
    () =>
      prisma.cli_sessions.count({
        where: { createdAt: { gte: thisWeekStart } },
      }),
    0,
  );
  const cliSessionsLastWeek = await safe(
    () =>
      prisma.cli_sessions.count({
        where: {
          createdAt: { gte: lastWeekStart, lt: thisWeekStart },
        },
      }),
    0,
  );

  // Unique CLI users this week
  const cliUniqueThisWeek = await safe(async () => {
    const result = await prisma.cli_sessions.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: thisWeekStart } },
    });
    return result.length;
  }, 0);

  // -----------------------------------------------------------------------
  // 4. COMBINED SIGNUPS
  // -----------------------------------------------------------------------
  const combinedSignupsThisWeek = usersThisWeek;
  const combinedSignupsLastWeek = usersLastWeek;
  const signupGrowthPct = pctChange(combinedSignupsThisWeek, combinedSignupsLastWeek);

  // -----------------------------------------------------------------------
  // 5. SUBSCRIPTIONS (subscriptions table)
  // -----------------------------------------------------------------------
  const activeSubscriptions = await safe(
    () => prisma.subscriptions.count({ where: { status: 'active' } }),
    0,
  );
  const newSubsThisWeek = await safe(
    () =>
      prisma.subscriptions.count({
        where: { status: 'active', createdAt: { gte: thisWeekStart } },
      }),
    0,
  );

  // MRR estimate from subscriptions table
  const mrrEstimate = await safe(async () => {
    const activeSubs = await prisma.subscriptions.findMany({
      where: { status: 'active' },
      select: { amount: true, interval: true },
    });
    let mrr = 0;
    for (const sub of activeSubs) {
      const amt = sub.amount ?? 0;
      if (sub.interval === 'year' || sub.interval === 'yearly') {
        mrr += amt / 12;
      } else {
        mrr += amt;
      }
    }
    return Math.round(mrr * 100) / 100;
  }, 0);

  // Also check dodo_subscriptions for additional revenue
  const dodoMrr = await safe(async () => {
    const activeSubs = await prisma.dodo_subscriptions.findMany({
      where: { status: 'active' },
      select: { amount: true },
    });
    return activeSubs.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  }, 0);

  const activeDodoSubs = await safe(
    () => prisma.dodo_subscriptions.count({ where: { status: 'active' } }),
    0,
  );

  // Users with active subscription status on their profile
  const paidUsersCount = await safe(
    () =>
      prisma.users.count({
        where: {
          subscriptionStatus: 'active',
          subscriptionPlan: { not: 'free' },
        },
      }),
    0,
  );

  // -----------------------------------------------------------------------
  // 6. NEWSLETTER
  // -----------------------------------------------------------------------
  const newsletterActive = await safe(
    () =>
      prisma.newsletter_subscribers.count({
        where: { status: 'active' },
      }),
    0,
  );
  const newsletterThisWeek = await safe(
    () =>
      prisma.newsletter_subscribers.count({
        where: { status: 'active', subscribedAt: { gte: thisWeekStart } },
      }),
    0,
  );

  // -----------------------------------------------------------------------
  // 7. SCHEDULED EMAILS
  // -----------------------------------------------------------------------
  const emailsSentThisWeek = await safe(
    () =>
      prisma.scheduled_emails.count({
        where: { status: 'sent', sentAt: { gte: thisWeekStart } },
      }),
    0,
  );
  const emailsFailedThisWeek = await safe(
    () =>
      prisma.scheduled_emails.count({
        where: { status: 'failed', scheduledAt: { gte: thisWeekStart } },
      }),
    0,
  );
  const emailsPending = await safe(
    () =>
      prisma.scheduled_emails.count({
        where: { status: 'pending' },
      }),
    0,
  );

  // -----------------------------------------------------------------------
  // 8. ENGAGEMENT EXTRAS
  // -----------------------------------------------------------------------
  const apiKeysTotal = await safe(() => prisma.api_keys.count({ where: { isActive: true } }), 0);
  const projectsThisWeek = await safe(
    () =>
      prisma.projects.count({
        where: { createdAt: { gte: thisWeekStart } },
      }),
    0,
  );
  const projectsLastWeek = await safe(
    () =>
      prisma.projects.count({
        where: {
          createdAt: { gte: lastWeekStart, lt: thisWeekStart },
        },
      }),
    0,
  );

  // Web sessions (Better Auth) this week
  const webSessionsThisWeek = await safe(
    () =>
      prisma.session.count({
        where: { createdAt: { gte: thisWeekStart } },
      }),
    0,
  );

  // -----------------------------------------------------------------------
  // Response
  // -----------------------------------------------------------------------
  return NextResponse.json({
    success: true,
    generatedAt: new Date().toISOString(),
    weekStart: thisWeekStart.toISOString(),
    metrics: {
      users: {
        total: totalUsers,
        thisWeek: usersThisWeek,
        lastWeek: usersLastWeek,
        growthPct: pctChange(usersThisWeek, usersLastWeek),
        web: {
          total: webUsersTotal,
          thisWeek: webUsersThisWeek,
          lastWeek: webUsersLastWeek,
          growthPct: pctChange(webUsersThisWeek, webUsersLastWeek),
        },
        cli: {
          total: cliUsersTotal,
          thisWeek: cliSessionsThisWeek,
          lastWeek: cliSessionsLastWeek,
          uniqueThisWeek: cliUniqueThisWeek,
          growthPct: pctChange(cliSessionsThisWeek, cliSessionsLastWeek),
        },
        combinedSignups: {
          thisWeek: combinedSignupsThisWeek,
          lastWeek: combinedSignupsLastWeek,
          growthPct: signupGrowthPct,
        },
      },
      engagement: {
        cliSessions: {
          thisWeek: cliSessionsThisWeek,
          uniqueUsers: cliUniqueThisWeek,
        },
        webSessions: {
          thisWeek: webSessionsThisWeek,
        },
        apiKeys: {
          active: apiKeysTotal,
        },
        projects: {
          thisWeek: projectsThisWeek,
          lastWeek: projectsLastWeek,
          growthPct: pctChange(projectsThisWeek, projectsLastWeek),
        },
      },
      revenue: {
        activeSubscriptions: activeSubscriptions + activeDodoSubs,
        newThisWeek: newSubsThisWeek,
        mrrEstimate: Math.round((mrrEstimate + dodoMrr) * 100) / 100,
        paidUsers: paidUsersCount,
      },
      email: {
        newsletter: {
          activeSubscribers: newsletterActive,
          newThisWeek: newsletterThisWeek,
        },
        scheduled: {
          sentThisWeek: emailsSentThisWeek,
          failedThisWeek: emailsFailedThisWeek,
          pending: emailsPending,
        },
      },
    },
  });
}
