import { NextRequest, NextResponse } from 'next/server';
import { withCLIAuth } from '@/lib/middleware/cli-auth-middleware';
import { prisma } from '@/lib/prisma';
import { isPriceyModel } from '@/lib/pricing-config';

/**
 * POST /api/cli/usage
 * Track usage from CLI
 * Called after each AI request to track tokens and costs
 */
export const POST = withCLIAuth(async (request: NextRequest, context) => {
  try {
    const body = await request.json();
    const {
      model,
      provider,
      tokensUsed,
      inputTokens,
      outputTokens,
      cost,
      duration,
      success = true,
      errorMessage,
    } = body;

    // Create usage record
    const usageRecord = await prisma.usage_records.create({
      data: {
        id: crypto.randomUUID(),
        userId: context.userId,
        type: 'cli',
        requestType: 'cli',
        model,
        provider,
        tokensUsed: tokensUsed || 0,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        cost: cost || 0,
        duration: duration || 0,
        success,
        errorMessage,
        platform: 'cli',
        isPriceyModel: isPriceyModel(model || ''),
      },
    });

    // Update quota if it's a pricey model
    if (usageRecord.isPriceyModel && success) {
      const quota = await prisma.user_quota.findUnique({
        where: { userId: context.userId },
      });

      if (quota) {
        await prisma.user_quota.update({
          where: { id: quota.id },
          data: {
            sessionsUsedToday: { increment: 1 },
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      usageId: usageRecord.id,
      message: 'Usage tracked successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to track usage' },
      { status: 500 }
    );
  }
});

/**
 * GET /api/cli/usage
 * Get usage history for authenticated user
 */
export const GET = withCLIAuth(async (request: NextRequest, context) => {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const usageRecords = await prisma.usage_records.findMany({
      where: {
        userId: context.userId,
        platform: 'cli',
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        model: true,
        provider: true,
        tokensUsed: true,
        cost: true,
        duration: true,
        success: true,
        timestamp: true,
      },
    });

    const total = await prisma.usage_records.count({
      where: {
        userId: context.userId,
        platform: 'cli',
      },
    });

    return NextResponse.json({
      usage: usageRecords,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get usage' },
      { status: 500 }
    );
  }
});
