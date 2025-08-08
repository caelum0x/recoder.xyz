const { logger } = require('../utils/logger');
const { getClient: getRedisClient } = require('./redis');

class SimpleQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
    this.workers = [];
    this.isProcessing = false;
  }

  async add(jobData, options = {}) {
    const job = {
      id: Date.now() + Math.random(),
      data: jobData,
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: 0,
      maxAttempts: options.attempts || 3,
      createdAt: new Date(),
      ...options
    };

    if (job.delay > 0) {
      setTimeout(() => {
        this.jobs.push(job);
        this.process();
      }, job.delay);
    } else {
      this.jobs.push(job);
      this.process();
    }

    logger.debug(`Job added to queue ${this.name}:`, job.id);
    return job;
  }

  process(processor) {
    if (processor) {
      this.workers.push(processor);
    }

    if (this.isProcessing || this.workers.length === 0 || this.jobs.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.processNext();
  }

  async processNext() {
    while (this.jobs.length > 0 && this.workers.length > 0) {
      // Sort by priority (higher number = higher priority)
      this.jobs.sort((a, b) => b.priority - a.priority);
      
      const job = this.jobs.shift();
      const processor = this.workers[0]; // Simple round-robin would be better

      try {
        logger.debug(`Processing job ${job.id} in queue ${this.name}`);
        await processor(job);
        logger.debug(`Job ${job.id} completed successfully`);
      } catch (error) {
        job.attempts++;
        job.lastError = error.message;
        
        logger.error(`Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}):`, error);
        
        if (job.attempts < job.maxAttempts) {
          // Retry with exponential backoff
          const delay = Math.pow(2, job.attempts) * 1000;
          setTimeout(() => {
            this.jobs.push(job);
            this.processNext();
          }, delay);
        } else {
          logger.error(`Job ${job.id} failed permanently after ${job.maxAttempts} attempts`);
        }
      }
    }
    
    this.isProcessing = false;
  }

  getJobCounts() {
    return {
      waiting: this.jobs.length,
      workers: this.workers.length
    };
  }
}

// Queue instances
const queues = {};

const getQueue = (name) => {
  if (!queues[name]) {
    queues[name] = new SimpleQueue(name);
  }
  return queues[name];
};

// Pre-defined queues for the application
const initializeQueues = async () => {
  try {
    // Code generation queue
    const codeGenQueue = getQueue('code-generation');
    codeGenQueue.process(async (job) => {
      logger.info(`Processing code generation job:`, job.data);
      // Simulate code generation work
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { status: 'completed', result: 'Generated code successfully' };
    });

    // AI processing queue
    const aiQueue = getQueue('ai-processing');
    aiQueue.process(async (job) => {
      logger.info(`Processing AI job:`, job.data);
      // Simulate AI processing work
      await new Promise(resolve => setTimeout(resolve, 1500));
      return { status: 'completed', result: 'AI processing completed' };
    });

    // Validation queue
    const validationQueue = getQueue('validation');
    validationQueue.process(async (job) => {
      logger.info(`Processing validation job:`, job.data);
      // Simulate validation work
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { status: 'completed', result: 'Validation completed' };
    });

    // Email/notification queue
    const notificationQueue = getQueue('notifications');
    notificationQueue.process(async (job) => {
      logger.info(`Processing notification job:`, job.data);
      // Simulate sending notification
      await new Promise(resolve => setTimeout(resolve, 500));
      return { status: 'completed', result: 'Notification sent' };
    });

    // Analytics queue
    const analyticsQueue = getQueue('analytics');
    analyticsQueue.process(async (job) => {
      logger.debug(`Processing analytics job:`, job.data);
      // Process analytics data
      await new Promise(resolve => setTimeout(resolve, 100));
      return { status: 'completed', result: 'Analytics processed' };
    });

    logger.info('Job queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize queues:', error);
    throw error;
  }
};

// Queue management functions
const addJob = async (queueName, jobData, options = {}) => {
  try {
    const queue = getQueue(queueName);
    return await queue.add(jobData, options);
  } catch (error) {
    logger.error(`Failed to add job to queue ${queueName}:`, error);
    throw error;
  }
};

const getQueueStats = (queueName) => {
  const queue = queues[queueName];
  if (!queue) {
    return { error: 'Queue not found' };
  }
  
  return {
    name: queueName,
    ...queue.getJobCounts()
  };
};

const getAllQueueStats = () => {
  return Object.keys(queues).map(name => getQueueStats(name));
};

// Helper functions for common queue operations
const scheduleCodeGeneration = (projectData) => {
  return addJob('code-generation', projectData, { priority: 5 });
};

const scheduleAIProcessing = (prompt, options = {}) => {
  return addJob('ai-processing', { prompt, ...options }, { priority: 3 });
};

const scheduleValidation = (validationData) => {
  return addJob('validation', validationData, { priority: 4 });
};

const scheduleNotification = (notificationData) => {
  return addJob('notifications', notificationData, { priority: 2 });
};

const trackAnalytics = (analyticsData) => {
  return addJob('analytics', analyticsData, { priority: 1 });
};

module.exports = {
  initializeQueues,
  getQueue,
  addJob,
  getQueueStats,
  getAllQueueStats,
  
  // Helper functions
  scheduleCodeGeneration,
  scheduleAIProcessing,
  scheduleValidation,
  scheduleNotification,
  trackAnalytics
};