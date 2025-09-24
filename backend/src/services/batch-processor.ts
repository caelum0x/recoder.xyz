/**
 * Batch Processing Service for API Cost Optimization
 * Reduces redundant calls by batching similar requests and optimizing execution
 */

import { EventEmitter } from 'events';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

interface BatchRequest {
  id: string;
  userId: string;
  type: 'ai_generation' | 'code_analysis' | 'compilation' | 'validation';
  prompt: string;
  parameters: any;
  priority: 'low' | 'normal' | 'high';
  timestamp: Date;
  callback?: (result: any) => void;
  maxWaitTime?: number; // Maximum time to wait for batching (ms)
  similarityThreshold?: number; // How similar requests need to be for batching (0-1)
}

interface BatchGroup {
  id: string;
  type: string;
  requests: BatchRequest[];
  createdAt: Date;
  scheduledExecutionTime: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultTemplate?: any;
}

export class BatchProcessor extends EventEmitter {
  private static instance: BatchProcessor;
  private batchGroups: Map<string, BatchGroup> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_INTERVAL = 5000; // Process batches every 5 seconds
  private readonly DEFAULT_MAX_WAIT = 30000; // Default max wait time: 30 seconds
  private readonly MIN_BATCH_SIZE = 3; // Minimum requests to form a batch
  private readonly MAX_BATCH_SIZE = 20; // Maximum requests per batch

  constructor() {
    super();
    this.startProcessing();
  }

