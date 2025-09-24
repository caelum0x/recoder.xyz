import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

interface Insight {
  id: string;
  type: 'performance' | 'usage' | 'business' | 'technical';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || 'day';
    
    const prisma = getPrisma();
    const now = new Date();
    let startDate: Date;
    
    // Calculate time range
    switch (timeRange) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Gather data for insights
    const [usageAnalytics, deviceAnalytics, auditLogs] = await Promise.all([
      prisma.usageAnalytics.findMany({
        where: {
          timestamp: {
            gte: startDate
          }
        },
        select: {
          eventType: true,
          platform: true,
          provider: true,
          tokens: true,
          cost: true,
          duration: true,
          success: true,
          errorCode: true,
          errorMessage: true,
          userId: true
        }
      }),
      
      prisma.deviceAnalytics.findMany({
        where: {
          timestamp: {
            gte: startDate
          }
        },
        select: {
          deviceType: true,
          screenWidth: true,
          userId: true
        }
      }),
      
      prisma.auditLog.findMany({
        where: {
          timestamp: {
            gte: startDate
          }
        },
        select: {
          action: true,
          resource: true,
          userId: true,
          metadata: true
        }
      })
    ]);

    const insights: Insight[] = [];

    // Performance insights - analyze usage analytics for slow requests
    const slowRequests = usageAnalytics.filter(u => u.duration && u.duration > 5000);
    if (slowRequests.length > usageAnalytics.length * 0.1) {
      insights.push({
        id: 'slow-performance',
        type: 'performance',
        severity: slowRequests.length > usageAnalytics.length * 0.2 ? 'critical' : 'warning',
        title: 'Slow Response Times Detected',
        description: `${slowRequests.length} requests (${Math.round((slowRequests.length / usageAnalytics.length) * 100)}%) are taking longer than 5 seconds to complete.`,
        recommendation: 'Consider optimizing API endpoints, adding caching, or scaling infrastructure to improve response times.',
        impact: 'high',
        confidence: 85
      });
    }

    // Error insights - analyze usage analytics for errors
    const failedRequests = usageAnalytics.filter(u => !u.success && u.errorCode);
    if (failedRequests.length > 0) {
      insights.push({
        id: 'failed-requests',
        type: 'technical',
        severity: 'critical',
        title: 'Failed Requests Detected',
        description: `${failedRequests.length} requests have failed, potentially affecting user experience.`,
        recommendation: 'Investigate and fix failed requests immediately. Consider implementing better error handling and monitoring.',
        impact: 'high',
        confidence: 95
      });
    }

    // Usage insights - analyze usage analytics for patterns
    const uniqueUsers = new Set(usageAnalytics.map(u => u.userId).filter(Boolean));
    const highCostRequests = usageAnalytics.filter(u => u.cost && u.cost > 0.01).length;
    
    if (highCostRequests < usageAnalytics.length * 0.3) {
      insights.push({
        id: 'low-cost-usage',
        type: 'usage',
        severity: 'info',
        title: 'Opportunity to Increase High-Value Usage',
        description: `Only ${Math.round((highCostRequests / usageAnalytics.length) * 100)}% of requests are high-cost operations.`,
        recommendation: 'Consider promoting premium features, providing tutorials, or offering incentives to increase high-value feature adoption.',
        impact: 'medium',
        confidence: 70
      });
    }

    // Platform distribution insight - analyze usage analytics by platform
    const platformUsage = usageAnalytics.reduce((acc, u) => {
      const platform = u.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxUsagePlatform = Object.entries(platformUsage).sort(([,a], [,b]) => b - a)[0];
    if (maxUsagePlatform && maxUsagePlatform[1] > usageAnalytics.length * 0.6) {
      insights.push({
        id: 'platform-concentration',
        type: 'technical',
        severity: 'info',
        title: `${maxUsagePlatform[0]} Platform Dominance`,
        description: `The ${maxUsagePlatform[0]} platform accounts for ${Math.round((maxUsagePlatform[1] / usageAnalytics.length) * 100)}% of total usage.`,
        recommendation: `Consider optimizing performance for ${maxUsagePlatform[0]} platform and ensuring cross-platform compatibility.`,
        impact: 'medium',
        confidence: 80
      });
    }

    // Provider usage insights - analyze usage analytics by provider
    const providerStats = usageAnalytics.reduce((acc, u) => {
      const provider = u.provider;
      if (provider) {
        acc[provider] = (acc[provider] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const mostUsedProvider = Object.entries(providerStats).sort(([,a], [,b]) => b - a)[0];
    if (mostUsedProvider && mostUsedProvider[1] > usageAnalytics.length * 0.8) {
      insights.push({
        id: 'provider-concentration',
        type: 'business',
        severity: 'info',
        title: 'Provider Usage Concentration',
        description: `${Math.round((mostUsedProvider[1] / usageAnalytics.length) * 100)}% of requests are using ${mostUsedProvider[0]}. This indicates strong preference but low provider diversity.`,
        recommendation: 'Consider promoting other providers for specific use cases, or analyze why users prefer this provider to improve others.',
        impact: 'low',
        confidence: 75
      });
    }

    // Success rate insight - analyze usage analytics success rate
    const successfulRequests = usageAnalytics.filter(u => u.success);
    const successRate = usageAnalytics.length > 0 ? (successfulRequests.length / usageAnalytics.length) : 1;
    
    if (successRate < 0.95) {
      insights.push({
        id: 'low-success-rate',
        type: 'technical',
        severity: successRate < 0.9 ? 'critical' : 'warning',
        title: 'Below Optimal Success Rate',
        description: `Current success rate is ${Math.round(successRate * 100)}%, which is below the recommended 95%+ threshold.`,
        recommendation: 'Investigate failed requests, improve error handling, and implement retry mechanisms for transient failures.',
        impact: 'high',
        confidence: 90
      });
    }

    return NextResponse.json({ insights });

  } catch (error) {
    console.error('Failed to generate insights:', error);
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    );
  }
}