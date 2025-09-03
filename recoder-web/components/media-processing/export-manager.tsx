'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, ExternalLink, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface ProcessingJob {
  id: string
  operation: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  file: {
    filename: string
    originalName: string
  }
  outputFilePath?: string
  errorMessage?: string
  createdAt: string
  completedAt?: string
}

interface BatchJob {
  id: string
  name: string
  status: string
  progress: number
  totalFiles: number
  processedFiles: number
  activeJobs: number
  completedJobs: number
  failedJobs: number
}

interface ExportManagerProps {
  selectedFiles: string[]
  files: any[]
}

export function ExportManager({ selectedFiles, files }: ExportManagerProps) {
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([])
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([])
  const [activeTab, setActiveTab] = useState('jobs')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchJobs()
    // Set up polling for job updates
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchJobs = async () => {
    try {
      setIsLoading(true)
      
      // Fetch processing jobs
      const jobsResponse = await fetch('/api/media-processing/process')
      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json()
        setProcessingJobs(jobsData.jobs)
      }

      // Fetch batch jobs
      const batchResponse = await fetch('/api/media-processing/batch')
      if (batchResponse.ok) {
        const batchData = await batchResponse.json()
        setBatchJobs(batchData.batchJobs)
      }

    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const downloadFile = async (filePath: string, filename: string) => {
    try {
      const response = await fetch(`/api/media-processing/download?path=${encodeURIComponent(filePath)}`)
      if (!response.ok) {
        throw new Error('Download failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Downloaded ${filename}`)
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download file')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'processing':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default'
      case 'failed': return 'destructive'
      case 'processing': return 'secondary'
      default: return 'outline'
    }
  }

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime)
    const end = endTime ? new Date(endTime) : new Date()
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000)
    
    if (duration < 60) return `${duration}s`
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Export Manager</h2>
            <p className="text-sm text-muted-foreground">
              Monitor processing jobs and download completed files
            </p>
          </div>
          <Button onClick={fetchJobs} disabled={isLoading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="jobs">Processing Jobs</TabsTrigger>
          <TabsTrigger value="batches">Batch Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Individual Processing Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {processingJobs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No processing jobs found
                </p>
              ) : (
                <div className="space-y-4">
                  {processingJobs.map(job => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {getStatusIcon(job.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {job.file.originalName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {job.operation} • Started {formatDuration(job.createdAt)}
                            {job.completedAt && ` • Completed in ${formatDuration(job.createdAt, job.completedAt)}`}
                          </p>
                          {job.status === 'processing' && (
                            <Progress value={job.progress} className="mt-2 h-1" />
                          )}
                          {job.errorMessage && (
                            <p className="text-xs text-red-500 mt-1">{job.errorMessage}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusColor(job.status) as any}>
                          {job.status}
                        </Badge>
                        
                        {job.status === 'completed' && job.outputFilePath && (
                          <Button
                            size="sm"
                            onClick={() => downloadFile(job.outputFilePath!, `processed_${job.file.filename}`)}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Batch Processing Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {batchJobs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No batch jobs found
                </p>
              ) : (
                <div className="space-y-4">
                  {batchJobs.map(batch => (
                    <div
                      key={batch.id}
                      className="p-4 border rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{batch.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {batch.processedFiles}/{batch.totalFiles} files processed
                          </p>
                        </div>
                        <Badge variant={getStatusColor(batch.status) as any}>
                          {batch.status}
                        </Badge>
                      </div>

                      <Progress value={batch.progress} className="mb-3" />

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-medium text-blue-600">{batch.activeJobs}</p>
                          <p className="text-muted-foreground">Active</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-green-600">{batch.completedJobs}</p>
                          <p className="text-muted-foreground">Completed</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-red-600">{batch.failedJobs}</p>
                          <p className="text-muted-foreground">Failed</p>
                        </div>
                      </div>

                      {batch.status === 'completed' && (
                        <div className="mt-4 pt-4 border-t">
                          <Button className="w-full">
                            <Download className="w-4 h-4 mr-2" />
                            Download All Files
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {processingJobs.filter(j => j.status === 'processing').length}
            </p>
            <p className="text-sm text-muted-foreground">Active Jobs</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {processingJobs.filter(j => j.status === 'queued').length}
            </p>
            <p className="text-sm text-muted-foreground">Queued</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {processingJobs.filter(j => j.status === 'completed').length}
            </p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">
              {processingJobs.filter(j => j.status === 'failed').length}
            </p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
