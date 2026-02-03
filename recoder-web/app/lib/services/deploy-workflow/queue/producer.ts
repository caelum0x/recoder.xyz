/**
 * Queue producer for deployment messages
 * Handles sending deployment requests to the queue
 */

import type {
  QueueMessage,
  QueueProducerOptions,
  QueueMessageMetadata,
  QueueDeploymentParams,
  DeploymentParams
} from '../types';
import { generateDeploymentId } from '../utils/common';
import { DeploymentError, ErrorCodes } from '../utils/errors';

/**
 * In-memory queue for local development
 */
class InMemoryQueue<T> {
  private items: T[] = [];

  enqueue(item: T): void {
    this.items.push(item);
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  get length(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  clear(): void {
    this.items = [];
  }

  getAll(): T[] {
    return [...this.items];
  }
}

// Global deployment queue instance
const deploymentQueue = new InMemoryQueue<QueueMessage>();

// Global dead letter queue instance
const deadLetterQueue = new InMemoryQueue<QueueMessage>();

/**
 * Create queue message from deployment params
 */
export function createQueueMessage(
  params: DeploymentParams,
  options?: {
    deploymentId?: string;
    priority?: number;
    debug?: boolean;
  }
): QueueMessage {
  const deploymentId = options?.deploymentId || generateDeploymentId();
  const now = new Date().toISOString();

  const metadata: QueueMessageMetadata = {
    deploymentId,
    createdAt: now,
    userId: params.userId,
    organizationId: params.orgId,
    version: '1.0.0',
    priority: options?.priority,
    retryCount: 0
  };

  const queueParams: QueueDeploymentParams = {
    projectId: params.projectId,
    customDomain: params.customDomain,
    orgId: params.orgId,
    userId: params.userId,
    initFiles: params.initFiles,
    historyMessages: params.historyMessages
  };

  return {
    metadata,
    params: queueParams,
    config: {
      debug: options?.debug
    }
  };
}

/**
 * Send message to deployment queue
 */
export async function sendToQueue(
  message: QueueMessage,
  _options?: QueueProducerOptions
): Promise<string> {
  try {
    deploymentQueue.enqueue(message);

    console.log(`[Queue] Message enqueued: ${message.metadata.deploymentId}`);

    return message.metadata.deploymentId;
  } catch (error) {
    throw new DeploymentError(
      500,
      ErrorCodes.QUEUE_SEND_FAILED,
      `Failed to send message to queue: ${error instanceof Error ? error.message : String(error)}`,
      { message, originalError: error }
    );
  }
}

/**
 * Send deployment request to queue
 */
export async function enqueueDeployment(
  params: DeploymentParams,
  options?: {
    priority?: number;
    delaySeconds?: number;
    debug?: boolean;
  }
): Promise<{ deploymentId: string; message: QueueMessage }> {
  const message = createQueueMessage(params, {
    priority: options?.priority,
    debug: options?.debug
  });

  await sendToQueue(message, {
    delaySeconds: options?.delaySeconds
  });

  return {
    deploymentId: message.metadata.deploymentId,
    message
  };
}

/**
 * Send batch of messages to deployment queue
 */
export async function sendBatchToQueue(
  messages: QueueMessage[],
  _options?: QueueProducerOptions
): Promise<string[]> {
  try {
    const deploymentIds: string[] = [];

    for (const message of messages) {
      deploymentQueue.enqueue(message);
      deploymentIds.push(message.metadata.deploymentId);
    }

    console.log(`[Queue] Batch of ${messages.length} messages enqueued`);

    return deploymentIds;
  } catch (error) {
    throw new DeploymentError(
      500,
      ErrorCodes.QUEUE_SEND_FAILED,
      `Failed to send batch to queue: ${error instanceof Error ? error.message : String(error)}`,
      { messageCount: messages.length, originalError: error }
    );
  }
}

/**
 * Send priority message to deployment queue
 */
export async function sendPriorityMessage(
  params: DeploymentParams
): Promise<string> {
  const message = createQueueMessage(params, {
    priority: 10 // Highest priority
  });

  return sendToQueue(message, {
    delaySeconds: 0 // Process immediately
  });
}

/**
 * Send delayed message to deployment queue
 */
export async function sendDelayedMessage(
  params: DeploymentParams,
  delaySeconds: number
): Promise<string> {
  const message = createQueueMessage(params);

  return sendToQueue(message, {
    delaySeconds
  });
}

/**
 * Send message to dead letter queue
 */
export async function sendToDLQ(
  message: QueueMessage,
  reason: 'max_retries_exceeded' | 'processing_timeout' | 'invalid_message' | 'system_error',
  error: string
): Promise<void> {
  const dlqMessage = {
    ...message,
    metadata: {
      ...message.metadata,
      lastError: error
    }
  };

  deadLetterQueue.enqueue(dlqMessage);

  console.log(`[DLQ] Message sent to DLQ: ${message.metadata.deploymentId}, reason: ${reason}`);
}

/**
 * Get queue statistics
 */
export function getQueueStats(): {
  pending: number;
  dlq: number;
} {
  return {
    pending: deploymentQueue.length,
    dlq: deadLetterQueue.length
  };
}

/**
 * Get all pending messages (for debugging)
 */
export function getPendingMessages(): QueueMessage[] {
  return deploymentQueue.getAll();
}

/**
 * Get all DLQ messages (for debugging)
 */
export function getDLQMessages(): QueueMessage[] {
  return deadLetterQueue.getAll();
}

/**
 * Clear all queues (for testing)
 */
export function clearAllQueues(): void {
  deploymentQueue.clear();
  deadLetterQueue.clear();
}

// Export queue instances for direct access
export { deploymentQueue, deadLetterQueue };
