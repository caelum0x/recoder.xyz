/**
 * @module patterns.test
 *
 * Comprehensive test suite for the A2A collaboration patterns:
 * - PatternRegistry: registration, lookup, listing, singleton lifecycle
 * - DirectHandoffPattern: two-phase handoff between Agent A and Agent B
 * - SupervisorOrchestrationPattern: master task + subtask fan-out
 * - CompetitivePattern: parallel race with winner selection and cancellation
 *
 * All three patterns depend on the TaskLifecycleService,
 * AMBCollaborationService, and ContextBridgeService singletons, which are
 * reset in `beforeEach` to ensure test isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { resetTaskLifecycleService, getTaskLifecycleService } from '../task-lifecycle.service';
import { resetCollaborationSvc, getCollaborationSvc } from '../collaboration.service';
import { resetContextBridgeService, getContextBridgeService } from '../context-bridge.service';
import {
  PatternRegistry,
  getPatternRegistry,
  resetPatternRegistry,
} from '../patterns/pattern-registry';
import { DirectHandoffPattern } from '../patterns/direct-handoff';
import { SupervisorOrchestrationPattern } from '../patterns/supervisor-orchestration';
import { CompetitivePattern } from '../patterns/competitive-pattern';
import type {
  AgentRef,
  PatternConfig,
  DirectHandoffInput,
  SupervisorInput,
  CompetitiveInput,
  PatternResult,
} from '../patterns/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAgent(id: string, name?: string): AgentRef {
  return {
    agent_id: id,
    platform: 'codex',
    name: name ?? id,
  };
}

function makeConfig(overrides: Partial<PatternConfig> = {}): PatternConfig {
  return {
    patternType: 'direct-handoff',
    workspaceId: 'ws_test',
    threadId: 'thr_test',
    requester: makeAgent('requester'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite-level reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetTaskLifecycleService();
  resetCollaborationSvc();
  resetContextBridgeService();
  resetPatternRegistry();
});

// ===========================================================================
// PatternRegistry
// ===========================================================================

describe('PatternRegistry', () => {
  describe('createDefault()', () => {
    it('registers all 3 built-in patterns', () => {
      const registry = PatternRegistry.createDefault();
      const types = registry.list();
      expect(types).toHaveLength(3);
      expect(types).toContain('direct-handoff');
      expect(types).toContain('supervisor');
      expect(types).toContain('competitive');
    });

    it('returns instances of the correct classes', () => {
      const registry = PatternRegistry.createDefault();
      expect(registry.get('direct-handoff')).toBeInstanceOf(DirectHandoffPattern);
      expect(registry.get('supervisor')).toBeInstanceOf(SupervisorOrchestrationPattern);
      expect(registry.get('competitive')).toBeInstanceOf(CompetitivePattern);
    });
  });

  describe('get()', () => {
    it('returns correct pattern by type', () => {
      const registry = PatternRegistry.createDefault();
      const handoff = registry.get('direct-handoff');
      expect(handoff).toBeDefined();
      expect(handoff!.patternType).toBe('direct-handoff');

      const supervisor = registry.get('supervisor');
      expect(supervisor).toBeDefined();
      expect(supervisor!.patternType).toBe('supervisor');

      const competitive = registry.get('competitive');
      expect(competitive).toBeDefined();
      expect(competitive!.patternType).toBe('competitive');
    });

    it('returns undefined for unknown type', () => {
      const registry = PatternRegistry.createDefault();
      expect(registry.get('unknown-type')).toBeUndefined();
      expect(registry.get('')).toBeUndefined();
    });
  });

  describe('list()', () => {
    it('returns all 3 types for a default registry', () => {
      const registry = PatternRegistry.createDefault();
      expect(registry.list()).toEqual(
        expect.arrayContaining(['direct-handoff', 'supervisor', 'competitive']),
      );
    });

    it('returns an empty array for an empty registry', () => {
      const registry = new PatternRegistry();
      expect(registry.list()).toEqual([]);
    });
  });

  describe('getDetails()', () => {
    it('returns descriptions for all registered patterns', () => {
      const registry = PatternRegistry.createDefault();
      const details = registry.getDetails();
      expect(details).toHaveLength(3);

      const types = details.map((d) => d.type);
      expect(types).toContain('direct-handoff');
      expect(types).toContain('supervisor');
      expect(types).toContain('competitive');

      for (const detail of details) {
        expect(detail.description).toBeTruthy();
        expect(typeof detail.description).toBe('string');
      }
    });

    it('filters descriptions to only registered patterns', () => {
      const registry = new PatternRegistry();
      registry.register(new DirectHandoffPattern());
      const details = registry.getDetails();
      expect(details).toHaveLength(1);
      expect(details[0].type).toBe('direct-handoff');
    });
  });

  describe('register()', () => {
    it('adds a custom pattern', () => {
      const registry = new PatternRegistry();
      expect(registry.list()).toHaveLength(0);

      registry.register(new DirectHandoffPattern());
      expect(registry.list()).toHaveLength(1);
      expect(registry.get('direct-handoff')).toBeDefined();
    });

    it('overwrites an existing pattern of the same type', () => {
      const registry = new PatternRegistry();
      const first = new DirectHandoffPattern();
      const second = new DirectHandoffPattern();
      registry.register(first);
      registry.register(second);
      expect(registry.list()).toHaveLength(1);
      expect(registry.get('direct-handoff')).toBe(second);
    });
  });

  describe('Singleton: getPatternRegistry / resetPatternRegistry', () => {
    it('getPatternRegistry returns the same instance on repeated calls', () => {
      const a = getPatternRegistry();
      const b = getPatternRegistry();
      expect(a).toBe(b);
    });

    it('resetPatternRegistry clears the singleton', () => {
      const before = getPatternRegistry();
      resetPatternRegistry();
      const after = getPatternRegistry();
      expect(before).not.toBe(after);
    });

    it('getPatternRegistry returns a default registry with 3 patterns', () => {
      const registry = getPatternRegistry();
      expect(registry.list()).toHaveLength(3);
    });
  });
});

// ===========================================================================
// DirectHandoffPattern
// ===========================================================================

describe('DirectHandoffPattern', () => {
  let pattern: DirectHandoffPattern;

  beforeEach(() => {
    pattern = new DirectHandoffPattern();
    // Ensure singletons are initialized
    getTaskLifecycleService();
    getCollaborationSvc();
    getContextBridgeService();
  });

  it('has patternType "direct-handoff"', () => {
    expect(pattern.patternType).toBe('direct-handoff');
  });

  it('rejects invalid input kind', async () => {
    const config = makeConfig();
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Test',
      supervisor: makeAgent('supervisor'),
      subtasks: [],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input kind');
    expect(result.taskIds).toEqual([]);
    expect(result.patternType).toBe('direct-handoff');
  });

  it('creates tasks for Agent A and Agent B and returns both taskIds', async () => {
    const config = makeConfig();
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Translate this document',
      agentA: makeAgent('agent-a', 'Agent A'),
      agentB: makeAgent('agent-b', 'Agent B'),
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    expect(result.patternType).toBe('direct-handoff');
    expect(result.taskIds).toHaveLength(2);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.taskAId).toBe(result.taskIds[0]);
    expect(result.metadata!.taskBId).toBe(result.taskIds[1]);
  });

  it('transfers context from task A to task B', async () => {
    const config = makeConfig();
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Analyze and summarize',
      agentA: makeAgent('agent-a'),
      agentB: makeAgent('agent-b'),
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    // Verify that context was created on task A and transferred to task B
    const contextBridge = getContextBridgeService();
    const taskAContext = await contextBridge.getContext(result.taskIds[0]);
    expect(taskAContext.ok).toBe(true);

    const taskBContext = await contextBridge.getContext(result.taskIds[1]);
    expect(taskBContext.ok).toBe(true);
  });

  it('returns success with finalResult describing the handoff', async () => {
    const config = makeConfig();
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Do something',
      agentA: makeAgent('alpha'),
      agentB: makeAgent('bravo'),
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    expect(result.finalResult).toContain('alpha');
    expect(result.finalResult).toContain('bravo');
    expect(result.finalResult).toContain('Direct handoff complete');
  });

  it('posts messages to AMB channel', async () => {
    const config = makeConfig();
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Write a report',
      agentA: makeAgent('writer'),
      agentB: makeAgent('reviewer'),
    };
    await pattern.execute(config, input);

    // Verify that a channel and thread were created and messages posted
    const collabSvc = getCollaborationSvc();
    const channels = collabSvc.listChannels();
    const handoffChannel = channels.find((ch) => ch.name === `handoff-${config.threadId}`);
    expect(handoffChannel).toBeDefined();

    const threads = collabSvc.listThreads(handoffChannel!.id);
    expect(threads.length).toBeGreaterThanOrEqual(1);

    const messages = collabSvc.listMessages(threads[0].id);
    expect(messages.length).toBeGreaterThanOrEqual(2); // Phase A complete + finished
  });

  it('handles handoffInstructions', async () => {
    const config = makeConfig();
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Generate code',
      agentA: makeAgent('coder'),
      agentB: makeAgent('tester'),
      handoffInstructions: 'Please review the generated code and write tests',
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    // Verify task B was created with handoff instructions in payload
    const lifecycle = getTaskLifecycleService();
    const taskBResult = lifecycle.getTask(result.taskIds[1]);
    expect(taskBResult.ok).toBe(true);
    if (taskBResult.ok) {
      const payload = taskBResult.data.payload;
      if (Array.isArray(payload)) {
        const textPayload = payload.find((p) => p.kind === 'text');
        expect(textPayload).toBeDefined();
        expect((textPayload as { text: string }).text).toContain(
          'Please review the generated code and write tests',
        );
      } else {
        expect((payload as { text: string }).text).toContain(
          'Please review the generated code and write tests',
        );
      }
    }
  });

  it('transitions both tasks through submitted -> working -> completed', async () => {
    const config = makeConfig();
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Full lifecycle',
      agentA: makeAgent('a1'),
      agentB: makeAgent('b1'),
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    const lifecycle = getTaskLifecycleService();
    for (const taskId of result.taskIds) {
      const task = lifecycle.getTask(taskId);
      expect(task.ok).toBe(true);
      if (task.ok) {
        expect(task.data.state).toBe('completed');
      }
    }
  });

  it('reuses existing channel on repeated executions', async () => {
    const config = makeConfig();
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'First run',
      agentA: makeAgent('a'),
      agentB: makeAgent('b'),
    };
    await pattern.execute(config, input);

    const input2: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Second run',
      agentA: makeAgent('a'),
      agentB: makeAgent('b'),
    };
    await pattern.execute(config, input2);

    const channels = getCollaborationSvc().listChannels();
    const handoffChannels = channels.filter((ch) => ch.name === `handoff-${config.threadId}`);
    expect(handoffChannels).toHaveLength(1);
  });
});

// ===========================================================================
// SupervisorOrchestrationPattern
// ===========================================================================

describe('SupervisorOrchestrationPattern', () => {
  let pattern: SupervisorOrchestrationPattern;

  beforeEach(() => {
    pattern = new SupervisorOrchestrationPattern();
    getTaskLifecycleService();
    getCollaborationSvc();
    getContextBridgeService();
  });

  it('has patternType "supervisor"', () => {
    expect(pattern.patternType).toBe('supervisor');
  });

  it('rejects invalid input kind', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Test',
      agentA: makeAgent('a'),
      agentB: makeAgent('b'),
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input kind');
    expect(result.taskIds).toEqual([]);
    expect(result.patternType).toBe('supervisor');
  });

  it('creates master task + N subtasks', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const workers = [makeAgent('worker-1'), makeAgent('worker-2'), makeAgent('worker-3')];
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Coordinate the team',
      supervisor: makeAgent('supervisor'),
      subtasks: workers.map((w, i) => ({
        prompt: `Subtask ${i + 1}`,
        assignee: w,
      })),
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    // 1 master + 3 subtasks = 4 total taskIds
    expect(result.taskIds).toHaveLength(4);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.masterTaskId).toBe(result.taskIds[0]);
    expect(result.metadata!.completedCount).toBe(3);
    expect(result.metadata!.failedCount).toBe(0);
  });

  it('transitions all tasks through lifecycle to completed', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Run all',
      supervisor: makeAgent('boss'),
      subtasks: [
        { prompt: 'Task A', assignee: makeAgent('w1') },
        { prompt: 'Task B', assignee: makeAgent('w2') },
      ],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    const lifecycle = getTaskLifecycleService();
    for (const taskId of result.taskIds) {
      const task = lifecycle.getTask(taskId);
      expect(task.ok).toBe(true);
      if (task.ok) {
        expect(task.data.state).toBe('completed');
      }
    }
  });

  it('returns aggregate results with correct counts', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Orchestrate 2 subtasks',
      supervisor: makeAgent('sup'),
      subtasks: [
        { prompt: 'Sub 1', assignee: makeAgent('w1') },
        { prompt: 'Sub 2', assignee: makeAgent('w2') },
      ],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    expect(result.finalResult).toContain('2/2');
    expect(result.metadata!.completedCount).toBe(2);
    expect(result.metadata!.failedCount).toBe(0);
  });

  it('handles zero subtasks gracefully', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'No subtasks',
      supervisor: makeAgent('sup'),
      subtasks: [],
    };
    const result = await pattern.execute(config, input);
    // With zero subtasks, master is created + completed, failedCount is 0
    expect(result.success).toBe(true);
    expect(result.taskIds).toHaveLength(1); // master only
    expect(result.metadata!.completedCount).toBe(0);
    expect(result.metadata!.failedCount).toBe(0);
    expect(result.finalResult).toContain('0/0');
  });

  it('posts orchestration updates to AMB', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Observe messages',
      supervisor: makeAgent('lead'),
      subtasks: [
        { prompt: 'Sub 1', assignee: makeAgent('w1') },
      ],
    };
    await pattern.execute(config, input);

    const collabSvc = getCollaborationSvc();
    const channels = collabSvc.listChannels();
    const supervisorChannel = channels.find((ch) => ch.name === `supervisor-${config.threadId}`);
    expect(supervisorChannel).toBeDefined();

    const threads = collabSvc.listThreads(supervisorChannel!.id);
    expect(threads.length).toBeGreaterThanOrEqual(1);

    const messages = collabSvc.listMessages(threads[0].id);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.text.includes('completed'))).toBe(true);
  });

  it('transfers context from master to each subtask', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Transfer context',
      supervisor: makeAgent('sup'),
      subtasks: [
        { prompt: 'Sub 1', assignee: makeAgent('w1') },
        { prompt: 'Sub 2', assignee: makeAgent('w2') },
      ],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    const contextBridge = getContextBridgeService();
    // Master task should have context
    const masterCtx = await contextBridge.getContext(result.taskIds[0]);
    expect(masterCtx.ok).toBe(true);

    // Subtasks should have transferred context
    for (let i = 1; i < result.taskIds.length; i++) {
      const subCtx = await contextBridge.getContext(result.taskIds[i]);
      expect(subCtx.ok).toBe(true);
    }
  });

  it('tags master task with pattern:supervisor and master', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Check tags',
      supervisor: makeAgent('sup'),
      subtasks: [{ prompt: 'Sub', assignee: makeAgent('w') }],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    const lifecycle = getTaskLifecycleService();
    const masterTask = lifecycle.getTask(result.taskIds[0]);
    expect(masterTask.ok).toBe(true);
    if (masterTask.ok) {
      expect(masterTask.data.tags).toContain('pattern:supervisor');
      expect(masterTask.data.tags).toContain('master');
    }
  });

  it('tags subtasks with sequential subtask index', async () => {
    const config = makeConfig({ patternType: 'supervisor' });
    const input: SupervisorInput = {
      kind: 'supervisor',
      prompt: 'Check subtask tags',
      supervisor: makeAgent('sup'),
      subtasks: [
        { prompt: 'Sub 1', assignee: makeAgent('w1') },
        { prompt: 'Sub 2', assignee: makeAgent('w2') },
      ],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    const lifecycle = getTaskLifecycleService();
    const sub1 = lifecycle.getTask(result.taskIds[1]);
    const sub2 = lifecycle.getTask(result.taskIds[2]);
    expect(sub1.ok).toBe(true);
    expect(sub2.ok).toBe(true);
    if (sub1.ok) expect(sub1.data.tags).toContain('subtask:1');
    if (sub2.ok) expect(sub2.data.tags).toContain('subtask:2');
  });
});

// ===========================================================================
// CompetitivePattern
// ===========================================================================

describe('CompetitivePattern', () => {
  let pattern: CompetitivePattern;

  beforeEach(() => {
    pattern = new CompetitivePattern();
    getTaskLifecycleService();
    getCollaborationSvc();
    getContextBridgeService();
  });

  it('has patternType "competitive"', () => {
    expect(pattern.patternType).toBe('competitive');
  });

  it('rejects invalid input kind', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: DirectHandoffInput = {
      kind: 'direct-handoff',
      prompt: 'Test',
      agentA: makeAgent('a'),
      agentB: makeAgent('b'),
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input kind');
    expect(result.taskIds).toEqual([]);
    expect(result.patternType).toBe('competitive');
  });

  it('requires at least 2 agents', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Race',
      agents: [makeAgent('solo')],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(false);
    expect(result.error).toBe('At least 2 agents are required');
    expect(result.taskIds).toEqual([]);
  });

  it('rejects zero agents', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Race',
      agents: [],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(false);
    expect(result.error).toBe('At least 2 agents are required');
  });

  it('creates parallel tasks for all agents', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const agents = [makeAgent('racer-1'), makeAgent('racer-2'), makeAgent('racer-3')];
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Solve this problem',
      agents,
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    expect(result.taskIds).toHaveLength(3);
  });

  it('first agent wins, others are cancelled', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const agents = [makeAgent('first'), makeAgent('second'), makeAgent('third')];
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Race!',
      agents,
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    // The winner is always agents[0] in the current implementation
    expect(result.metadata!.winnerId).toBe('first');
    expect(result.metadata!.cancelledCount).toBe(2);

    // Verify winner task is completed
    const lifecycle = getTaskLifecycleService();
    const winnerTask = lifecycle.getTask(result.metadata!.winnerTaskId as string);
    expect(winnerTask.ok).toBe(true);
    if (winnerTask.ok) {
      expect(winnerTask.data.state).toBe('completed');
    }

    // Verify other tasks are cancelled
    for (let i = 1; i < result.taskIds.length; i++) {
      const task = lifecycle.getTask(result.taskIds[i]);
      expect(task.ok).toBe(true);
      if (task.ok) {
        expect(task.data.state).toBe('cancelled');
      }
    }
  });

  it('returns winner info in metadata', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Who is fastest?',
      agents: [makeAgent('alpha'), makeAgent('beta')],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.winnerId).toBe('alpha');
    expect(result.metadata!.winnerTaskId).toBeDefined();
    expect(typeof result.metadata!.winnerTaskId).toBe('string');
    expect(result.metadata!.cancelledCount).toBe(1);
    expect(result.finalResult).toContain('alpha');
  });

  it('posts competition updates to AMB', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Observe messages',
      agents: [makeAgent('r1'), makeAgent('r2')],
    };
    await pattern.execute(config, input);

    const collabSvc = getCollaborationSvc();
    const channels = collabSvc.listChannels();
    const competitionChannel = channels.find(
      (ch) => ch.name === `competition-${config.threadId}`,
    );
    expect(competitionChannel).toBeDefined();

    const threads = collabSvc.listThreads(competitionChannel!.id);
    expect(threads.length).toBeGreaterThanOrEqual(1);

    const messages = collabSvc.listMessages(threads[0].id);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.text.includes('Winner'))).toBe(true);
  });

  it('tags each task with pattern:competitive and agent id', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Tag check',
      agents: [makeAgent('x'), makeAgent('y')],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);

    const lifecycle = getTaskLifecycleService();
    const taskX = lifecycle.getTask(result.taskIds[0]);
    const taskY = lifecycle.getTask(result.taskIds[1]);
    expect(taskX.ok).toBe(true);
    expect(taskY.ok).toBe(true);
    if (taskX.ok) {
      expect(taskX.data.tags).toContain('pattern:competitive');
      expect(taskX.data.tags).toContain('agent:x');
    }
    if (taskY.ok) {
      expect(taskY.data.tags).toContain('pattern:competitive');
      expect(taskY.data.tags).toContain('agent:y');
    }
  });

  it('handles exactly 2 agents (minimum)', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Minimal race',
      agents: [makeAgent('one'), makeAgent('two')],
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    expect(result.taskIds).toHaveLength(2);
    expect(result.metadata!.cancelledCount).toBe(1);
  });

  it('handles many agents', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const agents = Array.from({ length: 10 }, (_, i) => makeAgent(`agent-${i}`));
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Large race',
      agents,
    };
    const result = await pattern.execute(config, input);
    expect(result.success).toBe(true);
    expect(result.taskIds).toHaveLength(10);
    expect(result.metadata!.winnerId).toBe('agent-0');
    expect(result.metadata!.cancelledCount).toBe(9);
  });

  it('reuses existing channel on repeated executions', async () => {
    const config = makeConfig({ patternType: 'competitive' });
    const input: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'First race',
      agents: [makeAgent('a'), makeAgent('b')],
    };
    await pattern.execute(config, input);

    const input2: CompetitiveInput = {
      kind: 'competitive',
      prompt: 'Second race',
      agents: [makeAgent('a'), makeAgent('b')],
    };
    await pattern.execute(config, input2);

    const channels = getCollaborationSvc().listChannels();
    const competitionChannels = channels.filter(
      (ch) => ch.name === `competition-${config.threadId}`,
    );
    expect(competitionChannels).toHaveLength(1);
  });
});

// ===========================================================================
// Cross-pattern integration
// ===========================================================================

describe('Cross-pattern integration', () => {
  it('different patterns can run against the same workspace/thread', async () => {
    const config = makeConfig({ workspaceId: 'ws_shared', threadId: 'thr_shared' });

    const handoff = new DirectHandoffPattern();
    const handoffResult = await handoff.execute(config, {
      kind: 'direct-handoff',
      prompt: 'Handoff job',
      agentA: makeAgent('ha'),
      agentB: makeAgent('hb'),
    });
    expect(handoffResult.success).toBe(true);

    const supervisor = new SupervisorOrchestrationPattern();
    const supResult = await supervisor.execute(
      { ...config, patternType: 'supervisor' },
      {
        kind: 'supervisor',
        prompt: 'Supervisor job',
        supervisor: makeAgent('sup'),
        subtasks: [{ prompt: 'Sub', assignee: makeAgent('w') }],
      },
    );
    expect(supResult.success).toBe(true);

    const competitive = new CompetitivePattern();
    const compResult = await competitive.execute(
      { ...config, patternType: 'competitive' },
      {
        kind: 'competitive',
        prompt: 'Competition job',
        agents: [makeAgent('c1'), makeAgent('c2')],
      },
    );
    expect(compResult.success).toBe(true);

    // All task IDs should be unique
    const allIds = [
      ...handoffResult.taskIds,
      ...supResult.taskIds,
      ...compResult.taskIds,
    ];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('PatternRegistry can execute patterns by type', async () => {
    const registry = PatternRegistry.createDefault();
    const config = makeConfig({ patternType: 'competitive' });

    const patternInstance = registry.get('competitive');
    expect(patternInstance).toBeDefined();

    const result = await patternInstance!.execute(config, {
      kind: 'competitive',
      prompt: 'Registry-driven execution',
      agents: [makeAgent('ra'), makeAgent('rb')],
    });
    expect(result.success).toBe(true);
    expect(result.patternType).toBe('competitive');
  });
});