  public static getInstance(): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor();
    }
    return BatchProcessor.instance;
  }

  /**
   * Add a request to the batch processing queue
   */
  async addRequest(request: Omit<BatchRequest, 'id' | 'timestamp'>): Promise<string> {
    const batchRequest: BatchRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      maxWaitTime: request.maxWaitTime || this.DEFAULT_MAX_WAIT,
      similarityThreshold: request.similarityThreshold || 0.7,
      ...request
    };

    // Try to find an existing compatible batch
    const compatibleBatch = await this.findCompatibleBatch(batchRequest);
    
    if (compatibleBatch && compatibleBatch.requests.length < this.MAX_BATCH_SIZE) {
      // Add to existing batch
      compatibleBatch.requests.push(batchRequest);
      this.batchGroups.set(compatibleBatch.id, compatibleBatch);
      
      logger.info(`Added request to existing batch: ${compatibleBatch.id}`, {
        requestId: batchRequest.id,
        batchSize: compatibleBatch.requests.length,
        type: batchRequest.type
      });
    } else {
      // Create new batch
      const newBatch: BatchGroup = {
        id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: batchRequest.type,
        requests: [batchRequest],
        createdAt: new Date(),
        scheduledExecutionTime: new Date(Date.now() + batchRequest.maxWaitTime),
        status: 'pending'
      };
      
      this.batchGroups.set(newBatch.id, newBatch);
      
      logger.info(`Created new batch: ${newBatch.id}`, {
        requestId: batchRequest.id,
        type: batchRequest.type,
        scheduledExecution: newBatch.scheduledExecutionTime
      });
    }

    // Track request in database for analytics
    await this.trackBatchRequest(batchRequest);

    return batchRequest.id;
  }

  /**
   * Find a compatible batch for the request
   */
  private async findCompatibleBatch(request: BatchRequest): Promise<BatchGroup | null> {
    for (const [batchId, batch] of this.batchGroups) {
      if (batch.status !== 'pending') continue;
      if (batch.type !== request.type) continue;
      if (batch.requests.length >= this.MAX_BATCH_SIZE) continue;
      
      // Check if batch is still within acceptable wait time
      const timeSinceCreation = Date.now() - batch.createdAt.getTime();
      if (timeSinceCreation > request.maxWaitTime * 0.8) continue; // 80% of max wait time
      
      // Check similarity with existing requests in batch
      const isSimilar = await this.checkSimilarity(request, batch.requests);
      if (isSimilar) {
        return batch;
      }
    }
    
    return null;
  }

  /**
   * Check if request is similar enough to existing requests in batch
   */
  private async checkSimilarity(request: BatchRequest, existingRequests: BatchRequest[]): Promise<boolean> {
    if (existingRequests.length === 0) return true;
    
    // For now, use simple text similarity - can be enhanced with AI embeddings
    const requestPrompt = request.prompt.toLowerCase();
    
    for (const existingRequest of existingRequests) {
      const existingPrompt = existingRequest.prompt.toLowerCase();
      const similarity = this.calculateTextSimilarity(requestPrompt, existingPrompt);
      
      if (similarity >= request.similarityThreshold) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Simple text similarity calculation using Jaccard index
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Start the batch processing interval
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processPendingBatches();
    }, this.BATCH_INTERVAL);
    
    logger.info('Batch processor started', {
      interval: this.BATCH_INTERVAL,
      minBatchSize: this.MIN_BATCH_SIZE,
      maxBatchSize: this.MAX_BATCH_SIZE
    });
  }

  /**
   * Process all pending batches that are ready
   */
  private async processPendingBatches(): Promise<void> {
    const now = new Date();
    const batchesToProcess: BatchGroup[] = [];

    for (const [batchId, batch] of this.batchGroups) {
      if (batch.status !== 'pending') continue;
      
      const shouldProcess = 
        batch.requests.length >= this.MIN_BATCH_SIZE || // Minimum batch size reached
        now >= batch.scheduledExecutionTime || // Scheduled time reached
        batch.requests.some(req => req.priority === 'high'); // High priority request
      
      if (shouldProcess) {
        batchesToProcess.push(batch);
      }
    }

    // Process batches in parallel
    await Promise.all(batchesToProcess.map(batch => this.processBatch(batch)));
  }

  /**
   * Process a single batch
   */
  private async processBatch(batch: BatchGroup): Promise<void> {
    try {
      batch.status = 'processing';
      this.batchGroups.set(batch.id, batch);

      logger.info(`Processing batch: ${batch.id}`, {
        requestCount: batch.requests.length,
        type: batch.type,
        avgPriority: this.calculateAveragePriority(batch.requests)
      });

      let results: any[] = [];

      switch (batch.type) {
        case 'ai_generation':
          results = await this.processAIGenerationBatch(batch);
          break;
        case 'code_analysis':
          results = await this.processCodeAnalysisBatch(batch);
          break;
        case 'compilation':
          results = await this.processCompilationBatch(batch);
          break;
        case 'validation':
          results = await this.processValidationBatch(batch);
          break;
        default:
          throw new Error(`Unknown batch type: ${batch.type}`);
      }

      // Send results to callbacks
      batch.requests.forEach((request, index) => {
        if (request.callback && results[index]) {
          request.callback(results[index]);
        }
      });

      batch.status = 'completed';
      this.emit('batchCompleted', {
        batchId: batch.id,
        requestCount: batch.requests.length,
        processingTime: Date.now() - batch.createdAt.getTime(),
        costSavings: this.calculateCostSavings(batch.requests.length)
      });

      // Track completion in database
      await this.trackBatchCompletion(batch, results);

    } catch (error) {
      batch.status = 'failed';
      logger.error(`Batch processing failed: ${batch.id}`, error);
      
      // Notify callbacks of failure
      batch.requests.forEach(request => {
        if (request.callback) {
          request.callback({ error: 'Batch processing failed' });
        }
      });
    } finally {
      // Remove batch from memory after processing
      setTimeout(() => {
        this.batchGroups.delete(batch.id);
      }, 60000); // Keep for 1 minute for debugging
    }
  }

  /**
   * Process AI generation batch - combine similar prompts for efficiency
   */
  private async processAIGenerationBatch(batch: BatchGroup): Promise<any[]> {
    // Group similar requests and create optimized prompts
    const optimizedPrompt = this.createOptimizedAIPrompt(batch.requests);
    
    // Make single AI call instead of multiple
    const response = await this.makeAIRequest(optimizedPrompt, batch.requests[0].parameters);
    
    // Parse response and distribute results
    return this.distributeAIResults(response, batch.requests);
  }

  /**
   * Process code analysis batch
   */
  private async processCodeAnalysisBatch(batch: BatchGroup): Promise<any[]> {
    // Combine code snippets for batch analysis
    const combinedCode = batch.requests.map(req => req.prompt).join('\n\n---\n\n');
    
    // Analyze in batch
    const analysis = await this.analyzeCodeBatch(combinedCode, batch.requests[0].parameters);
    
    // Split results back to individual requests
    return this.splitAnalysisResults(analysis, batch.requests);
  }

  /**
   * Process compilation batch
   */
  private async processCompilationBatch(batch: BatchGroup): Promise<any[]> {
    // Batch compile multiple code snippets
    const compilationResults = await Promise.all(
      batch.requests.map(req => this.compileCode(req.prompt, req.parameters))
    );
    
    return compilationResults;
  }

  /**
   * Process validation batch
   */
  private async processValidationBatch(batch: BatchGroup): Promise<any[]> {
    // Batch validate multiple items
    const validationResults = await Promise.all(
      batch.requests.map(req => this.validateCode(req.prompt, req.parameters))
    );
    
    return validationResults;
  }

  /**
   * Create optimized AI prompt for batch processing
   */
  private createOptimizedAIPrompt(requests: BatchRequest[]): string {
    const uniquePrompts = [...new Set(requests.map(req => req.prompt))];
    
    if (uniquePrompts.length === 1) {
      return `Please process this request ${requests.length} times with slight variations:\n\n${uniquePrompts[0]}`;
    }
    
    return `Please process these ${uniquePrompts.length} related requests:\n\n` +
           uniquePrompts.map((prompt, i) => `${i + 1}. ${prompt}`).join('\n\n');
  }

  /**
   * Make AI request (placeholder - integrate with actual AI service)
   */
  private async makeAIRequest(prompt: string, parameters: any): Promise<any> {
    // This would integrate with the actual AI routing service
    logger.info('Making batched AI request', { promptLength: prompt.length, parameters });
    
    // Simulate AI response
    return {
      content: `Batched response for: ${prompt.substring(0, 100)}...`,
      usage: { tokens: prompt.length + 500 },
      cost: 0.001
    };
  }

  /**
   * Distribute AI results back to individual requests
   */
  private distributeAIResults(response: any, requests: BatchRequest[]): any[] {
    // Parse the batched response and create individual results
    const baseResult = {
      content: response.content,
      usage: { tokens: Math.floor(response.usage.tokens / requests.length) },
      cost: response.cost / requests.length,
      batchOptimized: true
    };
    
    return requests.map((req, index) => ({
      ...baseResult,
      requestId: req.id,
      variation: index
    }));
  }

  /**
   * Analyze code in batch
   */
  private async analyzeCodeBatch(code: string, parameters: any): Promise<any> {
    logger.info('Analyzing code batch', { codeLength: code.length });
    
    // Simulate batch code analysis
    return {
      analysis: `Batch analysis of ${code.length} characters`,
      issues: [],
      metrics: { complexity: 3, maintainability: 8 }
    };
  }

  /**
   * Split analysis results back to individual requests
   */
  private splitAnalysisResults(analysis: any, requests: BatchRequest[]): any[] {
    return requests.map(req => ({
      ...analysis,
      requestId: req.id,
      specificTo: req.prompt.substring(0, 50)
    }));
  }

  /**
   * Compile code
   */
  private async compileCode(code: string, parameters: any): Promise<any> {
    // Simulate compilation
    return {
      success: true,
      output: `Compiled: ${code.substring(0, 50)}...`,
      errors: [],
      warnings: []
    };
  }

  /**
   * Validate code
   */
  private async validateCode(code: string, parameters: any): Promise<any> {
    // Simulate validation
    return {
      valid: true,
      score: 0.95,
      issues: [],
      suggestions: []
    };
  }

  /**
   * Calculate average priority of requests
   */
  private calculateAveragePriority(requests: BatchRequest[]): number {
    const priorityValues = { low: 1, normal: 2, high: 3 };
    const sum = requests.reduce((acc, req) => acc + priorityValues[req.priority], 0);
    return sum / requests.length;
  }

  /**
   * Calculate cost savings from batching
   */
  private calculateCostSavings(requestCount: number): number {
    // Estimate cost savings: batching saves 30-50% on API costs
    const savingsPercentage = Math.min(0.5, 0.1 + (requestCount * 0.05));
    return savingsPercentage;
  }

  /**
   * Track batch request in database
   */
  private async trackBatchRequest(request: BatchRequest): Promise<void> {
    try {
      await prisma.batchRequest.create({
        data: {
          id: request.id,
          userId: request.userId,
          type: request.type,
          prompt: request.prompt.substring(0, 1000), // Truncate for storage
          parameters: request.parameters,
          priority: request.priority,
          timestamp: request.timestamp,
          maxWaitTime: request.maxWaitTime,
          similarityThreshold: request.similarityThreshold
        }
      });
    } catch (error) {
      logger.error('Failed to track batch request', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Track batch completion in database
   */
  private async trackBatchCompletion(batch: BatchGroup, results: any[]): Promise<void> {
    try {
      const processingTime = Date.now() - batch.createdAt.getTime();
      const costSavings = this.calculateCostSavings(batch.requests.length);

      await prisma.batchExecution.create({
        data: {
          id: batch.id,
          type: batch.type,
          requestCount: batch.requests.length,
          processingTime,
          costSavings,
          status: batch.status,
          completedAt: new Date(),
          metadata: {
            averagePriority: this.calculateAveragePriority(batch.requests),
            totalPromptLength: batch.requests.reduce((sum, req) => sum + req.prompt.length, 0),
            successCount: results.filter(r => !r.error).length
          }
        }
      });
    } catch (error) {
      logger.error('Failed to track batch completion', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Get batch processing statistics
   */
  async getStatistics(userId?: string): Promise<any> {
    try {
      const where = userId ? { userId } : {};
      
      const [requestStats, batchStats] = await Promise.all([
        prisma.batchRequest.aggregate({
          where,
          _count: { id: true },
          _avg: { maxWaitTime: true, similarityThreshold: true }
        }),
        prisma.batchExecution.aggregate({
          _count: { id: true },
          _avg: { requestCount: true, processingTime: true, costSavings: true },
          _sum: { requestCount: true }
        })
      ]);

      return {
        totalRequests: requestStats._count.id,
        totalBatches: batchStats._count.id,
        averageBatchSize: batchStats._avg.requestCount,
        averageProcessingTime: batchStats._avg.processingTime,
        averageCostSavings: batchStats._avg.costSavings,
        totalRequestsProcessed: batchStats._sum.requestCount,
        efficiency: batchStats._sum.requestCount / (requestStats._count.id || 1),
        currentBatches: this.batchGroups.size
      };
    } catch (error) {
      logger.error('Failed to get batch statistics', error);
      return {
        error: 'Failed to retrieve statistics',
        currentBatches: this.batchGroups.size
      };
    }
  }

  /**
   * Stop batch processing
   */
  public stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    logger.info('Batch processor stopped');
  }
}

// Export singleton instance
export const batchProcessor = BatchProcessor.getInstance();