/**
 * @module orchestration/pipeline
 *
 * Pipeline orchestration pattern for the A2A ecosystem.
 * Enables sequential multi-agent task chains where Agent A's output
 * feeds into Agent B's input via {{input}} template replacement.
 *
 * Supports:
 * - Ordered step execution with prompt templating
 * - Output transforms (json-extract, text-trim, passthrough)
 * - Error strategies (fail-fast, continue)
 * - Execution history and cancellation
 */

import { logger as baseLogger } from '../../logger';
import { generateId } from '../task-lifecycle.service';
import { compileInstructionBundleForTask } from '../compiled-instructions';
import type { InstructionBundle } from '@recoder/a2a-sdk';
import { createTaskEnvelope, type TaskEnvelope } from '@recoder/shared/a2a';

const logger = baseLogger.child({ component: 'a2a-pipeline' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PipelineStep {
  /** Unique step ID */
  stepId: string;
  /** Agent ID to execute this step */
  agentId: string;
  /** Prompt template -- {{input}} is replaced with previous step's output */
  promptTemplate: string;
  /** Timeout per step in ms (default 30000) */
  timeoutMs?: number;
  /** Transform function name to apply to output before passing to next step */
  outputTransform?: 'json-extract' | 'text-trim' | 'passthrough';
}

export interface PipelineDefinition {
  /** Unique pipeline ID */
  pipelineId: string;
  /** Human-readable name */
  name: string;
  /** Ordered list of steps */
  steps: PipelineStep[];
  /** Error strategy: 'fail-fast' (stop on first error) or 'continue' (skip failed steps) */
  errorStrategy: 'fail-fast' | 'continue';
}

export interface PipelineStepResult {
  stepId: string;
  agentId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface PipelineExecution {
  executionId: string;
  pipelineId: string;
  status: PipelineStatus;
  /** Initial input to the pipeline */
  input: string;
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** Results for each completed step */
  stepResults: PipelineStepResult[];
  /** Final output (last successful step's output) */
  finalOutput?: string;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
}

export interface PipelineTaskExecutionRequest {
  pipelineId: string;
  executionId: string;
  stepId: string;
  agentId: string;
  prompt: string;
  envelope: TaskEnvelope;
  instructionBundle: InstructionBundle | null;
}

export type PipelineTaskExecutor =
  | ((agentId: string, prompt: string) => Promise<string>)
  | ((request: PipelineTaskExecutionRequest) => Promise<string>);

type StructuredPipelineTaskExecutor = ((request: PipelineTaskExecutionRequest) => Promise<string>) & {
  __agentOsStructured?: boolean;
};

// ---------------------------------------------------------------------------
// Output transforms
// ---------------------------------------------------------------------------

function applyOutputTransform(
  output: string,
  transform: PipelineStep['outputTransform'],
): string {
  switch (transform) {
    case 'json-extract': {
      try {
        const parsed = JSON.parse(output);
        if (parsed && typeof parsed === 'object' && 'result' in parsed) {
          return typeof parsed.result === 'string'
            ? parsed.result
            : JSON.stringify(parsed.result);
        }
      } catch {
        // Fallback to raw output on parse error
      }
      return output;
    }

    case 'text-trim':
      return output.trim();

    case 'passthrough':
    default:
      return output;
  }
}

// ---------------------------------------------------------------------------
// PipelineOrchestrator
// ---------------------------------------------------------------------------

export class PipelineOrchestrator {
  private pipelines = new Map<string, PipelineDefinition>();
  private executions = new Map<string, PipelineExecution>();
  /** Set of execution IDs that have been cancelled (checked during step loop). */
  private cancelledIds = new Set<string>();

  // -------------------------------------------------------------------------
  // Pipeline CRUD
  // -------------------------------------------------------------------------

  /**
   * Register a pipeline definition.
   */
  registerPipeline(definition: PipelineDefinition): void {
    logger.info({ pipelineId: definition.pipelineId, name: definition.name }, 'Pipeline registered');
    this.pipelines.set(definition.pipelineId, definition);
  }

  /**
   * Get a registered pipeline definition.
   */
  getPipeline(pipelineId: string): PipelineDefinition | undefined {
    return this.pipelines.get(pipelineId);
  }

  /**
   * List all registered pipelines.
   */
  listPipelines(): PipelineDefinition[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Remove a pipeline definition.
   */
  removePipeline(pipelineId: string): boolean {
    const deleted = this.pipelines.delete(pipelineId);
    if (deleted) {
      logger.info({ pipelineId }, 'Pipeline removed');
    }
    return deleted;
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a pipeline with the given initial input.
   * Returns the execution result (runs synchronously through steps).
   *
   * The `executor` callback simulates what would be an agent execution call.
   * In real usage, this would call the connector runtime.
   */
  async execute(
    pipelineId: string,
    input: string,
    executor: PipelineTaskExecutor,
  ): Promise<PipelineExecution> {
    const definition = this.pipelines.get(pipelineId);
    if (!definition) {
      const executionId = generateId('exec');
      const now = new Date().toISOString();
      const execution: PipelineExecution = {
        executionId,
        pipelineId,
        status: 'failed',
        input,
        currentStepIndex: 0,
        stepResults: [],
        startedAt: now,
        completedAt: now,
        totalDurationMs: 0,
      };
      this.executions.set(executionId, execution);
      logger.warn({ pipelineId, executionId }, 'Pipeline not found');
      return execution;
    }

    const executionId = generateId('exec');
    const startedAt = new Date();
    const execution: PipelineExecution = {
      executionId,
      pipelineId,
      status: 'running',
      input,
      currentStepIndex: 0,
      stepResults: [],
      startedAt: startedAt.toISOString(),
    };
    this.executions.set(executionId, execution);

    logger.info(
      { executionId, pipelineId, stepCount: definition.steps.length },
      'Pipeline execution started',
    );

    // Handle empty pipeline (no steps) -- completes immediately
    if (definition.steps.length === 0) {
      const completedAt = new Date();
      execution.status = 'completed';
      execution.finalOutput = input;
      execution.completedAt = completedAt.toISOString();
      execution.totalDurationMs = completedAt.getTime() - startedAt.getTime();
      return execution;
    }

    let currentInput = input;
    let lastSuccessfulOutput: string | undefined;

    for (let i = 0; i < definition.steps.length; i++) {
      // Check for cancellation
      if (this.cancelledIds.has(executionId)) {
        execution.status = 'cancelled';
        execution.completedAt = new Date().toISOString();
        execution.totalDurationMs = new Date().getTime() - startedAt.getTime();
        if (lastSuccessfulOutput !== undefined) {
          execution.finalOutput = lastSuccessfulOutput;
        }
        logger.info({ executionId }, 'Pipeline execution cancelled');
        return execution;
      }

      const step = definition.steps[i];
      execution.currentStepIndex = i;

      // Replace {{input}} in promptTemplate
      const resolvedPrompt = step.promptTemplate.replace(/\{\{input\}\}/g, currentInput);

      const stepStartedAt = new Date();
      let stepResult: PipelineStepResult;

      try {
        // Create a timeout race if step.timeoutMs is specified
        const timeoutMs = step.timeoutMs ?? 30000;
        const request = this.buildTaskExecutionRequest(execution, step, resolvedPrompt);
        const result = await Promise.race([
          this.invokeTaskExecutor(executor, request),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Step ${step.stepId} timed out after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);

        const stepCompletedAt = new Date();
        const transformed = applyOutputTransform(result, step.outputTransform);

        stepResult = {
          stepId: step.stepId,
          agentId: step.agentId,
          status: 'completed',
          output: transformed,
          durationMs: stepCompletedAt.getTime() - stepStartedAt.getTime(),
          startedAt: stepStartedAt.toISOString(),
          completedAt: stepCompletedAt.toISOString(),
        };

        currentInput = transformed;
        lastSuccessfulOutput = transformed;

        logger.debug(
          { executionId, stepId: step.stepId, durationMs: stepResult.durationMs },
          'Pipeline step completed',
        );
      } catch (err) {
        const stepCompletedAt = new Date();
        const errorMessage = err instanceof Error ? err.message : String(err);

        logger.warn(
          { executionId, stepId: step.stepId, error: errorMessage },
          'Pipeline step failed',
        );

        if (definition.errorStrategy === 'fail-fast') {
          stepResult = {
            stepId: step.stepId,
            agentId: step.agentId,
            status: 'failed',
            error: errorMessage,
            durationMs: stepCompletedAt.getTime() - stepStartedAt.getTime(),
            startedAt: stepStartedAt.toISOString(),
            completedAt: stepCompletedAt.toISOString(),
          };
          execution.stepResults.push(stepResult);
          execution.status = 'failed';
          execution.completedAt = stepCompletedAt.toISOString();
          execution.totalDurationMs = stepCompletedAt.getTime() - startedAt.getTime();
          if (lastSuccessfulOutput !== undefined) {
            execution.finalOutput = lastSuccessfulOutput;
          }
          return execution;
        }

        // 'continue' strategy: mark as skipped, pass previous input forward
        stepResult = {
          stepId: step.stepId,
          agentId: step.agentId,
          status: 'skipped',
          error: errorMessage,
          durationMs: stepCompletedAt.getTime() - stepStartedAt.getTime(),
          startedAt: stepStartedAt.toISOString(),
          completedAt: stepCompletedAt.toISOString(),
        };
        // currentInput stays the same (previous input passed forward)
      }

      execution.stepResults.push(stepResult);
    }

    // All steps completed (or skipped with 'continue' strategy)
    const completedAt = new Date();
    execution.status = 'completed';
    execution.finalOutput = lastSuccessfulOutput ?? input;
    execution.completedAt = completedAt.toISOString();
    execution.totalDurationMs = completedAt.getTime() - startedAt.getTime();

    logger.info(
      { executionId, pipelineId, totalDurationMs: execution.totalDurationMs },
      'Pipeline execution completed',
    );

    return execution;
  }

  // -------------------------------------------------------------------------
  // Execution queries
  // -------------------------------------------------------------------------

  /**
   * Get a past execution by ID.
   */
  getExecution(executionId: string): PipelineExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * List all executions, optionally filtered by pipelineId.
   */
  listExecutions(pipelineId?: string): PipelineExecution[] {
    const all = Array.from(this.executions.values());
    if (pipelineId) {
      return all.filter((e) => e.pipelineId === pipelineId);
    }
    return all;
  }

  /**
   * Cancel a running execution (sets status to cancelled).
   * Returns true if the execution was found and was in a cancellable state.
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution) return false;
    if (execution.status !== 'running') return false;

    this.cancelledIds.add(executionId);
    execution.status = 'cancelled';
    execution.completedAt = new Date().toISOString();
    if (execution.startedAt) {
      execution.totalDurationMs =
        new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime();
    }

    logger.info({ executionId }, 'Pipeline execution cancelled');
    return true;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Reset all state.
   */
  reset(): void {
    this.pipelines.clear();
    this.executions.clear();
    this.cancelledIds.clear();
    logger.debug('PipelineOrchestrator reset');
  }

  private buildTaskExecutionRequest(
    execution: PipelineExecution,
    step: PipelineStep,
    prompt: string,
  ): PipelineTaskExecutionRequest {
    const envelope = createTaskEnvelope({
      id: generateId('pipe-task'),
      workspace_id: 'pipeline-orchestrator',
      thread_id: `pipeline-${execution.executionId}`,
      trace_id: execution.executionId,
      requester: {
        agent_id: 'pipeline-orchestrator',
        platform: 'recoder_backend',
        name: 'Pipeline Orchestrator',
      },
      assignee: {
        agent_id: step.agentId,
        platform: 'custom',
      },
      connector: {
        connector_id: `pipeline-step:${step.stepId}`,
        platform: 'custom',
        protocol: 'rest',
      },
      payload: {
        kind: 'text',
        text: prompt,
      },
      metadata: {
        pipelineId: execution.pipelineId,
        executionId: execution.executionId,
        stepId: step.stepId,
        source: 'pipeline-orchestrator',
      },
      tags: ['pipeline-step'],
    });

    return {
      pipelineId: execution.pipelineId,
      executionId: execution.executionId,
      stepId: step.stepId,
      agentId: step.agentId,
      prompt,
      envelope,
      instructionBundle: compileInstructionBundleForTask(envelope),
    };
  }

  private async invokeTaskExecutor(
    executor: PipelineTaskExecutor,
    request: PipelineTaskExecutionRequest,
  ): Promise<string> {
    return (executor as StructuredPipelineTaskExecutor).__agentOsStructured === true
      ? (executor as StructuredPipelineTaskExecutor)(request)
      : (executor as (agentId: string, prompt: string) => Promise<string>)(
          request.agentId,
          request.prompt,
        );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: PipelineOrchestrator | null = null;

export function getPipelineOrchestrator(): PipelineOrchestrator {
  if (!instance) {
    instance = new PipelineOrchestrator();
  }
  return instance;
}

export function resetPipelineOrchestrator(): void {
  instance = null;
}
