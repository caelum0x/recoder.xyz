/**
 * @module a2a-full-gateway.e2e.test
 *
 * Full gateway integration test — verifies:
 * 1. All route prefixes are mounted and reachable (no 404s)
 * 2. Cross-service workflows work end-to-end at the service level
 * 3. Event-driven integration wiring connects subsystems
 */

import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import fetch from 'node-fetch';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  taskLifecycleRouter,
  collaborationRouter,
  heartbeatRouter,
  agentRegistryRouter,
  connectorHealthRouter,
  claudeConnectorRouter,
  codexConnectorRouter,
  contextBridgeRouter,
  a2aOpenApiRouter,
  a2aSloMetricsRouter,
  orchestrationRouter,
  workflowMessagingRouter,
  adminRouter,
  // Services for cross-service tests
  getTaskLifecycleService,
  getAgentRegistryService,
  getWorkflowEngine,
  getAgentMessagingService,
  getDelegationChainService,
  getA2ATaskQueue,
  getA2ATaskScheduler,
  getIntegrationWiringService,
  getContextBridgeService,
  getPipelineOrchestrator,
  getScatterGatherOrchestrator,
  getCapabilityMatcher,
  // Resets
  resetTaskLifecycleService,
  resetCollaborationSvc,
  resetHeartbeatTracker,
  resetAgentRegistryService,
  resetA2AEventBus,
  resetA2AEventBridge,
  resetA2ARateLimiter,
  resetA2ARBACService,
  resetPipelineOrchestrator,
  resetScatterGatherOrchestrator,
  resetSupervisorOrchestrator,
  resetA2ATaskQueue,
  resetA2ATaskScheduler,
  resetWorkflowEngine,
  resetAgentMessagingService,
  resetDelegationChainService,
  resetIntegrationWiringService,
  resetConnectorHealthMonitor,
  resetClaudeConnectorRuntime,
  resetCodexConnectorRuntime,
  resetContextBridgeService,
  resetTraceService,
  resetCapabilityMatcher,
  resetTaskResultAggregator,
} from '../index';

import { restAdapterRouter, gitAdapterRouter, resetRestAdapters, resetGitAdapters, resetAdapterRegistry } from '../adapters';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

function resetAll() {
  resetTaskLifecycleService();
  resetCollaborationSvc();
  resetHeartbeatTracker();
  resetAgentRegistryService();
  resetA2AEventBus();
  resetA2AEventBridge();
  resetA2ARateLimiter();
  resetA2ARBACService();
  resetPipelineOrchestrator();
  resetScatterGatherOrchestrator();
  resetSupervisorOrchestrator();
  resetA2ATaskQueue();
  resetA2ATaskScheduler();
  resetWorkflowEngine();
  resetAgentMessagingService();
  resetDelegationChainService();
  resetIntegrationWiringService();
  resetConnectorHealthMonitor();
  resetClaudeConnectorRuntime();
  resetCodexConnectorRuntime();
  resetContextBridgeService();
  resetTraceService();
  resetCapabilityMatcher();
  resetTaskResultAggregator();
  resetRestAdapters();
  resetGitAdapters();
  resetAdapterRegistry();
}

