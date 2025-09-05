import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { getPrisma } from "@/lib/prisma";
import { z } from "zod";

// Notification preferences schema for validation
const notificationPreferencesSchema = z.object({
  preferences: z.object({
    email: z.object({
      enabled: z.boolean(),
      frequency: z.enum(['instant', 'hourly', 'daily', 'weekly']),
      types: z.object({
        projectUpdates: z.boolean(),
        collaborationInvites: z.boolean(),
        deploymentStatus: z.boolean(),
        securityAlerts: z.boolean(),
        systemUpdates: z.boolean(),
        marketingNews: z.boolean(),
        billing: z.boolean(),
        aiInsights: z.boolean(),
      }),
    }),
    push: z.object({
      enabled: z.boolean(),
      types: z.object({
        realTimeAlerts: z.boolean(),
        mentionsAndReplies: z.boolean(),
        projectNotifications: z.boolean(),
        errorAlerts: z.boolean(),
      }),
    }),
    inApp: z.object({
      enabled: z.boolean(),
      sound: z.boolean(),
      desktop: z.boolean(),
      frequency: z.enum(['all', 'important', 'minimal']),
    }),
    teamNotifications: z.object({
      enabled: z.boolean(),
      memberActivity: z.boolean(),
      roleChanges: z.boolean(),
      projectSharing: z.boolean(),
    }),
    aiNotifications: z.object({
      enabled: z.boolean(),
      consensusUpdates: z.boolean(),
      optimizationSuggestions: z.boolean(),
      modelPerformance: z.boolean(),
    }),
    quietHours: z.object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
    }),
  }),
});

// GET - Fetch user's notification preferences
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to find existing preferences
    let userNotificationSettings = await prisma.userNotificationSettings.findUnique({
      where: {
        userId: session.user.id,
      },
    });

    // If no preferences exist, create default ones
    if (!userNotificationSettings) {
      const defaultPreferences = {
        email: {
          enabled: true,
          frequency: 'daily',
          types: {
            projectUpdates: true,
            collaborationInvites: true,
            deploymentStatus: true,
            securityAlerts: true,
            systemUpdates: false,
            marketingNews: false,
            billing: true,
            aiInsights: true,
          },
        },
        push: {
          enabled: true,
          types: {
            realTimeAlerts: true,
            mentionsAndReplies: true,
            projectNotifications: false,
            errorAlerts: true,
          },
        },
        inApp: {
          enabled: true,
          sound: true,
          desktop: true,
          frequency: 'important',
        },
        teamNotifications: {
          enabled: true,
          memberActivity: false,
          roleChanges: true,
          projectSharing: true,
        },
        aiNotifications: {
          enabled: true,
          consensusUpdates: true,
          optimizationSuggestions: true,
          modelPerformance: false,
        },
        quietHours: {
          enabled: false,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC',
        },
      };

      userNotificationSettings = await prisma.userNotificationSettings.create({
        data: {
          userId: session.user.id,
          preferences: defaultPreferences,
        },
      });
    }

    return NextResponse.json({
      preferences: userNotificationSettings.preferences,
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 }
    );
  }
}

// POST - Update user's notification preferences
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = notificationPreferencesSchema.parse(body);

    // Update or create notification settings
    const userNotificationSettings = await prisma.userNotificationSettings.upsert({
      where: {
        userId: session.user.id,
      },
      update: {
        preferences: validatedData.preferences,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        preferences: validatedData.preferences,
      },
    });

    // Create audit log entry
    await prisma.userAuditLog.create({
      data: {
        userId: session.user.id,
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        details: {
          emailEnabled: validatedData.preferences.email.enabled,
          pushEnabled: validatedData.preferences.push.enabled,
          inAppEnabled: validatedData.preferences.inApp.enabled,
          emailFrequency: validatedData.preferences.email.frequency,
        },
      },
    });

    return NextResponse.json({
      preferences: userNotificationSettings.preferences,
      message: 'Notification preferences updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating notification preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 }
    );
  }
}
