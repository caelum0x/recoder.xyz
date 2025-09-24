import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const dismissSchema = z.object({
  userId: z.string().min(1),
  permanent: z.boolean().default(false),
  reason: z.string().optional(),
  feedback: z.string().optional()
});

interface RouteContext {
  params: { tooltipId: string }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { tooltipId } = params;
    const body = await request.json();

    if (!tooltipId) {
      return NextResponse.json(
        { error: 'Tooltip ID is required' },
        { status: 400 }
      );
    }

    const { userId, permanent, reason, feedback } = dismissSchema.parse(body);

    // Mock tooltip check since tooltip model doesn't exist
    const tooltip = { id: tooltipId }; // Mock tooltip

    // Create dismissal record
    const interaction = await prisma.tooltipInteraction.create({
      data: {
        userId,
        tooltipId,
        action: 'dismissed',
        context: 'dismissal',
        dismissed: true,
        permanent,
        metadata: {
          reason,
          feedback,
          dismissalType: permanent ? 'permanent' : 'temporary',
          timestamp: new Date().toISOString()
        }
      }
    });

    // Update tooltip dismissal statistics
    await prisma.tooltip.update({
      where: { id: tooltipId },
      data: {
        totalDismissals: {
          increment: 1
        },
        // Note: permanentDismissals field doesn't exist in Tooltip model
        // Using totalDismissals for now
      }
    });

    // If permanent dismissal, check if we need to disable tooltip globally
    if (permanent) {
      const tooltip = await prisma.tooltip.findUnique({
        where: { id: tooltipId },
        select: {
          totalShows: true,
          totalDismissals: true // using totalDismissals instead of permanentDismissals
        }
      });

      if (tooltip && tooltip.totalDismissals > 0) {
        const dismissalRate = tooltip.totalDismissals / Math.max(tooltip.totalShows, 1);
        
        // If dismissal rate is very high (>80%), consider disabling globally
        if (dismissalRate > 0.8 && tooltip.totalShows > 100) {
          await prisma.tooltip.update({
            where: { id: tooltipId },
            data: {
              isActive: false,
              // disabledReason: // Field not in Tooltip model 'High dismissal rate',
              // disabledAt: // Field not in Tooltip model new Date()
            }
          });
        }
      }
    }

    // Store feedback if provided
    if (feedback) {
      await (prisma as any).tooltipFeedback.create({
        data: {
          userId,
          tooltipId,
          feedback,
          rating: null, // Could be added later
          type: 'dismissal',
          metadata: { reason }
        }
      });
    }

    return NextResponse.json({
      success: true,
      interaction,
      permanent,
      message: permanent 
        ? 'Tooltip permanently dismissed' 
        : 'Tooltip temporarily dismissed'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid dismissal data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error dismissing tooltip:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss tooltip' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { tooltipId } = params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!tooltipId) {
      return NextResponse.json(
        { error: 'Tooltip ID is required' },
        { status: 400 }
      );
    }

    let whereCondition: any = { tooltipId };
    if (userId) {
      whereCondition.userId = userId;
    }

    const dismissals = await prisma.tooltipInteraction.findMany({
      where: {
        ...whereCondition,
        action: 'dismissed'
      },
      include: {
        tooltip: {
          select: {
            id: true,
            title: true,
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const analytics = {
      totalDismissals: dismissals.length,
      permanentDismissals: dismissals.filter(d => d.permanent).length,
      temporaryDismissals: dismissals.filter(d => !d.permanent).length,
      reasons: dismissals.reduce((acc, dismissal) => {
        let reason = 'No reason provided';
        if (
          dismissal.metadata &&
          typeof dismissal.metadata === 'object' &&
          'reason' in dismissal.metadata &&
          typeof (dismissal.metadata as any).reason === 'string'
        ) {
          reason = (dismissal.metadata as any).reason;
        }
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      feedbackCount: dismissals.filter(d =>
        d.metadata &&
        typeof d.metadata === 'object' &&
        'feedback' in d.metadata &&
        typeof (d.metadata as any).feedback === 'string' &&
        (d.metadata as any).feedback
      ).length
    };

    return NextResponse.json({
      dismissals,
      analytics,
      tooltipId
    });

  } catch (error) {
    console.error('Error fetching dismissal data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dismissal data' },
      { status: 500 }
    );
  }
}