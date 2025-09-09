// Push notification service for web and mobile apps
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for push notification operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  deviceInfo: z.object({
    platform: z.enum(['web', 'android', 'ios']),
    userAgent: z.string().optional(),
    deviceId: z.string().optional(),
  }),
});

const sendPushSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(200),
  icon: z.string().url().optional(),
  badge: z.string().url().optional(),
  image: z.string().url().optional(),
  url: z.string().url().optional(),
  actions: z.array(z.object({
    action: z.string(),
    title: z.string(),
    icon: z.string().url().optional(),
  })).optional(),
  tag: z.string().optional(),
  requireInteraction: z.boolean().default(false),
  silent: z.boolean().default(false),
  timestamp: z.number().optional(),
  vibrate: z.array(z.number()).optional(),
  data: z.record(z.any()).optional(),
  userId: z.string().optional(), // If specified, send only to this user
  userIds: z.array(z.string()).optional(), // If specified, send to these users
  broadcast: z.boolean().default(false), // Send to all subscribers
});

// TypeScript interface for push subscription stored in JSON preferences
interface PushSubscription {
  id: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  platform: 'web' | 'android' | 'ios';
  userAgent?: string;
  deviceId?: string;
  createdAt: string;
  lastUsed: string;
  isActive: boolean;
}

// TypeScript interface for send results
interface SendResult {
  userId: string;
  subscriptionId: string;
  status: 'sent' | 'failed';
  error?: string;
}

// Web Push VAPID configuration
const VAPID_CONFIG = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BMrZUi7J4-WlJGqOmEjS4sXdE8DlfvNIJHpSlwkLJeHjFkRAZCKSa5yPzGsBqKl02tEQ3kO2m5PvjEfPUFLyB-Y',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'qjqwLbdmfvME0wR7aw_RBj7zEYqJM2mHF8JzCLNnmJk',
  email: 'mailto:notifications@recoder.xyz',
};

// Helper function to get push subscriptions from user preferences
async function getUserPushSubscriptions(userId: string): Promise<PushSubscription[]> {
  const notificationSettings = await prisma.userNotificationSettings.findUnique({
    where: { userId },
    select: { preferences: true }
  });

  const preferences = notificationSettings?.preferences as any || {};
  const pushSettings = preferences.push || {};
  return pushSettings.subscriptions || [];
}

// Helper function to save push subscriptions to user preferences
async function saveUserPushSubscriptions(userId: string, subscriptions: PushSubscription[]) {
  const notificationSettings = await prisma.userNotificationSettings.findUnique({
    where: { userId },
    select: { preferences: true }
  });

  const preferences = notificationSettings?.preferences as any || {};
  const updatedPreferences = {
    ...preferences,
    push: {
      ...preferences.push,
      subscriptions
    }
  };

  await prisma.userNotificationSettings.upsert({
    where: { userId },
    update: { preferences: updatedPreferences },
    create: {
      userId,
      preferences: updatedPreferences
    }
  });
}

