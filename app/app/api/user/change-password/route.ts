/**
 * Change Password API Route
 * Allows authenticated users to change their password
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Get user with password
    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
      select: {
        id: true,
        email: true,
        password: true
      }
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { success: false, error: 'User not found or password not set' },
        { status: 404 }
      );
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.users.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    // Revoke all sessions except current one for security
    // (Optional - you may want to keep current session active)
    await prisma.sessions.deleteMany({
      where: {
        users: {
          email: user.email
        }
      }
    });

    // Log audit event
    await prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'password_changed',
        resource: 'user',
        resourceId: user.id,
        metadata: { email: user.email },
      }
    });

    console.log(`✅ Password changed for ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully. Please sign in again with your new password.'
    });

  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
