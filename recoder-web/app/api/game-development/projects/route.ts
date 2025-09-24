import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
// TODO: Add verifyAuth export to @/lib/auth or use getServerSession

export async function GET(request: NextRequest) {
  try {
    // TODO: Replace with proper auth verification
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    
    const engine = searchParams.get('engine')
    const platform = searchParams.get('platform')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    
    const skip = (page - 1) * limit

    const where: any = {
      userId,
      type: 'game'
    }

    if (engine) {
      where.framework = engine === 'unity' ? 'Unity' : 'Unreal Engine'
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: {
              // TODO: Add gameAssets relation to Project model
              // gameAssets: true,
              // TODO: Add gameBuilds relation to Project model  
              // gameBuilds: true
            }
          }
        }
      }),
      prisma.project.count({ where })
    ])

    return NextResponse.json({
      success: true,
      data: {
        projects,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    })
  } catch (error) {
    console.error('Game projects fetch error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}