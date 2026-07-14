/**
 * @module integration-wiring.service
 *
 * Event-driven integration wiring that connects all A2A subsystems together.
 * Listens to events from delegation chains, task queues, schedulers, and
 * workflow engines and triggers cross-subsystem actions.
 *
 * Features:
 * - Delegation -> Queue: auto-enqueue tasks when delegations are accepted
 * - Queue -> Messaging: notify requesting agents when tasks complete
 * - Queue -> Delegation: sync delegation status with queue task outcomes
 * - Scheduler -> Queue: enqueue tasks when schedules fire
 * - Workflow -> Delegation: create delegations when workflow task steps start
 * - Configurable per-wire toggles
 * - Error isolation: one handler failure does not break other wiring
 * - Wiring statistics
 *
 * All wiring is done via event listeners -- no direct coupling between
 * subsystems. Each wire function is idempotent (safe to call multiple times).
 *
 * Singleton access via `getIntegrationWiringService()` / `resetIntegrationWiringService()`.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logger';

import {
  getDelegationChainService,
  type DelegationRequest,
} from './delegation-chain.service';
import {
  getA2ATaskQueue,
  type QueuedTask,
} from './task-queue.service';
import {
  getAgentMessagingService,
} from './agent-messaging.service';
import {
  getA2ATaskScheduler,
} from './task-scheduler.service';
import {
  getWorkflowEngine,
} from './workflow-engine.service';

const logger = createLogger('a2a-integration-wiring');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WiringConfig {
  /** Auto-enqueue tasks from delegation requests (default true) */
  autoEnqueueDelegations: boolean;
  /** Auto-send agent messages on task completion (default true) */
  notifyOnTaskCompletion: boolean;
  /** Auto-update delegation status when queue tasks complete (default true) */
  syncDelegationWithQueue: boolean;
  /** Log all wiring events (default true) */
  logEvents: boolean;
}

export interface WiringStats {
  totalEventsProcessed: number;
  delegationsEnqueued: number;
  notificationsSent: number;
  delegationsSynced: number;
  errors: number;
}

export type WiringEventName =
  | 'wiring:delegation-enqueued'
  | 'wiring:notification-sent'
  | 'wiring:delegation-synced'
  | 'wiring:error';

// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: WiringConfig = {
  autoEnqueueDelegations: true,
  notifyOnTaskCompletion: true,
  syncDelegationWithQueue: true,
  logEvents: true,
};

// ---------------------------------------------------------------------------
// IntegrationWiringService
// ---------------------------------------------------------------------------

export class IntegrationWiringService extends EventEmitter {
  /** Resolved config. */
  private readonly config: WiringConfig;

  /** Whether wiring is active. */
  private _wired = false;

  /** Track which individual wires have been set up. */
  private readonly wiredFlags = {
    delegationToQueue: false,
    queueToMessaging: false,
    queueToDelegation: false,
    schedulerToQueue: false,
    workflowToDelegation: false,
  };

  /** Delegation ID -> Queue ID mapping for cross-subsystem correlation. */
  private readonly delegationToQueueMap = new Map<string, string>();

  /** Queue ID -> requesting agent ID (from delegation) for notification routing. */
  private readonly queueToRequesterMap = new Map<string, string>();

  /** Queue ID -> Delegation ID (reverse mapping) for sync. */
  private readonly queueToDelegationMap = new Map<string, string>();

  /** Stored event handler references for cleanup. */
  private readonly handlers: Array<{
    emitter: EventEmitter;
    event: string;
    handler: (...args: unknown[]) => void;
  }> = [];

  /** Wiring statistics. */
  private stats: WiringStats = {
    totalEventsProcessed: 0,
    delegationsEnqueued: 0,
    notificationsSent: 0,
    delegationsSynced: 0,
    errors: 0,
  };

