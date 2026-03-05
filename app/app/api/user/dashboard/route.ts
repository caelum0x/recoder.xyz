// User dashboard API endpoint
import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;
    
    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await ensureAppUserFromAuthUser(authUser);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const usage = await prisma.usage_records.aggregate({
      where: {
        userId: user.id,
        timestamp: { gte: startOfMonth },
      },
      _sum: {
        cost: true,
        tokensUsed: true,
      },
      _count: true,
    });

    const monthlyProjects = await prisma.ai_generated_projects.count({
      where: {
        userId: user.id,
        createdAt: { gte: startOfMonth },
      },
    });

    const deploymentsCount = await prisma.ai_generated_projects.count({
      where: {
        userId: user.id,
        deployUrl: { not: null },
      },
    });

    const deploymentsThisMonth = await prisma.ai_generated_projects.count({
      where: {
        userId: user.id,
        deployUrl: { not: null },
        updatedAt: { gte: startOfMonth },
      },
    });

    const projectsTotal = await prisma.ai_generated_projects.count({
      where: { userId: user.id },
    });

    const projectsActive = await prisma.ai_generated_projects.count({
      where: {
        userId: user.id,
        updatedAt: { gte: last30Days },
      },
    });

    const projectsShared = await prisma.ai_generated_projects.count({
      where: {
        userId: user.id,
        isPublic: true,
      },
    });

    const dashboardData = {
      success: true,
      data: {
        subscription: {
          plan: user.subscription || user.subscriptionPlan || 'free',
          status: user.subscriptionStatus || 'active',
          renewsAt: user.subscriptionEndDate?.toISOString() || null,
          limits: {
            codeGeneration: 100000,
            apiCalls: 100000,
            deployments: 1000,
          },
        },
        usage: {
          totalRequests: usage._count || 0,
          usedRequests: usage._count || 0,
          totalTokens: usage._sum.tokensUsed || 0,
          totalCost: usage._sum.cost || 0,
        },
        router_stats: {
          projectsTotal,
          projectsActive,
          projectsShared,
          projectsThisMonth: monthlyProjects,
          deploymentsCount,
          deploymentsThisMonth,
        },
        cost_savings: usage._sum.cost || 0,
      },
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
