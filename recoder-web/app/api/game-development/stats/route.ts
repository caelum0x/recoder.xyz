import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await verifyAuth(request)

    // Get total game projects
    const totalProjects = await prisma.project.count({
      where: {
        userId,
        type: 'game'
      }
    })

    // Get active builds
    const activeBuilds = await prisma.gameBuild.count({
      where: {
        userId,
        status: {
          in: ['queued', 'building']
        }
      }
    })

    // Get total assets
    const totalAssets = await prisma.gameAsset.count({
      where: {
        userId,
        status: 'active'
      }
    })

    // Get total generated scripts
    const totalScripts = await prisma.codeGeneration.count({
      where: {
        userId,
        type: 'script',
        framework: {
          in: ['Unity', 'Unreal Engine']
        }
      }
    })

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