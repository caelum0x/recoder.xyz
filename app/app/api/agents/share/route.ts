import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, author, content, version } = body;

    if (!name || !description || !author || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const marketplaceAgentsModel = (prisma as any).marketplace_agents;
    if (!marketplaceAgentsModel?.create) {
      return NextResponse.json({ error: 'Agent marketplace is not available in this schema' }, { status: 503 });
    }

    const agent = await marketplaceAgentsModel.create({
      data: {
        name,
        description,
        author,
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
