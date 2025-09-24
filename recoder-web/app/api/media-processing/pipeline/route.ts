import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { MediaProcessingPipeline } from '@/lib/media-processing/pipeline-orchestrator'
import { rateLimit } from '@/lib/rate-limit'

// Initialize pipeline instance
const mediaProcessingPipeline = new MediaProcessingPipeline()

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    await rateLimit({
      interval: 60 * 1000, // 1 minute
      uniqueTokenPerInterval: 5,
    }).check(request, 5, 'media-pipeline')

    // Authentication
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...params } = body

    switch (action) {
      case 'upload_and_process': {
        const { fileData, options } = params
        
        // Convert base64 to File object (simplified)
        const buffer = Buffer.from(fileData.content, 'base64')
        const file = new File([buffer], fileData.name, { type: fileData.type })

        const result = await mediaProcessingPipeline.uploadAndProcess(
          file,
          session.user.id,
          options
        )

        return NextResponse.json({
          success: true,
          jobId: result.jobId,
          uploadResult: result.uploadResult
        })
      }

      case 'process_timeline': {
        const { timelineConfig } = params
        
        const jobId = await mediaProcessingPipeline.processTimeline(
          timelineConfig,
          session.user.id
        )

        return NextResponse.json({
          success: true,
          jobId,
          message: 'Timeline processing started'
        })
      }

      case 'batch_process': {
        const { files, batchOptions } = params
        
        // Convert file data to File objects
        const fileObjects = files.map((f: any) => ({
          file: new File([Buffer.from(f.content, 'base64')], f.name, { type: f.type }),
          options: f.options
        }))

        const jobId = await mediaProcessingPipeline.batchProcess(
          fileObjects,
          session.user.id,
          batchOptions
        )

        return NextResponse.json({
          success: true,
          jobId,
          message: 'Batch processing started'
        })
      }

      case 'get_status': {
        const { jobId } = params
        const job = mediaProcessingPipeline.getJobStatus(jobId)

        if (!job) {
          return NextResponse.json({ error: 'Job not found' }, { status: 404 })
        }

        if (job.userId !== session.user.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        return NextResponse.json({
          success: true,
          job: {
            id: job.id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            stage: job.stage,
            startTime: job.startTime,
            endTime: job.endTime,
            error: job.error,
            output: job.output
          }
        })
      }

      case 'cancel_job': {
        const { jobId } = params
        const job = mediaProcessingPipeline.getJobStatus(jobId)

        if (!job) {
          return NextResponse.json({ error: 'Job not found' }, { status: 404 })
        }

        if (job.userId !== session.user.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const cancelled = await mediaProcessingPipeline.cancelJob(jobId)
        
        return NextResponse.json({
          success: cancelled,
          message: cancelled ? 'Job cancelled' : 'Job could not be cancelled'
        })
      }

      case 'get_user_jobs': {
        const jobs = mediaProcessingPipeline.getUserJobs(session.user.id)
        
        return NextResponse.json({
          success: true,
          jobs: jobs.map(job => ({
            id: job.id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            stage: job.stage,
            startTime: job.startTime,
            endTime: job.endTime,
            metadata: job.metadata
          }))
        })
      }

      case 'get_stats': {
        // Only allow admins to view system stats
        const stats = mediaProcessingPipeline.getSystemStats()
        
        return NextResponse.json({
          success: true,
          stats: {
            ...stats,
            userJobCount: mediaProcessingPipeline.getUserJobs(session.user.id).length
          }
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Pipeline API error:', error)
    return NextResponse.json(
      { error: 'Pipeline processing failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    const jobId = url.searchParams.get('jobId')

    if (action === 'status' && jobId) {
      const job = mediaProcessingPipeline.getJobStatus(jobId)

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      if (job.userId !== session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          type: job.type,
          status: job.status,
          progress: job.progress,
          stage: job.stage,
          startTime: job.startTime,
          endTime: job.endTime,
          error: job.error,
          output: job.output
        }
      })
    }

    if (action === 'jobs') {
      const jobs = mediaProcessingPipeline.getUserJobs(session.user.id)
      
      return NextResponse.json({
        success: true,
        jobs: jobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          progress: job.progress,
          stage: job.stage,
          startTime: job.startTime,
          endTime: job.endTime,
          metadata: job.metadata
        }))
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Pipeline GET API error:', error)
    return NextResponse.json({ error: 'Failed to get pipeline data' }, { status: 500 })
  }
}