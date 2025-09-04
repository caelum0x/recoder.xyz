import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FFmpegProcessor } from '@/lib/media-processing/ffmpeg-processor'

const ffmpegProcessor = new FFmpegProcessor()

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const jobId = params.jobId

    // Get job from database
    const job = await prisma.processingJob.findFirst({
      where: {
        id: jobId,
        userId: session.user.id
      },
      include: {
        mediaFile: {
          select: {
            originalName: true,
            fileSize: true,
            format: true
          }
        }
      }
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found or access denied' },
        { status: 404 }
      )
    }

    // Get live progress from FFmpeg processor
    const liveProgress = ffmpegProcessor.getJobProgress(jobId)
    
    // Calculate enhanced progress information
    const now = new Date()
    const elapsedTime = now.getTime() - job.createdAt.getTime()
    const estimatedTotal = job.progress > 0 ? (elapsedTime / job.progress) * 100 : null
    const estimatedRemaining = estimatedTotal ? estimatedTotal - elapsedTime : null

    // Enhanced job status
    const enhancedStatus = {
      id: job.id,
      status: job.status,
      progress: liveProgress?.progress || job.progress,
      operation: job.operation,
      type: job.type,
      
      // File information
      file: {
        name: job.mediaFile?.originalName || 'Unknown',
        size: job.mediaFile?.fileSize || 0,
        format: job.mediaFile?.format || 'unknown'
      },

      // Timing information
      timing: {
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        elapsedTime: Math.floor(elapsedTime / 1000), // in seconds
        estimatedRemaining: estimatedRemaining ? Math.floor(estimatedRemaining / 1000) : null
      },

      // Live progress details
      liveProgress: liveProgress ? {
        currentStep: liveProgress.currentStep,
        estimatedTimeRemaining: liveProgress.estimatedTimeRemaining,
        fileSize: liveProgress.fileSize,
        outputUrl: liveProgress.outputUrl
      } : null,

      // Parameters and metadata
      parameters: job.parameters,
      inputPath: job.inputPath,
      outputPath: job.outputPath,
      error: job.error,

      // Processing statistics
      stats: {
        queuePosition: await getQueuePosition(jobId, job.status),
        averageProcessingTime: await getAverageProcessingTime(job.operation, job.type),
        successRate: await getOperationSuccessRate(job.operation)
      }
    }

    return NextResponse.json({
      success: true,
      job: enhancedStatus
    })

  } catch (error) {
    console.error('Job status fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    )
  }
}

// Helper function to get queue position
async function getQueuePosition(jobId: string, status: string): Promise<number | null> {
  if (status !== 'queued') return null

  const queuedJobs = await prisma.processingJob.findMany({
    where: {
      status: 'queued',
      createdAt: {
        lte: await prisma.processingJob.findUnique({
          where: { id: jobId },
          select: { createdAt: true }
        }).then(job => job?.createdAt || new Date())
      }
    },
    orderBy: { createdAt: 'asc' }
  })

  const position = queuedJobs.findIndex(job => job.id === jobId) + 1
  return position > 0 ? position : null
}

// Helper function to get average processing time
async function getAverageProcessingTime(operation: string, type: string): Promise<number | null> {
  const completedJobs = await prisma.processingJob.findMany({
    where: {
      operation,
      type,
      status: 'completed',
      startedAt: { not: null },
      completedAt: { not: null }
    },
    select: {
      startedAt: true,
      completedAt: true
    },
    take: 50,
    orderBy: { completedAt: 'desc' }
  })

  if (completedJobs.length === 0) return null

  const totalTime = completedJobs.reduce((sum, job) => {
    if (job.startedAt && job.completedAt) {
      return sum + (job.completedAt.getTime() - job.startedAt.getTime())
    }
    return sum
  }, 0)

  return Math.floor(totalTime / completedJobs.length / 1000) // Average in seconds
}

// Helper function to get success rate
async function getOperationSuccessRate(operation: string): Promise<number> {
  const [total, successful] = await Promise.all([
    prisma.processingJob.count({
      where: {
        operation,
        status: { in: ['completed', 'failed'] }
      }
    }),
    prisma.processingJob.count({
      where: {
        operation,
        status: 'completed'
      }
    })
  ])

  return total > 0 ? Math.round((successful / total) * 100) : 100
}

// PATCH endpoint for updating job status (used by processing workers)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const jobId = params.jobId
    const body = await request.json()
    
    const { status, progress, error, outputPath, startedAt, completedAt } = body

    // Update job in database
    const updatedJob = await prisma.processingJob.update({
      where: {
        id: jobId,
        userId: session.user.id
      },
      data: {
        ...(status && { status }),
        ...(progress !== undefined && { progress }),
        ...(error && { error }),
        ...(outputPath && { outputPath }),
        ...(startedAt && { startedAt: new Date(startedAt) }),
        ...(completedAt && { completedAt: new Date(completedAt) }),
        updatedAt: new Date()
      }
    })

    // Log analytics for job completion
    if (status === 'completed') {
      try {
        await prisma.analyticsEvent.create({
          data: {
            userId: session.user.id,
            type: 'media_processing_completed',
            metadata: {
              jobId: updatedJob.id,
              operation: updatedJob.operation,
              type: updatedJob.type,
              processingTime: updatedJob.startedAt && updatedJob.completedAt 
                ? updatedJob.completedAt.getTime() - updatedJob.startedAt.getTime()
                : null
            }
          }
        })
      } catch (analyticsError) {
        console.log('Analytics logging failed:', analyticsError)
      }
    }

    return NextResponse.json({
      success: true,
      job: updatedJob
    })

  } catch (error) {
    console.error('Job status update error:', error)
    return NextResponse.json(
      { error: 'Failed to update job status' },
      { status: 500 }
    )
  }
}