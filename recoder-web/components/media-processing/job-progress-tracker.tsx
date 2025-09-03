'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  Play, 
  Pause, 
  Square, 
  Download, 
  Eye, 
  Trash2, 
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  FileVideo,
  FileAudio,
  FileImage,
  Zap,
  Activity,
  TrendingUp
} from 'lucide-react'
// import { useMediaProcessingSocket, JobProgress } from '@/hooks/useMediaProcessingSocket'

// Mock socket hook for now
const useMediaProcessingSocket = () => ({
  jobProgress: {} as any,
  isConnected: false,
  activeJobs: [] as JobProgress[],
  jobStatuses: new Map(),
  refreshActiveJobs: () => {},
  subscribeToJob: () => {},
  unsubscribeFromJob: () => {},
  hasActiveJobs: false
})

type JobProgress = {
  jobId: string
  status: string
  progress: number
  error?: string
  metadata?: {
    type?: string
    fileName?: string
    operation?: string
    fileSize?: number
    createdAt?: string
  }
  estimatedTimeRemaining?: number
  currentStep?: string
  outputUrl?: string
}
import { toast } from 'sonner'

interface JobProgressTrackerProps {
  className?: string
}

export function JobProgressTracker({ className }: JobProgressTrackerProps) {
  const [selectedTab, setSelectedTab] = useState('active')
  const [completedJobs, setCompletedJobs] = useState<JobProgress[]>([])

  const {
    isConnected,
    activeJobs,
    jobStatuses,
    refreshActiveJobs,
    subscribeToJob,
    unsubscribeFromJob,
    hasActiveJobs
  } = useMediaProcessingSocket({
    onJobProgress: (progress) => {
      // Optional: Add custom handling for progress updates
      console.log(`Job ${progress.jobId} progress: ${progress.progress}%`)
    },
    onJobComplete: (jobId, outputUrl) => {
      const job = jobStatuses[jobId]
      if (job) {
        setCompletedJobs(prev => [job, ...prev.slice(0, 19)]) // Keep last 20
        toast.success(`Processing completed: ${job.metadata?.fileName || 'File'}`, {
          action: outputUrl ? {
            label: 'Download',
            onClick: () => window.open(outputUrl, '_blank')
          } : undefined
        })
      }
    },
    onJobError: (jobId, error) => {
      const job = jobStatuses[jobId]
      toast.error(`Processing failed: ${job?.metadata?.fileName || jobId}`, {
        description: error
      })
    },
    onNotification: (notification) => {
      const toastFn = {
        success: toast.success,
        error: toast.error,
        info: toast.info,
        warning: toast.warning
      }[notification.type]

      toastFn(notification.title, {
        description: notification.message
      })
    }
  })

  const getJobIcon = (type: string) => {
    switch (type) {
      case 'video': return <FileVideo className="w-4 h-4" />
      case 'audio': return <FileAudio className="w-4 h-4" />
      case 'image': return <FileImage className="w-4 h-4" />
      default: return <FileVideo className="w-4 h-4" />
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="w-4 h-4 text-yellow-500" />
      case 'processing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'queued': return 'secondary' as const
      case 'processing': return 'default' as const
      case 'completed': return 'default' as const
      case 'failed': return 'destructive' as const
      default: return 'secondary' as const
    }
  }

  const formatTime = (seconds: number | null | undefined) => {
    if (!seconds) return 'Unknown'
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const JobCard = ({ job }: { job: JobProgress }) => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {getJobIcon(job.metadata?.type || 'video')}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {job.metadata?.fileName || `Job ${job.jobId.slice(0, 8)}`}
              </p>
              <p className="text-sm text-muted-foreground capitalize">
                {job.metadata?.operation || 'Processing'} • {job.metadata?.type || 'Video'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(job.status)}
            <Badge variant={getStatusBadgeVariant(job.status)}>
              {job.status}
            </Badge>
          </div>
        </div>

        {/* Progress Bar */}
        {job.status === 'processing' && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">{job.progress}%</span>
              {job.estimatedTimeRemaining && (
                <span className="text-sm text-muted-foreground">
                  {formatTime(job.estimatedTimeRemaining)} remaining
                </span>
              )}
            </div>
            <Progress value={job.progress} className="h-2" />
            {job.currentStep && (
              <p className="text-xs text-muted-foreground mt-1">
                {job.currentStep}
              </p>
            )}
          </div>
        )}

        {/* Job Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">File Size:</span>
            <span className="ml-2">
              {job.metadata?.fileSize ? formatFileSize(job.metadata.fileSize) : 'Unknown'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Created:</span>
            <span className="ml-2">
              {job.metadata?.createdAt 
                ? new Date(job.metadata.createdAt).toLocaleTimeString()
                : 'Unknown'
              }
            </span>
          </div>
        </div>

        {/* Error Display */}
        {job.status === 'failed' && job.error && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">{job.error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          {job.status === 'completed' && job.outputUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(job.outputUrl, '_blank')}
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </Button>
          )}
          
          {job.status === 'processing' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => unsubscribeFromJob(job.jobId)}
            >
              <Square className="w-4 h-4 mr-1" />
              Stop Tracking
            </Button>
          )}
          
          {(job.status === 'completed' || job.status === 'failed') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                // Remove from local state (in real app, this would call an API)
                toast.info('Job removed from list')
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Processing Jobs
            {hasActiveJobs && (
              <Badge variant="secondary" className="ml-2">
                {activeJobs.length} active
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshActiveJobs}
              disabled={!isConnected}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Active ({activeJobs.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed ({completedJobs.length})
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <ScrollArea className="h-96">
              {activeJobs.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No active processing jobs</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Jobs will appear here when you start processing files
                  </p>
                </div>
              ) : (
                <div>
                  {activeJobs.map(job => (
                    <JobCard key={job.jobId} job={job} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            <ScrollArea className="h-96">
              {completedJobs.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No completed jobs</p>
                </div>
              ) : (
                <div>
                  {completedJobs.map(job => (
                    <JobCard key={job.jobId} job={job} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="text-2xl font-bold">{activeJobs.length}</div>
                  <div className="text-sm text-muted-foreground">Active Jobs</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold">{completedJobs.length}</div>
                  <div className="text-sm text-muted-foreground">Completed Today</div>
                </Card>
              </div>
              
              <Card className="p-4">
                <h4 className="font-medium mb-2">Connection Status</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>WebSocket:</span>
                    <Badge variant={isConnected ? 'default' : 'destructive'}>
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Real-time Updates:</span>
                    <Badge variant={isConnected ? 'default' : 'secondary'}>
                      {isConnected ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}