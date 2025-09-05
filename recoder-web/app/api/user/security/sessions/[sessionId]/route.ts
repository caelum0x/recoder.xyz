import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = params

    // Find the session to terminate
    const userSession = await prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id
      }
    })

    if (!userSession) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    // Don't allow terminating the current session
    if (userSession.isCurrent) {
      return Response.json({ error: 'Cannot terminate current session' }, { status: 400 })
    }

    // Mark session as inactive
    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        terminatedAt: new Date()
      }
    })

    // Log the session termination
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SESSION_TERMINATED',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          terminatedSessionId: sessionId,
          deviceName: userSession.deviceName,
          ipAddress: userSession.ipAddress
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