beforeAll(async () => {
  resetAll();

  const app = express();
  app.use(express.json());

  // Mount all A2A sub-routers (mirrors server.ts)
  app.use('/api/a2a/tasks', taskLifecycleRouter);
  app.use('/api/a2a/channels', collaborationRouter);
  app.use('/api/a2a', heartbeatRouter);
  app.use('/api/a2a/agents', agentRegistryRouter);
  app.use('/api/a2a/connectors/claude', claudeConnectorRouter);
  app.use('/api/a2a/connectors/codex', codexConnectorRouter);
  app.use('/api/a2a/adapters/rest', restAdapterRouter);
  app.use('/api/a2a/adapters/git', gitAdapterRouter);
  app.use('/api/a2a/context', contextBridgeRouter);
  app.use('/api/a2a', connectorHealthRouter);
  app.use('/api/a2a', a2aOpenApiRouter);
  app.use('/api/a2a', a2aSloMetricsRouter);
  app.use('/api/a2a/orchestration', orchestrationRouter);
  app.use('/api/a2a', workflowMessagingRouter);
  app.use('/api/a2a/admin', adminRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  resetAll();
});

beforeEach(() => {
  resetAll();
});

// ===========================================================================
// 1. Route Mounting Smoke Tests
//    Verify all route prefixes respond (non-404), proving the routing layer
//    is correctly wired. These are GET requests to list endpoints.
// ===========================================================================

describe('Route Mounting Smoke', () => {
  const smokeEndpoints = [
    { path: '/api/a2a/tasks', name: 'Task Lifecycle' },
    { path: '/api/a2a/channels', name: 'Collaboration' },
    { path: '/api/a2a/agents', name: 'Agent Registry' },
    { path: '/api/a2a/connectors/claude/status', name: 'Claude Connector' },
    { path: '/api/a2a/connectors/codex/status', name: 'Codex Connector' },
    { path: '/api/a2a/connectors/health', name: 'Connector Health' },
    { path: '/api/a2a/docs', name: 'OpenAPI Docs' },
    { path: '/api/a2a/metrics', name: 'SLO Metrics' },
    { path: '/api/a2a/workflows', name: 'Workflows' },
    { path: '/api/a2a/admin/system/health', name: 'Admin Health' },
    { path: '/api/a2a/admin/rate-limits/summary', name: 'Admin Rate Limits' },
    { path: '/api/a2a/admin/queue/stats', name: 'Admin Queue Stats' },
  ];

  for (const { path, name } of smokeEndpoints) {
    it(`${name} route is mounted (${path})`, async () => {
      const res = await fetch(`${baseUrl}${path}`);
      // Any status other than 404 means the route is mounted
      expect(res.status).not.toBe(404);
    });
  }
});

// ===========================================================================
// 2. Cross-Service Integration Tests (Service Level)
//    Test that services work together correctly.
// ===========================================================================

describe('Cross-Service Integration', () => {
  it('task lifecycle: create → transition → complete', () => {
    const svc = getTaskLifecycleService();
    const created = svc.createTask({
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      requester: { agent_id: 'agent-a', platform: 'claude' },
      assignee: { agent_id: 'agent-b', platform: 'codex' },
      connector: { connector_id: 'conn-1', platform: 'claude', protocol: 'mcp' },
      payload: { prompt: 'Review code' },
    });
    expect(created.ok).toBe(true);
    const taskId = created.data!.id;

    const working = svc.transitionTask(taskId, { target_state: 'working' });
    expect(working.ok).toBe(true);

    const completed = svc.transitionTask(taskId, {
      target_state: 'completed',
      result: { summary: 'Done' },
    });
    expect(completed.ok).toBe(true);
    expect(completed.data!.state).toBe('completed');
  });

  it('agent registry: register → discover', () => {
    const registry = getAgentRegistryService();
    registry.selfRegister({
      agentId: 'coding-agent',
      name: 'Coding Agent',
      platform: 'claude_code',
    });
    registry.selfRegister({
      agentId: 'review-agent',
      name: 'Review Agent',
      platform: 'codex',
    });

    const all = registry.discover();
    // At least 2 registered + default agents
    expect(all.length).toBeGreaterThanOrEqual(2);
    const found = all.find((a: any) => a.identity?.id === 'coding-agent');
    expect(found).toBeDefined();
  });

  it('delegation chain: delegate → accept → complete', () => {
    const svc = getDelegationChainService();
    const del = svc.delegate({
      fromAgentId: 'supervisor',
      toAgentId: 'worker-1',
      prompt: 'Write tests',
    });
    expect(del.status).toBe('pending');

    svc.accept(del.delegationId);
    const accepted = svc.getDelegation(del.delegationId)!;
    expect(accepted.status).toBe('accepted');

    svc.complete(del.delegationId, JSON.stringify({ testsWritten: 10 }));
    const completed = svc.getDelegation(del.delegationId)!;
    expect(completed.status).toBe('completed');
  });

  it('agent messaging: send → inbox → mark read', () => {
    const ms = getAgentMessagingService();
    const msg = ms.sendMessage({
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      type: 'request',
      subject: 'Code Review',
      body: 'Review this PR',
    });
    expect(msg.deliveryStatus).toBe('sent');

    const inbox = ms.getInbox({ agentId: 'agent-b' });
    expect(inbox.length).toBe(1);
    expect(inbox[0].body).toBe('Review this PR');

    ms.markRead(msg.messageId);
    const updated = ms.getMessage(msg.messageId)!;
    expect(updated.deliveryStatus).toBe('read');
  });

  it('pipeline: register and retrieve', () => {
    const po = getPipelineOrchestrator();
    po.registerPipeline({
      pipelineId: 'pipe-1',
      name: 'code-review-pipeline',
      steps: [
        { stepId: 'lint', agentId: 'linter', promptTemplate: 'Lint the code' },
        { stepId: 'review', agentId: 'reviewer', promptTemplate: 'Review: {{input}}' },
      ],
      errorStrategy: 'fail-fast',
    });

    const retrieved = po.getPipeline('pipe-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('code-review-pipeline');
    expect(retrieved!.steps.length).toBe(2);
  });

  it('scatter-gather: register', () => {
    const sg = getScatterGatherOrchestrator();
    sg.registerPattern({
      patternId: 'sg-1',
      name: 'multi-review',
      targets: [
        { agentId: 'agent-a', prompt: 'Review security' },
        { agentId: 'agent-b', prompt: 'Review performance' },
      ],
      gatherStrategy: 'wait-all',
    });

    const retrieved = sg.getPattern('sg-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('multi-review');
  });

  it('workflow engine: register and list', () => {
    const we = getWorkflowEngine();
    we.registerWorkflow({
      workflowId: 'wf-deploy',
      name: 'deployment-workflow',
      steps: [
        { type: 'task', stepId: 'test', agentId: 'tester', prompt: 'Run tests' },
        { type: 'task', stepId: 'deploy', agentId: 'deployer', prompt: 'Deploy to staging' },
      ],
    });

    const list = we.listWorkflows();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('deployment-workflow');
  });

  it('context bridge: store and retrieve', async () => {
    const ctx = getContextBridgeService();
    const created = await ctx.createContext('task-1', 'metadata', { file: 'main.ts', content: 'const x = 1;' });
    expect(created.ok).toBe(true);

    const retrieved = await ctx.getContext('task-1');
    expect(retrieved.ok).toBe(true);
    if (retrieved.ok) {
      expect(retrieved.data.entries.length).toBe(1);
    }
  });

  it('task queue: enqueue and dequeue', () => {
    const q = getA2ATaskQueue();
    const task = q.enqueue({
      taskId: 'task-1',
      agentId: 'agent-a',
      prompt: 'Do something',
      priority: 'high',
    });
    expect(task.status).toBe('queued');
    expect(task.priority).toBe('high');

    const stats = q.getStats();
    expect(stats.queuedCount).toBe(1);
    expect(stats.byPriority.high).toBe(1);
  });

  it('task scheduler: create and list schedules', () => {
    const s = getA2ATaskScheduler();
    s.createSchedule({
      name: 'nightly-cleanup',
      type: 'interval',
      intervalMs: 86400000,
      taskTemplate: { taskId: 'cleanup', agentId: 'janitor', prompt: 'Clean up' },
    });

    const schedules = s.listSchedules();
    expect(schedules.length).toBe(1);
    expect(schedules[0].name).toBe('nightly-cleanup');
  });

  it('integration wiring: wireAll connects subsystems', () => {
    const wiring = getIntegrationWiringService();
    expect(() => wiring.wireAll()).not.toThrow();

    const stats = wiring.getStats();
    expect(stats).toBeDefined();

    // Unwire and verify rewiring works
    wiring.unwire();
    expect(() => wiring.wireAll()).not.toThrow();
  });
});
