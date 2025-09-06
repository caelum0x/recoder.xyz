import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const trackingSchema = z.object({
  userId: z.string().min(1),
  tooltipId: z.string().min(1),
  action: z.enum(['shown', 'dismissed', 'clicked', 'completed']),
  context: z.string().default('global'),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, tooltipId, action, context, timestamp, metadata } = trackingSchema.parse(body);

    // Check if tooltip exists
    const tooltip = await prisma.tooltip.findUnique({
      where: { id: tooltipId }
    });

    if (!tooltip) {
      return NextResponse.json(
        { error: 'Tooltip not found' },
        { status: 404 }
      );
    }

    // Record the interaction
    const interaction = await prisma.tooltipInteraction.create({
      data: {
        userId,
        tooltipId,
        action,
        context,
        metadata: metadata || {},
        createdAt: timestamp ? new Date(timestamp) : new Date(),
        dismissed: action === 'dismissed',
        permanent: false
      }
    });

    // Update tooltip analytics
    await prisma.tooltip.update({
      where: { id: tooltipId },
      data: {
        totalShows: {
          increment: action === 'shown' ? 1 : 0
        },
        totalDismissals: {
          increment: action === 'dismissed' ? 1 : 0
        },
        totalClicks: {
          increment: action === 'clicked' ? 1 : 0
        },
        lastShown: action === 'shown' ? new Date() : undefined
      }
    });

    // Get user's daily tooltip count for rate limiting
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCount = await prisma.tooltipInteraction.count({
      where: {
        userId,
        action: 'shown',
        createdAt: {
          gte: today
        }
      }
    });

    return NextResponse.json({
      success: true,
      interaction,
      dailyCount: todayCount,
      tooltip: {
        id: tooltip.id,
        title: tooltip.title,
        totalShows: tooltip.totalShows,
        totalDismissals: tooltip.totalDismissals
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid tracking data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error tracking tooltip interaction:', error);
    return NextResponse.json(
      { error: 'Failed to track interaction' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const tooltipId = searchParams.get('tooltipId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const whereCondition: any = { userId };
    
    if (tooltipId) {
      whereCondition.tooltipId = tooltipId;
    }
    
    if (startDate || endDate) {
      whereCondition.createdAt = {};
      if (startDate) whereCondition.createdAt.gte = new Date(startDate);
      if (endDate) whereCondition.createdAt.lte = new Date(endDate);
    }

    const interactions = await prisma.tooltipInteraction.findMany({
      where: whereCondition,
      include: {
        tooltip: {
          select: {
            id: true,
            title: true,
            category: true,
            context: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Generate analytics summary
    const analytics = {
      totalInteractions: interactions.length,
      shownCount: interactions.filter(i => i.action === 'shown').length,
      dismissedCount: interactions.filter(i => i.action === 'dismissed').length,
      clickedCount: interactions.filter(i => i.action === 'clicked').length,
      completedCount: interactions.filter(i => i.action === 'completed').length,
      uniqueTooltips: new Set(interactions.map(i => i.tooltipId)).size,
      averageEngagement: interactions.length > 0 
        ? (interactions.filter(i => i.action === 'clicked').length / interactions.filter(i => i.action === 'shown').length) || 0
        : 0,
      categoryBreakdown: interactions.reduce((acc, interaction) => {
        const category = interaction.tooltip?.category || 'unknown';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    return NextResponse.json({
      interactions,
      analytics,
      pagination: {
        total: interactions.length,
        page: 1,
        limit: interactions.length
      }
    });

  } catch (error) {
    console.error('Error fetching tooltip analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}