  constructor(config?: Partial<WiringConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // wireAll
  // -----------------------------------------------------------------------

  /**
   * Wire all subsystem integrations.
   * Sets up event listeners between services.
   */
  wireAll(): void {
    this.wireDelegationToQueue();
    this.wireQueueToMessaging();
    this.wireQueueToDelegation();
    this.wireSchedulerToQueue();
    this.wireWorkflowToDelegation();
    this._wired = true;
  }

  // -----------------------------------------------------------------------
  // wireDelegationToQueue
  // -----------------------------------------------------------------------

  /**
   * Wire delegation -> queue integration:
   * When a delegation is accepted, auto-enqueue a task in the task queue.
   */
  wireDelegationToQueue(): void {
    if (this.wiredFlags.delegationToQueue) return;
    this.wiredFlags.delegationToQueue = true;

    const delegation = getDelegationChainService();

    const handler = (d: DelegationRequest) => {
      try {
        this.stats.totalEventsProcessed++;

        if (!this.config.autoEnqueueDelegations) return;

        const queue = getA2ATaskQueue();
        const task = queue.enqueue({
          agentId: d.toAgentId,
          prompt: d.prompt,
          priority: d.priority,
          metadata: {
            ...(d.metadata ?? {}),
            delegationId: d.delegationId,
            fromAgentId: d.fromAgentId,
          },
        });

        // Store mappings for cross-service correlation
        this.delegationToQueueMap.set(d.delegationId, task.queueId);
        this.queueToRequesterMap.set(task.queueId, d.fromAgentId);
        this.queueToDelegationMap.set(task.queueId, d.delegationId);

        this.stats.delegationsEnqueued++;

        if (this.config.logEvents) {
          logger.debug(
            { delegationId: d.delegationId, queueId: task.queueId },
            'delegation accepted -> task enqueued',
          );
        }

        this.emit('wiring:delegation-enqueued', {
          delegationId: d.delegationId,
          queueId: task.queueId,
        });
      } catch (err) {
        this.stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, 'wireDelegationToQueue handler error');
        this.emit('wiring:error', { source: 'delegationToQueue', error: msg });
      }
    };

    delegation.on('delegation:accepted', handler);
    this.handlers.push({ emitter: delegation, event: 'delegation:accepted', handler: handler as (...args: unknown[]) => void });
  }

  // -----------------------------------------------------------------------
  // wireQueueToMessaging
  // -----------------------------------------------------------------------

  /**
   * Wire task queue -> messaging integration:
   * When a queued task completes, send a notification message to the requesting agent.
   */
  wireQueueToMessaging(): void {
    if (this.wiredFlags.queueToMessaging) return;
    this.wiredFlags.queueToMessaging = true;

    const queue = getA2ATaskQueue();

    const handler = (task: QueuedTask) => {
      try {
        this.stats.totalEventsProcessed++;

        if (!this.config.notifyOnTaskCompletion) return;

        // Only notify if this task was created from a delegation
        const delegationId = task.metadata?.delegationId;
        if (!delegationId) return;

        const requestingAgent = this.queueToRequesterMap.get(task.queueId)
          ?? task.metadata?.fromAgentId;
        if (!requestingAgent) return;

        const messaging = getAgentMessagingService();
        messaging.sendMessage({
          fromAgentId: 'system',
          toAgentId: requestingAgent,
          type: 'notification',
          subject: 'Task completed',
          body: task.output ?? 'Task completed successfully',
          metadata: {
            delegationId,
            queueId: task.queueId,
          },
        });

        this.stats.notificationsSent++;

        if (this.config.logEvents) {
          logger.debug(
            { queueId: task.queueId, toAgentId: requestingAgent },
            'task completed -> notification sent',
          );
        }

        this.emit('wiring:notification-sent', {
          queueId: task.queueId,
          toAgentId: requestingAgent,
        });
      } catch (err) {
        this.stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, 'wireQueueToMessaging handler error');
        this.emit('wiring:error', { source: 'queueToMessaging', error: msg });
      }
    };

