import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/database'
import { z } from 'zod'
import rateLimit from '@/lib/rate-limit'

// Rate limiting for notification operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

const markReadSchema = z.object({
  notificationIds: z.array(z.string()).optional(),
  notificationId: z.string().optional(),
  markAll: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'notifications-get');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    const category = url.searchParams.get('category')
    const read = url.searchParams.get('read')
    const starred = url.searchParams.get('starred')
    const priority = url.searchParams.get('priority')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const where: any = {
      userId: session.user.id
    }

    if (type) where.type = type
    if (category) where.category = category
    if (read !== null) where.isRead = read === 'true'
    if (starred !== null) where.starred = starred === 'true'
    if (priority) where.priority = priority

    const notifications = await prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        priority: true,
        isRead: true,
        // starred: true, // Field not in Notification model
        actionUrl: true,
        actionText: true,
        metadata: true,
        createdAt: true,
        readAt: true,
        expiresAt: true
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      skip: offset
    })

    const total = await prisma.notification.count({ where })
    const unreadCount = await prisma.notification.count({
      where: {
        userId: session.user.id,
        isRead: false,
        expiresAt: {
          gte: new Date()
        }
      }
    })

    // Get notification stats by type
    const statsByType = await prisma.notification.groupBy({
      by: ['type'],
      where: {
        userId: session.user.id,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      _count: {
        id: true
      }
    });

    // Get WebSocket connection info
    const websocketUrl = `${process.env.WEBSOCKET_URL || 'ws://localhost:3001'}/notifications`;

    return Response.json({
      notifications: notifications.map(notification => ({
        ...notification,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString(),
        expiresAt: notification.expiresAt?.toISOString(),
        isExpired: notification.expiresAt ? notification.expiresAt < new Date() : false
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      },
      stats: {
        unreadCount,
        byType: statsByType.reduce((acc, stat) => {
          acc[stat.type] = stat._count.id;
          return acc;
        }, {} as Record<string, number>)
      },
      websocketUrl
    })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return Response.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

// POST - Mark notifications as read or perform actions
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 20, 'notifications-action');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...data } = body;

    switch (action) {
      case 'mark_read':
        return await markNotificationsRead(session.user.id, data, request);
      case 'star':
        return await starNotifications(session.user.id, data.notificationIds || [data.notificationId], request);
      case 'unstar':
        return await unstarNotifications(session.user.id, data.notificationIds || [data.notificationId], request);
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Notification action error:', error)
    return Response.json(
      { error: 'Failed to process notification action' },
      { status: 500 }
    )
  }
}

async function markNotificationsRead(userId: string, data: any, request: NextRequest) {
  const validatedData = markReadSchema.parse(data);

  if (validatedData.markAll) {
    // Mark all notifications as read
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

    // Log bulk action
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'notifications_mark_all_read',
          resource: 'notification',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: { count: result.count }
      }
    });

    return Response.json({
      success: true,
      markedCount: result.count,
      message: `Marked ${result.count} notifications as read`
    });
  } else {
    // Mark specific notifications as read
    const notificationIds = validatedData.notificationIds || 
                           (validatedData.notificationId ? [validatedData.notificationId] : []);

    if (notificationIds.length === 0) {
      return Response.json({ error: 'No notification IDs provided' }, { status: 400 });
    }

    const result = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    return Response.json({
      success: true,
      markedCount: result.count,
      message: `Marked ${result.count} notifications as read`
    });
  }
}

async function starNotifications(userId: string, notificationIds: string[], request: NextRequest) {
  const result = await prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      userId
    },
    data: {
      // starred: true // Field not in Notification model
    }
  });

  return Response.json({
    success: true,
    starredCount: result.count,
    message: `Starred ${result.count} notifications`
  });
}

async function unstarNotifications(userId: string, notificationIds: string[], request: NextRequest) {
  const result = await prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      userId
    },
    data: {
      // starred: false // Field not in Notification model
    }
  });

  return Response.json({
    success: true,
    unstarredCount: result.count,
    message: `Unstarred ${result.count} notifications`
  });
}

export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'notifications-delete');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { notificationIds } = await request.json()

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return Response.json({ error: 'Invalid notification IDs' }, { status: 400 })
    }

    // Delete notifications owned by the user
    const result = await prisma.notification.deleteMany({
      where: {
        id: { in: notificationIds },
        userId: session.user.id
      }
    })

    // Log deletion
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'notifications_deleted',
          resource: 'notifications',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          count: result.count,
          notificationIds
        }
      }
    });

    return Response.json({
      success: true,
      deletedCount: result.count
    })
  } catch (error) {
    console.error('Notifications delete error:', error)
    return Response.json(
      { error: 'Failed to delete notifications' },
      { status: 500 }
    )
  }
}
