import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { password, reason, feedback } = await request.json()

    if (!password) {
      return Response.json({ error: 'Password is required to delete account' }, { status: 400 })
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        password: true,
        name: true
      }
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return Response.json({ error: 'Invalid password' }, { status: 400 })
    }

    // Log account deletion request
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ACCOUNT_DELETION_REQUESTED',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          email: user.email,
          name: user.name,
          reason: reason || 'No reason provided',
          feedback: feedback || 'No feedback provided',
          timestamp: new Date().toISOString()
        }
      }
    })

    // In a production environment, you might want to:
    // 1. Schedule the deletion for later (grace period)
    // 2. Send confirmation email
    // 3. Anonymize data instead of hard delete
    // 4. Keep audit logs for compliance
    
    // For immediate deletion with cascade
    await prisma.user.delete({
      where: { id: session.user.id }
    })

    return Response.json({
      success: true,
      message: 'Account deleted successfully'
    })
  } catch (error) {
    console.error('Account deletion error:', error)
    return Response.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
