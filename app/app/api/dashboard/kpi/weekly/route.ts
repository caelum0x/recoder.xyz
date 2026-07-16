import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const viewer = await prisma.users.findUnique({
      where: { email: authResult.user.email },
      select: { role: true },
    });

    if (viewer?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(now.getDate() - 14);

    const [newSignups, newsletterRows, activatedUsers, paidNew, mrr, recentSignups] =
      await Promise.all([
        prisma.users.count({
          where: {
            createdAt: { gte: sevenDaysAgo },
            isActive: true,
          },
        }),
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM newsletter_subscribers
          WHERE subscribed_at >= ${sevenDaysAgo}
            AND status = 'subscribed'
        `,
        prisma.projects.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        prisma.subscriptions.count({
          where: {
            createdAt: { gte: sevenDaysAgo },
            status: { in: ['active', 'trialing'] },
          },
        }),
        prisma.subscriptions.aggregate({
          where: {
            status: { in: ['active', 'trialing'] },
          },
          _sum: { amount: true },
        }),
        prisma.users.findMany({
          where: {
            createdAt: {
              gte: fourteenDaysAgo,
              lt: sevenDaysAgo,
            },
            isActive: true,
          },
          select: { createdAt: true, lastLoginAt: true },
        }),
      ]);

    const newsletterSignups = Number(newsletterRows[0]?.count ?? 0);

    const retainedD7 = recentSignups.filter((u) => {
      if (!u.lastLoginAt) return false;
      const daySeven = new Date(u.createdAt);
      daySeven.setDate(daySeven.getDate() + 7);
      return u.lastLoginAt >= daySeven;
    }).length;

    const topAcquisitionSources = await prisma.users.groupBy({
      by: ['acquisitionSource'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { acquisitionSource: true },
      orderBy: { _count: { acquisitionSource: 'desc' } },
      take: 5,
    });

    return NextResponse.json({
      success: true,
      window: {
        start: sevenDaysAgo.toISOString(),
        end: now.toISOString(),
      },
      kpis: {
        signups: newSignups,
        newsletterSignups,
        activatedUsers: activatedUsers.length,
        activationRate: pct(activatedUsers.length, newSignups),
        paidConversions: paidNew,
        paidConversionRate: pct(paidNew, newSignups),
        retentionD7Rate: pct(retainedD7, recentSignups.length),
        mrrEstimate: mrr._sum.amount ?? 0,
      },
      acquisition: topAcquisitionSources.map((row) => ({
        source: row.acquisitionSource ?? 'unknown',
        count: row._count.acquisitionSource,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to compute weekly KPI dashboard',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
