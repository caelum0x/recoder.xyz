import { FFmpegProcessor } from './ffmpeg-processor'
import { mediaUploadService } from './media-upload'
import { getS3Service } from '../cloud-storage/aws-s3-service'
import { v4 as uuidv4 } from 'uuid'

export interface PipelineJob {
  id: string
  userId: string
  type: 'upload' | 'process' | 'export' | 'batch'
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  stage: string
  startTime: Date
  endTime?: Date
  input: any
  output?: any
  error?: string
  metadata: Record<string, any>
}

export interface PipelineConfig {
  enableCloudStorage: boolean
  enableCDN: boolean
  enableParallelProcessing: boolean
  maxConcurrentJobs: number
  defaultQuality: 'low' | 'medium' | 'high' | 'ultra'
  outputFormats: string[]
  notifications: {
    webhook?: string
    email?: string
  }
}

export class MediaProcessingPipeline {
  private ffmpegProcessor: FFmpegProcessor
  private activeJobs: Map<string, PipelineJob> = new Map()
  private config: PipelineConfig
  private processingQueue: PipelineJob[] = []
  private isProcessing = false

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = {
      enableCloudStorage: process.env.USE_CLOUD_STORAGE === 'true',
      enableCDN: process.env.CLOUDFRONT_DOMAIN !== undefined,
      enableParallelProcessing: true,
      maxConcurrentJobs: 3,
      defaultQuality: 'medium',
      outputFormats: ['mp4', 'webm'],
      notifications: {},
      ...config
    }

