import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

// Configure web-push with VAPID keys (these should be in environment variables)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa40HEYmm6ePaOckQ4jk9lPJNbUfGq23fN8CYGGp-7LJzJb_-4B0tg5xF5-8sA';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UzQvQOjzKVyULz6D_Z7MfMNzqEbMb8eF9z7RQrNHaG8';

webpush.setVapidDetails(
  'mailto:admin@recoder.xyz',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Subscribe to push notifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, subscription, notification, userId } = body;

    switch (action) {
      case 'subscribe':
        return handleSubscribe(subscription, userId);
      case 'unsubscribe':
        return handleUnsubscribe(subscription, userId);
      case 'send':
        return handleSendNotification(notification, userId);
      case 'broadcast':
        return handleBroadcast(notification);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Push notification error:', error);
    return NextResponse.json(
      { error: 'Push notification operation failed' },
      { status: 500 }
    );
  }
}

// Handle push subscription
async function handleSubscribe(subscription: any, userId: string) {
  try {
    // Store subscription in database
    const subscriptionData = {
      id: generateSubscriptionId(),
      userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: subscription.userAgent || 'unknown',
      createdAt: new Date().toISOString(),
      isActive: true
    };

    // In production, store in database
    console.log('Stored push subscription:', subscriptionData);

    // Send welcome notification
    const welcomeNotification = {
      title: '🚀 Recoder.xyz Push Notifications Enabled',
      body: 'You\'ll now receive important updates about your projects and deployments.',
      icon: '/icons/manifest-icon-192.png',
      badge: '/icons/badge-72x72.png',
      tag: 'welcome',
      data: {
        url: '/settings/notifications',
        type: 'welcome'
      },
      actions: [
        {
          action: 'settings',
          title: 'Manage Settings',
          icon: '/icons/action-settings.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
          icon: '/icons/action-dismiss.png'
        }
      ]
    };

    // Send the welcome notification
    await webpush.sendNotification(subscription, JSON.stringify(welcomeNotification));

    return NextResponse.json({
      success: true,
      subscriptionId: subscriptionData.id,
      message: 'Successfully subscribed to push notifications'
    });
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe to push notifications' },
      { status: 500 }
    );
  }
}

// Handle push unsubscription
async function handleUnsubscribe(subscription: any, userId: string) {
  try {
    // Remove subscription from database
    // In production, update database record to mark as inactive
    console.log('Removed push subscription for user:', userId);

    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed from push notifications'
    });
  } catch (error) {
    console.error('Unsubscription error:', error);
    return NextResponse.json(
      { error: 'Failed to unsubscribe from push notifications' },
      { status: 500 }
    );
  }
}

