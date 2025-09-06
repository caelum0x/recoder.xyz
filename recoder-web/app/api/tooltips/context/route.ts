import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const contextQuerySchema = z.object({
  context: z.string().default('global'),
  userLevel: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  userId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = {
      context: searchParams.get('context') || 'global',
      userLevel: searchParams.get('userLevel') || 'beginner',
      userId: searchParams.get('userId') || undefined,
    };

    const { context, userLevel, userId } = contextQuerySchema.parse(params);

    // Get base tooltips for the context
    let tooltips = await prisma.tooltip.findMany({
      where: {
        OR: [
          { context: { has: context } },
          { context: { has: 'global' } }
        ],
        isActive: true,
        conditions: {
          path: ['userLevel'],
          in: [userLevel, null]
        }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    // If user is provided, get their preferences and interaction history
    if (userId) {
      const userInteractions = await prisma.tooltipInteraction.findMany({
        where: { userId },
        select: {
          tooltipId: true,
          action: true,
          createdAt: true,
          dismissed: true,
          permanent: true
        }
      });

      // Filter out permanently dismissed tooltips and add interaction data
      tooltips = tooltips.filter(tooltip => {
        const interaction = userInteractions.find(i => i.tooltipId === tooltip.id);
        return !interaction?.permanent;
      }).map(tooltip => {
        const interactions = userInteractions.filter(i => i.tooltipId === tooltip.id);
        const showCount = interactions.filter(i => i.action === 'shown').length;
        const lastShown = interactions
          .filter(i => i.action === 'shown')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt || new Date();
        const userDismissed = interactions.some(i => i.permanent);

        return {
          ...tooltip,
          showCount,
          lastShown,
          userDismissed
        };
      });
    } else {
      // For anonymous users, add default values
      tooltips = tooltips.map(tooltip => ({
        ...tooltip,
        showCount: 0,
        lastShown: new Date(),
        userDismissed: false
      }));
    }

    return NextResponse.json({
      tooltips,
      context,
      userLevel,
      total: tooltips.length
    });

  } catch (error) {
    console.error('Error fetching tooltips:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tooltips' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const tooltipSchema = z.object({
      title: z.string().min(1).max(100),
      content: z.string().min(1).max(500),
      element: z.string().min(1),
      position: z.enum(['top', 'bottom', 'left', 'right']),
      trigger: z.enum(['hover', 'click', 'focus', 'auto']),
      delay: z.number().min(0).max(10000),
      duration: z.number().optional(),
      context: z.array(z.string()).default(['global']),
      priority: z.enum(['low', 'medium', 'high']),
      category: z.string().min(1).max(50),
      conditions: z.object({
        userLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        feature: z.string().optional(),
        pageUrl: z.string().optional(),
        elementVisible: z.boolean().optional(),
      }).optional(),
      createdBy: z.string().optional()
    });

    const validatedData = tooltipSchema.parse(body);

    const tooltip = await prisma.tooltip.create({
      data: {
        ...validatedData,
        isActive: true,
        customizable: true,
        enabled: true
      }
    });

    return NextResponse.json(tooltip, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating tooltip:', error);
    return NextResponse.json(
      { error: 'Failed to create tooltip' },
      { status: 500 }
    );
  }
}