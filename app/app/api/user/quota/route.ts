import { NextRequest, NextResponse } from 'next/server';
import { checkQuota, getCurrentUsage } from '@/lib/usage-tracking';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const [quota, usage] = await Promise.all([
      checkQuota(userId),
      getCurrentUsage(userId),
    ]);

    return NextResponse.json({
      quota,
      usage,
    });
  } catch (error: any) {
    console.error('Get quota error:', error);
    return NextResponse.json({ error: 'Failed to get quota' }, { status: 500 });
  }
}
