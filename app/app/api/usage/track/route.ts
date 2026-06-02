import { NextRequest, NextResponse } from 'next/server';
import { trackUsage } from '@/lib/usage-tracking';

export async function POST(request: NextRequest) {
  try {
    const { 
      userId, 
      sessionId, 
      requestType, 
      modelUsed, 
      tokensUsed, 
      cost,
      duration,
      platform = 'spaces',
      success = true,
      errorMessage 
    } = await request.json();

    if (!userId || !requestType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Detect platform from headers if not explicitly provided
    let detectedPlatform = platform;
    if (!platform || platform === 'spaces') {
      const userAgent = request.headers.get('user-agent') || '';
      const referer = request.headers.get('referer') || '';
      
      // Check if request is from CLI
      if (userAgent.includes('recoder-cli') || userAgent.includes('recoder-code')) {
        detectedPlatform = 'cli';
      } else if (referer.includes('recoder.xyz/dashboard') || referer.includes('localhost:3000/dashboard')) {
        detectedPlatform = 'spaces';
      }
    }

    const updatedQuota = await trackUsage(userId, sessionId, requestType, {
      modelUsed,
      tokensUsed,
      cost,
      duration,
      platform: detectedPlatform,
      success,
      errorMessage,
    });

    return NextResponse.json({
      success: true,
      quota: updatedQuota,
      platform: detectedPlatform, // Return detected platform for confirmation
    });
  } catch (error) {
    console.error('Track usage error:', error);
    return NextResponse.json({ error: 'Failed to track usage' }, { status: 500 });
  }
}
