import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const agents = await prisma.marketplace_agents.findMany({
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
