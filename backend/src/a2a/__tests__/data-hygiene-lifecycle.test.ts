/**
 * @module data-hygiene-lifecycle.test
 *
 * Tests for data hygiene routines and singleton lifecycle management.
 * Verifies that all A2A services can be initialized, used, reset, and
 * re-initialized without issues (memory leaks, stale state, etc.).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Task Lifecycle
  getTaskLifecycleService,
  resetTaskLifecycleService,
  // Collaboration
  initCollaborationSvc,
  getCollaborationSvc,
  resetCollaborationSvc,
  // Heartbeat
  getHeartbeatTracker,
  resetHeartbeatTracker,
  // Agent Registry
  getAgentRegistryService,
  resetAgentRegistryService,
  // Event Bus
  getA2AEventBus,
  resetA2AEventBus,
  A2AEventType,
  // Event Bridge
  wireA2AEventBridge,
  resetA2AEventBridge,
  // Rate Limiter
  getA2ARateLimiter,
  resetA2ARateLimiter,
  // RBAC
  getA2ARBACService,
  resetA2ARBACService,
  // Tracing
  getTraceService,
  resetTraceService,
  // Pipeline
  getPipelineOrchestrator,
  resetPipelineOrchestrator,
  // Scatter-Gather
  getScatterGatherOrchestrator,
  resetScatterGatherOrchestrator,
  // Supervisor
  getSupervisorOrchestrator,
  resetSupervisorOrchestrator,
  // Task Queue
  getA2ATaskQueue,
  resetA2ATaskQueue,
  // Task Scheduler
  getA2ATaskScheduler,
  resetA2ATaskScheduler,
  // Workflow Engine
  getWorkflowEngine,
  resetWorkflowEngine,
  // Agent Messaging
  getAgentMessagingService,
  resetAgentMessagingService,
  // Delegation Chain
  getDelegationChainService,
  resetDelegationChainService,
  // Integration Wiring
  getIntegrationWiringService,
  resetIntegrationWiringService,
  // Capability Matcher
  getCapabilityMatcher,
  resetCapabilityMatcher,
  // Task Result Aggregator
  getTaskResultAggregator,
  resetTaskResultAggregator,
  // Connectors
  resetClaudeConnectorRuntime,
  resetCodexConnectorRuntime,
  resetCursorConnectorRuntime,
  resetWindsurfConnectorRuntime,
  resetReplitConnectorRuntime,
  // Context Bridge
  getContextBridgeService,
  resetContextBridgeService,
  // Connector Health
  resetConnectorHealthMonitor,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All reset functions for full teardown */
const ALL_RESETS = [
  resetTaskLifecycleService,
  resetCollaborationSvc,
  resetHeartbeatTracker,
  resetAgentRegistryService,
  resetA2AEventBus,
  resetA2AEventBridge,
  resetA2ARateLimiter,
  resetA2ARBACService,
  resetTraceService,
  resetPipelineOrchestrator,
  resetScatterGatherOrchestrator,
  resetSupervisorOrchestrator,
  resetA2ATaskQueue,
  resetA2ATaskScheduler,
  resetWorkflowEngine,
  resetAgentMessagingService,
  resetDelegationChainService,
  resetIntegrationWiringService,
  resetCapabilityMatcher,
  resetTaskResultAggregator,
  resetClaudeConnectorRuntime,
  resetCodexConnectorRuntime,
  resetCursorConnectorRuntime,
  resetWindsurfConnectorRuntime,
  resetReplitConnectorRuntime,
  resetContextBridgeService,
  resetConnectorHealthMonitor,
];

