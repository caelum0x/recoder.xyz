import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { notificationIds } = await request.json()

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return Response.json({ error: 'Invalid notification IDs' }, { status: 400 })
    }

    // Mark notifications as read
    const result = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId: session.user.id
      },
      data: {
        isRead: true
      }
    })

    return Response.json({
      success: true,
      updatedCount: result.count
    })
  } catch (error) {
    console.error('Mark notifications read error:', error)
    return Response.json(
      { error: 'Failed to mark notifications as read' },
      { status: 500 }
    )
  }
}
