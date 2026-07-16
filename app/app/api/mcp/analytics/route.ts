import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get('serverId');
    const days = parseInt(searchParams.get('days') || '7');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: { userId: string; createdAt: { gte: Date }; serverId?: string } = {
      userId: user.id,
      createdAt: { gte: startDate },
    };

    if (serverId) {
      where.serverId = serverId;
    }

    // Get tool call statistics
    const toolCalls = await prisma.mCPToolCall.groupBy({
      by: ['serverId', 'toolName'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Get error rate
    const errors = await prisma.mCPToolCall.count({
      where: { ...where, error: { not: null } },
    });

    const total = await prisma.mCPToolCall.count({ where });

    // Get daily usage
    const dailyUsage = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt") as date, COUNT(*)::int as count
      FROM "MCPToolCall"
      WHERE "userId" = ${user.id}
        AND "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    return NextResponse.json({
      toolCalls: toolCalls.map((tc) => ({
        serverId: tc.serverId,
        toolName: tc.toolName,
        count: tc._count.id,
      })),
      errorRate: total > 0 ? (errors / total) * 100 : 0,
      totalCalls: total,
      dailyUsage: dailyUsage.map((d) => ({
        date: d.date,
        count: Number(d.count),
      })),
    });
  } catch (error) {
    console.error('Failed to get analytics:', error);
    return NextResponse.json(
      { error: 'Failed to get analytics' },
      { status: 500 }
    );
  }
}
