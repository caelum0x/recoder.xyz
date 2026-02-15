/**
 * Single Notification API
 * DELETE - Remove a specific notification
 * PUT - Mark a single notification as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
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
      select: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const notificationId = params.id;

    // Only delete if notification belongs to user
    const notification = await prisma.notifications.findFirst({
      where: { id: notificationId, userId: dbUser.id },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    await prisma.notifications.delete({
      where: { id: notificationId },
    });

    return NextResponse.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    console.error('Failed to delete notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
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
      select: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const notificationId = params.id;

    // Only update if notification belongs to user
    const notification = await prisma.notifications.findFirst({
      where: { id: notificationId, userId: dbUser.id },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    await prisma.notifications.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Failed to update notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}
