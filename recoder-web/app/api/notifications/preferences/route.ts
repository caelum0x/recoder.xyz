// Notification preferences management API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for preferences operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

const notificationPreferencesSchema = z.object({
  email: z.object({
    enabled: z.boolean().default(true),
    frequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']).default('immediate'),
    categories: z.object({
      security: z.boolean().default(true),
      deployment: z.boolean().default(true),
      collaboration: z.boolean().default(true),
      marketing: z.boolean().default(false),
      updates: z.boolean().default(true),
    }).optional(),
  }).optional(),
  push: z.object({
    enabled: z.boolean().default(true),
    sound: z.boolean().default(true),
    vibration: z.boolean().default(true),
    quietHours: z.boolean().default(false),
    quietStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).default('22:00'),
    quietEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).default('08:00'),
    categories: z.object({
      security: z.boolean().default(true),
      deployment: z.boolean().default(true),
      collaboration: z.boolean().default(true),
      updates: z.boolean().default(false),
    }).optional(),
  }).optional(),
  inApp: z.object({
    enabled: z.boolean().default(true),
    showBadges: z.boolean().default(true),
    autoMarkRead: z.boolean().default(false),
    categories: z.object({
      security: z.boolean().default(true),
      deployment: z.boolean().default(true),
      collaboration: z.boolean().default(true),
      updates: z.boolean().default(true),
    }).optional(),
  }).optional(),
});

// GET - Get user notification preferences
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'notification-preferences-read');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's notification settings
    const notificationSettings = await prisma.userNotificationSettings.findUnique({
      where: { userId: session.user.id },
      select: { 
        preferences: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!notificationSettings) {
      // Return default preferences if none exist
      const defaultPreferences = {
        email: {
          enabled: true,
          frequency: 'immediate',
          categories: {
            security: true,
            deployment: true,
            collaboration: true,
            marketing: false,
            updates: true,
          }
        },
        push: {
          enabled: true,
          sound: true,
          vibration: true,
          quietHours: false,
          quietStart: '22:00',
          quietEnd: '08:00',
          categories: {
            security: true,
            deployment: true,
            collaboration: true,
            updates: false,
          }
        },
        inApp: {
          enabled: true,
          showBadges: true,
          autoMarkRead: false,
          categories: {
            security: true,
            deployment: true,
            collaboration: true,
            updates: true,
          }
        }
      };

      return NextResponse.json({
        preferences: defaultPreferences,
        isDefault: true,
        lastUpdated: null,
      });
    }

    const preferences = notificationSettings.preferences as any || {};

    return NextResponse.json({
      preferences,
      isDefault: false,
      lastUpdated: notificationSettings.updatedAt,
      createdAt: notificationSettings.createdAt,
    });

  } catch (error) {
    console.error('Get notification preferences error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update user notification preferences
export async function PUT(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'notification-preferences-update');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updatedPreferences = notificationPreferencesSchema.parse(body);

    // Get current preferences to merge with updates
    const currentSettings = await prisma.userNotificationSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const currentPreferences = currentSettings?.preferences as any || {};
    
    // Deep merge the preferences
    const mergedPreferences = {
      ...currentPreferences,
      ...updatedPreferences,
      email: {
        ...currentPreferences.email,
        ...updatedPreferences.email,
      },
      push: {
        ...currentPreferences.push,
        ...updatedPreferences.push,
      },
      inApp: {
        ...currentPreferences.inApp,
        ...updatedPreferences.inApp,
      },
    };

    // Update or create notification settings
    const updatedSettings = await prisma.userNotificationSettings.upsert({
      where: { userId: session.user.id },
      update: { 
        preferences: mergedPreferences,
        updatedAt: new Date()
      },
      create: {
        userId: session.user.id,
        preferences: mergedPreferences
      }
    });

    // Log the preferences update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'notification_preferences_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          changedFields: Object.keys(updatedPreferences),
          timestamp: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      message: 'Notification preferences updated successfully',
      preferences: mergedPreferences,
      lastUpdated: updatedSettings.updatedAt,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid preferences data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update notification preferences error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Partially update specific preference categories
export async function PATCH(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 15, 'notification-preferences-patch');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category'); // email, push, inApp
    const action = searchParams.get('action'); // enable, disable, toggle

    if (!category || !['email', 'push', 'inApp'].includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be email, push, or inApp' },
        { status: 400 }
      );
    }

    if (!action || !['enable', 'disable', 'toggle'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be enable, disable, or toggle' },
        { status: 400 }
      );
    }

    // Get current preferences
    const currentSettings = await prisma.userNotificationSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const currentPreferences = currentSettings?.preferences as any || {};
    const categoryPrefs = currentPreferences[category] || {};

    // Apply the action
    let newEnabled: boolean;
    switch (action) {
      case 'enable':
        newEnabled = true;
        break;
      case 'disable':
        newEnabled = false;
        break;
      case 'toggle':
        newEnabled = !categoryPrefs.enabled;
        break;
      default:
        newEnabled = categoryPrefs.enabled || true;
    }

    // Update the specific category
    const updatedPreferences = {
      ...currentPreferences,
      [category]: {
        ...categoryPrefs,
        enabled: newEnabled,
      }
    };

    // Save updated preferences
    await prisma.userNotificationSettings.upsert({
      where: { userId: session.user.id },
      update: { 
        preferences: updatedPreferences,
        updatedAt: new Date()
      },
      create: {
        userId: session.user.id,
        preferences: updatedPreferences
      }
    });

    // Log the quick action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'notification_quick_action',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          category,
          action,
          newState: newEnabled,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      message: `Successfully ${action}d ${category} notifications`,
      category,
      enabled: newEnabled,
      preferences: updatedPreferences,
    });

  } catch (error) {
    console.error('Quick notification action error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "edge";
