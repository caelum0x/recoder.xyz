// Compilation job queue system for managing concurrent compilation requests
import { EventEmitter } from 'events';

export interface CompilationJob {
  id: string;
  userId: string;
  language: string;
  code: string;
  input?: string;
  options: CompilationJobOptions;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface CompilationJobOptions {
  timeout: number;
  memory: number;
  optimization: string;
  debug: boolean;
  libraries: string[];
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageWaitTime: number;
  averageExecutionTime: number;
}

export class CompilerQueue extends EventEmitter {
  private jobs: Map<string, CompilationJob> = new Map();
  private pendingQueue: CompilationJob[] = [];
  private runningJobs: Set<string> = new Set();
  private maxConcurrent: number;
  private processingInterval: NodeJS.Timeout | null = null;
  private stats: QueueStats;

  constructor(maxConcurrent = 5) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.stats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      totalProcessed: 0,
      averageWaitTime: 0,
      averageExecutionTime: 0,
    };
    
    this.startProcessing();
  }

  async addCompilationJob(jobData: {
    compilationId: string;
    userId: string;
    language: string;
    code: string;
    input?: string;
    options: CompilationJobOptions;
  }): Promise<string> {
    const job: CompilationJob = {
      id: jobData.compilationId,
      userId: jobData.userId,
      language: jobData.language,
      code: jobData.code,
      input: jobData.input,
      options: jobData.options,
      status: 'pending',
      priority: this.calculatePriority(jobData.userId, jobData.language),
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 2,
    };

    this.jobs.set(job.id, job);
    this.insertIntoQueue(job);
    this.stats.pending++;

    this.emit('jobAdded', job);
    
    return job.id;
  }

  private calculatePriority(userId: string, language: string): number {
    // Priority calculation (higher number = higher priority)
    let priority = 0;

    // Free tier users get lower priority
    const userTier = this.getUserTier(userId);
    switch (userTier) {
      case 'enterprise': priority += 100; break;
      case 'pro': priority += 50; break;
      case 'free': priority += 0; break;
    }

    // Some languages get higher priority (faster compilation)
    const fastLanguages = ['javascript', 'python', 'php', 'ruby'];
    if (fastLanguages.includes(language)) {
      priority += 10;
    }

    // Add some randomness to prevent starvation
    priority += Math.random() * 5;

    return priority;
  }

  private getUserTier(userId: string): 'free' | 'pro' | 'enterprise' {
    // In production, this would check the user's subscription
    return 'free'; // Default for now
  }

  private insertIntoQueue(job: CompilationJob): void {
    // Insert job in priority order
    let inserted = false;
    for (let i = 0; i < this.pendingQueue.length; i++) {
      if (job.priority > this.pendingQueue[i].priority) {
        this.pendingQueue.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      this.pendingQueue.push(job);
    }
  }

  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000); // Check every second
  }

  private async processQueue(): Promise<void> {
    // Start new jobs if we have capacity
    while (
      this.runningJobs.size < this.maxConcurrent && 
      this.pendingQueue.length > 0
    ) {
      const job = this.pendingQueue.shift()!;
      await this.startJob(job);
    }

    // Clean up old completed jobs
    this.cleanupOldJobs();
  }

  private async startJob(job: CompilationJob): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date();
    this.runningJobs.add(job.id);
    this.stats.pending--;
    this.stats.running++;

    this.emit('jobStarted', job);

    try {
      // Import DockerCompilerService dynamically to avoid circular dependencies
      const { DockerCompilerService } = await import('./docker-compiler');
      const compiler = new DockerCompilerService();

      // Execute the compilation
      const result = await compiler.compile({
        language: job.language,
        code: job.code,
        input: job.input || '',
        timeout: job.options.timeout,
        memory: job.options.memory,
        compilationId: job.id,
        userId: job.userId,
        optimization: job.options.optimization as "basic" | "none" | "aggressive" | undefined,
        debug: job.options.debug,
        libraries: job.options.libraries,
      });

      await this.completeJob(job, result);
    } catch (error) {
      await this.failJob(job, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async completeJob(job: CompilationJob, result: any): Promise<void> {
    job.status = 'completed';
    job.completedAt = new Date();
    job.result = result;
    
    this.runningJobs.delete(job.id);
    this.stats.running--;
    this.stats.completed++;
    this.stats.totalProcessed++;

    // Update average execution time
    const executionTime = job.completedAt.getTime() - (job.startedAt?.getTime() || job.createdAt.getTime());
    this.updateAverageExecutionTime(executionTime);

    this.emit('jobCompleted', job);
  }

  private async failJob(job: CompilationJob, error: string): Promise<void> {
    job.error = error;
    job.retryCount++;

    if (job.retryCount <= job.maxRetries) {
      // Retry the job
      job.status = 'pending';
      job.priority -= 10; // Lower priority for retries
      this.insertIntoQueue(job);
      this.stats.pending++;
      this.emit('jobRetry', job);
    } else {
      // Max retries reached, mark as failed
      job.status = 'failed';
      job.completedAt = new Date();
      this.stats.failed++;
      this.stats.totalProcessed++;
      this.emit('jobFailed', job);
    }

    this.runningJobs.delete(job.id);
    this.stats.running--;
  }

  private updateAverageExecutionTime(executionTime: number): void {
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalProcessed - 1);
    this.stats.averageExecutionTime = (totalTime + executionTime) / this.stats.totalProcessed;
  }

  private cleanupOldJobs(): void {
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt < cutoffTime
      ) {
        this.jobs.delete(jobId);
      }
    }
  }

  async getJobStatus(jobId: string): Promise<CompilationJob | null> {
    return this.jobs.get(jobId) || null;
  }

  getQueueStats(): QueueStats {
    return { ...this.stats };
  }

  getUserJobStats(userId: string): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const userJobs = Array.from(this.jobs.values()).filter(job => job.userId === userId);
    
    return {
      pending: userJobs.filter(job => job.status === 'pending').length,
      running: userJobs.filter(job => job.status === 'running').length,
      completed: userJobs.filter(job => job.status === 'completed').length,
      failed: userJobs.filter(job => job.status === 'failed').length,
    };
  }

  // Cancel a job
  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    
    if (!job || job.userId !== userId) {
      return false;
    }

    if (job.status === 'pending') {
      // Remove from queue
      const index = this.pendingQueue.findIndex(j => j.id === jobId);
      if (index !== -1) {
        this.pendingQueue.splice(index, 1);
        this.stats.pending--;
      }
    } else if (job.status === 'running') {
      // Kill running job (implementation depends on Docker container management)
      this.runningJobs.delete(jobId);
      this.stats.running--;
    } else {
      return false; // Can't cancel completed/failed jobs
    }

    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = new Date();
    
    this.emit('jobCancelled', job);
    return true;
  }

  // Get user's recent jobs
  getUserRecentJobs(userId: string, limit = 10): CompilationJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Pause/resume processing
  pauseProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  resumeProcessing(): void {
    if (!this.processingInterval) {
      this.startProcessing();
    }
  }

  // Update concurrent limit
  setMaxConcurrent(limit: number): void {
    this.maxConcurrent = Math.max(1, Math.min(50, limit)); // Between 1 and 50
  }

  // Shutdown gracefully
  async shutdown(): Promise<void> {
    this.pauseProcessing();
    
    // Wait for running jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.runningJobs.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.emit('shutdown');
  }
}

// Singleton instance
let compilerQueue: CompilerQueue | null = null;

export function createCompilerQueue(): CompilerQueue {
  if (!compilerQueue) {
    compilerQueue = new CompilerQueue(5); // Default 5 concurrent jobs
  }
  return compilerQueue;
}

export function getCompilerQueue(): CompilerQueue | null {
  return compilerQueue;
}

export default CompilerQueue;