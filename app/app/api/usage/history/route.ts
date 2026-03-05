import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUserFromAuthUser, requireAuth } from "@/lib/auth-helpers";

import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const model = searchParams.get('model');
    const limit = parseInt(searchParams.get('limit') || '100');

    const user = await ensureAppUserFromAuthUser(authUser);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const where: any = { userId: user.id };

    if (startDate && endDate) {
      where.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else if (startDate) {
      where.timestamp = { gte: new Date(startDate) };
    }

    if (model) {
      where.model = model;
    }

    const usageRecords = await prisma.usage_records.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit
    });

    const summary = await prisma.usage_records.aggregate({
      where,
      _sum: {
        tokensUsed: true,
        cost: true
      },
      _count: true
    });

    return NextResponse.json({
      success: true,
      data: {
        records: usageRecords.map(record => ({
          id: record.id,
          timestamp: record.timestamp,
          model: record.model || 'unknown',
          tokens: record.tokensUsed || 0,
          cost: record.cost || 0,
          platform: record.requestType || 'unknown'
        })),
        summary: {
          totalRecords: summary._count,
          totalTokens: summary._sum.tokensUsed || 0,
          totalCost: summary._sum.cost || 0
        },
        filters: {
          startDate,
          endDate,
          model,
          limit
        }
      }
    });

  } catch (error) {
    console.error('Usage history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage history' },
      { status: 500 }
    );
  }
}
