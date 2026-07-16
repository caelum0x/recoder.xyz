import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';

const MAX_CONTENT_LENGTH = 500_000; // 500KB limit for agent content

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    const body = await request.json();
    const { name, description, content, version } = body;

    if (!name || !description || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (typeof content === 'string' && content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: 'Content exceeds maximum allowed size' },
        { status: 400 }
      );
    }

    const marketplaceAgentsModel = prisma.marketplace_agents;
    if (!marketplaceAgentsModel?.create) {
      return NextResponse.json({ error: 'Agent marketplace is not available in this schema' }, { status: 503 });
    }

    const agent = await marketplaceAgentsModel.create({
      data: {
        name,
        description,
        author: authResult.user.name || authResult.user.email || 'Anonymous',
        content,
        version: version || '1.0.0',
        template: 'custom',
        published: true,
        downloads: 0,
        rating: 0,
      },
    });

    return NextResponse.json({ success: true, id: agent.id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to share agent' }, { status: 500 });
  }
}
