import { ProcessingJob, processingQueue } from './processing-queue';
import { FFmpegProcessor } from './ffmpeg-processor';

export interface BatchJob {
  id: string;
  name: string;
  description?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  files: string[];
  operation: string;
  parameters: Record<string, any>;
  progress: number;
  processedFiles: number;
  totalFiles: number;
  individualJobs: string[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  userId: string;
}

export class BatchProcessor {
  private batchJobs: Map<string, BatchJob> = new Map();
  private ffmpegProcessor: FFmpegProcessor;

  constructor() {
    this.ffmpegProcessor = new FFmpegProcessor();
  }

  async createBatchJob(jobData: {
    name: string;
    description?: string;
    files: string[];
    operation: string;
    parameters: Record<string, any>;
    userId: string;
  }): Promise<string> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const batchJob: BatchJob = {
      id: batchId,
      name: jobData.name,
      description: jobData.description,
      status: 'queued',
      files: jobData.files,
      operation: jobData.operation,
      parameters: jobData.parameters,
      progress: 0,
      processedFiles: 0,
      totalFiles: jobData.files.length,
      individualJobs: [],
      createdAt: new Date(),
      userId: jobData.userId
    };

    this.batchJobs.set(batchId, batchJob);
    
    // Start processing the batch
    this.processBatch(batchId);
    
    return batchId;
  }

  async getBatchJob(batchId: string): Promise<BatchJob | undefined> {
    return this.batchJobs.get(batchId);
  }

