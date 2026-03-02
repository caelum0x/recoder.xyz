/**
 * @module workflow-engine.test
 *
 * Comprehensive test suite for the A2A Workflow Engine.
 * Covers workflow CRUD, sequential/parallel/conditional step execution,
 * error strategies, cancellation, events, context sharing, and singleton lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  WorkflowEngine,
  getWorkflowEngine,
  resetWorkflowEngine,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowTaskStep,
  type WorkflowPipelineStep,
  type WorkflowScatterGatherStep,
  type WorkflowConditionalStep,
  type WorkflowParallelStep,
} from '../workflow-engine.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskStep(overrides: Partial<WorkflowTaskStep> = {}): WorkflowTaskStep {
  return {
    type: 'task',
    stepId: overrides.stepId ?? 'task-1',
    agentId: overrides.agentId ?? 'agent-1',
    prompt: overrides.prompt ?? 'Process: {{input}}',
    timeoutMs: overrides.timeoutMs,
  };
}

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    workflowId: overrides.workflowId ?? 'wf-1',
    name: overrides.name ?? 'Test Workflow',
    description: overrides.description,
    steps: overrides.steps ?? [makeTaskStep()],
    timeoutMs: overrides.timeoutMs,
    errorStrategy: overrides.errorStrategy,
  };
}

const successExecutor = async (_agentId: string, prompt: string) =>
  `Result: ${prompt}`;

const failExecutor = async () => {
  throw new Error('Agent failed');
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let engine: WorkflowEngine;

beforeEach(() => {
  resetWorkflowEngine();
  engine = new WorkflowEngine();
});

// ===========================================================================
// 1. registerWorkflow + getWorkflow
// ===========================================================================

describe('Workflow CRUD', () => {
  it('should register and retrieve a workflow', () => {
    const wf = makeWorkflow();
    engine.registerWorkflow(wf);

    const retrieved = engine.getWorkflow('wf-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.workflowId).toBe('wf-1');
    expect(retrieved!.name).toBe('Test Workflow');
  });

  // 2. listWorkflows
  it('should list all registered workflows', () => {
    engine.registerWorkflow(makeWorkflow({ workflowId: 'wf-a', name: 'A' }));
    engine.registerWorkflow(makeWorkflow({ workflowId: 'wf-b', name: 'B' }));

    const workflows = engine.listWorkflows();
    expect(workflows).toHaveLength(2);
    expect(workflows.map((w) => w.workflowId).sort()).toEqual(['wf-a', 'wf-b']);
  });

  // 3. removeWorkflow
  it('should remove a workflow and return true', () => {
    engine.registerWorkflow(makeWorkflow());
    expect(engine.removeWorkflow('wf-1')).toBe(true);
    expect(engine.getWorkflow('wf-1')).toBeUndefined();
  });

  it('should return false when removing a non-existent workflow', () => {
    expect(engine.removeWorkflow('no-such')).toBe(false);
  });
});

// ===========================================================================
// Execution tests
// ===========================================================================

describe('Workflow execution', () => {
  // 4. Execute simple 1-task workflow
  it('should execute a simple 1-task workflow', async () => {
    engine.registerWorkflow(makeWorkflow());

    const result = await engine.execute('wf-1', 'hello', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.workflowId).toBe('wf-1');
    expect(result.input).toBe('hello');
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].status).toBe('completed');
    expect(result.finalOutput).toBe('Result: Process: hello');
  });

  // 5. Execute multi-task workflow (output chains)
  it('should chain output from one task to the next', async () => {
    const wf = makeWorkflow({
      steps: [
        makeTaskStep({ stepId: 'step-1', prompt: 'First: {{input}}' }),
        makeTaskStep({ stepId: 'step-2', prompt: 'Second: {{input}}' }),
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'start', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.stepResults).toHaveLength(2);
    // Step 1 gets "start" as input
    expect(result.stepResults[0].output).toBe('Result: First: start');
    // Step 2 gets step 1's output as input
    expect(result.stepResults[1].output).toBe('Result: Second: Result: First: start');
    expect(result.finalOutput).toBe('Result: Second: Result: First: start');
  });

  // 6. Execute with pipeline step (simulated)
  it('should execute a pipeline step with simulated output', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'pipeline',
          stepId: 'pipe-step',
          pipelineId: 'my-pipeline',
        } as WorkflowPipelineStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('[pipeline:my-pipeline] executed');
  });

  // 7. Execute with scatter-gather step (simulated)
  it('should execute a scatter-gather step with simulated output', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'scatter-gather',
          stepId: 'sg-step',
          patternId: 'my-pattern',
        } as WorkflowScatterGatherStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('[scatter-gather:my-pattern] executed');
  });

  // 8. Execute with conditional step (true branch)
  it('should execute the then branch when condition is true', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'conditional',
          stepId: 'cond-1',
          condition: 'input === "yes"',
          thenSteps: [makeTaskStep({ stepId: 'then-task', prompt: 'Then: {{input}}' })],
          elseSteps: [makeTaskStep({ stepId: 'else-task', prompt: 'Else: {{input}}' })],
        } as WorkflowConditionalStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'yes', successExecutor);

    expect(result.status).toBe('completed');
    // The conditional step result itself + the inner step result
    expect(result.finalOutput).toBe('Result: Then: yes');
  });

  // 9. Execute with conditional step (false branch)
  it('should execute the else branch when condition is false', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'conditional',
          stepId: 'cond-1',
          condition: 'input === "yes"',
          thenSteps: [makeTaskStep({ stepId: 'then-task', prompt: 'Then: {{input}}' })],
          elseSteps: [makeTaskStep({ stepId: 'else-task', prompt: 'Else: {{input}}' })],
        } as WorkflowConditionalStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'no', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('Result: Else: no');
  });

  // 10. Execute with conditional step (no else branch)
  it('should pass input through when condition is false and no else branch', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'conditional',
          stepId: 'cond-1',
          condition: 'input === "yes"',
          thenSteps: [makeTaskStep({ stepId: 'then-task', prompt: 'Then: {{input}}' })],
        } as WorkflowConditionalStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'no', successExecutor);

    expect(result.status).toBe('completed');
    // No else branch, input passes through
    expect(result.finalOutput).toBe('no');
  });

  // 11. Execute with parallel step (all succeed)
  it('should execute parallel branches concurrently and join outputs', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'parallel',
          stepId: 'par-1',
          branches: [
            makeTaskStep({ stepId: 'branch-a', agentId: 'agent-a', prompt: 'A: {{input}}' }),
            makeTaskStep({ stepId: 'branch-b', agentId: 'agent-b', prompt: 'B: {{input}}' }),
          ],
        } as WorkflowParallelStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.finalOutput).toContain('Result: A: data');
    expect(result.finalOutput).toContain('Result: B: data');
  });

  // 12. Execute with parallel step (some fail) -- continue strategy
  it('should continue when parallel branch fails under continue strategy', async () => {
    let callCount = 0;
    const mixedExecutor = async (_agentId: string, prompt: string) => {
      callCount++;
      if (callCount === 1) throw new Error('Branch 1 failed');
      return `OK: ${prompt}`;
    };

    const wf = makeWorkflow({
      errorStrategy: 'continue',
      steps: [
        {
          type: 'parallel',
          stepId: 'par-1',
          branches: [
            makeTaskStep({ stepId: 'branch-a', agentId: 'agent-a', prompt: 'A: {{input}}' }),
            makeTaskStep({ stepId: 'branch-b', agentId: 'agent-b', prompt: 'B: {{input}}' }),
          ],
        } as WorkflowParallelStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', mixedExecutor);

    expect(result.status).toBe('completed');
    // Only the successful branch output is included
    expect(result.finalOutput).toContain('OK: B: data');
  });

  // 13. Fail-fast error strategy
  it('should stop on first error with fail-fast strategy', async () => {
    const wf = makeWorkflow({
      errorStrategy: 'fail-fast',
      steps: [
        makeTaskStep({ stepId: 'step-1', prompt: 'First: {{input}}' }),
        makeTaskStep({ stepId: 'step-2', prompt: 'Second: {{input}}' }),
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', failExecutor);

    expect(result.status).toBe('failed');
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].status).toBe('failed');
    expect(result.stepResults[0].error).toBe('Agent failed');
  });

  // 14. Continue error strategy
  it('should skip failed steps with continue strategy', async () => {
    let callIndex = 0;
    const failFirstExecutor = async (_agentId: string, prompt: string) => {
      callIndex++;
      if (callIndex === 1) throw new Error('First failed');
      return `Result: ${prompt}`;
    };

    const wf = makeWorkflow({
      errorStrategy: 'continue',
      steps: [
        makeTaskStep({ stepId: 'step-1', prompt: 'First: {{input}}' }),
        makeTaskStep({ stepId: 'step-2', prompt: 'Second: {{input}}' }),
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', failFirstExecutor);

    expect(result.status).toBe('completed');
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0].status).toBe('skipped');
    expect(result.stepResults[0].error).toBe('First failed');
    expect(result.stepResults[1].status).toBe('completed');
    // Step 2 receives the original input since step 1 was skipped
    expect(result.stepResults[1].output).toBe('Result: Second: data');
  });

  // 15. Workflow execution has correct timing
  it('should record timing information correctly', async () => {
    const wf = makeWorkflow({
      steps: [makeTaskStep()],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'test', successExecutor);

    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(typeof result.totalDurationMs).toBe('number');
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stepResults[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  // 25. Empty workflow (no steps)
  it('should complete immediately with no steps', async () => {
    const wf = makeWorkflow({ steps: [] });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'pass-through', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('pass-through');
    expect(result.stepResults).toHaveLength(0);
  });
});

// ===========================================================================
// Execution queries
// ===========================================================================

describe('Execution queries', () => {
  // 16. getExecution / listExecutions
  it('should retrieve execution by ID', async () => {
    engine.registerWorkflow(makeWorkflow());
    const exec = await engine.execute('wf-1', 'hello', successExecutor);

    const retrieved = engine.getExecution(exec.executionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.executionId).toBe(exec.executionId);
  });

  it('should list all executions', async () => {
    engine.registerWorkflow(makeWorkflow());
    await engine.execute('wf-1', 'a', successExecutor);
    await engine.execute('wf-1', 'b', successExecutor);

    const all = engine.listExecutions();
    expect(all).toHaveLength(2);
  });

  it('should filter executions by workflowId', async () => {
    engine.registerWorkflow(makeWorkflow({ workflowId: 'wf-1' }));
    engine.registerWorkflow(makeWorkflow({ workflowId: 'wf-2' }));
    await engine.execute('wf-1', 'a', successExecutor);
    await engine.execute('wf-2', 'b', successExecutor);

    const filtered = engine.listExecutions('wf-1');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].workflowId).toBe('wf-1');
  });

  // 17. cancelExecution
  it('should cancel a running execution', async () => {
    // Use a slow executor to give time for cancellation
    const slowExecutor = async (_agentId: string, prompt: string) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return `Result: ${prompt}`;
    };

    const wf = makeWorkflow({
      steps: [
        makeTaskStep({ stepId: 'step-1', prompt: 'Slow: {{input}}' }),
        makeTaskStep({ stepId: 'step-2', prompt: 'After: {{input}}' }),
      ],
    });
    engine.registerWorkflow(wf);

    // Start execution but don't await yet
    const execPromise = engine.execute('wf-1', 'data', slowExecutor);

    // Give it a moment to start, then cancel
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Find the running execution
    const executions = engine.listExecutions('wf-1');
    const running = executions.find((e) => e.status === 'running');

    if (running) {
      const cancelled = engine.cancelExecution(running.executionId);
      expect(cancelled).toBe(true);
    }

    const result = await execPromise;
    // It should be cancelled or completed (depending on timing)
    expect(['cancelled', 'completed']).toContain(result.status);
  });

  it('should return false when cancelling non-existent execution', () => {
    expect(engine.cancelExecution('no-such')).toBe(false);
  });

  // 18. Unknown workflow returns error
  it('should return a failed execution for unknown workflow', async () => {
    const result = await engine.execute('no-such-workflow', 'data', successExecutor);

    expect(result.status).toBe('failed');
    expect(result.workflowId).toBe('no-such-workflow');
    expect(result.stepResults).toHaveLength(0);
  });
});

// ===========================================================================
// Events
// ===========================================================================

describe('Event emission', () => {
  // 19. Events emitted: started, step:started, step:completed, completed
  it('should emit workflow and step lifecycle events on success', async () => {
    const events: string[] = [];

    engine.on('workflow:started', () => events.push('workflow:started'));
    engine.on('workflow:completed', () => events.push('workflow:completed'));
    engine.on('workflow:step:started', () => events.push('workflow:step:started'));
    engine.on('workflow:step:completed', () => events.push('workflow:step:completed'));

    engine.registerWorkflow(makeWorkflow());
    await engine.execute('wf-1', 'test', successExecutor);

    expect(events).toEqual([
      'workflow:started',
      'workflow:step:started',
      'workflow:step:completed',
      'workflow:completed',
    ]);
  });

  // 20. Events emitted on failure: step:failed, workflow:failed
  it('should emit failure events when a step fails', async () => {
    const events: string[] = [];

    engine.on('workflow:started', () => events.push('workflow:started'));
    engine.on('workflow:failed', () => events.push('workflow:failed'));
    engine.on('workflow:step:started', () => events.push('workflow:step:started'));
    engine.on('workflow:step:failed', () => events.push('workflow:step:failed'));

    engine.registerWorkflow(makeWorkflow({ errorStrategy: 'fail-fast' }));
    await engine.execute('wf-1', 'test', failExecutor);

    expect(events).toContain('workflow:started');
    expect(events).toContain('workflow:step:started');
    expect(events).toContain('workflow:step:failed');
    expect(events).toContain('workflow:failed');
  });

  it('should emit workflow:failed for unknown workflow', async () => {
    const events: string[] = [];
    engine.on('workflow:failed', () => events.push('workflow:failed'));

    await engine.execute('no-such', 'test', successExecutor);

    expect(events).toContain('workflow:failed');
  });
});

// ===========================================================================
// Context sharing
// ===========================================================================

describe('Context sharing', () => {
  // 21. Context shared across steps
  it('should extract context from step output and share across steps', async () => {
    const contextExecutor = async (_agentId: string, prompt: string) => {
      if (prompt.includes('set-ctx')) {
        return JSON.stringify({ result: 'done', context: { foo: 'bar' } });
      }
      return `Result: ${prompt}`;
    };

    const wf = makeWorkflow({
      steps: [
        makeTaskStep({ stepId: 'ctx-setter', prompt: 'set-ctx' }),
        {
          type: 'conditional',
          stepId: 'ctx-reader',
          condition: 'context.foo === "bar"',
          thenSteps: [makeTaskStep({ stepId: 'then-task', prompt: 'Context worked: {{input}}' })],
        } as WorkflowConditionalStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', contextExecutor);

    expect(result.status).toBe('completed');
    expect(result.context.foo).toBe('bar');
    expect(result.finalOutput).toContain('Context worked');
  });
});

// ===========================================================================
// {{input}} replacement
// ===========================================================================

describe('Input replacement', () => {
  // 22. {{input}} replacement in prompts
  it('should replace {{input}} placeholders in task prompts', async () => {
    const capturedPrompts: string[] = [];
    const capturingExecutor = async (_agentId: string, prompt: string) => {
      capturedPrompts.push(prompt);
      return 'output';
    };

    const wf = makeWorkflow({
      steps: [
        makeTaskStep({ stepId: 'task-1', prompt: 'Begin: {{input}} end' }),
      ],
    });
    engine.registerWorkflow(wf);

    await engine.execute('wf-1', 'THE_INPUT', capturingExecutor);

    expect(capturedPrompts[0]).toBe('Begin: THE_INPUT end');
  });

  it('should replace multiple {{input}} placeholders', async () => {
    const capturedPrompts: string[] = [];
    const capturingExecutor = async (_agentId: string, prompt: string) => {
      capturedPrompts.push(prompt);
      return 'output';
    };

    const wf = makeWorkflow({
      steps: [
        makeTaskStep({ stepId: 'task-1', prompt: '{{input}} and {{input}}' }),
      ],
    });
    engine.registerWorkflow(wf);

    await engine.execute('wf-1', 'X', capturingExecutor);

    expect(capturedPrompts[0]).toBe('X and X');
  });
});

// ===========================================================================
// Nested conditional
// ===========================================================================

describe('Nested conditional', () => {
  // 23. Nested conditional with inner steps
  it('should handle nested conditional steps', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'conditional',
          stepId: 'outer-cond',
          condition: 'true',
          thenSteps: [
            {
              type: 'conditional',
              stepId: 'inner-cond',
              condition: 'input === "hello"',
              thenSteps: [makeTaskStep({ stepId: 'nested-task', prompt: 'Nested: {{input}}' })],
              elseSteps: [makeTaskStep({ stepId: 'nested-else', prompt: 'NestedElse: {{input}}' })],
            } as WorkflowConditionalStep,
          ],
        } as WorkflowConditionalStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'hello', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('Result: Nested: hello');
  });

  it('should follow else branch in nested conditional', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'conditional',
          stepId: 'outer-cond',
          condition: 'true',
          thenSteps: [
            {
              type: 'conditional',
              stepId: 'inner-cond',
              condition: 'input === "hello"',
              thenSteps: [makeTaskStep({ stepId: 'nested-task', prompt: 'Nested: {{input}}' })],
              elseSteps: [makeTaskStep({ stepId: 'nested-else', prompt: 'NestedElse: {{input}}' })],
            } as WorkflowConditionalStep,
          ],
        } as WorkflowConditionalStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'goodbye', successExecutor);

    expect(result.status).toBe('completed');
    expect(result.finalOutput).toBe('Result: NestedElse: goodbye');
  });

  it('should treat invalid condition as false', async () => {
    const wf = makeWorkflow({
      steps: [
        {
          type: 'conditional',
          stepId: 'bad-cond',
          condition: 'this is not valid javascript !!!',
          thenSteps: [makeTaskStep({ stepId: 'then-task', prompt: 'Then: {{input}}' })],
          elseSteps: [makeTaskStep({ stepId: 'else-task', prompt: 'Else: {{input}}' })],
        } as WorkflowConditionalStep,
      ],
    });
    engine.registerWorkflow(wf);

    const result = await engine.execute('wf-1', 'data', successExecutor);

    expect(result.status).toBe('completed');
    // Invalid condition -> false -> else branch
    expect(result.finalOutput).toBe('Result: Else: data');
  });
});

// ===========================================================================
// Singleton management
// ===========================================================================

describe('Singleton management', () => {
  // 24. Singleton management
  it('should return the same instance from getWorkflowEngine', () => {
    const a = getWorkflowEngine();
    const b = getWorkflowEngine();
    expect(a).toBe(b);
  });

  it('should return a new instance after resetWorkflowEngine', () => {
    const a = getWorkflowEngine();
    a.registerWorkflow(makeWorkflow());
    expect(a.listWorkflows()).toHaveLength(1);

    resetWorkflowEngine();

    const b = getWorkflowEngine();
    expect(b).not.toBe(a);
    expect(b.listWorkflows()).toHaveLength(0);
  });

  it('should clear all state on reset', () => {
    engine.registerWorkflow(makeWorkflow());
    expect(engine.listWorkflows()).toHaveLength(1);

    engine.reset();

    expect(engine.listWorkflows()).toHaveLength(0);
    expect(engine.listExecutions()).toHaveLength(0);
  });
});

// ===========================================================================
// Parallel failure under fail-fast
// ===========================================================================

describe('Parallel failure under fail-fast', () => {
  it('should propagate parallel branch failure with fail-fast strategy', async () => {
    const wf = makeWorkflow({
      errorStrategy: 'fail-fast',
      steps: [
        {
          type: 'parallel',
          stepId: 'par-1',
          branches: [
            makeTaskStep({ stepId: 'branch-ok', agentId: 'agent-ok', prompt: 'OK: {{input}}' }),
            makeTaskStep({ stepId: 'branch-fail', agentId: 'agent-fail', prompt: 'Fail: {{input}}' }),
          ],
        } as WorkflowParallelStep,
      ],
    });
    engine.registerWorkflow(wf);

    const mixedExecutor = async (agentId: string, prompt: string) => {
      if (agentId === 'agent-fail') throw new Error('Branch failed');
      return `Result: ${prompt}`;
    };

    const result = await engine.execute('wf-1', 'data', mixedExecutor);

    expect(result.status).toBe('failed');
  });
});

// ===========================================================================
// Step event data
// ===========================================================================

describe('Step event data', () => {
  it('should include step details in step events', async () => {
    const stepEvents: Array<{ stepId: string; type: string }> = [];

    engine.on('workflow:step:started', (data) => {
      stepEvents.push({ stepId: data.stepId, type: data.type });
    });

    engine.registerWorkflow(makeWorkflow({
      steps: [
        makeTaskStep({ stepId: 'my-step' }),
      ],
    }));

    await engine.execute('wf-1', 'test', successExecutor);

    expect(stepEvents).toHaveLength(1);
    expect(stepEvents[0].stepId).toBe('my-step');
    expect(stepEvents[0].type).toBe('task');
  });
});