// Handle sending notification to specific user
async function handleSendNotification(notification: any, userId: string) {
  try {
    // Get user's subscriptions from database
    // For demo, we'll use a mock subscription
    const userSubscriptions = await getUserSubscriptions(userId);

    if (userSubscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No active subscriptions found for user' },
        { status: 404 }
      );
    }

    const results = [];

    for (const subscription of userSubscriptions) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        };

        const payload = JSON.stringify({
          title: notification.title || 'Recoder.xyz Notification',
          body: notification.body || 'You have a new notification',
          icon: notification.icon || '/icons/manifest-icon-192.png',
          badge: notification.badge || '/icons/badge-72x72.png',
          tag: notification.tag || 'recoder-notification',
          data: {
            url: notification.url || '/',
            timestamp: Date.now(),
            type: notification.type || 'general',
            ...notification.data
          },
          actions: notification.actions || [
            {
              action: 'open',
              title: 'Open App',
              icon: '/icons/action-open.png'
            },
            {
              action: 'dismiss',
              title: 'Dismiss',
              icon: '/icons/action-dismiss.png'
            }
          ],
          requireInteraction: notification.requireInteraction || false,
          silent: notification.silent || false,
          vibrate: notification.vibrate || [200, 100, 200],
          timestamp: notification.timestamp || Date.now()
        });

        await webpush.sendNotification(pushSubscription, payload);
        results.push({ subscriptionId: subscription.id, status: 'sent' });
      } catch (error) {
        console.error('Failed to send to subscription:', subscription.id, error);
        results.push({ 
          subscriptionId: subscription.id, 
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    });
  } catch (error) {
    console.error('Send notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

// Handle broadcasting to all users
async function handleBroadcast(notification: any) {
  try {
    // Get all active subscriptions from database
    const allSubscriptions = await getAllSubscriptions();

    if (allSubscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active subscriptions found',
        sent: 0
      });
    }

    const batchSize = 100; // Process in batches to avoid overwhelming
    const batches = [];
    
    for (let i = 0; i < allSubscriptions.length; i += batchSize) {
      batches.push(allSubscriptions.slice(i, i + batchSize));
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const batch of batches) {
      const promises = batch.map(async (subscription: any) => {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          };

          const payload = JSON.stringify({
            title: notification.title || 'Recoder.xyz Announcement',
            body: notification.body || 'New platform update available!',
            icon: notification.icon || '/icons/manifest-icon-192.png',
            badge: notification.badge || '/icons/badge-72x72.png',
            tag: notification.tag || 'broadcast',
            data: {
              url: notification.url || '/',
              timestamp: Date.now(),
              type: 'broadcast',
              ...notification.data
            },
            actions: notification.actions || [
              {
                action: 'open',
                title: 'Learn More',
                icon: '/icons/action-open.png'
              }
            ]
          });

          await webpush.sendNotification(pushSubscription, payload);
          return { status: 'sent' };
        } catch (error) {
          return { status: 'failed', error };
        }
      });

      const results = await Promise.all(promises);
      totalSent += results.filter(r => r.status === 'sent').length;
      totalFailed += results.filter(r => r.status === 'failed').length;
    }

    return NextResponse.json({
      success: true,
      totalSubscriptions: allSubscriptions.length,
      sent: totalSent,
      failed: totalFailed,
      message: `Broadcast sent to ${totalSent} subscribers`
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    return NextResponse.json(
      { error: 'Failed to broadcast notification' },
      { status: 500 }
    );
  }
}

// Get VAPID public key
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    if (action === 'vapid-key') {
      return NextResponse.json({
        publicKey: VAPID_PUBLIC_KEY
      });
    }

    if (action === 'subscription-status') {
      const userId = searchParams.get('userId');
      if (!userId) {
        return NextResponse.json(
          { error: 'User ID required' },
          { status: 400 }
        );
      }

      const subscriptions = await getUserSubscriptions(userId);
      
      return NextResponse.json({
        hasActiveSubscriptions: subscriptions.length > 0,
        subscriptionCount: subscriptions.length,
        subscriptions: subscriptions.map(sub => ({
          id: sub.id,
          createdAt: sub.createdAt,
          userAgent: sub.userAgent,
          isActive: sub.isActive
        }))
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('GET push notifications error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// Mock functions - in production these would query the database
async function getUserSubscriptions(userId: string) {
  // Mock subscription data
  return [
    {
      id: 'sub_1',
      userId,
      endpoint: 'https://fcm.googleapis.com/fcm/send/example',
      keys: {
        p256dh: 'example_p256dh_key',
        auth: 'example_auth_key'
      },
      userAgent: 'Mozilla/5.0...',
      createdAt: new Date().toISOString(),
      isActive: true
    }
  ];
}

async function getAllSubscriptions() {
  // Mock all subscriptions data
  return [
    {
      id: 'sub_1',
      userId: 'user_1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/example1',
      keys: {
        p256dh: 'example_p256dh_key_1',
        auth: 'example_auth_key_1'
      }
    },
    {
      id: 'sub_2',
      userId: 'user_2',
      endpoint: 'https://fcm.googleapis.com/fcm/send/example2',
      keys: {
        p256dh: 'example_p256dh_key_2',
        auth: 'example_auth_key_2'
      }
    }
  ];
}

function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}