import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Current month usage
    const currentMonthUsage = await prisma.usage_records.aggregate({
      where: {
        userId: user.id,
        timestamp: { gte: startOfMonth }
      },
      _sum: {
        tokens: true,
        cost: true
      },
      _count: true
    });

    // Last month usage for trend calculation
    const lastMonthUsage = await prisma.usage_records.aggregate({
      where: {
        userId: user.id,
        timestamp: {
          gte: lastMonth,
          lte: endOfLastMonth
        }
      },
      _sum: {
        tokens: true,
        cost: true
      },
      _count: true
    });

    // Calculate trends
    const requestTrend = lastMonthUsage._count 
      ? ((currentMonthUsage._count - lastMonthUsage._count) / lastMonthUsage._count) * 100 
      : 0;

    // Projects stats
    const totalProjects = await prisma.projects.count({
      where: { userId: user.id }
    });

    const activeProjects = await prisma.projects.count({
      where: {
        userId: user.id,
        status: 'active'
      }
    });

    const lastMonthProjects = await prisma.projects.count({
      where: {
        userId: user.id,
        createdAt: {
          gte: lastMonth,
          lte: endOfLastMonth
        }
      }
    });

    const projectTrend = lastMonthProjects 
      ? ((totalProjects - lastMonthProjects) / lastMonthProjects) * 100
      : 0;

    // API Keys stats
    const totalApiKeys = await prisma.api_keys.count({
      where: { userId: user.id }
    });

    const activeApiKeys = await prisma.api_keys.count({
      where: { 
        userId: user.id,
        isActive: true
      }
    });

    // Subscription info
    const subscriptionInfo = {
      plan: user.subscription || 'free',
      status: 'active',
      renewsAt: '',
      daysRemaining: 0
    };

    return NextResponse.json({
      success: true,
      data: {
        usage: {
          requests: currentMonthUsage._count || 0,
          tokens: currentMonthUsage._sum.tokens || 0,
          cost: currentMonthUsage._sum.cost || 0,
          trend: Math.round(requestTrend)
        },
        projects: {
          total: totalProjects,
          active: activeProjects,
          trend: Math.round(projectTrend)
        },
        apiKeys: {
          total: totalApiKeys,
          active: activeApiKeys
        },
        subscription: subscriptionInfo
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
