import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';
    
    const prisma = getPrisma();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get recent errors
    const [
      criticalErrors,
      recentErrors,
      slowPerformance,
      totalErrors,
      totalPerformance
    ] = await Promise.all([
      // Critical errors in last hour
      prisma.auditLog.count({
        where: {
          success: false,
          timestamp: {
            gte: oneHourAgo
          }
        }
      }),
      
      // All errors in last day
      prisma.auditLog.count({
        where: {
          timestamp: {
            gte: oneDayAgo
          }
        }
      }),
      
      // Slow performance in last hour
      prisma.auditLog.count({
        where: {
          success: false,
          timestamp: {
            gte: oneHourAgo
          }
        }
      }),
      
      // Total errors in last day
      prisma.auditLog.count({
        where: {
          timestamp: {
            gte: oneDayAgo
          }
        }
      }),
      
      // Total performance logs in last day
      prisma.auditLog.count({
        where: {
          timestamp: {
            gte: oneDayAgo
          }
        }
      })
    ]);

    // Calculate health score (0-100)
    let healthScore = 100;
    
    // Reduce score based on critical errors
    if (criticalErrors > 0) {
      healthScore -= Math.min(criticalErrors * 20, 60); // Max -60 for critical errors
    }
    
    // Reduce score based on error rate
    if (totalPerformance > 0) {
      const errorRate = (totalErrors / totalPerformance) * 100;
      if (errorRate > 5) {
        healthScore -= Math.min((errorRate - 5) * 2, 25); // Max -25 for error rate
      }
    }
    
    // Reduce score based on slow performance
    if (totalPerformance > 0) {
      const slowRate = (slowPerformance / totalPerformance) * 100;
      if (slowRate > 10) {
        healthScore -= Math.min((slowRate - 10) * 1.5, 15); // Max -15 for slow performance
      }
    }
    
    healthScore = Math.max(0, Math.round(healthScore));
    
    // Determine status
    let status: 'healthy' | 'degraded' | 'critical';
    if (healthScore >= 90) status = 'healthy';
    else if (healthScore >= 70) status = 'degraded';
    else status = 'critical';

    const response = {
      status,
      healthScore,
      timestamp: now.toISOString(),
      summary: {
        criticalErrors,
        recentErrors,
        slowPerformance,
        errorRate: totalPerformance > 0 ? Math.round((totalErrors / totalPerformance) * 10000) / 100 : 0,
        slowPerformanceRate: totalPerformance > 0 ? Math.round((slowPerformance / totalPerformance) * 10000) / 100 : 0
      }
    };

    if (detailed) {
      // Get breakdown by platform and error types
      const [
        errorsByPlatform,
        errorsByType,
        errorsBySeverity,
        avgPerformanceByPlatform
      ] = await Promise.all([
        prisma.auditLog.groupBy({
          by: ['platform'],
          where: {
            timestamp: {
              gte: oneDayAgo
            }
          },
          _count: {
            id: true
          }
        }),
        
        prisma.auditLog.groupBy({
          by: ['action'],
          where: {
            timestamp: {
              gte: oneDayAgo
            }
          },
          _count: {
            id: true
          }
        }),
        
        prisma.auditLog.groupBy({
          by: ['success'],
          where: {
            timestamp: {
              gte: oneDayAgo
            }
          },
          _count: {
            id: true
          }
        }),
        
        prisma.auditLog.groupBy({
          by: ['platform'],
          where: {
            timestamp: {
              gte: oneDayAgo
            }
          },
          _count: {
            id: true
          }
        })
      ]);

      (response as any).detailed = {
        errorsByPlatform,
        errorsByType, 
        errorsBySeverity,
        avgPerformanceByPlatform
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Failed to get health status:', error);
    return NextResponse.json({
      status: 'critical',
      healthScore: 0,
      error: 'Failed to determine health status'
    }, { status: 500 });
  }
}