import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    const category = url.searchParams.get('category')
    const read = url.searchParams.get('read')
    const starred = url.searchParams.get('starred')
    const priority = url.searchParams.get('priority')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const where: any = {
      userId: session.user.id,
      archived: false
    }

    if (type) where.type = type
    if (category) where.category = category
    if (read !== null) where.read = read === 'true'
    if (starred !== null) where.starred = starred === 'true'
    if (priority) where.priority = priority

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      skip: offset
    })

    const total = await prisma.notification.count({ where })
    const unreadCount = await prisma.notification.count({
      where: {
        userId: session.user.id,
        read: false,
        archived: false
      }
    })

    return Response.json({
      notifications,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      },
      unreadCount
    })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return Response.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { notificationIds } = await request.json()

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return Response.json({ error: 'Invalid notification IDs' }, { status: 400 })
    }

    // Delete notifications owned by the user
    const result = await prisma.notification.deleteMany({
      where: {
        id: { in: notificationIds },
        userId: session.user.id
      }
    })

    return Response.json({
      success: true,
      deletedCount: result.count
    })
  } catch (error) {
    console.error('Notifications delete error:', error)
    return Response.json(
      { error: 'Failed to delete notifications' },
      { status: 500 }
    )
  }
}