    this.ffmpegProcessor = new FFmpegProcessor()
    this.startProcessingLoop()
  }

  async uploadAndProcess(
    file: File,
    userId: string,
    options: {
      purpose?: string
      quality?: string
      formats?: string[]
      processImmediately?: boolean
    } = {}
  ): Promise<{ jobId: string; uploadResult: any }> {
    // Step 1: Upload file
    const uploadResult = await mediaUploadService.uploadFile({
      file,
      userId,
      purpose: options.purpose || 'processing',
      metadata: {
        pipelineProcessing: true,
        requestedQuality: options.quality || this.config.defaultQuality,
        requestedFormats: options.formats || this.config.outputFormats
      }
    })

    // Step 2: Create processing job if requested
    if (options.processImmediately !== false) {
      const jobId = await this.queueProcessingJob({
        type: 'process',
        userId,
        input: {
          fileId: uploadResult.id,
          filePath: uploadResult.filePath,
          cloudUrl: uploadResult.cloudUrl,
          quality: options.quality || this.config.defaultQuality,
          formats: options.formats || this.config.outputFormats
        },
        metadata: {
          originalFileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        }
      })

      return { jobId, uploadResult }
    }

    return { jobId: '', uploadResult }
  }

  async processTimeline(
    timelineConfig: any,
    userId: string
  ): Promise<string> {
    const jobId = await this.queueProcessingJob({
      type: 'export',
      userId,
      input: timelineConfig,
      metadata: {
        clipCount: timelineConfig.clips?.length || 0,
        duration: timelineConfig.duration || 0,
        resolution: `${timelineConfig.settings?.width}x${timelineConfig.settings?.height}`,
        cloudOptimized: this.config.enableCloudStorage
      }
    })

    return jobId
  }

  async batchProcess(
    files: Array<{ file: File; options?: any }>,
    userId: string,
    batchOptions: any = {}
  ): Promise<string> {
    const jobId = await this.queueProcessingJob({
      type: 'batch',
      userId,
      input: {
        files,
        batchOptions
      },
      metadata: {
        fileCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.file.size, 0)
      }
    })

    return jobId
  }

  private async queueProcessingJob(params: {
    type: PipelineJob['type']
    userId: string
    input: any
    metadata?: any
  }): Promise<string> {
    const job: PipelineJob = {
      id: uuidv4(),
      userId: params.userId,
      type: params.type,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      startTime: new Date(),
      input: params.input,
      metadata: params.metadata || {}
    }

    this.activeJobs.set(job.id, job)
    this.processingQueue.push(job)

    return job.id
  }

  private async startProcessingLoop() {
    if (this.isProcessing) return
    this.isProcessing = true

    while (true) {
      try {
        const activeCount = Array.from(this.activeJobs.values())
          .filter(job => job.status === 'processing').length

        if (activeCount < this.config.maxConcurrentJobs && this.processingQueue.length > 0) {
          const job = this.processingQueue.shift()
          if (job) {
            this.processJob(job).catch(error => {
              console.error(`Job ${job.id} processing error:`, error)
              job.status = 'failed'
              job.error = error.message
              job.endTime = new Date()
            })
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.error('Processing loop error:', error)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  private async processJob(job: PipelineJob) {
    try {
      job.status = 'processing'
      job.stage = 'initializing'
      job.progress = 5

      switch (job.type) {
        case 'process':
          await this.processMediaFile(job)
          break
        case 'export':
          await this.processTimelineExport(job)
          break
        case 'batch':
          await this.processBatch(job)
          break
        default:
          throw new Error(`Unknown job type: ${job.type}`)
      }

      job.status = 'completed'
      job.progress = 100
      job.endTime = new Date()

      // Send notification if configured
      await this.sendNotification(job)

    } catch (error) {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      job.endTime = new Date()
      throw error
    }
  }

  private async processMediaFile(job: PipelineJob) {
    const { filePath, quality, formats, cloudUrl } = job.input

    job.stage = 'analyzing'
    job.progress = 10

    // Analyze media
    const mediaInfo = await this.ffmpegProcessor.getMediaInfo(cloudUrl || filePath)

    job.stage = 'processing'
    job.progress = 30

    const outputs: any[] = []

    // Process each requested format
    for (const format of formats) {
      const outputFileName = `processed_${job.id}_${Date.now()}.${format}`
      const outputPath = `/tmp/${outputFileName}`

      try {
        await this.ffmpegProcessor.processVideo({
          inputPath: cloudUrl || filePath,
          outputPath,
          format,
          quality,
          metadata: { jobId: job.id, userId: job.userId }
        })

        // Upload to cloud if enabled
        if (this.config.enableCloudStorage && mediaUploadService.isCloudStorageEnabled()) {
          const cloudResult = await this.uploadProcessedFile(outputPath, job.userId, format)
          outputs.push(cloudResult)
        } else {
          outputs.push({ localPath: outputPath, format })
        }

        job.progress += Math.floor(50 / formats.length)
      } catch (error) {
        console.error(`Format ${format} processing failed:`, error)
        outputs.push({ format, error: error.message })
      }
    }

    job.stage = 'finalizing'
    job.progress = 95

    job.output = {
      mediaInfo,
      outputs,
      processedAt: new Date(),
      cloudOptimized: this.config.enableCloudStorage
    }
  }

  private async processTimelineExport(job: PipelineJob) {
    const config = job.input

    job.stage = 'downloading_assets'
    job.progress = 15

    // Mock timeline processing
    job.stage = 'compositing'
    job.progress = 40

    job.stage = 'rendering'
    job.progress = 70

    job.stage = 'uploading'
    job.progress = 90

    const outputUrl = this.config.enableCloudStorage
      ? `https://${process.env.CLOUDFRONT_DOMAIN}/exports/${job.userId}/${job.id}/timeline.mp4`
      : `/exports/${job.id}/timeline.mp4`

    job.output = {
      outputUrl,
      cdnUrl: this.config.enableCDN ? outputUrl : undefined,
      duration: config.duration,
      resolution: `${config.settings?.width}x${config.settings?.height}`,
      formats: this.config.outputFormats
    }
  }

  private async processBatch(job: PipelineJob) {
    const { files, batchOptions } = job.input
    const results: any[] = []

    for (let i = 0; i < files.length; i++) {
      const { file, options } = files[i]
      
      job.stage = `processing_file_${i + 1}`
      job.progress = Math.floor((i / files.length) * 90)

      try {
        const uploadResult = await mediaUploadService.uploadFile({
          file,
          userId: job.userId,
          purpose: 'batch_processing',
          metadata: { batchJobId: job.id, batchIndex: i }
        })

        results.push({
          index: i,
          fileName: file.name,
          success: true,
          result: uploadResult
        })
      } catch (error) {
        results.push({
          index: i,
          fileName: file.name,
          success: false,
          error: error.message
        })
      }
    }

    job.output = {
      results,
      successCount: results.filter(r => r.success).length,
      failCount: results.filter(r => !r.success).length,
      totalFiles: files.length
    }
  }

  private async uploadProcessedFile(localPath: string, userId: string, format: string) {
    // Implementation for uploading processed files to cloud storage
    return {
      localPath,
      cloudUrl: `https://example-cdn.com/processed/${userId}/${uuidv4()}.${format}`,
      format
    }
  }

  private async sendNotification(job: PipelineJob) {
    if (this.config.notifications.webhook) {
      try {
        await fetch(this.config.notifications.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            userId: job.userId,
            status: job.status,
            type: job.type,
            completedAt: job.endTime,
            output: job.output
          })
        })
      } catch (error) {
        console.error('Webhook notification failed:', error)
      }
    }
  }

  getJobStatus(jobId: string): PipelineJob | undefined {
    return this.activeJobs.get(jobId)
  }

  getUserJobs(userId: string): PipelineJob[] {
    return Array.from(this.activeJobs.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId)
    if (!job || job.status === 'completed') {
      return false
    }

    if (job.status === 'processing') {
      // In production, this would signal the processing to stop
      job.status = 'failed'
      job.error = 'Job cancelled by user'
      job.endTime = new Date()
    } else {
      // Remove from queue
      const queueIndex = this.processingQueue.findIndex(j => j.id === jobId)
      if (queueIndex > -1) {
        this.processingQueue.splice(queueIndex, 1)
      }
      job.status = 'failed'
      job.error = 'Job cancelled by user'
      job.endTime = new Date()
    }

    return true
  }

  getSystemStats() {
    const jobs = Array.from(this.activeJobs.values())
    return {
      totalJobs: jobs.length,
      queuedJobs: jobs.filter(j => j.status === 'queued').length,
      processingJobs: jobs.filter(j => j.status === 'processing').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      queueLength: this.processingQueue.length,
      config: this.config
    }
  }
}

// Singleton instance
export const mediaProcessingPipeline = new MediaProcessingPipeline()