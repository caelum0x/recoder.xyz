import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return Response.json({ error: 'Current password and new password are required' }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return Response.json({ error: 'New password must be at least 8 characters long' }, { status: 400 })
    }

    // Get user with current password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        password: true,
        securitySettings: true
      }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      return Response.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.password)
    if (isSamePassword) {
      return Response.json({ error: 'New password must be different from current password' }, { status: 400 })
    }

    // Hash new password
    const saltRounds = 12
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds)

    // Update password
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        password: hashedNewPassword,
        passwordUpdatedAt: new Date()
      }
    })

    // Log password change
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'PASSWORD_CHANGED',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          timestamp: new Date().toISOString(),
          method: 'manual_change'
        }
      }
    })

    // Send security notification email if enabled
    if (user.securitySettings?.loginNotifications) {
      // TODO: Send email notification about password change
      console.log('Password changed notification would be sent to:', user.email)
    }

    return Response.json({ 
      success: true,
      message: 'Password updated successfully',
      passwordLastChanged: updatedUser.passwordUpdatedAt?.toISOString()
    })
  } catch (error) {
    console.error('Password change error:', error)
    return Response.json(
      { error: 'Failed to change password' },
      { status: 500 }
    )
  }
}