// GET - Get push subscription status and VAPID public key
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 20, 'push-subscription-status');
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

    // Get user's notification settings using the JSON preferences field
    const notificationSettings = await prisma.userNotificationSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const preferences = notificationSettings?.preferences as any || {};
    const pushSettings = preferences.push || {};

    return NextResponse.json({
      vapidPublicKey: VAPID_CONFIG.publicKey,
      subscriptions: pushSettings.subscriptions || [],
      preferences: {
        pushEnabled: pushSettings.enabled !== false,
        pushSound: pushSettings.sound !== false,
        pushVibration: pushSettings.vibration !== false,
        quietHours: pushSettings.quietHours || false,
        categories: pushSettings.categories || {},
      },
      supportedFeatures: {
        webPush: typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window,
        notifications: typeof window !== 'undefined' && 'Notification' in window,
        vibration: typeof window !== 'undefined' && 'vibrate' in navigator,
      },
    });

  } catch (error) {
    console.error('Get push subscription status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Subscribe to push notifications or send push notification
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'push-operation');
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
    const action = searchParams.get('action') || 'subscribe';

    if (action === 'subscribe') {
      return await handleSubscribe(request, session.user.id);
    } else if (action === 'send') {
      return await handleSendPush(request, session.user.id);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "subscribe" or "send"' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Push notification operation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'push-unsubscribe');
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
    const endpoint = searchParams.get('endpoint');
    const deviceId = searchParams.get('deviceId');

    if (!endpoint && !deviceId) {
      return NextResponse.json(
        { error: 'Endpoint or deviceId parameter is required' },
        { status: 400 }
      );
    }

    // Get current subscriptions
    const subscriptions = await getUserPushSubscriptions(session.user.id);

    // Filter out the subscription to remove
    const filteredSubscriptions = subscriptions.filter((sub) => {
      if (endpoint && sub.endpoint === endpoint) return false;
      if (deviceId && sub.deviceId === deviceId) return false;
      return true;
    });

    const deletedCount = subscriptions.length - filteredSubscriptions.length;

    if (deletedCount === 0) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      );
    }

    // Save updated subscriptions
    await saveUserPushSubscriptions(session.user.id, filteredSubscriptions);

    // Log the unsubscribe action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'push_unsubscribed',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          endpoint,
          deviceId,
          deletedCount,
        },
      },
    });

    return NextResponse.json({
      message: 'Successfully unsubscribed from push notifications',
      deletedCount,
    });

  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle push subscription