function resetAllServices() {
  for (const reset of ALL_RESETS) {
    reset();
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Singleton Lifecycle', () => {
  beforeEach(() => {
    resetAllServices();
  });

  it('all resets execute without throwing', () => {
    // Just calling resetAll twice should be safe (idempotent)
    expect(() => resetAllServices()).not.toThrow();
    expect(() => resetAllServices()).not.toThrow();
  });

  it('singletons return fresh instances after reset', () => {
    const tls1 = getTaskLifecycleService();
    resetTaskLifecycleService();
    const tls2 = getTaskLifecycleService();
    expect(tls1).not.toBe(tls2);
  });

  it('collaboration service re-inits after reset', () => {
    initCollaborationSvc();
    const svc1 = getCollaborationSvc();
    resetCollaborationSvc();
    initCollaborationSvc();
    const svc2 = getCollaborationSvc();
    expect(svc1).not.toBe(svc2);
  });

  it('heartbeat tracker re-creates after reset', () => {
    const ht1 = getHeartbeatTracker();
    resetHeartbeatTracker();
    const ht2 = getHeartbeatTracker();
    expect(ht1).not.toBe(ht2);
  });

  it('agent registry service re-creates after reset', () => {
    const ar1 = getAgentRegistryService();
    resetAgentRegistryService();
    const ar2 = getAgentRegistryService();
    expect(ar1).not.toBe(ar2);
  });

  it('event bus re-creates after reset', () => {
    const eb1 = getA2AEventBus();
    resetA2AEventBus();
    const eb2 = getA2AEventBus();
    expect(eb1).not.toBe(eb2);
  });

  it('rate limiter re-creates after reset', () => {
    const rl1 = getA2ARateLimiter();
    resetA2ARateLimiter();
    const rl2 = getA2ARateLimiter();
    expect(rl1).not.toBe(rl2);
  });

  it('RBAC service re-creates after reset', () => {
    const rbac1 = getA2ARBACService();
    resetA2ARBACService();
    const rbac2 = getA2ARBACService();
    expect(rbac1).not.toBe(rbac2);
  });

  it('trace service re-creates after reset', () => {
    const ts1 = getTraceService();
    resetTraceService();
    const ts2 = getTraceService();
    expect(ts1).not.toBe(ts2);
  });

  it('pipeline orchestrator re-creates after reset', () => {
    const po1 = getPipelineOrchestrator();
    resetPipelineOrchestrator();
    const po2 = getPipelineOrchestrator();
    expect(po1).not.toBe(po2);
  });

  it('scatter-gather orchestrator re-creates after reset', () => {
    const sg1 = getScatterGatherOrchestrator();
    resetScatterGatherOrchestrator();
    const sg2 = getScatterGatherOrchestrator();
    expect(sg1).not.toBe(sg2);
  });

  it('supervisor orchestrator re-creates after reset', () => {
    const su1 = getSupervisorOrchestrator();
    resetSupervisorOrchestrator();
    const su2 = getSupervisorOrchestrator();
    expect(su1).not.toBe(su2);
  });

  it('task queue re-creates after reset', () => {
    const q1 = getA2ATaskQueue();
    resetA2ATaskQueue();
    const q2 = getA2ATaskQueue();
    expect(q1).not.toBe(q2);
  });

  it('task scheduler re-creates after reset', () => {
    const s1 = getA2ATaskScheduler();
    resetA2ATaskScheduler();
    const s2 = getA2ATaskScheduler();
    expect(s1).not.toBe(s2);
  });

  it('workflow engine re-creates after reset', () => {
    const w1 = getWorkflowEngine();
    resetWorkflowEngine();
    const w2 = getWorkflowEngine();
    expect(w1).not.toBe(w2);
  });

  it('agent messaging service re-creates after reset', () => {
    const m1 = getAgentMessagingService();
    resetAgentMessagingService();
    const m2 = getAgentMessagingService();
    expect(m1).not.toBe(m2);
  });

  it('delegation chain service re-creates after reset', () => {
    const d1 = getDelegationChainService();
    resetDelegationChainService();
    const d2 = getDelegationChainService();
    expect(d1).not.toBe(d2);
  });

  it('integration wiring service re-creates after reset', () => {
    const w1 = getIntegrationWiringService();
    resetIntegrationWiringService();
    const w2 = getIntegrationWiringService();
    expect(w1).not.toBe(w2);
  });

  it('capability matcher re-creates after reset', () => {
    const c1 = getCapabilityMatcher();
    resetCapabilityMatcher();
    const c2 = getCapabilityMatcher();
    expect(c1).not.toBe(c2);
  });

  it('task result aggregator re-creates after reset', () => {
    const a1 = getTaskResultAggregator();
    resetTaskResultAggregator();
    const a2 = getTaskResultAggregator();
    expect(a1).not.toBe(a2);
  });

  it('context bridge re-creates after reset', () => {
    const cb1 = getContextBridgeService();
    resetContextBridgeService();
    const cb2 = getContextBridgeService();
    expect(cb1).not.toBe(cb2);
  });
});

