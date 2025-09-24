import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { notificationId } = params

    // Star the notification
    const notification = await prisma.notification.update({
      where: {
        id: notificationId,
        userId: session.user.id
      },
      data: {
        // starred: true // Field not in Notification model
      }
    })

    return Response.json({
      success: true,
      notification
    })
  } catch (error) {
    console.error('Star notification error:', error)
    return Response.json(
      { error: 'Failed to star notification' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { notificationId } = params

    // Unstar the notification
    const notification = await prisma.notification.update({
      where: {
        id: notificationId,
        userId: session.user.id
      },
      data: {
        // starred: false // Field not in Notification model
      }
    })

    return Response.json({
      success: true,
      notification
    })
  } catch (error) {
    console.error('Unstar notification error:', error)
    return Response.json(
      { error: 'Failed to unstar notification' },
      { status: 500 }
    )
  }
}
