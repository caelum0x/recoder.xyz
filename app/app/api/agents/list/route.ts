import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
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

    return NextResponse.json(agents);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}