  async getAllBatchJobs(userId: string): Promise<BatchJob[]> {
    return Array.from(this.batchJobs.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async cancelBatchJob(batchId: string): Promise<boolean> {
    const batchJob = this.batchJobs.get(batchId);
    if (!batchJob || batchJob.status === 'completed' || batchJob.status === 'cancelled') {
      return false;
    }

    batchJob.status = 'cancelled';
    batchJob.completedAt = new Date();
    this.batchJobs.set(batchId, batchJob);

    // Cancel individual jobs that are still queued/processing
    for (const jobId of batchJob.individualJobs) {
      const job = await processingQueue.getJob(jobId);
      if (job && (job.status === 'queued' || job.status === 'processing')) {
        await processingQueue.failJob(jobId, 'Batch job cancelled');
      }
    }

    return true;
  }

  private async processBatch(batchId: string): Promise<void> {
    const batchJob = this.batchJobs.get(batchId);
    if (!batchJob) return;

    try {
      batchJob.status = 'processing';
      batchJob.startedAt = new Date();
      this.batchJobs.set(batchId, batchJob);

      // Create individual processing jobs for each file
      for (let i = 0; i < batchJob.files.length; i++) {
        const file = batchJob.files[i];
        const outputPath = this.generateOutputPath(file, batchJob.operation, batchJob.parameters);
        
        const jobId = await processingQueue.addJob({
          type: this.getJobType(batchJob.operation),
          inputPath: file,
          outputPath,
          operation: batchJob.operation,
          parameters: {
            ...batchJob.parameters,
            batchId,
            fileIndex: i
          },
          priority: 5 // Normal priority for batch jobs
        });

        batchJob.individualJobs.push(jobId);
      }

      this.batchJobs.set(batchId, batchJob);

      // Monitor individual job progress
      this.monitorBatchProgress(batchId);

    } catch (error) {
      batchJob.status = 'failed';
      batchJob.error = error instanceof Error ? error.message : 'Unknown error';
      batchJob.completedAt = new Date();
      this.batchJobs.set(batchId, batchJob);
    }
  }

  private async monitorBatchProgress(batchId: string): Promise<void> {
    const interval = setInterval(async () => {
      const batchJob = this.batchJobs.get(batchId);
      if (!batchJob || batchJob.status === 'completed' || batchJob.status === 'failed' || batchJob.status === 'cancelled') {
        clearInterval(interval);
        return;
      }

      let completedJobs = 0;
      let failedJobs = 0;
      let totalProgress = 0;

      // Check status of all individual jobs
      for (const jobId of batchJob.individualJobs) {
        const job = await processingQueue.getJob(jobId);
        if (job) {
          if (job.status === 'completed') {
            completedJobs++;
            totalProgress += 100;
          } else if (job.status === 'failed') {
            failedJobs++;
            totalProgress += 0;
          } else {
            totalProgress += job.progress;
          }
        }
      }

      // Update batch job progress
      batchJob.processedFiles = completedJobs;
      batchJob.progress = Math.round(totalProgress / batchJob.totalFiles);

      // Check if batch is complete
      if (completedJobs + failedJobs === batchJob.totalFiles) {
        if (failedJobs === 0) {
          batchJob.status = 'completed';
        } else if (completedJobs === 0) {
          batchJob.status = 'failed';
          batchJob.error = `All ${failedJobs} files failed to process`;
        } else {
          batchJob.status = 'completed';
          batchJob.error = `${failedJobs} files failed to process, ${completedJobs} completed`;
        }
        batchJob.completedAt = new Date();
        clearInterval(interval);
      }

      this.batchJobs.set(batchId, batchJob);
    }, 2000); // Check every 2 seconds
  }

  private generateOutputPath(inputPath: string, operation: string, parameters: Record<string, any>): string {
    const pathParts = inputPath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const nameWithoutExt = fileName.split('.')[0];
    const ext = parameters.format || 'mp4';
    
    const outputDir = pathParts.slice(0, -1).join('/') + '/processed';
    return `${outputDir}/${nameWithoutExt}_${operation}.${ext}`;
  }

  private getJobType(operation: string): 'video' | 'audio' | 'image' | 'batch' {
    if (operation.includes('video') || operation.includes('mp4') || operation.includes('avi')) {
      return 'video';
    } else if (operation.includes('audio') || operation.includes('mp3') || operation.includes('wav')) {
      return 'audio';
    } else if (operation.includes('image') || operation.includes('jpg') || operation.includes('png')) {
      return 'image';
    }
    return 'batch';
  }

  // Predefined batch operations
  async createVideoCompressionBatch(files: string[], quality: 'low' | 'medium' | 'high' | 'lossless', userId: string): Promise<string> {
    const qualitySettings = {
      low: { crf: 28, preset: 'fast' },
      medium: { crf: 23, preset: 'medium' },
      high: { crf: 18, preset: 'slow' },
      lossless: { crf: 0, preset: 'veryslow' }
    };

    return this.createBatchJob({
      name: `Video Compression - ${quality}`,
      description: `Compress ${files.length} videos with ${quality} quality`,
      files,
      operation: 'compress_video',
      parameters: {
        format: 'mp4',
        ...qualitySettings[quality]
      },
      userId
    });
  }

  async createFormatConversionBatch(files: string[], targetFormat: string, userId: string): Promise<string> {
    return this.createBatchJob({
      name: `Format Conversion to ${targetFormat.toUpperCase()}`,
      description: `Convert ${files.length} files to ${targetFormat}`,
      files,
      operation: 'convert_format',
      parameters: {
        format: targetFormat
      },
      userId
    });
  }

  async createThumbnailGenerationBatch(files: string[], userId: string): Promise<string> {
    return this.createBatchJob({
      name: 'Thumbnail Generation',
      description: `Generate thumbnails for ${files.length} videos`,
      files,
      operation: 'generate_thumbnail',
      parameters: {
        format: 'jpg',
        width: 1280,
        height: 720,
        time: '00:00:05'
      },
      userId
    });
  }

  async createWatermarkBatch(files: string[], watermarkText: string, position: string, userId: string): Promise<string> {
    return this.createBatchJob({
      name: 'Add Watermarks',
      description: `Add watermark to ${files.length} files`,
      files,
      operation: 'add_watermark',
      parameters: {
        watermarkText,
        position,
        fontSize: 24,
        fontColor: 'white',
        opacity: 0.8
      },
      userId
    });
  }

  async getBatchJobDetails(batchId: string): Promise<{
    batchJob: BatchJob;
    individualJobs: ProcessingJob[];
  } | undefined> {
    const batchJob = this.batchJobs.get(batchId);
    if (!batchJob) return undefined;

    const individualJobs: ProcessingJob[] = [];
    for (const jobId of batchJob.individualJobs) {
      const job = await processingQueue.getJob(jobId);
      if (job) {
        individualJobs.push(job);
      }
    }

    return {
      batchJob,
      individualJobs
    };
  }
}

// Singleton instance
export const batchProcessor = new BatchProcessor();
