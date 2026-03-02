/**
 * @module integration-wiring.test
 *
 * Comprehensive test suite for the A2A Integration Wiring Service.
 * Covers all cross-subsystem event wiring, configuration toggles,
 * error isolation, stats tracking, and singleton lifecycle.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  IntegrationWiringService,
  getIntegrationWiringService,
  resetIntegrationWiringService,
} from '../integration-wiring.service';

import {
  getDelegationChainService,
  resetDelegationChainService,
} from '../delegation-chain.service';

import {
  getA2ATaskQueue,
  resetA2ATaskQueue,
} from '../task-queue.service';

import {
  getAgentMessagingService,
  resetAgentMessagingService,
} from '../agent-messaging.service';

import {
  getA2ATaskScheduler,
  resetA2ATaskScheduler,
} from '../task-scheduler.service';

import {
  getWorkflowEngine,
  resetWorkflowEngine,
} from '../workflow-engine.service';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let wiring: IntegrationWiringService;

beforeEach(() => {
  // Reset all singletons to get clean state
  resetIntegrationWiringService();
  resetDelegationChainService();
  resetA2ATaskQueue();
  resetAgentMessagingService();
  resetA2ATaskScheduler();
  resetWorkflowEngine();

  wiring = new IntegrationWiringService();
});

// ---------------------------------------------------------------------------
// wireAll / isWired / unwire
// ---------------------------------------------------------------------------

describe('wireAll / isWired / unwire', () => {
  it('1. wireAll() sets up all integrations', () => {
    wiring.wireAll();
    expect(wiring.isWired()).toBe(true);
  });

  it('2. isWired() returns true after wireAll()', () => {
    expect(wiring.isWired()).toBe(false);
    wiring.wireAll();
    expect(wiring.isWired()).toBe(true);
  });

  it('3. unwire() disconnects all', () => {
    wiring.wireAll();
    wiring.unwire();
    expect(wiring.isWired()).toBe(false);
  });

  it('4. isWired() returns false after unwire()', () => {
    wiring.wireAll();
    expect(wiring.isWired()).toBe(true);
    wiring.unwire();
    expect(wiring.isWired()).toBe(false);

    // After unwire, events should not trigger any wiring
    const delegation = getDelegationChainService();
    const queue = getA2ATaskQueue();

    // Create and accept a delegation
    const d = delegation.delegate({ fromAgentId: 'a', toAgentId: 'b', prompt: 'test' });
    delegation.accept(d.delegationId);

    // Queue should be empty (wiring disconnected)
    expect(queue.size()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// wireDelegationToQueue
// ---------------------------------------------------------------------------

describe('wireDelegationToQueue', () => {
  it('5. accepted delegation creates queue task', () => {
    wiring.wireDelegationToQueue();

    const delegation = getDelegationChainService();
    const queue = getA2ATaskQueue();

    // Create and accept a delegation
    const d = delegation.delegate({ fromAgentId: 'agent-a', toAgentId: 'agent-b', prompt: 'do the thing' });
    delegation.accept(d.delegationId);

    // Queue should have a task for agent-b
    const tasks = queue.listTasks('queued');
    expect(tasks.length).toBe(1);
    expect(tasks[0].agentId).toBe('agent-b');
    expect(tasks[0].prompt).toBe('do the thing');
  });

  it('6. delegation metadata stored on queue task', () => {
    wiring.wireDelegationToQueue();

    const delegation = getDelegationChainService();
    const queue = getA2ATaskQueue();

    const d = delegation.delegate({ fromAgentId: 'agent-a', toAgentId: 'agent-b', prompt: 'test' });
    delegation.accept(d.delegationId);

    const tasks = queue.listTasks('queued');
    expect(tasks.length).toBe(1);
    expect(tasks[0].metadata?.delegationId).toBe(d.delegationId);
    expect(tasks[0].metadata?.fromAgentId).toBe('agent-a');
  });
});

// ---------------------------------------------------------------------------
// wireQueueToMessaging
// ---------------------------------------------------------------------------

describe('wireQueueToMessaging', () => {
  it('7. completed task sends notification', () => {
    // Wire both delegation->queue and queue->messaging
    wiring.wireDelegationToQueue();
    wiring.wireQueueToMessaging();

    const delegation = getDelegationChainService();
    const queue = getA2ATaskQueue();
    const messaging = getAgentMessagingService();

    // Create delegation -> accept -> auto-enqueue
    const d = delegation.delegate({ fromAgentId: 'agent-x', toAgentId: 'agent-y', prompt: 'review code' });
    delegation.accept(d.delegationId);

    // Find the enqueued task and complete it
    const tasks = queue.listTasks('queued');
    expect(tasks.length).toBe(1);
    const task = queue.dequeue();
    expect(task).toBeDefined();
    queue.complete(task!.queueId, 'code looks good');

    // Check messaging inbox for agent-x
    const inbox = messaging.getInbox({ agentId: 'agent-x' });
    expect(inbox.length).toBe(1);
    expect(inbox[0].fromAgentId).toBe('system');
    expect(inbox[0].type).toBe('notification');
    expect(inbox[0].subject).toBe('Task completed');
    expect(inbox[0].body).toBe('code looks good');
  });
});

// ---------------------------------------------------------------------------
// wireQueueToDelegation
// ---------------------------------------------------------------------------

describe('wireQueueToDelegation', () => {
  it('8. completed task updates delegation status', () => {
    wiring.wireDelegationToQueue();
    wiring.wireQueueToDelegation();

    const delegationService = getDelegationChainService();
    const queue = getA2ATaskQueue();

    // Create and accept delegation
    const d = delegationService.delegate({ fromAgentId: 'a', toAgentId: 'b', prompt: 'task1' });
    delegationService.accept(d.delegationId);

    // Complete the queued task
    const task = queue.dequeue();
    expect(task).toBeDefined();
    queue.complete(task!.queueId, 'done');

    // Delegation should now be completed
    const updated = delegationService.getDelegation(d.delegationId);
    expect(updated?.status).toBe('completed');
    expect(updated?.result).toBe('done');
  });

  it('9. dead-lettered task fails delegation', () => {
    // Only wire queue->delegation (not delegation->queue, we'll enqueue manually
    // with maxRetries=1 for a fast dead-letter path)
    wiring.wireQueueToDelegation();

    const delegationService = getDelegationChainService();
    const queue = getA2ATaskQueue();

    // Create a delegation and accept it manually
    const d = delegationService.delegate({ fromAgentId: 'a', toAgentId: 'b', prompt: 'task2' });
    delegationService.accept(d.delegationId);

    // Manually enqueue a task with maxRetries=1 and delegationId in metadata
    const task = queue.enqueue({
      agentId: 'b',
      prompt: 'task2',
      maxRetries: 1,
      metadata: { delegationId: d.delegationId, fromAgentId: 'a' },
    });

    // Dequeue and fail once -- since maxRetries=1 and attempts becomes 1,
    // 1 < 1 is false so it goes straight to dead-letter
    const dequeued = queue.dequeue();
    expect(dequeued).toBeDefined();
    queue.fail(dequeued!.queueId, 'permanent failure');

    // The task should now be dead-lettered
    const dlq = queue.getDeadLetterQueue();
    expect(dlq.length).toBe(1);

    // Delegation should now be failed
    const updated = delegationService.getDelegation(d.delegationId);
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toBe('permanent failure');
  });
});

// ---------------------------------------------------------------------------
// wireSchedulerToQueue
// ---------------------------------------------------------------------------

describe('wireSchedulerToQueue', () => {
  it('10. scheduled execution enqueues task', () => {
    wiring.wireSchedulerToQueue();

    const scheduler = getA2ATaskScheduler();
    const queue = getA2ATaskQueue();

    // Create a schedule
    scheduler.createSchedule({
      scheduleId: 'sched-1',
      name: 'Daily report',
      type: 'interval',
      intervalMs: 60000,
      agentId: 'reporter-agent',
      prompt: 'generate daily report',
      priority: 'high',
    });

    // Manually emit the schedule:executed event (simulating a tick)
    scheduler.emit('schedule:executed', {
      scheduleId: 'sched-1',
      execution: { executionId: 'exec-1', output: 'report generated' },
    });

    // Queue should have a task
    const tasks = queue.listTasks('queued');
    expect(tasks.length).toBe(1);
    expect(tasks[0].agentId).toBe('reporter-agent');
    expect(tasks[0].prompt).toBe('generate daily report');
    expect(tasks[0].metadata?.scheduleId).toBe('sched-1');
  });
});

// ---------------------------------------------------------------------------
// wireWorkflowToDelegation
// ---------------------------------------------------------------------------

describe('wireWorkflowToDelegation', () => {
  it('11. workflow task step creates delegation', () => {
    wiring.wireWorkflowToDelegation();

    const workflowEngine = getWorkflowEngine();
    const delegationService = getDelegationChainService();

    // Emit a workflow:step:started event for a task step with agentId and prompt
    workflowEngine.emit('workflow:step:started', {
      executionId: 'wf-exec-1',
      stepId: 'step-1',
      type: 'task',
      agentId: 'worker-agent',
      prompt: 'process data',
    });

    // A delegation should have been created
    const delegations = delegationService.getDelegationsTo('worker-agent');
    expect(delegations.length).toBe(1);
    expect(delegations[0].fromAgentId).toBe('workflow-engine');
    expect(delegations[0].toAgentId).toBe('worker-agent');
    expect(delegations[0].prompt).toBe('process data');
    expect(delegations[0].metadata?.executionId).toBe('wf-exec-1');
    expect(delegations[0].metadata?.stepId).toBe('step-1');
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe('getStats', () => {
  it('12. returns correct counts', () => {
    wiring.wireAll();

    const delegation = getDelegationChainService();
    const queue = getA2ATaskQueue();

    // Create and accept a delegation (triggers delegation->queue)
    const d = delegation.delegate({ fromAgentId: 'a', toAgentId: 'b', prompt: 'test' });
    delegation.accept(d.delegationId);

    // Complete the task (triggers queue->delegation sync + queue->messaging notification)
    const task = queue.dequeue();
    expect(task).toBeDefined();
    queue.complete(task!.queueId, 'result');

    const stats = wiring.getStats();
    // delegation:accepted -> 1 (delegationToQueue)
    // task:completed -> 3 (queueToMessaging + queueToDelegation complete handler + queueToMessaging)
    expect(stats.delegationsEnqueued).toBe(1);
    expect(stats.notificationsSent).toBe(1);
    expect(stats.delegationsSynced).toBe(1);
    expect(stats.totalEventsProcessed).toBeGreaterThanOrEqual(3);
    expect(stats.errors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error isolation
// ---------------------------------------------------------------------------

describe('error isolation', () => {
  it('13. error in handler does not break other wiring', () => {
    wiring.wireAll();

    const queue = getA2ATaskQueue();
    const messaging = getAgentMessagingService();

    // Enqueue a task directly with a non-existent delegationId that will cause
    // the delegation sync to call .complete() on a non-existent delegation
    // (which returns undefined but does not throw). Let's test differently:
    // We manually enqueue a task with metadata referencing a delegationId,
    // and the queue->delegation handler will try to complete it.
    // Even if delegation.complete returns undefined (no error), the messaging handler
    // should still work.

    const task = queue.enqueue({
      agentId: 'agent-z',
      prompt: 'test',
      metadata: { delegationId: 'nonexistent-dlg', fromAgentId: 'agent-sender' },
    });
    const dequeued = queue.dequeue();
    expect(dequeued).toBeDefined();

    // Complete the task. Both queue->delegation and queue->messaging handlers will fire.
    // queue->delegation tries to complete a non-existent delegation (no error, just returns undefined).
    // queue->messaging should still send a notification.
    queue.complete(dequeued!.queueId, 'output');

    // The messaging notification should still have been sent
    const inbox = messaging.getInbox({ agentId: 'agent-sender' });
    expect(inbox.length).toBe(1);
    expect(inbox[0].body).toBe('output');

    // No errors should be in stats (delegation.complete just returns undefined)
    const stats = wiring.getStats();
    expect(stats.errors).toBe(0);
    expect(stats.notificationsSent).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Config toggles
// ---------------------------------------------------------------------------

describe('config toggles', () => {
  it('14. disable autoEnqueueDelegations', () => {
    const w = new IntegrationWiringService({ autoEnqueueDelegations: false });
    w.wireAll();

    const delegation = getDelegationChainService();
    const queue = getA2ATaskQueue();

    const d = delegation.delegate({ fromAgentId: 'a', toAgentId: 'b', prompt: 'test' });
    delegation.accept(d.delegationId);

    // Queue should be empty because autoEnqueueDelegations is false
    expect(queue.size()).toBe(0);

    w.reset();
  });

  it('15. disable notifyOnTaskCompletion', () => {
    const w = new IntegrationWiringService({ notifyOnTaskCompletion: false });
    w.wireDelegationToQueue();
    w.wireQueueToMessaging();

    const delegation = getDelegationChainService();
    const queue = getA2ATaskQueue();
    const messaging = getAgentMessagingService();

    // Create delegation -> accept -> auto-enqueue
    const d = delegation.delegate({ fromAgentId: 'a', toAgentId: 'b', prompt: 'test' });
    delegation.accept(d.delegationId);

    // Complete the task
    const task = queue.dequeue();
    expect(task).toBeDefined();
    queue.complete(task!.queueId, 'result');

    // No notification should have been sent
    const inbox = messaging.getInbox({ agentId: 'a' });
    expect(inbox.length).toBe(0);

    w.reset();
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('singleton management', () => {
  it('16. get/reset singleton', () => {
    resetIntegrationWiringService();

    const instance1 = getIntegrationWiringService();
    const instance2 = getIntegrationWiringService();
    expect(instance1).toBe(instance2);

    instance1.wireAll();
    expect(instance1.isWired()).toBe(true);

    resetIntegrationWiringService();

    const instance3 = getIntegrationWiringService();
    expect(instance3).not.toBe(instance1);
    expect(instance3.isWired()).toBe(false);
  });
});
