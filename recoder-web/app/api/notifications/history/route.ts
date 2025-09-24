// Notification history and archive management API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for notification history operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const archiveNotificationSchema = z.object({
  notificationIds: z.array(z.string().cuid()).min(1).max(50),
  action: z.enum(['archive', 'unarchive', 'delete']),
});

const historyFilterSchema = z.object({
  type: z.enum([
    'system',
    'security', 
    'deployment',
    'ai_completion',
    'team_invite',
    'project_update',
    'billing',
    'maintenance'
  ]).optional(),
  status: z.enum(['read', 'unread', 'archived']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  search: z.string().max(200).optional(),
});

// GET - Get notification history with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'notification-history');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    
    // Parse and validate query parameters
    const filters = historyFilterSchema.parse({
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      priority: searchParams.get('priority') || undefined,
      fromDate: searchParams.get('fromDate') || undefined,
      toDate: searchParams.get('toDate') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
      search: searchParams.get('search') || undefined,
    });

    // Build where clause for filtering
    const whereClause: any = {
      userId: user.id,
    };

    if (filters.type) {
      whereClause.type = filters.type;
    }

    if (filters.status) {
      switch (filters.status) {
        case 'read':
          whereClause.isRead = true;
          // Note: archived functionality not implemented in Notification model
          break;
        case 'unread':
          whereClause.isRead = false;
          break;
        case 'archived':
          // Note: archived functionality not implemented in Notification model
          // Would add archived field to schema for this functionality
          break;
      }
    }

    if (filters.priority) {
      whereClause.priority = filters.priority;
    }

    if (filters.fromDate || filters.toDate) {
      whereClause.createdAt = {};
      if (filters.fromDate) {
        whereClause.createdAt.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        whereClause.createdAt.lte = new Date(filters.toDate);
      }
    }

    if (filters.search) {
      whereClause.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get notifications with pagination
    const [notifications, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: filters.offset,
        take: filters.limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          priority: true,
          actionUrl: true,
          actionText: true,
          isRead: true,
          // Note: archived and starred fields not available in Notification model
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.notification.count({ where: whereClause }),
    ]);

    // Get notification statistics
    const stats = await prisma.notification.groupBy({
      by: ['type'],
      where: {
        userId: user.id,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      _count: {
        id: true,
      },
    });

    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    return NextResponse.json({
      notifications: notifications.map(notification => ({
        ...notification,
        status: notification.isRead ? 'read' : 'unread',
      })),
      pagination: {
        total: totalCount,
        limit: filters.limit,
        offset: filters.offset,
        hasMore: totalCount > filters.offset + filters.limit,
      },
      statistics: {
        unreadCount,
        typeBreakdown: stats.reduce((acc, stat) => {
          acc[stat.type] = stat._count.id;
          return acc;
        }, {} as Record<string, number>),
      },
    });

  } catch (error) {
    console.error('Get notification history error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Archive/unarchive/delete notifications in bulk
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'notification-archive');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { notificationIds, action } = archiveNotificationSchema.parse(body);

    // Verify all notifications belong to the user
    const notifications = await prisma.notification.findMany({
      where: {
        id: { in: notificationIds },
        userId: user.id,
      },
      select: { id: true },
    });

    if (notifications.length !== notificationIds.length) {
      return NextResponse.json(
        { error: 'Some notifications not found or access denied' },
        { status: 403 }
      );
    }

    let updateData: any = {};
    let successMessage = '';

    switch (action) {
      case 'archive':
        // Note: Archive functionality requires adding archived field to Notification model
        updateData = { isRead: true }; // Mark as read instead of archived
        successMessage = 'Notifications marked as read (archive not implemented)';
        break;
      case 'unarchive':
        updateData = { isRead: false };
        successMessage = 'Notifications marked as unread';
        break;
      case 'delete':
            // Hard delete notifications
        await prisma.notification.deleteMany({
          where: {
            id: { in: notificationIds },
            userId: user.id,
          },
        });
        
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'notifications_delete',
            platform: 'web',
            ip: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
            success: true,
            metadata: {
              notificationIds,
              count: notificationIds.length,
              action,
            },
          },
        });

        return NextResponse.json({
          message: 'Notifications deleted successfully',
          updatedCount: notificationIds.length,
        });
    }

    // Update notifications
    const updateResult = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId: user.id,
      },
      data: updateData,
    });

    // Log the action for audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: `notifications_${action}`,
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          notificationIds,
          count: updateResult.count,
          action,
        },
      },
    });

    return NextResponse.json({
      message: successMessage,
      updatedCount: updateResult.count,
    });

  } catch (error) {
    console.error('Archive notifications error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Permanently delete archived notifications older than specified days
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'notification-cleanup');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const daysOld = parseInt(searchParams.get('days') || '30'); // Default 30 days

    if (daysOld < 7) {
      return NextResponse.json(
        { error: 'Cannot delete notifications newer than 7 days' },
        { status: 400 }
      );
    }

    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    // Delete old read notifications (since archived field doesn't exist)
    const deleteResult = await prisma.notification.deleteMany({
      where: {
        userId: user.id,
        isRead: true,
        createdAt: {
          lte: cutoffDate,
        },
      },
    });

    // Log the cleanup action
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'notifications_cleanup',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          deletedCount: deleteResult.count,
          daysOld,
          cutoffDate: cutoffDate.toISOString(),
        },
      },
    });

    return NextResponse.json({
      message: 'Old notifications cleaned up successfully',
      deletedCount: deleteResult.count,
    });

  } catch (error) {
    console.error('Cleanup notifications error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
