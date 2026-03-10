/**
 * Notifications API
 * GET - Fetch user notifications
 * PUT - Mark notifications as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const dbUser = await prisma.users.findUnique({
      where: { email: user.email },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const whereClause: any = { userId: dbUser.id };
    if (unreadOnly) {
      whereClause.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notifications.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          read: true,
          actionUrl: true,
          actionText: true,
          createdAt: true,
          readAt: true,
        },
      }),
      prisma.notifications.count({ where: whereClause }),
      prisma.notifications.count({
        where: { userId: dbUser.id, read: false },
      }),
    ]);

    return NextResponse.json({
      success: true,
      notifications,
      pagination: { total, limit, offset },
      unreadCount,
    });
  } catch (error) {
    logger.error('Failed to fetch notifications:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Mark notifications as read
 * Body: { notificationIds: string[] } or { markAllRead: true }
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user } = authResult;

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const dbUser = await prisma.users.findUnique({
      where: { email: user.email },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { notificationIds, markAllRead } = body;

    const now = new Date();

    if (markAllRead) {
      const result = await prisma.notifications.updateMany({
        where: { userId: dbUser.id, read: false },
        data: { read: true, readAt: now },
      });

      return NextResponse.json({
        success: true,
        message: `Marked ${result.count} notifications as read`,
        count: result.count,
      });
    }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'notificationIds array or markAllRead is required' },
        { status: 400 }
      );
    }

    // Only update notifications that belong to this user
    const result = await prisma.notifications.updateMany({
      where: {
        id: { in: notificationIds },
        userId: dbUser.id,
        read: false,
      },
      data: { read: true, readAt: now },
    });

    return NextResponse.json({
      success: true,
      message: `Marked ${result.count} notifications as read`,
      count: result.count,
    });
  } catch (error) {
    logger.error('Failed to update notifications:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
