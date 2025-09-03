import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// Use existing services
import { FFmpegProcessor } from '@/lib/media-processing/ffmpeg-processor'
import { ProcessingQueue } from '@/lib/media-processing/processing-queue'
import { rateLimiter } from '@/lib/rate-limit'

const ffmpegProcessor = new FFmpegProcessor()
const processingQueue = new ProcessingQueue()

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'media-process', 5, 60) // 5 processing jobs per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Authentication
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { 
      fileId, 
      operation, 
      parameters,
      outputFormat,
      quality = 'medium',
      priority = 'normal'
    } = body

    if (!fileId || !operation) {
      return NextResponse.json(
        { error: 'File ID and operation are required' },
        { status: 400 }
      )
    }

    // Verify file ownership
    const file = await prisma.mediaFile.findFirst({
      where: {
        id: fileId,
        userId: session.user.id,
        deleted: false
      }
    })

    if (!file) {
      return NextResponse.json(
        { error: 'File not found or access denied' },
        { status: 404 }
      )
    }

    // Check user quota
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Validate operation and parameters
    const validationResult = await ffmpegProcessor.validateOperation(operation, parameters)
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: validationResult.error },
        { status: 400 }
      )
    }

    // Create processing job
    const job = await prisma.processingJob.create({
      data: {
        userId: user.id,
        fileId: file.id,
        operation,
        parameters: parameters || {},
        outputFormat,
        quality,
        priority,
        status: 'queued',
        estimatedDuration: validationResult.estimatedDuration,
        metadata: {
          inputFile: file.filename,
          inputFormat: file.format,
          inputSize: file.size
        }
      }
    })

    // Add to processing queue
    await processingQueue.addJob({
      jobId: job.id,
      userId: user.id,
      fileId: file.id,
      filePath: file.filePath,
      operation,
      parameters: parameters || {},
      outputFormat,
      quality,
      priority: priority as 'low' | 'normal' | 'high'
    })

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        userId: user.id,
        type: 'media_processing_started',
        metadata: {
          jobId: job.id,
          fileId: file.id,
          operation,
          outputFormat,
          quality
        }
      }
    })

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        operation,
        estimatedDuration: job.estimatedDuration,
        createdAt: job.createdAt
      },
      message: 'Processing job created successfully'
    })

  } catch (error) {
    console.error('Media processing error:', error)
    return NextResponse.json(
      { error: 'Failed to start processing' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')
    const fileId = url.searchParams.get('fileId')
    const status = url.searchParams.get('status')
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const where: any = {
      userId: session.user.id
    }

    if (jobId) {
      where.id = jobId
    }

    if (fileId) {
      where.fileId = fileId
    }

    if (status) {
      where.status = status
    }

    const [jobs, total] = await Promise.all([
      prisma.processingJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          file: {
            select: {
              id: true,
              filename: true,
              format: true,
              size: true
            }
          }
        }
      }),
      prisma.processingJob.count({ where })
    ])

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error('Processing jobs fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch processing jobs' },
      { status: 500 }
    )
  }
}
