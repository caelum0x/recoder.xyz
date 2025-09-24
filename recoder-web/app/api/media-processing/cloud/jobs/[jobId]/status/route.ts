import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../../../../lib/auth'

declare global {
  // Adjust the Job type according to your actual job object structure
  var processingJobs: Map<string, any> | undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const jobId = params.jobId
    
    // Get job status from memory (in production, this would be from a database/queue)
    ;(global as any).processingJobs = (global as any).processingJobs || new Map()
    const job = (global as any).processingJobs.get(jobId)

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Verify user owns this job
    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const response = {
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error,
      ...job.result
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Job status error:', error)
    return NextResponse.json({ error: 'Failed to get job status' }, { status: 500 })
  }
}