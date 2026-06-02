import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { SERVER_TEMPLATES, applyTemplate } from '@/lib/mcp/templates';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { installServer } from '@/lib/services/mcp.service';

const publicRateLimiter = rateLimit(rateLimitConfigs.public);
const PUBLIC_CACHE_HEADER = 'public, s-maxage=600, stale-while-revalidate=86400';

export async function GET(req: NextRequest) {
  const rateLimitResponse = await publicRateLimiter(req);
  if (rateLimitResponse) return rateLimitResponse;

  return NextResponse.json(
    { templates: SERVER_TEMPLATES },
    {
      headers: {
        'Cache-Control': PUBLIC_CACHE_HEADER,
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId } = await req.json();
    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const result = await applyTemplate(
      user.id,
      templateId,
      installServer
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to apply template:', error);
    return NextResponse.json(
      { error: 'Failed to apply template' },
      { status: 500 }
    );
  }
}
