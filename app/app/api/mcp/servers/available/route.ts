import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { getAvailableServers } from '@/lib/services/mcp.service';

const publicRateLimiter = rateLimit(rateLimitConfigs.public);
const PUBLIC_CACHE_HEADER = 'public, s-maxage=600, stale-while-revalidate=86400';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await publicRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const servers = getAvailableServers();
    return NextResponse.json(
      { servers },
      {
        headers: {
          'Cache-Control': PUBLIC_CACHE_HEADER,
        },
      }
    );
  } catch (error) {
    console.error('Failed to get available servers:', error);
    return NextResponse.json(
      { error: 'Failed to get available servers' },
      { status: 500 }
    );
  }
}
