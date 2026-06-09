/**
 * @module pipeline.test
 *
 * Comprehensive test suite for the A2A Pipeline Orchestration Pattern.
 * Covers pipeline CRUD, sequential step execution, output transforms,
 * error strategies, cancellation, execution queries, and singleton lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const pipelineInstructionMocks = vi.hoisted(() => {
  const compileInstructionBundleForTask = vi.fn(() => ({
    shared_goal: 'Pipeline task goal',
    agent_specific_prompt: 'Read AGENTS.md and execute the pipeline task.',
    system_context_refs: [{ ref_id: 'AGENTS.md', kind: 'agents_md', path: 'AGENTS.md', sha: 'abc123' }],
    acceptance_criteria: ['Execute pipeline task'],
    verification_commands: ['pnpm test'],
    forbidden_actions: ['Do not edit .env*'],
    approval_gates: [],
    memory_used: [],
    provenance: {
      source_files: [{ path: 'AGENTS.md', sha: 'abc123' }],
      compiled_at: '2026-06-06T00:00:00.000Z',
      compiler_version: '0.1.0',
    },
  }));
  return { compileInstructionBundleForTask };
});

vi.mock('../compiled-instructions', () => ({
  compileInstructionBundleForTask: pipelineInstructionMocks.compileInstructionBundleForTask,
}));

import {
  PipelineOrchestrator,
  getPipelineOrchestrator,
  resetPipelineOrchestrator,
  type PipelineDefinition,
  type PipelineStep,
} from '../orchestration/pipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<PipelineStep> = {}): PipelineStep {
  return {
    stepId: overrides.stepId ?? 'step-1',
    agentId: overrides.agentId ?? 'agent-1',
    promptTemplate: overrides.promptTemplate ?? 'Process: {{input}}',
    timeoutMs: overrides.timeoutMs,
    outputTransform: overrides.outputTransform,
  };
}

function makePipeline(overrides: Partial<PipelineDefinition> = {}): PipelineDefinition {
  return {
    pipelineId: overrides.pipelineId ?? 'pipe-1',
    name: overrides.name ?? 'Test Pipeline',
    steps: overrides.steps ?? [makeStep()],
    errorStrategy: overrides.errorStrategy ?? 'fail-fast',
  };
}

const successExecutor = async (agentId: string, prompt: string) =>
  `Result from ${agentId}: ${prompt}`;

const failExecutor = async () => {
  throw new Error('Agent failed');
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let orchestrator: PipelineOrchestrator;

beforeEach(() => {
  resetPipelineOrchestrator();
  orchestrator = new PipelineOrchestrator();
});

// ===========================================================================
// Pipeline CRUD
// ===========================================================================

describe('Pipeline CRUD', () => {
  // Test 1: registerPipeline + getPipeline
  it('registers and retrieves a pipeline definition', () => {
    const def = makePipeline();
    orchestrator.registerPipeline(def);

    const retrieved = orchestrator.getPipeline('pipe-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.pipelineId).toBe('pipe-1');
    expect(retrieved!.name).toBe('Test Pipeline');
    expect(retrieved!.steps).toHaveLength(1);
  });

  // Test 2: listPipelines
  it('lists all registered pipelines', () => {
    orchestrator.registerPipeline(makePipeline({ pipelineId: 'p1', name: 'First' }));
    orchestrator.registerPipeline(makePipeline({ pipelineId: 'p2', name: 'Second' }));
    orchestrator.registerPipeline(makePipeline({ pipelineId: 'p3', name: 'Third' }));

    const all = orchestrator.listPipelines();
    expect(all).toHaveLength(3);
    expect(all.map((p) => p.pipelineId)).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']));
  });

  // Test 3: removePipeline
  it('removes a pipeline definition and returns true; returns false for non-existent', () => {
    orchestrator.registerPipeline(makePipeline());

    expect(orchestrator.removePipeline('pipe-1')).toBe(true);
    expect(orchestrator.getPipeline('pipe-1')).toBeUndefined();
    expect(orchestrator.removePipeline('pipe-1')).toBe(false);
  });
});

// ===========================================================================
// Execution -- success paths
// ===========================================================================

describe('Pipeline execution (success)', () => {
  // Test 4: Execute simple 2-step pipeline
  it('executes a 2-step pipeline successfully with chained output', async () => {
    const def = makePipeline({
      steps: [
        makeStep({ stepId: 'step-a', agentId: 'agent-a', promptTemplate: 'Analyze: {{input}}' }),
        makeStep({ stepId: 'step-b', agentId: 'agent-b', promptTemplate: 'Summarize: {{input}}' }),
      ],
    });
    orchestrator.registerPipeline(def);

    const exec = await orchestrator.execute('pipe-1', 'raw data', successExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults).toHaveLength(2);
    expect(exec.stepResults[0].status).toBe('completed');
    expect(exec.stepResults[1].status).toBe('completed');
    expect(exec.finalOutput).toBeDefined();
  });

  // Test 5: Execute 3-step pipeline (output chains correctly)
  it('chains output through 3 steps correctly', async () => {
    const def = makePipeline({
      steps: [
        makeStep({ stepId: 's1', agentId: 'a1', promptTemplate: '{{input}}' }),
        makeStep({ stepId: 's2', agentId: 'a2', promptTemplate: '{{input}}' }),
        makeStep({ stepId: 's3', agentId: 'a3', promptTemplate: '{{input}}' }),
      ],
    });
    orchestrator.registerPipeline(def);

    // Each executor returns "Result from <agentId>: <prompt>"
    // Step 1: input = "start" -> output = "Result from a1: start"
    // Step 2: input = "Result from a1: start" -> output = "Result from a2: Result from a1: start"
    // Step 3: chained further
    const exec = await orchestrator.execute('pipe-1', 'start', successExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults).toHaveLength(3);
    // Final output should contain references to all 3 agents in chain
    expect(exec.finalOutput).toContain('a3');
    expect(exec.finalOutput).toContain('a2');
    expect(exec.finalOutput).toContain('a1');
    expect(exec.finalOutput).toContain('start');
  });

  // Test 8: Step results have correct timing info
  it('records timing info in step results', async () => {
    const def = makePipeline({
      steps: [makeStep({ stepId: 's1', agentId: 'agent-1' })],
    });
    orchestrator.registerPipeline(def);

    const exec = await orchestrator.execute('pipe-1', 'input', successExecutor);

    const stepResult = exec.stepResults[0];
    expect(stepResult.startedAt).toBeTruthy();
    expect(stepResult.completedAt).toBeTruthy();
    expect(typeof stepResult.durationMs).toBe('number');
    expect(stepResult.durationMs).toBeGreaterThanOrEqual(0);

    // Verify timestamps are valid ISO strings
    expect(() => new Date(stepResult.startedAt)).not.toThrow();
    expect(() => new Date(stepResult.completedAt)).not.toThrow();
  });

  // Test 9: PipelineExecution has correct status on success
  it('sets execution status to completed on success', async () => {
    const def = makePipeline();
    orchestrator.registerPipeline(def);

    const exec = await orchestrator.execute('pipe-1', 'data', successExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.executionId).toBeTruthy();
    expect(exec.pipelineId).toBe('pipe-1');
    expect(exec.input).toBe('data');
    expect(exec.completedAt).toBeTruthy();
    expect(typeof exec.totalDurationMs).toBe('number');
    expect(exec.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  // Test 20: Empty pipeline (no steps) completes immediately
  it('completes immediately with input as output for empty pipeline', async () => {
    const def = makePipeline({ steps: [] });
    orchestrator.registerPipeline(def);

    const exec = await orchestrator.execute('pipe-1', 'pass-through', successExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults).toHaveLength(0);
    expect(exec.finalOutput).toBe('pass-through');
    expect(exec.completedAt).toBeTruthy();
  });

  it('passes a compiled instruction bundle to structured pipeline executors', async () => {
    const def = makePipeline();
    orchestrator.registerPipeline(def);

    const structuredExecutor = vi.fn(async (request: any) => {
      expect(request.pipelineId).toBe('pipe-1');
      expect(request.stepId).toBe('step-1');
      expect(request.prompt).toBe('Process: input');
      expect(request.envelope.payload).toMatchObject({ kind: 'text', text: 'Process: input' });
      expect(request.instructionBundle).toMatchObject({
        shared_goal: 'Pipeline task goal',
        agent_specific_prompt: 'Read AGENTS.md and execute the pipeline task.',
      });
      return 'structured pipeline result';
    });
    (structuredExecutor as any).__agentOsStructured = true;

    const exec = await orchestrator.execute('pipe-1', 'input', structuredExecutor as any);

    expect(structuredExecutor).toHaveBeenCalledTimes(1);
    expect(exec.status).toBe('completed');
    expect(exec.finalOutput).toBe('structured pipeline result');
  });
});

// ===========================================================================
// Execution -- error strategies
// ===========================================================================

describe('Pipeline execution (error strategies)', () => {
  // Test 6: Execute with fail-fast -- stops on first error
  it('stops on first error with fail-fast strategy', async () => {
    const def = makePipeline({
      errorStrategy: 'fail-fast',
      steps: [
        makeStep({ stepId: 's1', agentId: 'good-agent', promptTemplate: '{{input}}' }),
        makeStep({ stepId: 's2', agentId: 'bad-agent', promptTemplate: '{{input}}' }),
        makeStep({ stepId: 's3', agentId: 'never-reached', promptTemplate: '{{input}}' }),
      ],
    });
    orchestrator.registerPipeline(def);

    let callCount = 0;
    const mixedExecutor = async (agentId: string, prompt: string) => {
      callCount++;
      if (agentId === 'bad-agent') throw new Error('Agent failed');
      return `Result from ${agentId}: ${prompt}`;
    };

    const exec = await orchestrator.execute('pipe-1', 'input', mixedExecutor);

    expect(exec.status).toBe('failed');
    // Only 2 steps executed (s1 success, s2 fail, s3 never reached)
    expect(exec.stepResults).toHaveLength(2);
    expect(exec.stepResults[0].status).toBe('completed');
    expect(exec.stepResults[1].status).toBe('failed');
    expect(exec.stepResults[1].error).toBe('Agent failed');
    expect(callCount).toBe(2);
  });

  // Test 7: Execute with continue -- skips failed steps
  it('skips failed steps with continue strategy and passes previous input forward', async () => {
    const def = makePipeline({
      errorStrategy: 'continue',
      steps: [
        makeStep({ stepId: 's1', agentId: 'good-agent', promptTemplate: '{{input}}' }),
        makeStep({ stepId: 's2', agentId: 'bad-agent', promptTemplate: '{{input}}' }),
        makeStep({ stepId: 's3', agentId: 'final-agent', promptTemplate: '{{input}}' }),
      ],
    });
    orchestrator.registerPipeline(def);

    const mixedExecutor = async (agentId: string, prompt: string) => {
      if (agentId === 'bad-agent') throw new Error('Agent failed');
      return `Result from ${agentId}: ${prompt}`;
    };

    const exec = await orchestrator.execute('pipe-1', 'input', mixedExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults).toHaveLength(3);
    expect(exec.stepResults[0].status).toBe('completed');
    expect(exec.stepResults[1].status).toBe('skipped');
    expect(exec.stepResults[1].error).toBe('Agent failed');
    expect(exec.stepResults[2].status).toBe('completed');
    // s3 receives s1's output (s2 was skipped, previous input forwarded)
    expect(exec.finalOutput).toContain('final-agent');
    expect(exec.finalOutput).toContain('good-agent');
  });

  // Test 10: PipelineExecution has correct status on failure
  it('sets execution status to failed on error with fail-fast', async () => {
    const def = makePipeline({
      errorStrategy: 'fail-fast',
      steps: [makeStep({ stepId: 's1', agentId: 'bad-agent' })],
    });
    orchestrator.registerPipeline(def);

    const exec = await orchestrator.execute('pipe-1', 'data', failExecutor);

    expect(exec.status).toBe('failed');
    expect(exec.completedAt).toBeTruthy();
    expect(exec.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(exec.stepResults[0].status).toBe('failed');
    expect(exec.stepResults[0].error).toBe('Agent failed');
  });

  // Test 17: Execute with unknown pipeline returns error
  it('returns a failed execution for unknown pipeline', async () => {
    const exec = await orchestrator.execute('nonexistent', 'data', successExecutor);

    expect(exec.status).toBe('failed');
    expect(exec.pipelineId).toBe('nonexistent');
    expect(exec.stepResults).toHaveLength(0);
    expect(exec.completedAt).toBeTruthy();
  });
});

// ===========================================================================
// Cancellation
// ===========================================================================

describe('Pipeline cancellation', () => {
  // Test 11: cancelExecution while "running"
  it('cancels a running execution', async () => {
    const def = makePipeline({
      steps: [
        makeStep({ stepId: 's1', agentId: 'slow-agent', promptTemplate: '{{input}}' }),
        makeStep({ stepId: 's2', agentId: 'agent-2', promptTemplate: '{{input}}' }),
      ],
    });
    orchestrator.registerPipeline(def);

    // Use a slow executor so we can cancel mid-execution
    let resolveFirst: ((value: string) => void) | undefined;
    const slowExecutor = async (agentId: string, prompt: string) => {
      if (agentId === 'slow-agent') {
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return `Result from ${agentId}: ${prompt}`;
    };

    // Start execution in the background
    const execPromise = orchestrator.execute('pipe-1', 'data', slowExecutor);

    // Wait a tick for the execution to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The execution should be in the executions map with 'running' status
    const executions = orchestrator.listExecutions('pipe-1');
    expect(executions.length).toBeGreaterThanOrEqual(1);
    const runningExec = executions.find((e) => e.status === 'running');

    if (runningExec) {
      const cancelled = orchestrator.cancelExecution(runningExec.executionId);
      expect(cancelled).toBe(true);

      // Verify status was set
      const updated = orchestrator.getExecution(runningExec.executionId);
      expect(updated?.status).toBe('cancelled');
    }

    // Resolve the pending promise to allow execution to finish
    if (resolveFirst) resolveFirst('done');
    await execPromise;
  });

  it('returns false when cancelling a non-existent execution', () => {
    expect(orchestrator.cancelExecution('nonexistent')).toBe(false);
  });

  it('returns false when cancelling an already completed execution', async () => {
    const def = makePipeline();
    orchestrator.registerPipeline(def);

    const exec = await orchestrator.execute('pipe-1', 'data', successExecutor);
    expect(exec.status).toBe('completed');

    expect(orchestrator.cancelExecution(exec.executionId)).toBe(false);
  });
});

// ===========================================================================
// Execution queries
// ===========================================================================

describe('Execution queries', () => {
  // Test 12: getExecution returns past execution
  it('retrieves a past execution by ID', async () => {
    const def = makePipeline();
    orchestrator.registerPipeline(def);

    const exec = await orchestrator.execute('pipe-1', 'test', successExecutor);
    const retrieved = orchestrator.getExecution(exec.executionId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.executionId).toBe(exec.executionId);
    expect(retrieved!.pipelineId).toBe('pipe-1');
    expect(retrieved!.status).toBe('completed');
  });

  it('returns undefined for non-existent execution', () => {
    expect(orchestrator.getExecution('nonexistent')).toBeUndefined();
  });

  // Test 13: listExecutions filters by pipelineId
  it('lists executions filtered by pipelineId', async () => {
    orchestrator.registerPipeline(makePipeline({ pipelineId: 'p1' }));
    orchestrator.registerPipeline(makePipeline({ pipelineId: 'p2' }));

    await orchestrator.execute('p1', 'data-a', successExecutor);
    await orchestrator.execute('p1', 'data-b', successExecutor);
    await orchestrator.execute('p2', 'data-c', successExecutor);

    const p1Execs = orchestrator.listExecutions('p1');
    expect(p1Execs).toHaveLength(2);
    expect(p1Execs.every((e) => e.pipelineId === 'p1')).toBe(true);

    const p2Execs = orchestrator.listExecutions('p2');
    expect(p2Execs).toHaveLength(1);

    const allExecs = orchestrator.listExecutions();
    expect(allExecs).toHaveLength(3);
  });
});

// ===========================================================================
// Output transforms
// ===========================================================================

describe('Output transforms', () => {
  // Test 14: json-extract
  it('json-extract extracts .result field from JSON output', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'json-agent',
          promptTemplate: '{{input}}',
          outputTransform: 'json-extract',
        }),
        makeStep({
          stepId: 's2',
          agentId: 'consumer',
          promptTemplate: 'Got: {{input}}',
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const jsonExecutor = async (agentId: string, _prompt: string) => {
      if (agentId === 'json-agent') {
        return JSON.stringify({ result: 'extracted-value', other: 'ignored' });
      }
      return `Consumed: ${_prompt}`;
    };

    const exec = await orchestrator.execute('pipe-1', 'input', jsonExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults[0].output).toBe('extracted-value');
    // The second step should receive 'extracted-value' as input
    expect(exec.stepResults[1].output).toContain('extracted-value');
  });

  it('json-extract falls back to raw output on invalid JSON', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'agent',
          promptTemplate: '{{input}}',
          outputTransform: 'json-extract',
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const rawExecutor = async () => 'not-json-at-all';
    const exec = await orchestrator.execute('pipe-1', 'input', rawExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults[0].output).toBe('not-json-at-all');
  });

  it('json-extract falls back to raw output when no .result field', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'agent',
          promptTemplate: '{{input}}',
          outputTransform: 'json-extract',
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const noResultExecutor = async () => JSON.stringify({ data: 'something' });
    const exec = await orchestrator.execute('pipe-1', 'input', noResultExecutor);

    expect(exec.status).toBe('completed');
    // Falls back to raw output since there's no .result field
    expect(exec.stepResults[0].output).toBe(JSON.stringify({ data: 'something' }));
  });

  // Test 15: text-trim
  it('text-trim trims whitespace from output', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'agent',
          promptTemplate: '{{input}}',
          outputTransform: 'text-trim',
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const spaceyExecutor = async () => '  hello world  \n';
    const exec = await orchestrator.execute('pipe-1', 'input', spaceyExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults[0].output).toBe('hello world');
  });

  // Test 16: passthrough
  it('passthrough does not modify output', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'agent',
          promptTemplate: '{{input}}',
          outputTransform: 'passthrough',
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const rawOutput = '  raw   output  ';
    const passthroughExecutor = async () => rawOutput;
    const exec = await orchestrator.execute('pipe-1', 'input', passthroughExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults[0].output).toBe(rawOutput);
  });

  it('default (no transform) behaves as passthrough', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'agent',
          promptTemplate: '{{input}}',
          // No outputTransform specified
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const rawOutput = '  untrimmed  ';
    const executor = async () => rawOutput;
    const exec = await orchestrator.execute('pipe-1', 'input', executor);

    expect(exec.status).toBe('completed');
    expect(exec.stepResults[0].output).toBe(rawOutput);
  });
});

// ===========================================================================
// Prompt template replacement
// ===========================================================================

describe('Prompt template replacement', () => {
  // Test 18: {{input}} replacement works
  it('replaces {{input}} in prompt template with current input', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'agent-1',
          promptTemplate: 'Please analyze the following: {{input}}. Be thorough.',
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const capturedPrompts: string[] = [];
    const capturingExecutor = async (_agentId: string, prompt: string) => {
      capturedPrompts.push(prompt);
      return 'done';
    };

    await orchestrator.execute('pipe-1', 'my raw data', capturingExecutor);

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toBe('Please analyze the following: my raw data. Be thorough.');
  });

  it('replaces multiple {{input}} occurrences in same template', async () => {
    const def = makePipeline({
      steps: [
        makeStep({
          stepId: 's1',
          agentId: 'agent-1',
          promptTemplate: 'Input: {{input}}, Again: {{input}}',
        }),
      ],
    });
    orchestrator.registerPipeline(def);

    const capturedPrompts: string[] = [];
    const capturingExecutor = async (_agentId: string, prompt: string) => {
      capturedPrompts.push(prompt);
      return 'done';
    };

    await orchestrator.execute('pipe-1', 'X', capturingExecutor);

    expect(capturedPrompts[0]).toBe('Input: X, Again: X');
  });
});

// ===========================================================================
// Singleton management
// ===========================================================================

describe('Singleton management', () => {
  // Test 19: get/reset
  it('getPipelineOrchestrator returns the same instance on repeated calls', () => {
    const a = getPipelineOrchestrator();
    const b = getPipelineOrchestrator();
    expect(a).toBe(b);
  });

  it('resetPipelineOrchestrator clears the singleton', () => {
    const before = getPipelineOrchestrator();
    resetPipelineOrchestrator();
    const after = getPipelineOrchestrator();
    expect(before).not.toBe(after);
  });

  it('reset() clears all internal state', async () => {
    orchestrator.registerPipeline(makePipeline());
    await orchestrator.execute('pipe-1', 'data', successExecutor);

    expect(orchestrator.listPipelines()).toHaveLength(1);
    expect(orchestrator.listExecutions()).toHaveLength(1);

    orchestrator.reset();

    expect(orchestrator.listPipelines()).toHaveLength(0);
    expect(orchestrator.listExecutions()).toHaveLength(0);
    expect(orchestrator.getPipeline('pipe-1')).toBeUndefined();
  });
});
