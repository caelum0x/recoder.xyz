import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const preferencesSchema = z.object({
  showTooltips: z.boolean().default(true),
  maxTooltipsPerDay: z.number().min(0).max(50).default(5),
  preferredTrigger: z.enum(['hover', 'click', 'focus', 'auto']).default('hover'),
  enableTour: z.boolean().default(true),
  skipSeen: z.boolean().default(false),
  categories: z.array(z.string()).optional(),
  contexts: z.array(z.string()).optional(),
  autoHideDelay: z.number().min(1000).max(30000).default(5000),
  enableAnimations: z.boolean().default(true),
  position: z.enum(['top', 'bottom', 'left', 'right']).optional(),
  theme: z.enum(['light', 'dark', 'auto']).default('auto')
});

interface RouteContext {
  params: { userId: string }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = params;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    let preferences = await (prisma as any).tooltipPreferences.findUnique({
      where: { userId }
    });

    // If no preferences exist, create default ones
    if (!preferences) {
      preferences = await (prisma as any).tooltipPreferences.create({
        data: {
          userId,
          showTooltips: true,
          maxTooltipsPerDay: 5,
          preferredTrigger: 'hover',
          enableTour: true,
          skipSeen: false,
          autoHideDelay: 5000,
          enableAnimations: true,
          theme: 'auto',
          categories: [],
          contexts: ['global']
        }
      });
    }

    return NextResponse.json(preferences);

  } catch (error) {
    console.error('Error fetching tooltip preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = params;
    const body = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const validatedData = preferencesSchema.parse(body);

    const preferences = await (prisma as any).tooltipPreferences.upsert({
      where: { userId },
      update: {
        ...validatedData,
        updatedAt: new Date()
      },
      create: {
        userId,
        ...validatedData
      }
    });

    // Log preference change for analytics
    await prisma.tooltipInteraction.create({
      data: {
        userId,
        tooltipId: 'system',
        action: 'clicked', // Using clicked to represent preference change
        context: 'preferences',
        metadata: {
          action: 'preferences_updated',
          changes: validatedData
        }
      }
    });

    return NextResponse.json(preferences);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid preference data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating tooltip preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = params;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    await (prisma as any).tooltipPreferences.delete({
      where: { userId }
    });

    // Also delete user's tooltip interactions if requested
    const { searchParams } = new URL(request.url);
    const deleteInteractions = searchParams.get('deleteInteractions') === 'true';

    if (deleteInteractions) {
      await prisma.tooltipInteraction.deleteMany({
        where: { userId }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Preferences deleted successfully',
      deletedInteractions: deleteInteractions
    });

  } catch (error) {
    console.error('Error deleting tooltip preferences:', error);
    return NextResponse.json(
      { error: 'Failed to delete preferences' },
      { status: 500 }
    );
  }
}