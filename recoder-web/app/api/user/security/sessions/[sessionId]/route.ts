import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const { sessionId } = params

    // Find the session to terminate
    const userSession = await prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id
      }
    })

    if (!userSession) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // Note: isCurrent field not available in UserSession model
    // Skip current session check for now
    
    // Mark session as expired (using expiresAt field instead of isActive)
    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        expiresAt: new Date() // Mark as expired immediately
      }
    })

    // Log the session termination
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SESSION_TERMINATED',
        resource: 'system',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          terminatedSessionId: sessionId,
          deviceId: userSession.deviceId || 'unknown',
          platform: userSession.platform || 'unknown'
        }
      }
    })

    return Response.json({ 
      success: true,
      message: 'Session terminated successfully' 
    })
  } catch (error) {
    console.error('Session termination error:', error)
    return Response.json(
      { error: 'Failed to terminate session' },
      { status: 500 }
    )
  }
}
