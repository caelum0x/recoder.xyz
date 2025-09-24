import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userId = user.id

    // Get total game projects
    const totalProjects = await prisma.project.count({
      where: {
        userId
        // TODO: Add type field to Project model in database and uncomment below
        // type: 'game'
      }
    })

    // TODO: Add gameBuild model to Prisma schema
    const activeBuilds = 0;
    // Would be: await prisma.gameBuild.count({
    //   where: {
    //     userId,
    //     status: {
    //       in: ['queued', 'building']
    //     }
    //   }
    // })

    // TODO: Add gameAsset model to Prisma schema  
    const totalAssets = 0;
    // Would be: await prisma.gameAsset.count({
    //   where: {
    //     userId,
    //     status: 'active'
    //   }
    // })

    // TODO: Add codeGeneration model to Prisma schema
    const totalScripts = 0;
    // Would be: await prisma.codeGeneration.count({
    //   where: {
    //     userId,
    //     type: 'script',
    //     framework: {
    //       in: ['Unity', 'Unreal Engine']
    //     }
    //   }
    // })

    return NextResponse.json({
      success: true,
      data: {
        totalProjects,
        activeBuilds,
        totalAssets,
        totalScripts
      }
    })
  } catch (error) {
    console.error('Game development stats error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}