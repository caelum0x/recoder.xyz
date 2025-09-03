'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useSession } from 'next-auth/react'

export interface JobProgress {
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

export interface BatchProgress {
  batchId: string
  userId: string
  totalFiles: number
  completedFiles: number
  failedFiles: number
  progress: number
  currentFile?: string
}

export interface ProcessingNotification {
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
  jobId?: string
  metadata?: Record<string, any>
}

interface UseMediaProcessingSocketOptions {
  autoConnect?: boolean
  onJobProgress?: (progress: JobProgress) => void
  onJobComplete?: (jobId: string, outputUrl?: string) => void
  onJobError?: (jobId: string, error: string) => void
  onBatchProgress?: (progress: BatchProgress) => void
  onNotification?: (notification: ProcessingNotification) => void
}

export function useMediaProcessingSocket(options: UseMediaProcessingSocketOptions = {}) {
  const { data: session } = useSession()
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [activeJobs, setActiveJobs] = useState<JobProgress[]>([])
  const [jobStatuses, setJobStatuses] = useState<Map<string, JobProgress>>(new Map())

  const {
    autoConnect = true,
    onJobProgress,
    onJobComplete,
    onJobError,
    onBatchProgress,
    onNotification
  } = options

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!session?.user?.id || socketRef.current?.connected) return

    const socket = io({
      path: '/socket.io/media-processing',
      autoConnect: false,
      transports: ['websocket', 'polling']
    })

    socketRef.current = socket

    // Connection handlers
    socket.on('connect', () => {
      console.log('Connected to media processing socket')
      setIsConnected(true)
      
      // Join user-specific room
      socket.emit('join-user-room', session.user.id)
      
      // Get active jobs on connection
      socket.emit('get-active-jobs', session.user.id)
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from media processing socket')
      setIsConnected(false)
    })

    // Job progress handlers
    socket.on('job-progress', (progress: JobProgress) => {
      setJobStatuses(prev => new Map(prev.set(progress.jobId, progress)))
      onJobProgress?.(progress)

      // Handle job completion
      if (progress.status === 'completed') {
        onJobComplete?.(progress.jobId, progress.outputUrl)
      } else if (progress.status === 'failed' && progress.error) {
        onJobError?.(progress.jobId, progress.error)
      }
    })

    socket.on('job-update', (update: Partial<JobProgress> & { jobId: string }) => {
      setJobStatuses(prev => {
        const existing = prev.get(update.jobId)
        if (existing) {
          const updated = { ...existing, ...update }
          return new Map(prev.set(update.jobId, updated))
        }
        return prev
      })
    })

    socket.on('job-status', (status: JobProgress) => {
      setJobStatuses(prev => new Map(prev.set(status.jobId, status)))
    })

    socket.on('job-error', (error: { jobId: string, error: string }) => {
      console.error(`Job ${error.jobId} error:`, error.error)
      onJobError?.(error.jobId, error.error)
    })

    // Active jobs handler
    socket.on('active-jobs', (jobs: JobProgress[]) => {
      setActiveJobs(jobs)
      const jobsMap = new Map()
      jobs.forEach(job => jobsMap.set(job.jobId, job))
      setJobStatuses(jobsMap)
    })

    // Batch progress handler
    socket.on('batch-update', (progress: BatchProgress) => {
      onBatchProgress?.(progress)
    })

    // Notification handler
    socket.on('notification', (notification: ProcessingNotification) => {
      onNotification?.(notification)
    })

    socket.connect()
  }, [session?.user?.id, onJobProgress, onJobComplete, onJobError, onBatchProgress, onNotification])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
      setActiveJobs([])
      setJobStatuses(new Map())
    }
  }, [])

  // Subscribe to specific job updates
  const subscribeToJob = useCallback((jobId: string) => {
    if (socketRef.current && session?.user?.id) {
      socketRef.current.emit('subscribe-job', {
        jobId,
        userId: session.user.id
      })
    }
  }, [session?.user?.id])

  // Unsubscribe from job updates
  const unsubscribeFromJob = useCallback((jobId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe-job', jobId)
      setJobStatuses(prev => {
        const updated = new Map(prev)
        updated.delete(jobId)
        return updated
      })
    }
  }, [])

  // Get current status of a job
  const getJobStatus = useCallback((jobId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('get-job-status', jobId)
    }
  }, [])

  // Refresh active jobs
  const refreshActiveJobs = useCallback(() => {
    if (socketRef.current && session?.user?.id) {
      socketRef.current.emit('get-active-jobs', session.user.id)
    }
  }, [session?.user?.id])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && session?.user?.id) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, session?.user?.id, connect, disconnect])

  return {
    // Connection state
    isConnected,
    socket: socketRef.current,
    
    // Data
    activeJobs,
    jobStatuses: Object.fromEntries(jobStatuses),
    
    // Methods
    connect,
    disconnect,
    subscribeToJob,
    unsubscribeFromJob,
    getJobStatus,
    refreshActiveJobs,
    
    // Helper methods
    getJobProgress: (jobId: string) => jobStatuses.get(jobId),
    isJobActive: (jobId: string) => {
      const job = jobStatuses.get(jobId)
      return job?.status === 'queued' || job?.status === 'processing'
    },
    hasActiveJobs: activeJobs.length > 0
  }
}