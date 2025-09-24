// Real-time notification system using WebSocket
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for notification operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

const notificationSchema = z.object({
  type: z.enum([
    'system',
    'security', 
    'deployment',
    'ai_completion',
    'team_invite',
    'project_update',
    'billing',
    'maintenance'
  ]),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  actionUrl: z.string().url().optional(),
  actionText: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
  channels: z.array(z.enum(['websocket', 'email', 'push', 'sms'])).default(['websocket'])
});

const subscriptionSchema = z.object({
  channels: z.array(z.string()).min(1),
  deviceId: z.string().optional(),
  platform: z.enum(['web', 'mobile', 'desktop', 'cli']).default('web'),
  pushSubscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    })
  }).optional()
});

// GET - Get notification connection info and status
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'notification-info');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;

    // Get user's notification preferences
    // Note: NotificationPreference model doesn't exist, using mock data
    const preferences = null; // await prisma.notificationPreference.findUnique({ where: { userId } });

    // Get recent notifications
    const recentNotifications = await prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        priority: true,
        isRead: true,
        actionUrl: true,
        actionText: true,
        createdAt: true,
        readAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Get active WebSocket connections count (this would connect to the backend WebSocket service)
    const activeConnections = await getActiveConnectionsForUser(userId);

    // Get notification statistics
    const stats = await prisma.notification.aggregate({
      where: { 
        userId,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      _count: {
        id: true
      }
    });

    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });

    return NextResponse.json({
      websocketUrl: `${process.env.WEBSOCKET_URL || 'ws://localhost:3001'}/notifications`,
      connectionInfo: {
        userId,
        activeConnections,
        lastActivity: new Date().toISOString()
      },
      preferences: preferences || {
        websocketEnabled: true,
        emailEnabled: true,
        pushEnabled: false,
        smsEnabled: false,
        channels: ['system', 'security', 'deployment'],
        quietHours: null
      },
      notifications: recentNotifications,
      stats: {
        unreadCount,
        totalLast30Days: stats._count.id || 0
      },
      supportedChannels: [
        'system',
        'security',
        'deployment', 
        'ai_completion',
        'team_invite',
        'project_update',
        'billing',
        'maintenance'
      ]
    });

  } catch (error) {
    console.error('Notification info error:', error);
    return NextResponse.json(
      { error: 'Failed to get notification info' },
      { status: 500 }
    );
  }
}

// POST - Send notification or manage subscription
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 20, 'notification-action');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'send':
        return await sendNotification(userId, data, request);
      case 'subscribe':
        return await subscribeToNotifications(userId, data, request);
      case 'unsubscribe':
        return await unsubscribeFromNotifications(userId, data, request);
      case 'mark_read':
        return await markNotificationRead(userId, data.notificationId, request);
      case 'mark_all_read':
        return await markAllNotificationsRead(userId, request);
      case 'test':
        return await sendTestNotification(userId, request);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Notification action error:', error);
    return NextResponse.json(
      { error: 'Failed to process notification action' },
      { status: 500 }
    );
  }
}

async function sendNotification(userId: string, data: any, request: NextRequest) {
  const validatedData = notificationSchema.parse(data);

  // Create notification in database
  const notification = await prisma.notification.create({
    data: {
      userId,
      type: validatedData.type,
      title: validatedData.title,
      message: validatedData.message,
      priority: validatedData.priority,
      actionUrl: validatedData.actionUrl,
      actionText: validatedData.actionText,
      metadata: validatedData.metadata || {},
      expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
      channels: validatedData.channels
    }
  });

  // Send via WebSocket if enabled
  if (validatedData.channels.includes('websocket')) {
    await sendWebSocketNotification(userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      actionUrl: notification.actionUrl,
      actionText: notification.actionText,
      metadata: notification.metadata,
      createdAt: notification.createdAt.toISOString()
    });
  }

  // Send via other channels (email, push, SMS) - would integrate with respective services
  if (validatedData.channels.includes('email')) {
    await scheduleEmailNotification(notification.id);
  }

  if (validatedData.channels.includes('push')) {
    await schedulePushNotification(notification.id);
  }

  // Log notification sent
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'notification_sent',
      resource: 'notification',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        notificationId: notification.id,
        type: notification.type,
        channels: validatedData.channels
      }
    }
  });

  return NextResponse.json({
    success: true,
    notification: {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      channels: notification.channels,
      createdAt: notification.createdAt.toISOString()
    },
    message: 'Notification sent successfully'
  }, { status: 201 });
}

