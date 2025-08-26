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
    const [errors, performance, chats] = await Promise.all([
      prisma.errorLog.findMany({
        where: {
          timestamp: {
            gte: startDate
          }
        },
        select: {
          severity: true,
          type: true,
          platform: true
        }
      }),
      
      prisma.performanceLog.findMany({
        where: {
          timestamp: {
            gte: startDate
          }
        },
        select: {
          duration: true,
          type: true,
          success: true,
          platform: true
        }
      }),
      
      prisma.chat.findMany({
        where: {
          createdAt: {
            gte: startDate
          }
        },
        select: {
          model: true,
          quality: true,
          userId: true
        }
      })
    ]);

    const insights: Insight[] = [];

    // Performance insights
    const slowRequests = performance.filter(p => p.duration > 5000);
    if (slowRequests.length > performance.length * 0.1) {
      insights.push({
        id: 'slow-performance',
        type: 'performance',
        severity: slowRequests.length > performance.length * 0.2 ? 'critical' : 'warning',
        title: 'Slow Response Times Detected',
        description: `${slowRequests.length} requests (${Math.round((slowRequests.length / performance.length) * 100)}%) are taking longer than 5 seconds to complete.`,
        recommendation: 'Consider optimizing API endpoints, adding caching, or scaling infrastructure to improve response times.',
        impact: 'high',
        confidence: 85
      });
    }

    // Error insights
    const criticalErrors = errors.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      insights.push({
        id: 'critical-errors',
        type: 'technical',
        severity: 'critical',
        title: 'Critical Errors Detected',
        description: `${criticalErrors.length} critical errors have occurred, potentially affecting user experience.`,
        recommendation: 'Investigate and fix critical errors immediately. Consider implementing better error handling and monitoring.',
        impact: 'high',
        confidence: 95
      });
    }

    // Usage insights
    const uniqueUsers = new Set(chats.map(c => c.userId).filter(Boolean));
    const highQualityChats = chats.filter(c => c.quality === 'high').length;
    
    if (highQualityChats < chats.length * 0.3) {
      insights.push({
        id: 'low-quality-usage',
        type: 'usage',
        severity: 'info',
        title: 'Opportunity to Increase High-Quality Usage',
        description: `Only ${Math.round((highQualityChats / chats.length) * 100)}% of generations are using high-quality mode.`,
        recommendation: 'Consider promoting high-quality features, providing tutorials, or offering incentives to increase premium feature adoption.',
        impact: 'medium',
        confidence: 70
      });
    }

    // Platform distribution insight
    const platformErrors = errors.reduce((acc, e) => {
      acc[e.platform] = (acc[e.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxErrorPlatform = Object.entries(platformErrors).sort(([,a], [,b]) => b - a)[0];
    if (maxErrorPlatform && maxErrorPlatform[1] > errors.length * 0.6) {
      insights.push({
        id: 'platform-issues',
        type: 'technical',
        severity: 'warning',
        title: `${maxErrorPlatform[0]} Platform Issues`,
        description: `The ${maxErrorPlatform[0]} platform is experiencing ${maxErrorPlatform[1]} errors (${Math.round((maxErrorPlatform[1] / errors.length) * 100)}% of total errors).`,
        recommendation: `Focus debugging efforts on the ${maxErrorPlatform[0]} platform. Check for platform-specific issues, dependencies, or configuration problems.`,
        impact: 'medium',
        confidence: 80
      });
    }

    // Model usage insights
    const modelStats = chats.reduce((acc, chat) => {
      acc[chat.model] = (acc[chat.model] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostUsedModel = Object.entries(modelStats).sort(([,a], [,b]) => b - a)[0];
    if (mostUsedModel && mostUsedModel[1] > chats.length * 0.8) {
      insights.push({
        id: 'model-concentration',
        type: 'business',
        severity: 'info',
        title: 'Model Usage Concentration',
        description: `${Math.round((mostUsedModel[1] / chats.length) * 100)}% of users are using ${mostUsedModel[0]}. This indicates strong preference but low model diversity.`,
        recommendation: 'Consider promoting other models for specific use cases, or analyze why users prefer this model to improve others.',
        impact: 'low',
        confidence: 75
      });
    }

    // Success rate insight
    const successfulRequests = performance.filter(p => p.success);
    const successRate = performance.length > 0 ? (successfulRequests.length / performance.length) : 1;
    
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