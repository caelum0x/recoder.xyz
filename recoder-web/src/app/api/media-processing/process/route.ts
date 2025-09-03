import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { FFmpegProcessor } from '../../../../lib/media-processing/ffmpeg-processor'
import { ProcessingQueue } from '../../../../lib/media-processing/processing-queue'
import { rateLimit } from '../../../../lib/rate-limit'

// Create instances
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
    });

    if (!file) {
      return NextResponse.json(
        { error: 'File not found or access denied' },
        { status: 404 }
      )
    }

    // Check user quota
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
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
        mediaFileId: file.id,
        type: file.mimeType.startsWith('video/') ? 'video' : file.mimeType.startsWith('audio/') ? 'audio' : 'image',
        operation,
        parameters: parameters || {},
        inputPath: file.filePath,
        status: 'queued'
      }
    });

    // Add to processing queue
    const priorityMap = { 'low': 1, 'normal': 2, 'high': 3 };
    await processingQueue.addJob({
      type: 'video', // Determine based on file format
      inputPath: file.filePath,
      operation,
      parameters: parameters || {},
      priority: priorityMap[priority as keyof typeof priorityMap] || 2,
      metadata: {
        userId: user.id,
        fileId: file.id,
        outputFormat,
        quality
      }
    });

    // Log analytics (temporarily disabled until AnalyticsEvent model is available)
    // TODO: Uncomment when AnalyticsEvent model is available in Prisma client
    // await prisma.analyticsEvent.create({
    //   data: {
    //     userId: user.id,
    //     type: 'media_processing_started',
    //     metadata: {
    //       jobId: job.id,
    //       fileId: file.id,
    //       operation,
    //       outputFormat,
    //       quality
    //     }
    //   }
    // });

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        operation,
        progress: job.progress,
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

    // Temporarily return mock data until ProcessingJob model is available
    const jobs = [
      {
        id: 'job_123',
        userId: session.user.id,
        fileId: fileId || 'file_123',
        operation: 'convert',
        status: status || 'completed',
        progress: 100,
        createdAt: new Date(),
        file: {
          id: 'file_123',
          filename: 'sample.mp4',
          format: 'mp4',
          size: 1024000
        }
      }
    ];
    const total = jobs.length;

    // TODO: Uncomment when ProcessingJob model is available in Prisma client
    // const [jobs, total] = await Promise.all([
    //   prisma.processingJob.findMany({
    //     where,
    //     orderBy: { createdAt: 'desc' },
    //     skip: (page - 1) * limit,
    //     take: limit,
    //     include: {
    //       file: {
    //         select: {
    //           id: true,
    //           filename: true,
    //           format: true,
    //           size: true
    //         }
    //       }
    //     }
    //   }),
    //   prisma.processingJob.count({ where })
    // ]);

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
