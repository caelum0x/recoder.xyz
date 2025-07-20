interface QueueConfig {
  provider: 'redis' | 'rabbitmq' | 'sqs' | 'in-memory';
  connection: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    database?: number;
    region?: string; // for SQS
    vhost?: string; // for RabbitMQ
  };
  defaultQueue: string;
  concurrency: number;
  retries: {
    maxAttempts: number;
    backoff: 'fixed' | 'exponential' | 'linear';
    delay: number; // milliseconds
    maxDelay: number;
  };
  deadLetterQueue: {
    enabled: boolean;
    name: string;
    maxRetries: number;
  };
  priority: {
    enabled: boolean;
    levels: number;
    default: number;
  };
  batching: {
    enabled: boolean;
    maxSize: number;
    maxWait: number; // milliseconds
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // seconds
    alerts: {
      queueSize: number;
      processingTime: number; // milliseconds
      failureRate: number; // percentage
    };
  };
}

interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  delay: number;
  processAfter: Date;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: any;
  progress: number;
  metadata: {
    source?: string;
    userId?: string;
    sessionId?: string;
    tags?: string[];
    timeout?: number;
  };
  options: {
    removeOnComplete?: boolean;
    removeOnFail?: boolean;
    jobId?: string;
    repeat?: {
      cron?: string;
      every?: number;
      limit?: number;
    };
  };
}

interface JobProcessor<T = any> {
  type: string;
  handler: (job: Job<T>) => Promise<any>;
  concurrency: number;
  retries: number;
  timeout: number; // milliseconds
  middleware: Array<{
    name: string;
    before?: (job: Job<T>) => Promise<void>;
    after?: (job: Job<T>, result: any) => Promise<void>;
    error?: (job: Job<T>, error: Error) => Promise<void>;
  }>;
}

interface QueueMetrics {
  timestamp: Date;
  queues: Array<{
    name: string;
    size: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }>;
  jobs: {
    total: number;
    completed: number;
    failed: number;
    waiting: number;
    active: number;
    delayed: number;
    stuck: number;
  };
  performance: {
    throughput: number; // jobs per second
    averageProcessingTime: number; // milliseconds
    p95ProcessingTime: number;
    p99ProcessingTime: number;
    successRate: number; // percentage
  };
  workers: {
    total: number;
    active: number;
    idle: number;
    utilization: number; // percentage
  };
  memory: {
    used: number; // bytes
    peak: number;
    utilization: number; // percentage
  };
}

interface WorkerNode {
  id: string;
  host: string;
  port: number;
  status: 'active' | 'idle' | 'busy' | 'failed' | 'maintenance';
  capacity: number;
  currentLoad: number;
  queues: string[];
  lastHeartbeat: Date;
  startedAt: Date;
  processedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  memory: {
    used: number;
    total: number;
    utilization: number;
  };
  cpu: {
    usage: number;
    load: number[];
  };
}

interface Scheduler {
  id: string;
  name: string;
  schedule: string; // cron expression
  jobType: string;
  jobData: any;
  enabled: boolean;
  timezone: string;
  nextRun: Date;
  lastRun?: Date;
  runCount: number;
  maxRuns?: number;
  errorCount: number;
  maxErrors?: number;
  metadata: {
    description?: string;
    tags?: string[];
    owner?: string;
  };
}

export class QueueSystem {
  private config: QueueConfig;
  private queues: Map<string, any> = new Map();
  private processors: Map<string, JobProcessor> = new Map();
  private workers: Map<string, WorkerNode> = new Map();
  private schedulers: Map<string, Scheduler> = new Map();
  private metrics: QueueMetrics[] = [];
  private client: any;
  private isConnected: boolean = false;

  constructor(config: QueueConfig) {
    this.config = config;
    this.initializeConnection();
    this.initializeWorkerManagement();
    this.initializeMetricsCollection();
  }

