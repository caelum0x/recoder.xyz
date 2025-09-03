import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BatchProcessor } from '@/lib/media-processing/batch-processor'
import { rateLimit } from '@/lib/rate-limit'

const batchProcessor = new BatchProcessor()

export async function POST(request: NextRequest) {
  try {
    // Rate limiting for batch operations
    const rateLimitResult = await rateLimit(request, 'batch-process', 2, 60) // 2 batch jobs per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { 
      fileIds, 
      operations, 
      outputFormat,
      quality = 'medium',
      batchName 
    } = body

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'File IDs array is required' },
        { status: 400 }
      )
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json(
        { error: 'Operations array is required' },
        { status: 400 }
      )
    }

    // Verify file ownership
    const files = await prisma.mediaFile.findMany({
      where: {
        id: { in: fileIds },
        userId: session.user.id,
        deleted: false
      }
    })

    if (files.length !== fileIds.length) {
      return NextResponse.json(
        { error: 'Some files not found or access denied' },
        { status: 404 }
      )
    }

    // Check user quota for batch processing
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

    // Create batch job
    const batchJob = await prisma.batchJob.create({
      data: {
        userId: user.id,
        name: batchName || `Batch ${new Date().toISOString()}`,
        fileIds,
        operations,
        outputFormat,
        quality,
        status: 'queued',
        totalFiles: files.length,
        processedFiles: 0,
        metadata: {
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
          formats: [...new Set(files.map(file => file.format))]
        }
      }
    })

    // Start batch processing
    const result = await batchProcessor.processBatch({
      batchJobId: batchJob.id,
      userId: user.id,
      files,
      operations,
      outputFormat,
      quality
    })

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        userId: user.id,
        type: 'batch_processing_started',
        metadata: {
          batchJobId: batchJob.id,
          fileCount: files.length,
          operationsCount: operations.length,
          outputFormat,
          quality
        }
      }
    })

    return NextResponse.json({
      success: true,
      batchJob: {
        id: batchJob.id,
        name: batchJob.name,
        status: batchJob.status,
        totalFiles: batchJob.totalFiles,
        estimatedDuration: result.estimatedDuration
      },
      processingJobs: result.processingJobs,
      message: 'Batch processing started successfully'
    })

  } catch (error) {
    console.error('Batch processing error:', error)
    return NextResponse.json(
      { error: 'Failed to start batch processing' },
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
    const batchJobId = url.searchParams.get('batchJobId')
    const status = url.searchParams.get('status')
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const where: any = {
      userId: session.user.id
    }

    if (batchJobId) {
      where.id = batchJobId
    }

    if (status) {
      where.status = status
    }

    const [batchJobs, total] = await Promise.all([
      prisma.batchJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          processingJobs: {
            select: {
              id: true,
              status: true,
              progress: true,
              operation: true
            }
          }
        }
      }),
      prisma.batchJob.count({ where })
    ])

    return NextResponse.json({
      batchJobs: batchJobs.map(job => ({
        ...job,
        progress: job.totalFiles > 0 ? (job.processedFiles / job.totalFiles) * 100 : 0,
        activeJobs: job.processingJobs.filter(pJob => 
          ['queued', 'processing'].includes(pJob.status)
        ).length,
        completedJobs: job.processingJobs.filter(pJob => 
          pJob.status === 'completed'
        ).length,
        failedJobs: job.processingJobs.filter(pJob => 
          pJob.status === 'failed'
        ).length
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error('Batch jobs fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch batch jobs' },
      { status: 500 }
    )
  }
}
