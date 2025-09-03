import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { prisma } from '../prisma'
import { FFmpegProcessor } from '../media-processing/ffmpeg-processor'

export interface MediaProcessingSocketData {
  jobId: string
  userId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  currentStep?: string
  estimatedTimeRemaining?: number
  error?: string
  outputUrl?: string
  metadata?: Record<string, any>
}

export class MediaProcessingSocketServer {
  private io: SocketIOServer
  private ffmpegProcessor: FFmpegProcessor
  private progressIntervals: Map<string, NodeJS.Timeout> = new Map()

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'development' 
          ? ['http://localhost:3000', 'http://localhost:3001'] 
          : [process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'],
        methods: ['GET', 'POST']
      },
      path: '/socket.io/media-processing'
    })

    this.ffmpegProcessor = new FFmpegProcessor()
    this.setupSocketHandlers()
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Media processing client connected:', socket.id)

      // Join user-specific room for job updates
      socket.on('join-user-room', (userId: string) => {
        socket.join(`user:${userId}`)
        console.log(`Socket ${socket.id} joined room: user:${userId}`)
      })

      // Subscribe to specific job updates
      socket.on('subscribe-job', (data: { jobId: string, userId: string }) => {
        const { jobId, userId } = data
        socket.join(`job:${jobId}`)
        
        // Start real-time progress tracking for this job
        this.startJobProgressTracking(jobId, userId)
        console.log(`Socket ${socket.id} subscribed to job: ${jobId}`)
      })

      // Unsubscribe from job updates
      socket.on('unsubscribe-job', (jobId: string) => {
        socket.leave(`job:${jobId}`)
        this.stopJobProgressTracking(jobId)
        console.log(`Socket ${socket.id} unsubscribed from job: ${jobId}`)
      })

      // Get current job status
      socket.on('get-job-status', async (jobId: string) => {
        try {
          const jobStatus = await this.getJobStatus(jobId)
          socket.emit('job-status', jobStatus)
        } catch (error) {
          socket.emit('job-error', { 
            jobId, 
            error: 'Failed to fetch job status' 
          })
        }
      })

      // Get user's active jobs
      socket.on('get-active-jobs', async (userId: string) => {
        try {
          const activeJobs = await this.getUserActiveJobs(userId)
          socket.emit('active-jobs', activeJobs)
        } catch (error) {
          socket.emit('jobs-error', { 
            error: 'Failed to fetch active jobs' 
          })
        }
      })

      socket.on('disconnect', () => {
        console.log('Media processing client disconnected:', socket.id)
      })
    })
  }

  // Start tracking progress for a specific job
  private startJobProgressTracking(jobId: string, userId: string) {
    // Clear existing interval if any
    this.stopJobProgressTracking(jobId)

    const interval = setInterval(async () => {
      try {
        const jobStatus = await this.getJobStatus(jobId)
        
        // Emit to job-specific room and user room
        this.io.to(`job:${jobId}`).emit('job-progress', jobStatus)
        this.io.to(`user:${userId}`).emit('job-progress', jobStatus)

        // Stop tracking if job is completed or failed
        if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
          this.stopJobProgressTracking(jobId)
        }
      } catch (error) {
        console.error('Error tracking job progress:', error)
        this.io.to(`job:${jobId}`).emit('job-error', {
          jobId,
          error: 'Failed to track progress'
        })
      }
    }, 2000) // Update every 2 seconds

    this.progressIntervals.set(jobId, interval)
  }

  // Stop tracking progress for a job
  private stopJobProgressTracking(jobId: string) {
    const interval = this.progressIntervals.get(jobId)
    if (interval) {
      clearInterval(interval)
      this.progressIntervals.delete(jobId)
    }
  }

  // Get job status with live progress
  private async getJobStatus(jobId: string): Promise<MediaProcessingSocketData> {
    const job = await prisma.processingJob.findUnique({
      where: { id: jobId },
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
      throw new Error('Job not found')
    }

    // Get live progress from FFmpeg processor
    const liveProgress = this.ffmpegProcessor.getJobProgress(jobId)

    return {
      jobId: job.id,
      userId: job.userId,
      status: job.status as any,
      progress: liveProgress?.progress || job.progress,
      currentStep: liveProgress?.currentStep,
      estimatedTimeRemaining: liveProgress?.estimatedTimeRemaining,
      error: job.error || undefined,
      outputUrl: job.outputPath || liveProgress?.outputUrl,
      metadata: {
        operation: job.operation,
        type: job.type,
        fileName: job.mediaFile?.originalName,
        fileSize: job.mediaFile?.fileSize,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt
      }
    }
  }

  // Get all active jobs for a user
  private async getUserActiveJobs(userId: string) {
    const jobs = await prisma.processingJob.findMany({
      where: {
        userId,
        status: { in: ['queued', 'processing'] }
      },
      include: {
        mediaFile: {
          select: {
            originalName: true,
            fileSize: true,
            format: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return Promise.all(jobs.map(job => this.getJobStatus(job.id)))
  }

  // Broadcast job status update to all subscribed clients
  public broadcastJobUpdate(jobId: string, userId: string, update: Partial<MediaProcessingSocketData>) {
    const data = { jobId, userId, ...update }
    this.io.to(`job:${jobId}`).emit('job-update', data)
    this.io.to(`user:${userId}`).emit('job-update', data)
  }

  // Broadcast batch job updates
  public broadcastBatchUpdate(batchId: string, userId: string, update: {
    totalFiles: number
    completedFiles: number
    failedFiles: number
    progress: number
    currentFile?: string
  }) {
    this.io.to(`batch:${batchId}`).emit('batch-update', { batchId, userId, ...update })
    this.io.to(`user:${userId}`).emit('batch-update', { batchId, userId, ...update })
  }

  // Send system notifications
  public sendNotification(userId: string, notification: {
    type: 'success' | 'error' | 'info' | 'warning'
    title: string
    message: string
    jobId?: string
    metadata?: Record<string, any>
  }) {
    this.io.to(`user:${userId}`).emit('notification', notification)
  }

  // Get server statistics
  public getServerStats() {
    return {
      connectedClients: this.io.sockets.sockets.size,
      activeJobTrackers: this.progressIntervals.size,
      rooms: Array.from(this.io.sockets.adapter.rooms.keys())
    }
  }

  // Clean up resources
  public cleanup() {
    // Clear all intervals
    for (const interval of this.progressIntervals.values()) {
      clearInterval(interval)
    }
    this.progressIntervals.clear()

    // Close socket server
    this.io.close()
  }
}

// Singleton instance
let mediaProcessingSocket: MediaProcessingSocketServer | null = null

export function initializeMediaProcessingSocket(httpServer: HTTPServer): MediaProcessingSocketServer {
  if (!mediaProcessingSocket) {
    mediaProcessingSocket = new MediaProcessingSocketServer(httpServer)
  }
  return mediaProcessingSocket
}

export function getMediaProcessingSocket(): MediaProcessingSocketServer | null {
  return mediaProcessingSocket
}