import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || '30d'
    const type = searchParams.get('type') || 'overview'

    // Calculate date range based on timeframe
    const now = new Date()
    let startDate: Date
    
    switch (timeframe) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const userId = session.user.id

    switch (type) {
      case 'overview':
        return getOverviewAnalytics(userId, startDate, now)
      
      case 'processing':
        return getProcessingAnalytics(userId, startDate, now)
      
      case 'storage':
        return getStorageAnalytics(userId, startDate, now)
      
      case 'usage':
        return getUsageAnalytics(userId, startDate, now)
      
      case 'performance':
        return getPerformanceAnalytics(userId, startDate, now)
      
      default:
        return getOverviewAnalytics(userId, startDate, now)
    }

  } catch (error) {
    console.error('Analytics fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

async function getOverviewAnalytics(userId: string, startDate: Date, endDate: Date) {
  // Parallel queries for overview data
  const [
    totalFiles,
    totalJobs,
    completedJobs,
    failedJobs,
    totalStorage,
    recentFiles,
    popularOperations,
    processingTimeStats
  ] = await Promise.all([
    // Total files uploaded
    prisma.mediaFile.count({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
        // Note: deleted field doesn't exist in MediaFile model
      }
    }),

    // Total processing jobs
    prisma.processingJob.count({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate }
      }
    }),

    // Completed jobs
    prisma.processingJob.count({
      where: {
        userId,
        status: 'completed',
        createdAt: { gte: startDate, lte: endDate }
      }
    }),

    // Failed jobs
    prisma.processingJob.count({
      where: {
        userId,
        status: 'failed',
        createdAt: { gte: startDate, lte: endDate }
      }
    }),

    // Total storage used
    prisma.mediaFile.aggregate({
      where: {
        userId,
        // Note: deleted field doesn't exist in MediaFile model
      },
      _sum: { fileSize: true }
    }),

    // Recent files
    prisma.mediaFile.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
        // Note: deleted field doesn't exist in MediaFile model
      },
      select: {
        id: true,
        originalName: true,
        format: true,
        fileSize: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    }),

    // Most popular operations
    prisma.processingJob.groupBy({
      by: ['operation'],
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate }
      },
      _count: { operation: true },
      orderBy: { _count: { operation: 'desc' } },
      take: 5
    }),

    // Processing time statistics
    prisma.processingJob.aggregate({
      where: {
        userId,
        status: 'completed',
        startedAt: { not: null },
        completedAt: { not: null },
        createdAt: { gte: startDate, lte: endDate }
      },
      _avg: { 
        progress: true // This is a placeholder - in real implementation, calculate actual processing time
      }
    })
  ])

  const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0

  return NextResponse.json({
    success: true,
    analytics: {
      overview: {
        totalFiles,
        totalJobs,
        completedJobs,
        failedJobs,
        successRate,
        totalStorage: totalStorage._sum?.fileSize || 0,
        averageProcessingTime: processingTimeStats._avg.progress || 0
      },
      recentFiles,
      popularOperations: popularOperations.map((op: any) => ({
        operation: op.operation,
        count: op._count.operation
      })),
      timeframe: {
        startDate,
        endDate
      }
    }
  })
}

async function getProcessingAnalytics(userId: string, startDate: Date, endDate: Date) {
  // Daily processing statistics
  const dailyStats = await prisma.$queryRaw`
    SELECT 
      DATE("createdAt") as date,
      COUNT(*) as total_jobs,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
      COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_jobs
    FROM "ProcessingJob" 
    WHERE "userId" = ${userId} 
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt")
  `

  // Operations breakdown
  const operationsBreakdown = await prisma.processingJob.groupBy({
    by: ['operation', 'type'],
    where: {
      userId,
      createdAt: { gte: startDate, lte: endDate }
    },
    _count: { id: true },
    _avg: { progress: true }
  })

  // Processing time analysis
  const processingTimes = await prisma.$queryRaw`
    SELECT 
      operation,
      type,
      AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))) as avg_duration,
      MIN(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))) as min_duration,
      MAX(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))) as max_duration,
      COUNT(*) as job_count
    FROM "ProcessingJob" 
    WHERE "userId" = ${userId}
      AND status = 'completed'
      AND "startedAt" IS NOT NULL 
      AND "completedAt" IS NOT NULL
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY operation, type
    ORDER BY avg_duration DESC
  `

  return NextResponse.json({
    success: true,
    analytics: {
      dailyStats,
      operationsBreakdown: operationsBreakdown.map(op => ({
        operation: op.operation,
        type: op.type,
        count: op._count.id,
        averageProgress: op._avg.progress || 0
      })),
      processingTimes,
      timeframe: { startDate, endDate }
    }
  })
}

