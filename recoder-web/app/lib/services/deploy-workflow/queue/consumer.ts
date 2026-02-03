/**
 * Queue consumer for deployment messages
 * Handles processing deployment requests from the queue
 */

import type {
  QueueMessage,
  QueueProcessingResult,
  QueueBatchResult,
  DeploymentEnvironment,
  DeploymentParams
} from '../types';
import { DeploymentWorkflow, DeploymentStateManager } from '../deployment';
import { createLogger } from '../utils/logger';
import { generateBatchId } from '../utils/common';
import { deploymentQueue, sendToDLQ } from './producer';

/**
 * Consumer configuration
 */
interface ConsumerConfig {
  maxRetries: number;
  batchSize: number;
  processingTimeout: number;
}

const DEFAULT_CONFIG: ConsumerConfig = {
  maxRetries: 3,
  batchSize: 10,
  processingTimeout: 600000 // 10 minutes
};

/**
 * Process a single queue message
 */
async function processMessage(
  message: QueueMessage,
  env: DeploymentEnvironment,
  stateManager: DeploymentStateManager,
  logger: ReturnType<typeof createLogger>
): Promise<QueueProcessingResult> {
  const startTime = Date.now();
  const { metadata, params } = message;
  const deploymentId = metadata.deploymentId;

  try {
    logger.info('Processing deployment message', {
      deploymentId,
      projectId: params.projectId,
      userId: params.userId,
      organizationId: params.orgId
    });

    // Convert queue params to deployment params
    const deploymentParams: DeploymentParams = {
      projectId: params.projectId,
      customDomain: params.customDomain,
      orgId: params.orgId,
      userId: params.userId,
      initFiles: params.initFiles,
      historyMessages: params.historyMessages
    };

    // Initialize deployment state
    await stateManager.initializeDeployment(deploymentId, deploymentParams);

    // Create and execute deployment workflow
    const workflow = new DeploymentWorkflow(env, stateManager, logger);
    const result = await workflow.execute(deploymentId, deploymentParams);

    const duration = Date.now() - startTime;

    if (result.success) {
      logger.info('Deployment completed successfully', {
        deploymentId,
        duration,
        workerUrl: result.workerUrl
      });

      return {
        messageId: deploymentId,
        deploymentId,
        success: true,
        duration,
        status: 'completed'
      };
    } else {
      logger.error('Deployment failed', {
        deploymentId,
        error: result.error,
        duration
      });

      return {
        messageId: deploymentId,
        deploymentId,
        success: false,
        error: result.error,
        duration,
        status: 'failed'
      };
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Deployment processing failed', {
      deploymentId,
      error: errorMessage,
      duration
    });

    // Update deployment state to failed
    try {
      await stateManager.markDeploymentFailed(deploymentId, errorMessage);
    } catch (stateError) {
      logger.error('Failed to update deployment state', {
        deploymentId,
        stateError: stateError instanceof Error ? stateError.message : String(stateError)
      });
    }

    return {
      messageId: deploymentId,
      deploymentId,
      success: false,
      error: errorMessage,
      duration,
      status: 'failed'
    };
  }
}

/**
 * Process a batch of queue messages
 */
export async function processBatch(
  messages: QueueMessage[],
  env: DeploymentEnvironment,
  config: Partial<ConsumerConfig> = {}
): Promise<QueueBatchResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const logger = createLogger(env);
  const stateManager = new DeploymentStateManager(env);
  const batchId = generateBatchId();
  const startTime = Date.now();

  logger.info('Starting batch processing', {
    batchId,
    batchSize: messages.length,
    timestamp: new Date().toISOString()
  });

  const results: QueueProcessingResult[] = [];

  // Process messages sequentially
  for (const message of messages) {
    const result = await processMessage(message, env, stateManager, logger);
    results.push(result);

    // Handle failed messages
    if (!result.success) {
      const retryCount = message.metadata.retryCount || 0;

      if (retryCount < mergedConfig.maxRetries) {
        // Update retry count and re-queue
        message.metadata.retryCount = retryCount + 1;
        message.metadata.lastError = result.error;
        deploymentQueue.enqueue(message);

        logger.info('Message re-queued for retry', {
          deploymentId: message.metadata.deploymentId,
          retryCount: message.metadata.retryCount
        });
      } else {
        // Send to DLQ
        await sendToDLQ(
          message,
          'max_retries_exceeded',
          result.error || 'Unknown error'
        );

        logger.warn('Message sent to DLQ after max retries', {
          deploymentId: message.metadata.deploymentId,
          totalRetries: retryCount + 1
        });
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const successRate = messages.length > 0 ? successCount / messages.length : 0;

  const batchResult: QueueBatchResult = {
    batchId,
    results,
    successRate,
    totalDuration,
    retryCount: results.filter(r => !r.success).length
  };

  logger.info('Batch processing completed', {
    ...batchResult,
    timestamp: new Date().toISOString()
  });

  return batchResult;
}

/**
 * Start the queue consumer
 * Polls the queue and processes messages
 */
export function startConsumer(
  env: DeploymentEnvironment,
  config: Partial<ConsumerConfig & { pollInterval: number }> = {}
): { stop: () => void } {
  const pollInterval = config.pollInterval || 1000;
  const batchSize = config.batchSize || DEFAULT_CONFIG.batchSize;
  let isRunning = true;

  const logger = createLogger(env);

  logger.info('Starting queue consumer', {
    pollInterval,
    batchSize
  });

  const poll = async () => {
    while (isRunning) {
      try {
        // Get batch of messages from queue
        const messages: QueueMessage[] = [];
        while (messages.length < batchSize && deploymentQueue.length > 0) {
          const message = deploymentQueue.dequeue();
          if (message) {
            messages.push(message);
          }
        }

        // Process batch if we have messages
        if (messages.length > 0) {
          await processBatch(messages, env, config);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        logger.error('Consumer poll error', {
          error: error instanceof Error ? error.message : String(error)
        });

        // Wait longer on error
        await new Promise(resolve => setTimeout(resolve, pollInterval * 2));
      }
    }

    logger.info('Queue consumer stopped');
  };

  // Start polling in the background
  poll();

  return {
    stop: () => {
      isRunning = false;
    }
  };
}

/**
 * Process next message from queue (single message processing)
 */
export async function processNextMessage(
  env: DeploymentEnvironment
): Promise<QueueProcessingResult | null> {
  const message = deploymentQueue.dequeue();

  if (!message) {
    return null;
  }

  const logger = createLogger(env);
  const stateManager = new DeploymentStateManager(env);

  return processMessage(message, env, stateManager, logger);
}

/**
 * Process all pending messages
 */
export async function processAllPending(
  env: DeploymentEnvironment,
  config: Partial<ConsumerConfig> = {}
): Promise<QueueBatchResult> {
  const messages = [];
  while (deploymentQueue.length > 0) {
    const message = deploymentQueue.dequeue();
    if (message) {
      messages.push(message);
    }
  }

  if (messages.length === 0) {
    return {
      batchId: generateBatchId(),
      results: [],
      successRate: 1,
      totalDuration: 0,
      retryCount: 0
    };
  }

  return processBatch(messages, env, config);
}