    queue.on('task:completed', handler);
    this.handlers.push({ emitter: queue, event: 'task:completed', handler: handler as (...args: unknown[]) => void });
  }

  // -----------------------------------------------------------------------
  // wireQueueToDelegation
  // -----------------------------------------------------------------------

  /**
   * Wire queue -> delegation integration:
   * When a queued task completes/fails, update the corresponding delegation status.
   */
  wireQueueToDelegation(): void {
    if (this.wiredFlags.queueToDelegation) return;
    this.wiredFlags.queueToDelegation = true;

    const queue = getA2ATaskQueue();
    const delegationService = getDelegationChainService();

    // On task completion
    const completeHandler = (task: QueuedTask) => {
      try {
        this.stats.totalEventsProcessed++;

        if (!this.config.syncDelegationWithQueue) return;

        const delegationId = this.queueToDelegationMap.get(task.queueId)
          ?? task.metadata?.delegationId;
        if (!delegationId) return;

        delegationService.complete(delegationId, task.output ?? 'completed');

        this.stats.delegationsSynced++;

        if (this.config.logEvents) {
          logger.debug(
            { queueId: task.queueId, delegationId },
            'task completed -> delegation completed',
          );
        }

        this.emit('wiring:delegation-synced', {
          queueId: task.queueId,
          delegationId,
          status: 'completed',
        });
      } catch (err) {
        this.stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, 'wireQueueToDelegation complete handler error');
        this.emit('wiring:error', { source: 'queueToDelegation', error: msg });
      }
    };

    // On task dead-letter
    const deadLetterHandler = (task: QueuedTask) => {
      try {
        this.stats.totalEventsProcessed++;

        if (!this.config.syncDelegationWithQueue) return;

        const delegationId = this.queueToDelegationMap.get(task.queueId)
          ?? task.metadata?.delegationId;
        if (!delegationId) return;

        delegationService.fail(delegationId, task.lastError ?? 'task dead-lettered');

        this.stats.delegationsSynced++;

        if (this.config.logEvents) {
          logger.debug(
            { queueId: task.queueId, delegationId },
            'task dead-lettered -> delegation failed',
          );
        }

        this.emit('wiring:delegation-synced', {
          queueId: task.queueId,
          delegationId,
          status: 'failed',
        });
      } catch (err) {
        this.stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, 'wireQueueToDelegation dead-letter handler error');
        this.emit('wiring:error', { source: 'queueToDelegation', error: msg });
      }
    };

    queue.on('task:completed', completeHandler);
    queue.on('task:dead-letter', deadLetterHandler);
    this.handlers.push({ emitter: queue, event: 'task:completed', handler: completeHandler as (...args: unknown[]) => void });
    this.handlers.push({ emitter: queue, event: 'task:dead-letter', handler: deadLetterHandler as (...args: unknown[]) => void });
  }

  // -----------------------------------------------------------------------
  // wireSchedulerToQueue
  // -----------------------------------------------------------------------

  /**
   * Wire scheduler -> queue integration:
   * When a schedule fires, enqueue a task.
   */
  wireSchedulerToQueue(): void {
    if (this.wiredFlags.schedulerToQueue) return;
    this.wiredFlags.schedulerToQueue = true;

    const scheduler = getA2ATaskScheduler();

    const handler = (data: { scheduleId: string; execution: { executionId: string; output?: string } }) => {
      try {
        this.stats.totalEventsProcessed++;

        // Look up the schedule definition to get agentId and prompt
        const schedule = scheduler.getSchedule(data.scheduleId);
        if (!schedule) return;

        const queue = getA2ATaskQueue();
        const task = queue.enqueue({
          agentId: schedule.agentId,
          prompt: schedule.prompt,
          priority: schedule.priority,
          metadata: {
            scheduleId: data.scheduleId,
            executionId: data.execution.executionId,
          },
        });

        this.stats.delegationsEnqueued++;

        if (this.config.logEvents) {
          logger.debug(
            { scheduleId: data.scheduleId, queueId: task.queueId },
            'schedule executed -> task enqueued',
          );
        }

        this.emit('wiring:delegation-enqueued', {
          scheduleId: data.scheduleId,
          queueId: task.queueId,
        });
      } catch (err) {
        this.stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, 'wireSchedulerToQueue handler error');
        this.emit('wiring:error', { source: 'schedulerToQueue', error: msg });
      }
    };

    scheduler.on('schedule:executed', handler);
    this.handlers.push({ emitter: scheduler, event: 'schedule:executed', handler: handler as (...args: unknown[]) => void });
  }

  // -----------------------------------------------------------------------
  // wireWorkflowToDelegation
  // -----------------------------------------------------------------------

  /**
   * Wire workflow -> delegation integration:
   * When a workflow task step needs an agent, create a delegation.
   */
  wireWorkflowToDelegation(): void {
    if (this.wiredFlags.workflowToDelegation) return;
    this.wiredFlags.workflowToDelegation = true;

    const workflowEngine = getWorkflowEngine();

    const handler = (data: { executionId: string; stepId: string; type: string; agentId?: string; prompt?: string }) => {
      try {
        this.stats.totalEventsProcessed++;

        // Only create delegations for task steps
        if (data.type !== 'task') return;

        // We need agentId and prompt. These may be in the event data or
        // we fall back to defaults if not provided.
        const agentId = data.agentId;
        const prompt = data.prompt;
        if (!agentId || !prompt) return;

        const delegationService = getDelegationChainService();
        const delegation = delegationService.delegate({
          fromAgentId: 'workflow-engine',
          toAgentId: agentId,
          prompt,
          metadata: {
            executionId: data.executionId,
            stepId: data.stepId,
          },
        });

        this.stats.delegationsEnqueued++;

        if (this.config.logEvents) {
          logger.debug(
            { executionId: data.executionId, stepId: data.stepId, delegationId: delegation.delegationId },
            'workflow step started -> delegation created',
          );
        }

        this.emit('wiring:delegation-enqueued', {
          executionId: data.executionId,
          stepId: data.stepId,
          delegationId: delegation.delegationId,
        });
      } catch (err) {
        this.stats.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg }, 'wireWorkflowToDelegation handler error');
        this.emit('wiring:error', { source: 'workflowToDelegation', error: msg });
      }
    };

    workflowEngine.on('workflow:step:started', handler);
    this.handlers.push({ emitter: workflowEngine, event: 'workflow:step:started', handler: handler as (...args: unknown[]) => void });
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  /**
   * Get wiring statistics.
   */
  getStats(): WiringStats {
    return { ...this.stats };
  }

  // -----------------------------------------------------------------------
  // State checks
  // -----------------------------------------------------------------------

  /**
   * Check if wiring is active.
   */
  isWired(): boolean {
    return this._wired;
  }

  // -----------------------------------------------------------------------
  // unwire
  // -----------------------------------------------------------------------

  /**
   * Disconnect all wiring (remove event listeners).
   */
  unwire(): void {
    for (const { emitter, event, handler } of this.handlers) {
      emitter.removeListener(event, handler);
    }
    this.handlers.length = 0;

    this._wired = false;
    this.wiredFlags.delegationToQueue = false;
    this.wiredFlags.queueToMessaging = false;
    this.wiredFlags.queueToDelegation = false;
    this.wiredFlags.schedulerToQueue = false;
    this.wiredFlags.workflowToDelegation = false;

    if (this.config.logEvents) {
      logger.info('all wiring disconnected');
    }
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  /**
   * Reset all state.
   */
  reset(): void {
    this.unwire();
    this.delegationToQueueMap.clear();
    this.queueToRequesterMap.clear();
    this.queueToDelegationMap.clear();
    this.stats = {
      totalEventsProcessed: 0,
      delegationsEnqueued: 0,
      notificationsSent: 0,
      delegationsSynced: 0,
      errors: 0,
    };
    this.removeAllListeners();
    logger.debug('integration wiring service reset');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: IntegrationWiringService | null = null;

/** Get or create the default singleton instance. */
export function getIntegrationWiringService(config?: Partial<WiringConfig>): IntegrationWiringService {
  if (!_instance) {
    _instance = new IntegrationWiringService(config);
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetIntegrationWiringService(): void {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}