async function getStorageAnalytics(userId: string, startDate: Date, endDate: Date) {
  // Storage by file type
  const storageByType = await prisma.mediaFile.groupBy({
    by: ['format'],
    where: {
      userId,
      // TODO: Add deleted field to MediaFile model
      // deleted: false,
      createdAt: { gte: startDate, lte: endDate }
    },
    _sum: { fileSize: true },
    _count: { id: true },
    orderBy: { _sum: { fileSize: 'desc' } }
  })

  // Storage growth over time
  const storageGrowth = await prisma.$queryRaw`
    SELECT 
      DATE("createdAt") as date,
      SUM("fileSize") as daily_storage,
      COUNT(*) as files_count
    FROM "MediaFile" 
    WHERE "userId" = ${userId} 
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt")
  `

  // Largest files
  const largestFiles = await prisma.mediaFile.findMany({
    where: {
      userId,
      // TODO: Add deleted field to MediaFile model
      // deleted: false,
      createdAt: { gte: startDate, lte: endDate }
    },
    select: {
      id: true,
      originalName: true,
      format: true,
      fileSize: true,
      createdAt: true
    },
    orderBy: { fileSize: 'desc' },
    take: 10
  })

  return NextResponse.json({
    success: true,
    analytics: {
      storageByType: storageByType.map(item => ({
        format: item.format,
        totalSize: item._sum?.fileSize || 0,
        fileCount: item._count?.id || 0
      })),
      storageGrowth,
      largestFiles,
      timeframe: { startDate, endDate }
    }
  })
}

async function getUsageAnalytics(userId: string, startDate: Date, endDate: Date) {
  // Get usage events
  const usageEvents = await prisma.analyticsEvent.findMany({
    where: {
      userId,
      type: {
        in: [
          'media_upload',
          'media_processing_started',
          'media_processing_completed',
          'template_usage',
          'batch_processing_started'
        ]
      },
      createdAt: { gte: startDate, lte: endDate }
    },
    select: {
      type: true,
      createdAt: true,
      metadata: true
    },
    orderBy: { createdAt: 'desc' }
  })

  // Usage by hour of day
  const usageByHour = await prisma.$queryRaw`
    SELECT 
      EXTRACT(HOUR FROM "createdAt") as hour,
      COUNT(*) as event_count
    FROM "AnalyticsEvent" 
    WHERE "userId" = ${userId}
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
      AND type IN ('media_upload', 'media_processing_started', 'template_usage')
    GROUP BY EXTRACT(HOUR FROM "createdAt")
    ORDER BY hour
  `

  // Most active days
  const mostActiveDays = await prisma.$queryRaw`
    SELECT 
      DATE("createdAt") as date,
      COUNT(*) as activity_count
    FROM "AnalyticsEvent" 
    WHERE "userId" = ${userId}
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY DATE("createdAt")
    ORDER BY activity_count DESC
    LIMIT 10
  `

  return NextResponse.json({
    success: true,
    analytics: {
      usageEvents: usageEvents.slice(0, 50), // Last 50 events
      usageByHour,
      mostActiveDays,
      timeframe: { startDate, endDate }
    }
  })
}

async function getPerformanceAnalytics(userId: string, startDate: Date, endDate: Date) {
  // Performance metrics
  const performanceMetrics = await prisma.$queryRaw`
    SELECT 
      operation,
      type,
      COUNT(*) as total_jobs,
      AVG(CASE WHEN status = 'completed' THEN 
        EXTRACT(EPOCH FROM (completed_at - started_at)) 
        ELSE NULL END) as avg_processing_time,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_jobs,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs
    FROM "ProcessingJob" 
    WHERE "userId" = ${userId}
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY operation, type
    ORDER BY total_jobs DESC
  `

  // Queue wait times
  const queueWaitTimes = await prisma.$queryRaw`
    SELECT 
      operation,
      AVG(EXTRACT(EPOCH FROM (started_at - created_at))) as avg_queue_time,
      MIN(EXTRACT(EPOCH FROM (started_at - created_at))) as min_queue_time,
      MAX(EXTRACT(EPOCH FROM (started_at - created_at))) as max_queue_time
    FROM "ProcessingJob" 
    WHERE "userId" = ${userId}
      AND "startedAt" IS NOT NULL
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY operation
    ORDER BY avg_queue_time DESC
  `

  return NextResponse.json({
    success: true,
    analytics: {
      performanceMetrics,
      queueWaitTimes,
      timeframe: { startDate, endDate }
    }
  })
}