import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

interface PerformanceMetrics {
  id: string;
  timestamp: number;
  type: 'navigation' | 'resource' | 'api_call' | 'form_submission';
  duration: number;
  url: string;
  success: boolean;
  userId?: string;
  sessionId: string;
  platform: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const perfData: PerformanceMetrics = await request.json();
    
    // Validate required fields
    if (!perfData.sessionId || !perfData.platform || perfData.duration === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, platform, duration' },
        { status: 400 }
      );
    }

    const prisma = getPrisma();
    
    // Store performance metrics in database
    await prisma.performanceLog.create({
      data: {
        id: perfData.id,
        timestamp: new Date(perfData.timestamp),
        type: perfData.type,
        duration: perfData.duration,
        url: perfData.url,
        success: perfData.success,
        userId: perfData.userId,
        sessionId: perfData.sessionId,
        platform: perfData.platform,
        metadata: perfData.metadata as any
      }
    });

    // Alert on slow performance
    if (perfData.duration > 5000 && perfData.type === 'navigation') {
      console.warn('⚠️ SLOW NAVIGATION:', {
        url: perfData.url,
        duration: perfData.duration,
        platform: perfData.platform,
        userId: perfData.userId
      });
    }

    if (perfData.duration > 10000 && perfData.type === 'api_call') {
      console.warn('⚠️ SLOW API CALL:', {
        url: perfData.url,
        duration: perfData.duration,
        platform: perfData.platform,
        userId: perfData.userId
      });
    }

    return NextResponse.json({ success: true, id: perfData.id });

  } catch (error) {
    console.error('Failed to log performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to log performance metrics' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100');
    const timeRange = searchParams.get('timeRange') || 'day';
    
    // Calculate time filter
    const now = new Date();
    const timeFilter = new Date();
    switch (timeRange) {
      case 'hour':
        timeFilter.setHours(now.getHours() - 1);
        break;
      case 'day':
        timeFilter.setDate(now.getDate() - 1);
        break;
      case 'week':
        timeFilter.setDate(now.getDate() - 7);
        break;
      case 'month':
        timeFilter.setMonth(now.getMonth() - 1);
        break;
      default:
        timeFilter.setDate(now.getDate() - 1);
    }
    
    const prisma = getPrisma();
    
    const metrics = await prisma.performanceLog.findMany({
      where: {
        timestamp: {
          gte: timeFilter
        },
        ...(platform && { platform }),
        ...(type && { type })
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit
    });

    // Calculate aggregated metrics
    const totalMetrics = metrics.length;
    const avgDuration = metrics.length > 0 
      ? metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length 
      : 0;
    
    const successRate = metrics.length > 0 
      ? (metrics.filter(m => m.success).length / metrics.length) * 100 
      : 100;

    const slowRequests = metrics.filter(m => m.duration > 3000).length;
    const errorRate = metrics.length > 0 
      ? ((metrics.filter(m => !m.success).length / metrics.length) * 100)
      : 0;

    return NextResponse.json({
      metrics,
      summary: {
        total: totalMetrics,
        avgDuration: Math.round(avgDuration),
        successRate: Math.round(successRate * 100) / 100,
        slowRequests,
        errorRate: Math.round(errorRate * 100) / 100
      }
    });

  } catch (error) {
    console.error('Failed to fetch performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performance metrics' },
      { status: 500 }
    );
  }
}