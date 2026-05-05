import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const publicRateLimiter = rateLimit(rateLimitConfigs.public);
const PUBLIC_CACHE_HEADER = 'public, s-maxage=300, stale-while-revalidate=86400';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await publicRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const marketplaceAgentsModel = prisma.marketplace_agents;
    if (!marketplaceAgentsModel?.findMany) {
      return NextResponse.json({ error: 'Agent marketplace is not available in this schema' }, { status: 503 });
    }

    const agents = await marketplaceAgentsModel.findMany({
      where: { published: true },
      orderBy: { downloads: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        description: true,
        author: true,
        version: true,
        template: true,
        downloads: true,
        rating: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json(agents, {
      headers: {
        'Cache-Control': PUBLIC_CACHE_HEADER,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}
