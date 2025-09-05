import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's data overview for deletion preparation
    const [
      projectsCount,
      teamsOwned,
      apiKeys,
      integrations,
      notifications,
      auditLogs
    ] = await Promise.all([
      // Count user's projects
      prisma.project.count({
        where: { userId: session.user.id }
      }),
      
      // Count teams where user is owner
      prisma.teamMember.count({
        where: {
          userId: session.user.id,
          role: 'OWNER'
        }
      }),
      
      // Count API keys
      prisma.apiKey.count({
        where: { userId: session.user.id }
      }),
      
      // Count active integrations
      prisma.userIntegration.count({
        where: { 
          userId: session.user.id,
          isEnabled: true
        }
      }),
      
      // Count notifications
      prisma.notification.count({
        where: { userId: session.user.id }
      }),
      
      // Count audit logs (for storage estimation)
      prisma.auditLog.count({
        where: { userId: session.user.id }
      })
    ])

    // Calculate approximate storage used (simplified)
    const estimatedStorageMB = Math.ceil(
      (projectsCount * 5) + // ~5MB per project average
      (notifications * 0.01) + // ~0.01MB per notification
      (auditLogs * 0.005) + // ~0.005MB per audit log
      1 // Base account data
    )

    // Check if user has recent data export
    // const lastExport = await prisma.dataExport.findFirst({
    //   where: { userId: session.user.id },
    //   orderBy: { createdAt: 'desc' },
    //   select: { createdAt: true }
    // })

    return Response.json({
      projects: projectsCount,
      teams: teamsOwned,
      apiKeys: apiKeys,
      integrations: integrations,
      notifications: notifications,
      auditLogs: auditLogs,
      storageUsed: `${estimatedStorageMB} MB`,
      lastExport: null // Temporarily disabled until Prisma client is updated
    })
  } catch (error) {
    console.error('Error fetching deletion info:', error)
    return Response.json(
      { error: 'Failed to fetch account information' },
      { status: 500 }
    )
  }
}