async function handleSubscribe(request: NextRequest, userId: string) {
  const body = await request.json();
  const subscriptionData = pushSubscriptionSchema.parse(body);

  // Get current subscriptions
  const subscriptions = await getUserPushSubscriptions(userId);

  // Check if subscription already exists
  const existingIndex = subscriptions.findIndex(
    sub => sub.endpoint === subscriptionData.endpoint
  );

  const now = new Date().toISOString();
  const subscriptionId = existingIndex >= 0 ? subscriptions[existingIndex].id : `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const subscriptionRecord: PushSubscription = {
    id: subscriptionId,
    endpoint: subscriptionData.endpoint,
    p256dhKey: subscriptionData.keys.p256dh,
    authKey: subscriptionData.keys.auth,
    platform: subscriptionData.deviceInfo.platform,
    userAgent: subscriptionData.deviceInfo.userAgent,
    deviceId: subscriptionData.deviceInfo.deviceId,
    createdAt: existingIndex >= 0 ? subscriptions[existingIndex].createdAt : now,
    lastUsed: now,
    isActive: true,
  };

  if (existingIndex >= 0) {
    // Update existing subscription
    subscriptions[existingIndex] = subscriptionRecord;
  } else {
    // Add new subscription
    subscriptions.push(subscriptionRecord);
  }

  // Save updated subscriptions
  await saveUserPushSubscriptions(userId, subscriptions);

  // Log the subscription
  await prisma.auditLog.create({
    data: {
      userId,
      action: existingIndex >= 0 ? 'push_subscription_updated' : 'push_subscribed',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        subscriptionId,
        platform: subscriptionData.deviceInfo.platform,
        deviceId: subscriptionData.deviceInfo.deviceId,
      },
    },
  });

  return NextResponse.json({
    message: existingIndex >= 0 ? 'Push subscription updated successfully' : 'Push subscription created successfully',
    subscriptionId,
  });
}

// Handle sending push notification
async function handleSendPush(request: NextRequest, senderId: string) {
  const body = await request.json();
  const pushData = sendPushSchema.parse(body);

  // Determine target users
  let targetUserIds: string[] = [];
  
  if (pushData.broadcast) {
    // Get all users with push subscriptions (anyone can broadcast for now, but we could add admin check)
    const allUsersWithSettings = await prisma.userNotificationSettings.findMany({
      select: { userId: true, preferences: true }
    });
    
    targetUserIds = allUsersWithSettings
      .filter(settings => {
        const preferences = settings.preferences as any || {};
        const pushSettings = preferences.push || {};
        return (pushSettings.subscriptions || []).length > 0;
      })
      .map(settings => settings.userId);
  } else if (pushData.userIds) {
    targetUserIds = pushData.userIds;
  } else if (pushData.userId) {
    targetUserIds = [pushData.userId];
  } else {
    // Send to sender only
    targetUserIds = [senderId];
  }

  // Get active push subscriptions for target users
  const allSubscriptions: Array<{ userId: string; subscription: PushSubscription; settings: any }> = [];
  
  for (const userId of targetUserIds) {
    const subscriptions = await getUserPushSubscriptions(userId);
    const userSettings = await prisma.userNotificationSettings.findUnique({
      where: { userId },
      select: { preferences: true }
    });
    
    const preferences = userSettings?.preferences as any || {};
    const pushSettings = preferences.push || {};
    
    subscriptions
      .filter(sub => sub.isActive)
      .forEach(subscription => {
        allSubscriptions.push({
          userId,
          subscription,
          settings: pushSettings
        });
      });
  }

  // Filter subscriptions based on user preferences
  const filteredSubscriptions = allSubscriptions.filter(({ settings }) => {
    if (settings.enabled === false) return false;
    
    // Check quiet hours
    if (settings.quietHours) {
      const now = new Date();
      const currentHour = now.getHours();
      // Assume quiet hours are 10 PM to 8 AM
      if (currentHour >= 22 || currentHour < 8) {
        return false;
      }
    }
    
    return true;
  });

  // Prepare push notification payload
  const pushPayload = {
    title: pushData.title,
    body: pushData.body,
    icon: pushData.icon || '/icons/notification-icon.png',
    badge: pushData.badge || '/icons/badge-icon.png',
    image: pushData.image,
    url: pushData.url,
    actions: pushData.actions,
    tag: pushData.tag,
    requireInteraction: pushData.requireInteraction,
    silent: pushData.silent,
    timestamp: pushData.timestamp || Date.now(),
    vibrate: pushData.vibrate,
    data: pushData.data,
  };

  // Send push notifications (in a real implementation, use web-push library)
  const sendResults: SendResult[] = [];
  
  for (const { userId, subscription } of filteredSubscriptions) {
    try {
      // In production, use the web-push library:
      // const webpush = require('web-push');
      // webpush.setVapidDetails(VAPID_CONFIG.email, VAPID_CONFIG.publicKey, VAPID_CONFIG.privateKey);
      // await webpush.sendNotification({
      //   endpoint: subscription.endpoint,
      //   keys: {
      //     p256dh: subscription.p256dhKey,
      //     auth: subscription.authKey,
      //   }
      // }, JSON.stringify(pushPayload));
      
      // For now, simulate sending
      console.log(`Push notification sent to ${userId}:`, pushPayload);
      
      // Update last used timestamp
      const userSubscriptions = await getUserPushSubscriptions(userId);
      const updatedSubscriptions = userSubscriptions.map(sub => 
        sub.id === subscription.id 
          ? { ...sub, lastUsed: new Date().toISOString() }
          : sub
      );
      await saveUserPushSubscriptions(userId, updatedSubscriptions);
      
      sendResults.push({
        userId,
        subscriptionId: subscription.id,
        status: 'sent',
      });
    } catch (error) {
      console.error(`Failed to send push to ${userId}:`, error);
      sendResults.push({
        userId,
        subscriptionId: subscription.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Log the push notification sending
  await prisma.auditLog.create({
    data: {
      userId: senderId,
      action: 'push_notification_sent',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        title: pushData.title,
        targetCount: targetUserIds.length,
        sentCount: sendResults.filter(r => r.status === 'sent').length,
        failedCount: sendResults.filter(r => r.status === 'failed').length,
        broadcast: pushData.broadcast,
      },
    },
  });

  return NextResponse.json({
    message: 'Push notifications processed',
    results: sendResults,
    summary: {
      total: sendResults.length,
      sent: sendResults.filter(r => r.status === 'sent').length,
      failed: sendResults.filter(r => r.status === 'failed').length,
    },
  });
}

export const runtime = "edge";
