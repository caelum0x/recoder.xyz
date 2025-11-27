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
      success = true,
      errorMessage 
    } = await request.json();

    if (!userId || !requestType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const updatedQuota = await trackUsage(userId, sessionId, requestType, {
      modelUsed,
      tokensUsed,
      cost,
      duration,
      success,
      errorMessage,
    });

    return NextResponse.json({
      success: true,
      quota: updatedQuota,
    });
  } catch (error: any) {
    console.error('Track usage error:', error);
    return NextResponse.json({ error: 'Failed to track usage' }, { status: 500 });
  }
}