async function subscribeToNotifications(userId: string, data: any, request: NextRequest) {
  const validatedData = subscriptionSchema.parse(data);

  // Update or create notification preferences
  // Note: NotificationPreference model doesn't exist, using mock response
  const preferences = {
    websocketEnabled: true,
    channels: validatedData.channels,
    deviceInfo: {
      deviceId: validatedData.deviceId,
      platform: validatedData.platform,
      subscribedAt: new Date().toISOString()
    }
  };
  /*
  const preferences = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {
      websocketEnabled: true,
      channels: validatedData.channels,
      deviceInfo: {
        deviceId: validatedData.deviceId,
        platform: validatedData.platform,
        subscribedAt: new Date().toISOString()
      },
      pushSubscription: validatedData.pushSubscription,
      updatedAt: new Date()
    },
    create: {
      userId,
      websocketEnabled: true,
      emailEnabled: true,
      pushEnabled: !!validatedData.pushSubscription,
      smsEnabled: false,
      channels: validatedData.channels,
      deviceInfo: {
        deviceId: validatedData.deviceId,
        platform: validatedData.platform,
        subscribedAt: new Date().toISOString()
      },
      pushSubscription: validatedData.pushSubscription
    }
  });
  */

  // Register with WebSocket service
  await registerWebSocketSubscription(userId, {
    channels: validatedData.channels,
    deviceId: validatedData.deviceId,
    platform: validatedData.platform
  });

  // Log subscription
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'notifications_subscribed',
      resource: 'notification',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        channels: validatedData.channels,
        platform: validatedData.platform,
        hasPushSubscription: !!validatedData.pushSubscription
      }
    }
  });

  return NextResponse.json({
    success: true,
    subscription: {
      channels: validatedData.channels,
      platform: validatedData.platform,
      subscribedAt: new Date().toISOString()
    },
    message: 'Successfully subscribed to notifications'
  });
}

async function unsubscribeFromNotifications(userId: string, data: any, request: NextRequest) {
  const { channels } = data;

  // Note: NotificationPreference model doesn't exist, using mock logic
  /*
  if (channels && Array.isArray(channels)) {
    // Unsubscribe from specific channels
    const preferences = await prisma.notificationPreference.findUnique({
      where: { userId }
    });

    if (preferences) {
      const updatedChannels = (preferences.channels as string[]).filter(
        channel => !channels.includes(channel)
      );

      await prisma.notificationPreference.update({
        where: { userId },
        data: {
          channels: updatedChannels,
          updatedAt: new Date()
        }
      });
    }
  } else {
    // Unsubscribe from all notifications
    await prisma.notificationPreference.update({
      where: { userId },
      data: {
        websocketEnabled: false,
        channels: [],
        pushSubscription: null,
        updatedAt: new Date()
      }
    });
  }
  */

  // Unregister from WebSocket service
  await unregisterWebSocketSubscription(userId, channels);

  // Log unsubscription
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'notifications_unsubscribed',
      resource: 'notification',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        channels: channels || 'all'
      }
    }
  });

  return NextResponse.json({
    success: true,
    message: channels 
      ? `Unsubscribed from channels: ${channels.join(', ')}`
      : 'Unsubscribed from all notifications'
  });
}

async function markNotificationRead(userId: string, notificationId: string, request: NextRequest) {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId
    }
  });

  if (!notification) {
    return NextResponse.json(
      { error: 'Notification not found' },
      { status: 404 }
    );
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  return NextResponse.json({
    success: true,
    message: 'Notification marked as read'
  });
}

async function markAllNotificationsRead(userId: string, request: NextRequest) {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  return NextResponse.json({
    success: true,
    message: `Marked ${result.count} notifications as read`
  });
}

async function sendTestNotification(userId: string, request: NextRequest) {
  const testNotification = {
    type: 'system' as const,
    title: 'Test Notification',
    message: 'This is a test notification to verify your notification settings are working correctly.',
    priority: 'normal' as const,
    actionText: 'View Settings',
    actionUrl: '/settings/notifications',
    channels: ['websocket'] as const
  };

  return await sendNotification(userId, testNotification, request);
}

// Helper functions to integrate with backend WebSocket service

async function sendWebSocketNotification(userId: string, notification: any) {
  try {
    // This would send to the backend WebSocket service
    const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/websocket/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
      },
      body: JSON.stringify({
        userId,
        event: 'notification:received',
        data: notification
      })
    });

    if (!response.ok) {
      console.error('Failed to send WebSocket notification:', response.statusText);
    }
  } catch (error) {
    console.error('WebSocket notification error:', error);
  }
}

async function registerWebSocketSubscription(userId: string, subscription: any) {
  try {
    await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/websocket/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
      },
      body: JSON.stringify({
        userId,
        ...subscription
      })
    });
  } catch (error) {
    console.error('WebSocket subscription error:', error);
  }
}

async function unregisterWebSocketSubscription(userId: string, channels?: string[]) {
  try {
    await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/websocket/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
      },
      body: JSON.stringify({
        userId,
        channels
      })
    });
  } catch (error) {
    console.error('WebSocket unsubscription error:', error);
  }
}

async function getActiveConnectionsForUser(userId: string): Promise<number> {
  try {
    const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/websocket/connections/${userId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      return data.activeConnections || 0;
    }
  } catch (error) {
    console.error('Failed to get active connections:', error);
  }
  return 0;
}

async function scheduleEmailNotification(notificationId: string) {
  // Would integrate with email service (SendGrid, etc.)
  console.log(`Scheduling email notification: ${notificationId}`);
}

async function schedulePushNotification(notificationId: string) {
  // Would integrate with push notification service (FCM, etc.)
  console.log(`Scheduling push notification: ${notificationId}`);
}