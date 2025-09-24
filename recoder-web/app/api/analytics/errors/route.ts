import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

interface ErrorEvent {
  id: string;
  timestamp: number;
  type: 'javascript_error' | 'react_error' | 'api_error' | 'auth_error' | 'validation_error';
  message: string;
  stack?: string;
  url: string;
  lineNumber?: number;
  columnNumber?: number;
  userAgent: string;
  userId?: string;
  sessionId: string;
  platform: 'web' | 'chat' | 'cli' | 'engine';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  resolved?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const errorData: ErrorEvent = await request.json();
    
    // Validate required fields
    if (!errorData.message || !errorData.sessionId || !errorData.platform) {
      return NextResponse.json(
        { error: 'Missing required fields: message, sessionId, platform' },
        { status: 400 }
      );
    }

    const prisma = getPrisma();
    
    // Store error in database
    await prisma.auditLog.create({
      data: {
        userId: errorData.userId || 'system',
        action: 'error',
        resource: errorData.url || 'unknown',
        success: false,
        metadata: {
          type: errorData.type,
          message: errorData.message,
          stack: errorData.stack,
          lineNumber: errorData.lineNumber,
          columnNumber: errorData.columnNumber,
          userAgent: errorData.userAgent,
          platform: errorData.platform,
          severity: errorData.severity,
          context: errorData.context
        }
      }
    });

    // Alert on critical errors
    if (errorData.severity === 'critical') {
      console.error('🚨 CRITICAL ERROR:', {
        message: errorData.message,
        platform: errorData.platform,
        userId: errorData.userId,
        url: errorData.url,
        stack: errorData.stack?.substring(0, 500)
      });
    }

    return NextResponse.json({ success: true, id: errorData.id });

  } catch (error) {
    console.error('Failed to log error:', error);
    return NextResponse.json(
      { error: 'Failed to log error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const severity = searchParams.get('severity');
    const resolved = searchParams.get('resolved');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const prisma = getPrisma();
    
    const errors = await prisma.auditLog.findMany({
      where: {
        ...(platform && { platform }),
        ...(severity && { severity }),
        ...(resolved !== null && { resolved: resolved === 'true' })
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit
    });

    return NextResponse.json({ errors });

  } catch (error) {
    console.error('Failed to fetch errors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch errors' },
      { status: 500 }
    );
  }
}