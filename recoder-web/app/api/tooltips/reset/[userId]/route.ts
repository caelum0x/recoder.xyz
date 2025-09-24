import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

interface RouteContext {
  params: { userId: string }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId } = params;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Delete all user's tooltip interactions
    const deletedInteractions = await prisma.tooltipInteraction.deleteMany({
      where: { userId }
    });

    // Reset user preferences to defaults
    await (prisma as any).tooltipPreferences.upsert({
      where: { userId },
      update: {
        showTooltips: true,
        maxTooltipsPerDay: 5,
        preferredTrigger: 'hover',
        enableTour: true,
        skipSeen: false,
        autoHideDelay: 5000,
        enableAnimations: true,
        theme: 'auto',
        categories: [],
        contexts: ['global'],
        updatedAt: new Date()
      },
      create: {
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

    // Log the reset action
    await prisma.tooltipInteraction.create({
      data: {
        userId,
        tooltipId: 'system',
        action: 'clicked',
        context: 'reset',
        metadata: {
          action: 'tooltips_reset',
          deletedCount: deletedInteractions.count,
          resetAt: new Date().toISOString()
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'All tooltips have been reset',
      deletedInteractions: deletedInteractions.count,
      resetAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error resetting tooltips:', error);
    return NextResponse.json(
      { error: 'Failed to reset tooltips' },
      { status: 500 }
    );
  }
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

    // Get current user's tooltip status
    const interactions = await prisma.tooltipInteraction.findMany({
      where: { userId },
      select: {
        tooltipId: true,
        action: true,
        permanent: true,
        createdAt: true
      }
    });

    const preferences = await (prisma as any).tooltipPreferences.findUnique({
      where: { userId }
    });

    // Calculate reset impact
    const permanentDismissals = interactions.filter(i => i.permanent).length;
    const totalInteractions = interactions.length;
    const uniqueTooltips = new Set(interactions.map(i => i.tooltipId)).size;

    const resetPreview = {
      interactions: {
        total: totalInteractions,
        toBeDeleted: totalInteractions,
        permanentDismissals,
        uniqueTooltips
      },
      preferences: {
        current: preferences,
        willResetTo: {
          showTooltips: true,
          maxTooltipsPerDay: 5,
          preferredTrigger: 'hover',
          enableTour: true,
          skipSeen: false
        }
      },
      impact: {
        tooltipsWillReappear: permanentDismissals,
        preferencesWillReset: preferences ? true : false,
        tourWillBeAvailable: true
      }
    };

    return NextResponse.json({
      userId,
      resetPreview,
      canReset: true
    });

  } catch (error) {
    console.error('Error getting reset preview:', error);
    return NextResponse.json(
      { error: 'Failed to get reset preview' },
      { status: 500 }
    );
  }
}