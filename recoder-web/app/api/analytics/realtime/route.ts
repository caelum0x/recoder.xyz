import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Get real-time metrics
    const [
      recentActivity,
      currentRequests,
      recentErrors,
      systemPerformance
    ] = await Promise.all([
      // Active users (activity in last 5 minutes)
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          timestamp: {
            gte: fiveMinutesAgo
          }
        }
      }).then((result: any) => result.length),

      // Current requests (activity in last minute)
      prisma.auditLog.count({
        where: {
          timestamp: {
            gte: oneMinuteAgo
          },
          action: 'api_call'
        }
      }),

      // Recent errors (last 5 minutes)
      prisma.auditLog.count({
        where: {
          timestamp: {
            gte: fiveMinutesAgo
          }
        }
      }),

      // System performance (average response time in last 5 minutes)
      prisma.auditLog.findMany({
        where: {
          timestamp: {
            gte: fiveMinutesAgo
          },
          action: 'api_call'
        },
        select: {
          metadata: true,
          success: true
        }
      })
    ]);

    // Calculate system load based on performance
    const avgResponseTime = systemPerformance.length > 0 
      ? systemPerformance.reduce((sum: number, p: any) => sum + ((p.metadata as any)?.duration || 0), 0) / systemPerformance.length 
      : 1000;

    // System load percentage (higher response time = higher load)
    const systemLoad = Math.min(Math.max((avgResponseTime / 5000) * 100, 10), 95);

    // Error rate calculation
    const totalRecentRequests = Math.max(systemPerformance.length, 1);
    const errorRate = (recentErrors / totalRecentRequests) * 100;

    const response = {
      activeUsers: recentActivity,
      currentRequests: currentRequests,
      systemLoad: Math.round(systemLoad * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Failed to fetch realtime metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch realtime metrics' },
      { status: 500 }
    );
  }
}