  async addJob<T>(
    queueName: string,
    jobType: string,
    data: T,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
      timeout?: number;
      removeOnComplete?: boolean;
      removeOnFail?: boolean;
      jobId?: string;
      repeat?: {
        cron?: string;
        every?: number;
        limit?: number;
      };
      metadata?: Record<string, any>;
    }
  ): Promise<Job<T>> {
    const job: Job<T> = {
      id: options?.jobId || this.generateJobId(),
      type: jobType,
      data,
      priority: options?.priority || this.config.priority.default,
      attempts: 0,
      maxAttempts: options?.attempts || this.config.retries.maxAttempts,
      delay: options?.delay || 0,
      processAfter: new Date(Date.now() + (options?.delay || 0)),
      createdAt: new Date(),
      progress: 0,
      metadata: {
        timeout: options?.timeout,
        ...options?.metadata
      },
      options: {
        removeOnComplete: options?.removeOnComplete ?? true,
        removeOnFail: options?.removeOnFail ?? false,
        jobId: options?.jobId,
        repeat: options?.repeat
      }
    };

    // Add to queue
    await this.enqueueJob(queueName, job);

    // Schedule repeated job if configured
    if (options?.repeat) {
      await this.scheduleRepeatedJob(job);
    }

    return job;
  }

  async registerProcessor<T>(processor: JobProcessor<T>): Promise<void> {
    this.processors.set(processor.type, processor);
    
    // Start processing jobs of this type
    await this.startProcessing(processor);
  }

  async createQueue(name: string, options?: {
    priority?: boolean;
    delayed?: boolean;
    maxConcurrency?: number;
    rateLimiter?: {
      max: number;
      duration: number;
    };
  }): Promise<void> {
    const queue = await this.initializeQueue(name, options);
    this.queues.set(name, queue);
  }

  async pauseQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.pause();
    }
  }

  async resumeQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.resume();
    }
  }

  async purgeQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.empty();
    }
  }

  async getJob(jobId: string): Promise<Job | null> {
    // Search across all queues
    for (const [queueName, queue] of this.queues.entries()) {
      const job = await this.findJobInQueue(queue, jobId);
      if (job) {
        return job;
      }
    }
    return null;
  }

  async retryJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (job && job.failedAt) {
      job.attempts = 0;
      job.failedAt = undefined;
      job.error = undefined;
      job.processAfter = new Date();
      
      await this.updateJob(job);
      return true;
    }
    return false;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (job) {
      await this.removeJobFromQueue(job);
      return true;
    }
    return false;
  }

  async getQueueStatus(name: string): Promise<{
    name: string;
    size: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
    processing: Job[];
    failed: Job[];
  } | null> {
    const queue = this.queues.get(name);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.getJobCounts(queue, 'waiting'),
      this.getJobCounts(queue, 'active'),
      this.getJobCounts(queue, 'completed'),
      this.getJobCounts(queue, 'failed'),
      this.getJobCounts(queue, 'delayed')
    ]);

    const processing = await this.getActiveJobs(queue);
    const failedJobs = await this.getFailedJobs(queue);

    return {
      name,
      size: waiting + active + delayed,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: await this.isQueuePaused(queue),
      processing,
      failed: failedJobs
    };
  }

  async addWorker(worker: Omit<WorkerNode, 'id' | 'startedAt' | 'processedJobs' | 'failedJobs' | 'averageProcessingTime'>): Promise<WorkerNode> {
    const workerNode: WorkerNode = {
      ...worker,
      id: this.generateWorkerId(),
      startedAt: new Date(),
      processedJobs: 0,
      failedJobs: 0,
      averageProcessingTime: 0
    };

    this.workers.set(workerNode.id, workerNode);
    
    // Start health monitoring for this worker
    this.startWorkerHealthMonitoring(workerNode);

    return workerNode;
  }

  async removeWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      // Gracefully drain worker
      worker.status = 'maintenance';
      await this.drainWorker(workerId);
      this.workers.delete(workerId);
    }
  }

  async scaleWorkers(targetCount: number): Promise<void> {
    const currentCount = this.workers.size;
    
    if (targetCount > currentCount) {
      // Scale up
      const workersToAdd = targetCount - currentCount;
      for (let i = 0; i < workersToAdd; i++) {
        await this.addWorker({
          host: `worker-${Date.now()}-${i}`,
          port: 3000 + i,
          status: 'idle',
          capacity: this.config.concurrency,
          currentLoad: 0,
          queues: [this.config.defaultQueue],
          lastHeartbeat: new Date(),
          memory: { used: 0, total: 1024 * 1024 * 1024, utilization: 0 },
          cpu: { usage: 0, load: [0, 0, 0] }
        });
      }
    } else if (targetCount < currentCount) {
      // Scale down
      const workersToRemove = currentCount - targetCount;
      const workerIds = Array.from(this.workers.keys()).slice(0, workersToRemove);
      
      for (const workerId of workerIds) {
        await this.removeWorker(workerId);
      }
    }
  }

  async addScheduler(scheduler: Omit<Scheduler, 'id' | 'nextRun' | 'runCount' | 'errorCount'>): Promise<Scheduler> {
    const newScheduler: Scheduler = {
      ...scheduler,
      id: this.generateSchedulerId(),
      nextRun: this.calculateNextRun(scheduler.schedule, scheduler.timezone),
      runCount: 0,
      errorCount: 0
    };

    this.schedulers.set(newScheduler.id, newScheduler);
    this.scheduleJob(newScheduler);

    return newScheduler;
  }

  async removeScheduler(schedulerId: string): Promise<void> {
    const scheduler = this.schedulers.get(schedulerId);
    if (scheduler) {
      this.schedulers.delete(schedulerId);
      // Cancel any pending scheduled jobs
      await this.cancelScheduledJob(scheduler);
    }
  }

  async getMetrics(timeRange?: { start: Date; end: Date }): Promise<{
    current: QueueMetrics;
    historical: QueueMetrics[];
    summary: {
      totalJobs: number;
      successRate: number;
      averageThroughput: number;
      averageProcessingTime: number;
      queueHealth: number;
    };
    queues: Array<{
      name: string;
      health: number;
      performance: number;
      utilization: number;
    }>;
    workers: Array<{
      id: string;
      efficiency: number;
      utilization: number;
      health: number;
    }>;
  }> {
    const current = await this.getCurrentMetrics();
    
    let historical = this.metrics;
    if (timeRange) {
      historical = this.metrics.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const summary = {
      totalJobs: historical.reduce((sum, m) => sum + m.jobs.total, 0),
      successRate: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.performance.successRate, 0) / historical.length : 0,
      averageThroughput: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.performance.throughput, 0) / historical.length : 0,
      averageProcessingTime: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.performance.averageProcessingTime, 0) / historical.length : 0,
      queueHealth: await this.calculateOverallQueueHealth()
    };

    const queues = await this.getQueueHealthMetrics();
    const workers = await this.getWorkerEfficiencyMetrics();

    return { current, historical, summary, queues, workers };
  }

  async optimizeQueues(): Promise<{
    recommendations: Array<{
      type: 'scale-workers' | 'adjust-concurrency' | 'redistribute-load' | 'add-capacity' | 'optimize-priority';
      target: string;
      reason: string;
      impact: 'high' | 'medium' | 'low';
      action: string;
    }>;
    applied: boolean;
    improvements: {
      expectedThroughputIncrease: number;
      expectedLatencyReduction: number;
      resourceOptimization: number;
    };
  }> {
    const metrics = await this.getCurrentMetrics();
    const recommendations = [];

    // Analyze queue performance
    for (const [queueName, queue] of this.queues.entries()) {
      const queueMetrics = await this.getQueueStatus(queueName);
      if (!queueMetrics) continue;

      // Check if queue is overwhelmed
      if (queueMetrics.waiting > 1000) {
        recommendations.push({
          type: 'scale-workers',
          target: queueName,
          reason: `Queue has ${queueMetrics.waiting} waiting jobs`,
          impact: 'high',
          action: `Add ${Math.ceil(queueMetrics.waiting / 100)} more workers`
        });
      }

      // Check processing time
      if (metrics.performance.averageProcessingTime > 5000) {
        recommendations.push({
          type: 'optimize-priority',
          target: queueName,
          reason: 'Average processing time exceeds 5 seconds',
          impact: 'medium',
          action: 'Implement job prioritization and timeouts'
        });
      }
    }

    // Worker utilization analysis
    const underutilizedWorkers = Array.from(this.workers.values())
      .filter(w => w.currentLoad / w.capacity < 0.3);
    
    if (underutilizedWorkers.length > 2) {
      recommendations.push({
        type: 'redistribute-load',
        target: 'workers',
        reason: `${underutilizedWorkers.length} workers are underutilized`,
        impact: 'medium',
        action: 'Redistribute jobs or reduce worker count'
      });
    }

    // Auto-apply safe optimizations
    let applied = false;
    if (recommendations.some(r => r.type === 'scale-workers' && r.impact === 'high')) {
      // Auto-scale workers for critical queues
      applied = true;
    }

    return {
      recommendations,
      applied,
      improvements: {
        expectedThroughputIncrease: applied ? 25 : 0,
        expectedLatencyReduction: applied ? 15 : 0,
        resourceOptimization: applied ? 10 : 0
      }
    };
  }

  private async initializeConnection(): Promise<void> {
    try {
      switch (this.config.provider) {
        case 'redis':
          this.client = await this.createRedisClient();
          break;
        case 'rabbitmq':
          this.client = await this.createRabbitMQClient();
          break;
        case 'sqs':
          this.client = await this.createSQSClient();
          break;
        case 'in-memory':
          this.client = new Map();
          break;
      }
      
      this.isConnected = true;
      console.log(`Queue provider ${this.config.provider} initialized successfully`);
      
    } catch (error) {
      console.error('Failed to initialize queue connection:', error);
      throw error;
    }
  }

  private async createRedisClient(): Promise<any> {
    // Mock Redis client for queue operations
    return {
      lpush: async (key: string, value: string) => {
        // Mock implementation
        console.log(`Adding job to queue ${key}`);
      },
      brpop: async (key: string, timeout: number) => {
        // Mock implementation - would normally block and wait for jobs
        return null;
      },
      llen: async (key: string) => {
        // Mock implementation
        return Math.floor(Math.random() * 100);
      }
    };
  }

  private async createRabbitMQClient(): Promise<any> {
    // Mock RabbitMQ client
    return {
      publish: async (exchange: string, routingKey: string, content: Buffer) => {
        console.log(`Publishing to ${exchange}/${routingKey}`);
      },
      consume: async (queue: string, callback: Function) => {
        console.log(`Consuming from queue ${queue}`);
      }
    };
  }

  private async createSQSClient(): Promise<any> {
    // Mock SQS client
    return {
      sendMessage: async (params: any) => {
        console.log(`Sending message to SQS queue ${params.QueueUrl}`);
      },
      receiveMessage: async (params: any) => {
        console.log(`Receiving messages from SQS queue ${params.QueueUrl}`);
        return { Messages: [] };
      }
    };
  }

  private async initializeQueue(name: string, options?: any): Promise<any> {
    // Mock queue initialization
    return {
      name,
      jobs: new Map(),
      paused: false,
      ...options
    };
  }

  private async enqueueJob(queueName: string, job: Job): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      queue.jobs.set(job.id, job);
    }
  }

  private async startProcessing(processor: JobProcessor): Promise<void> {
    // Mock job processing
    console.log(`Started processing jobs of type ${processor.type}`);
  }

  private async findJobInQueue(queue: any, jobId: string): Promise<Job | null> {
    return queue.jobs?.get(jobId) || null;
  }

  private async updateJob(job: Job): Promise<void> {
    // Mock job update
    console.log(`Updated job ${job.id}`);
  }

  private async removeJobFromQueue(job: Job): Promise<void> {
    // Mock job removal
    console.log(`Removed job ${job.id}`);
  }

  private async getJobCounts(queue: any, type: string): Promise<number> {
    // Mock job counts
    return Math.floor(Math.random() * 50);
  }

  private async getActiveJobs(queue: any): Promise<Job[]> {
    // Mock active jobs
    return [];
  }

  private async getFailedJobs(queue: any): Promise<Job[]> {
    // Mock failed jobs
    return [];
  }

  private async isQueuePaused(queue: any): Promise<boolean> {
    return queue.paused || false;
  }

  private async scheduleRepeatedJob(job: Job): Promise<void> {
    // Mock repeated job scheduling
    console.log(`Scheduled repeated job ${job.id}`);
  }

  private async getCurrentMetrics(): Promise<QueueMetrics> {
    const queueStatuses = await Promise.all(
      Array.from(this.queues.keys()).map(name => this.getQueueStatus(name))
    );

    const totalJobs = queueStatuses.reduce((sum, q) => sum + (q?.size || 0), 0);
    const totalCompleted = queueStatuses.reduce((sum, q) => sum + (q?.completed || 0), 0);
    const totalFailed = queueStatuses.reduce((sum, q) => sum + (q?.failed || 0), 0);

    return {
      timestamp: new Date(),
      queues: queueStatuses.filter(q => q !== null).map(q => ({
        name: q!.name,
        size: q!.size,
        waiting: q!.waiting,
        active: q!.active,
        completed: q!.completed,
        failed: q!.failed,
        delayed: q!.delayed,
        paused: q!.paused
      })),
      jobs: {
        total: totalJobs,
        completed: totalCompleted,
        failed: totalFailed,
        waiting: queueStatuses.reduce((sum, q) => sum + (q?.waiting || 0), 0),
        active: queueStatuses.reduce((sum, q) => sum + (q?.active || 0), 0),
        delayed: queueStatuses.reduce((sum, q) => sum + (q?.delayed || 0), 0),
        stuck: 0
      },
      performance: {
        throughput: totalCompleted / 60, // jobs per second
        averageProcessingTime: 2500, // Mock value
        p95ProcessingTime: 5000,
        p99ProcessingTime: 10000,
        successRate: totalJobs > 0 ? (totalCompleted / (totalCompleted + totalFailed)) * 100 : 100
      },
      workers: {
        total: this.workers.size,
        active: Array.from(this.workers.values()).filter(w => w.status === 'active').length,
        idle: Array.from(this.workers.values()).filter(w => w.status === 'idle').length,
        utilization: this.workers.size > 0 ? 
          Array.from(this.workers.values()).reduce((sum, w) => sum + w.currentLoad / w.capacity, 0) / this.workers.size * 100 : 0
      },
      memory: {
        used: 1024 * 1024 * 100, // Mock 100MB
        peak: 1024 * 1024 * 150,
        utilization: 66.7
      }
    };
  }

  private async calculateOverallQueueHealth(): Promise<number> {
    // Mock health calculation
    return 95.5;
  }

  private async getQueueHealthMetrics(): Promise<Array<{ name: string; health: number; performance: number; utilization: number }>> {
    return Array.from(this.queues.keys()).map(name => ({
      name,
      health: 90 + Math.random() * 10,
      performance: 80 + Math.random() * 20,
      utilization: Math.random() * 100
    }));
  }

  private async getWorkerEfficiencyMetrics(): Promise<Array<{ id: string; efficiency: number; utilization: number; health: number }>> {
    return Array.from(this.workers.values()).map(worker => ({
      id: worker.id,
      efficiency: 85 + Math.random() * 15,
      utilization: worker.currentLoad / worker.capacity * 100,
      health: worker.status === 'active' ? 95 + Math.random() * 5 : 0
    }));
  }

  private startWorkerHealthMonitoring(worker: WorkerNode): void {
    // Mock worker health monitoring
    setInterval(() => {
      worker.lastHeartbeat = new Date();
      worker.memory.utilization = Math.random() * 100;
      worker.cpu.usage = Math.random() * 100;
    }, 30000); // Every 30 seconds
  }

  private async drainWorker(workerId: string): Promise<void> {
    // Mock worker draining
    console.log(`Draining worker ${workerId}`);
  }

  private calculateNextRun(schedule: string, timezone: string): Date {
    // Mock cron calculation
    return new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  }

  private scheduleJob(scheduler: Scheduler): void {
    // Mock job scheduling
    console.log(`Scheduled job for ${scheduler.name}`);
  }

  private async cancelScheduledJob(scheduler: Scheduler): Promise<void> {
    // Mock scheduled job cancellation
    console.log(`Cancelled scheduled job for ${scheduler.name}`);
  }

  private initializeWorkerManagement(): void {
    // Mock worker management initialization
    console.log('Worker management initialized');
  }

  private initializeMetricsCollection(): void {
    if (this.config.monitoring.enabled) {
      setInterval(async () => {
        const metrics = await this.getCurrentMetrics();
        this.metrics.push(metrics);
        
        // Keep only last 1000 metrics
        if (this.metrics.length > 1000) {
          this.metrics.splice(0, this.metrics.length - 1000);
        }
      }, this.config.monitoring.metricsInterval * 1000);
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateWorkerId(): string {
    return `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSchedulerId(): string {
    return `scheduler_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export {
  type QueueConfig,
  type Job,
  type JobProcessor,
  type QueueMetrics,
  type WorkerNode,
  type Scheduler
};