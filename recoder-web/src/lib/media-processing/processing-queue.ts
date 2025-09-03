export interface ProcessingJob {
  id: string;
  type: 'video' | 'audio' | 'image' | 'batch';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  inputPath: string;
  outputPath?: string;
  operation: string;
  parameters: Record<string, any>;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: number;
  error?: string;
  metadata?: Record<string, any>;
}

export class ProcessingQueue {
  private jobs: Map<string, ProcessingJob> = new Map();
  private processingJobs: Set<string> = new Set();
  private maxConcurrency: number = 3;

  async addJob(job: Omit<ProcessingJob, 'id' | 'status' | 'createdAt' | 'progress'>): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const processingJob: ProcessingJob = {
      ...job,
      id: jobId,
      status: 'queued',
      createdAt: new Date(),
      progress: 0
    };

    this.jobs.set(jobId, processingJob);
    
    // Start processing if under concurrency limit
    if (this.processingJobs.size < this.maxConcurrency) {
      this.processNext();
    }

    return jobId;
  }

  async getJob(jobId: string): Promise<ProcessingJob | undefined> {
    return this.jobs.get(jobId);
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
      this.jobs.set(jobId, job);
    }
  }

  async completeJob(jobId: string, outputPath: string, metadata?: Record<string, any>): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.completedAt = new Date();
      job.outputPath = outputPath;
      job.progress = 100;
      job.metadata = metadata;
      this.jobs.set(jobId, job);
      this.processingJobs.delete(jobId);
      
      // Process next job
      this.processNext();
    }
  }

  async failJob(jobId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error;
      this.jobs.set(jobId, job);
      this.processingJobs.delete(jobId);
      
      // Process next job
      this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.processingJobs.size >= this.maxConcurrency) {
      return;
    }

    // Find next queued job with highest priority
    const queuedJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'queued')
      .sort((a, b) => b.priority - a.priority);

    if (queuedJobs.length === 0) {
      return;
    }

    const nextJob = queuedJobs[0];
    nextJob.status = 'processing';
    nextJob.startedAt = new Date();
    this.processingJobs.add(nextJob.id);
    this.jobs.set(nextJob.id, nextJob);

    // In a real implementation, this would trigger the actual processing
    console.log(`Started processing job: ${nextJob.id}`);
  }

  async getQueueStatus(): Promise<{
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const jobs = Array.from(this.jobs.values());
    
    return {
      queued: jobs.filter(j => j.status === 'queued').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      total: jobs.length
    };
  }

  async getAllJobs(status?: string): Promise<ProcessingJob[]> {
    const jobs = Array.from(this.jobs.values());
    
    if (status) {
      return jobs.filter(job => job.status === status);
    }
    
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

// Singleton instance
export const processingQueue = new ProcessingQueue();