describe('Cross-Service Lifecycle', () => {
  beforeEach(() => {
    resetAllServices();
  });

  it('task lifecycle works after full reset cycle', () => {
    const svc = getTaskLifecycleService();
    const r1 = svc.createTask({
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      requester: { agent_id: 'a', platform: 'claude' },
      assignee: { agent_id: 'b', platform: 'codex' },
      connector: { connector_id: 'c', platform: 'claude', protocol: 'mcp' },
      payload: { prompt: 'Before reset' },
    });
    expect(r1.ok).toBe(true);

    resetAllServices();

    const svc2 = getTaskLifecycleService();
    // Old task should be gone
    const r2 = svc2.listTasks({});
    expect(r2.ok).toBe(true);
    expect(r2.data).toHaveLength(0);

    // New task should work
    const r3 = svc2.createTask({
      workspace_id: 'ws-2',
      thread_id: 'thread-2',
      requester: { agent_id: 'a', platform: 'claude' },
      assignee: { agent_id: 'b', platform: 'codex' },
      connector: { connector_id: 'c', platform: 'claude', protocol: 'mcp' },
      payload: { prompt: 'After reset' },
    });
    expect(r3.ok).toBe(true);
  });

  it('event bus loses listeners after reset', () => {
    const bus = getA2AEventBus();
    let called = false;
    bus.subscribeGlobal(() => { called = true; });

    resetA2AEventBus();

    const bus2 = getA2AEventBus();
    bus2.publish({ type: A2AEventType.TaskCreated, payload: {} as any, timestamp: Date.now() });

    // Old listener should NOT fire
    expect(called).toBe(false);
  });

  it('event bridge can be re-wired after reset', () => {
    wireA2AEventBridge();
    resetA2AEventBridge();
    
    // Should not throw on re-wire
    expect(() => wireA2AEventBridge()).not.toThrow();
    resetA2AEventBridge();
  });

  it('integration wiring can wireAll, unwire, then rewire', () => {
    const wiring = getIntegrationWiringService();
    wiring.wireAll();
    wiring.unwire();

    // Re-wire should work
    expect(() => wiring.wireAll()).not.toThrow();
  });

  it('task queue is empty after reset', () => {
    const q = getA2ATaskQueue();
    q.enqueue({ taskId: 'task-1', agentId: 'agent-1', prompt: 'Do something' });

    const stats1 = q.getStats();
    expect(stats1.queuedCount).toBe(1);

    resetA2ATaskQueue();

    const q2 = getA2ATaskQueue();
    const stats2 = q2.getStats();
    expect(stats2.queuedCount).toBe(0);
  });

  it('messaging inbox is empty after reset', () => {
    const ms = getAgentMessagingService();
    ms.sendMessage({ fromAgentId: 'a', toAgentId: 'b', type: 'request', subject: 'test', body: 'hi' });

    const inbox1 = ms.getInbox({ agentId: 'b' });
    expect(inbox1.length).toBe(1);

    resetAgentMessagingService();

    const ms2 = getAgentMessagingService();
    const inbox2 = ms2.getInbox({ agentId: 'b' });
    expect(inbox2.length).toBe(0);
  });

  it('RBAC policies reset to defaults', () => {
    const rbac = getA2ARBACService();
    rbac.assignRole('test-user', 'viewer');
    rbac.addCustomPolicy({ role: 'viewer', resource: 'tasks', actions: ['create'] });

    // Custom policy should allow viewer to create tasks
    const before = rbac.isAllowed('test-user', 'tasks', 'create');
    expect(before).toBe(true);

    resetA2ARBACService();

    const rbac2 = getA2ARBACService();
    rbac2.assignRole('test-user', 'viewer');
    // After reset, custom policy should be gone — viewer should NOT have create
    const after = rbac2.isAllowed('test-user', 'tasks', 'create');
    expect(after).toBe(false);
  });
});

describe('Event Listener Cleanup', () => {
  beforeEach(() => {
    resetAllServices();
  });

  it('EventEmitter-based services have zero listeners after reset', () => {
    const queue = getA2ATaskQueue();
    queue.on('task:completed', () => {});
    queue.on('task:failed', () => {});
    
    resetA2ATaskQueue();
    
    const queue2 = getA2ATaskQueue();
    // New instance should have no custom listeners
    expect(queue2.listenerCount('task:completed')).toBe(0);
    expect(queue2.listenerCount('task:failed')).toBe(0);
  });

  it('scheduler timer is cleared after reset', () => {
    const sched = getA2ATaskScheduler();
    sched.createSchedule({
      name: 'test-sched',
      type: 'interval',
      intervalMs: 1000,
      taskTemplate: { taskId: 'task-1', agentId: 'agent-1', prompt: 'Do something' },
    });
    
    resetA2ATaskScheduler();
    
    const sched2 = getA2ATaskScheduler();
    const schedules = sched2.listSchedules();
    expect(schedules.length).toBe(0);
  });

  it('workflow engine has no registered workflows after reset', () => {
    const we = getWorkflowEngine();
    we.registerWorkflow({
      name: 'test-workflow',
      steps: [{ name: 'step1', type: 'task', agentId: 'a', prompt: 'work' }],
    });
    
    resetWorkflowEngine();
    
    const we2 = getWorkflowEngine();
    const workflows = we2.listWorkflows();
    expect(workflows.length).toBe(0);
  });
});
