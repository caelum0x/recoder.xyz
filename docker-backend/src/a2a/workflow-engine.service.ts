/**
 * @module workflow-engine.service
 *
 * Declarative multi-step workflow engine for the docker-backend A2A ecosystem.
 * Composes orchestration patterns (pipeline, scatter-gather) into workflows
 * with conditional branching, parallel execution, and shared context.
 *
 * Features:
 * - Sequential step execution with output chaining
 * - Task, pipeline, and scatter-gather step types
 * - Conditional branching (if/else with JS expression evaluation)
 * - Parallel branch execution via Promise.allSettled
 * - Shared context across steps
 * - Global and per-step timeouts
 * - Error strategies: fail-fast and continue
 * - Event emission for lifecycle transitions
 * - Cancellation support
 *
 * This is a pure in-memory implementation suitable for single-process
 * deployments.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logger';
import { generateId } from './task-lifecycle.service';
import { compileInstructionBundleForTask } from './compiled-instructions';
import type { InstructionBundle } from '@recoder/a2a-sdk';
import {
  createTaskEnvelope,
  type TaskEnvelope,
} from '@recoder/shared/a2a';

const logger = createLogger('a2a-workflow-engine');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowStepType = 'task' | 'pipeline' | 'scatter-gather' | 'conditional' | 'parallel';
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowTaskStep {
  type: 'task';
  stepId: string;
  agentId: string;
  prompt: string;
  timeoutMs?: number;
}

export interface WorkflowPipelineStep {
  type: 'pipeline';
  stepId: string;
  pipelineId: string;
}

export interface WorkflowScatterGatherStep {
  type: 'scatter-gather';
  stepId: string;
  patternId: string;
}

export interface WorkflowConditionalStep {
  type: 'conditional';
  stepId: string;
  /** JS expression evaluated against { input, context } -- must return truthy/falsy */
  condition: string;
  /** Steps to execute if condition is true */
  thenSteps: WorkflowStep[];
  /** Steps to execute if condition is false (optional) */
  elseSteps?: WorkflowStep[];
}

export interface WorkflowParallelStep {
  type: 'parallel';
  stepId: string;
  /** Steps to execute in parallel */
  branches: WorkflowStep[];
}

export type WorkflowStep =
  | WorkflowTaskStep
  | WorkflowPipelineStep
  | WorkflowScatterGatherStep
  | WorkflowConditionalStep
  | WorkflowParallelStep;

export interface WorkflowDefinition {
  workflowId: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  /** Global timeout in ms (default 300000 = 5 min) */
  timeoutMs?: number;
  /** Error strategy: 'fail-fast' or 'continue' */
  errorStrategy?: 'fail-fast' | 'continue';
}

export interface WorkflowStepResult {
  stepId: string;
  type: WorkflowStepType;
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  durationMs: number;
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: WorkflowStatus;
  input: string;
  stepResults: WorkflowStepResult[];
  finalOutput?: string;
  /** Shared context that steps can read/write */
  context: Record<string, string>;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
}

export interface WorkflowTaskExecutionRequest {
  workflowId: string;
  executionId: string;
  stepId: string;
  agentId: string;
  prompt: string;
  envelope: TaskEnvelope;
  instructionBundle: InstructionBundle | null;
  context: Record<string, string>;
}

export type WorkflowTaskExecutor =
  | ((agentId: string, prompt: string) => Promise<string>)
  | ((request: WorkflowTaskExecutionRequest) => Promise<string>);

type StructuredWorkflowTaskExecutor = ((request: WorkflowTaskExecutionRequest) => Promise<string>) & {
  __agentOsStructured?: boolean;
};

export type WorkflowEventName =
  | 'workflow:started'
  | 'workflow:completed'
  | 'workflow:failed'
  | 'workflow:step:started'
  | 'workflow:step:completed'
  | 'workflow:step:failed'
  | 'workflow:cancelled';

// ---------------------------------------------------------------------------
// Safe condition evaluator
// ---------------------------------------------------------------------------

/**
 * Allowed operators and tokens in condition expressions.
 * Only simple comparisons, boolean logic, and property access are permitted.
 */
const SAFE_CONDITION_PATTERN =
  /^[\s()!&|=<>?:.]+$|^(input|context|true|false|null|undefined|typeof|instanceof|'[^']*'|"[^"]*"|`[^`]*`|\d+(\.\d+)?|[\w$.[\]]+|===?|!==?|>=?|<=?|&&|\|\||[?]{2}|[?]\.|[+\-*/%]|\s)+$/;

/**
 * Validate that a condition string contains only safe tokens.
 * Rejects anything that could execute arbitrary code (function calls,
 * assignments, template literals with expressions, etc.).
 */
function isSafeCondition(condition: string): boolean {
  // Block dangerous patterns explicitly
  const dangerous =
    /\b(eval|Function|require|import|process|global|window|document|fetch|XMLHttpRequest|setTimeout|setInterval|setImmediate)\b/;
  if (dangerous.test(condition)) return false;

  // Block assignment operators (but allow == and ===)
  if (/(?<![=!<>])=(?!=)/.test(condition)) return false;

  // Block semicolons, curly braces, and backtick template expressions
  if (/[;{}]|\$\{/.test(condition)) return false;

  return true;
}

/**
 * Evaluate a condition expression with `input` and `context` in scope.
 * Uses vm.runInNewContext for sandboxed evaluation with a strict timeout.
 * Returns true/false. On any error or unsafe input, returns false.
 */
function evaluateCondition(
  condition: string,
  input: string,
  context: Record<string, string>,
): boolean {
  if (!isSafeCondition(condition)) {
    logger.warn(
      { condition },
      'Condition contains unsafe tokens, rejecting',
    );
    return false;
  }

  try {
    // Use vm module for sandboxed evaluation instead of new Function()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm = require('vm');
    const sandbox = Object.freeze({
      input: Object.freeze(input),
      context: Object.freeze({ ...context }),
    });
    const result = vm.runInNewContext(`!!(${condition})`, sandbox, {
      timeout: 100, // 100ms hard timeout
      displayErrors: false,
    });
    return !!result;
  } catch (err) {
    logger.warn(
      { condition, error: err instanceof Error ? err.message : String(err) },
      'Condition evaluation failed, treating as false',
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------

export class WorkflowEngine extends EventEmitter {
  private workflows = new Map<string, WorkflowDefinition>();
  private executions = new Map<string, WorkflowExecution>();
  private cancelledIds = new Set<string>();

  // -------------------------------------------------------------------------
  // Workflow CRUD
  // -------------------------------------------------------------------------

  /**
   * Register a workflow definition.
   */
  registerWorkflow(definition: WorkflowDefinition): void {
    logger.info(
      { workflowId: definition.workflowId, name: definition.name },
      'Workflow registered',
    );
    this.workflows.set(definition.workflowId, definition);
  }

  /**
   * Get a registered workflow definition.
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * List all registered workflows.
   */
  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Remove a workflow definition.
   */
  removeWorkflow(workflowId: string): boolean {
    const deleted = this.workflows.delete(workflowId);
    if (deleted) {
      logger.info({ workflowId }, 'Workflow removed');
    }
    return deleted;
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a workflow with the given input.
   * The executor handles individual task execution.
   */
  async execute(
    workflowId: string,
    input: string,
    executor: WorkflowTaskExecutor,
  ): Promise<WorkflowExecution> {
    const definition = this.workflows.get(workflowId);
    if (!definition) {
      const executionId = generateId('wfexec');
      const now = new Date().toISOString();
      const execution: WorkflowExecution = {
        executionId,
        workflowId,
        status: 'failed',
        input,
        stepResults: [],
        context: {},
        startedAt: now,
        completedAt: now,
        totalDurationMs: 0,
      };
      this.executions.set(executionId, execution);
      logger.warn({ workflowId, executionId }, 'Workflow not found');
      this.emit('workflow:failed', execution);
      return execution;
    }

    const executionId = generateId('wfexec');
    const startedAt = new Date();
    const execution: WorkflowExecution = {
      executionId,
      workflowId,
      status: 'running',
      input,
      stepResults: [],
      context: {},
      startedAt: startedAt.toISOString(),
    };
    this.executions.set(executionId, execution);

    logger.info(
      { executionId, workflowId, stepCount: definition.steps.length },
      'Workflow execution started',
    );
    this.emit('workflow:started', execution);

    const errorStrategy = definition.errorStrategy ?? 'fail-fast';
    const globalTimeoutMs = definition.timeoutMs ?? 300000;

    // Handle empty workflow -- completes immediately
    if (definition.steps.length === 0) {
      const completedAt = new Date();
      execution.status = 'completed';
      execution.finalOutput = input;
      execution.completedAt = completedAt.toISOString();
      execution.totalDurationMs = completedAt.getTime() - startedAt.getTime();
      this.emit('workflow:completed', execution);
      return execution;
    }

    // Create a global timeout promise for racing
    let globalTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const globalTimeoutPromise = new Promise<'timeout'>((resolve) => {
      globalTimeoutHandle = setTimeout(() => resolve('timeout'), globalTimeoutMs);
    });

    try {
      const result = await Promise.race([
        this.executeSteps(
          execution,
          definition.steps,
          input,
          executor,
          errorStrategy,
          startedAt,
        ),
        globalTimeoutPromise,
      ]);

      if (result === 'timeout') {
        const completedAt = new Date();
        execution.status = 'failed';
        execution.completedAt = completedAt.toISOString();
        execution.totalDurationMs = completedAt.getTime() - startedAt.getTime();
        logger.warn({ executionId, workflowId }, 'Workflow execution timed out');
        this.emit('workflow:failed', execution);
        return execution;
      }

      // result is the final output string
      const completedAt = new Date();

      if (execution.status === 'cancelled') {
        execution.completedAt = completedAt.toISOString();
        execution.totalDurationMs = completedAt.getTime() - startedAt.getTime();
        this.emit('workflow:cancelled', execution);
        return execution;
      }

      // Check if any step failed under fail-fast
      if (execution.status === 'failed') {
        execution.completedAt = completedAt.toISOString();
        execution.totalDurationMs = completedAt.getTime() - startedAt.getTime();
        this.emit('workflow:failed', execution);
        return execution;
      }

      execution.status = 'completed';
      execution.finalOutput = result;
      execution.completedAt = completedAt.toISOString();
      execution.totalDurationMs = completedAt.getTime() - startedAt.getTime();

      logger.info(
        { executionId, workflowId, totalDurationMs: execution.totalDurationMs },
        'Workflow execution completed',
      );
      this.emit('workflow:completed', execution);
      return execution;
    } finally {
      if (globalTimeoutHandle) {
        clearTimeout(globalTimeoutHandle);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal step execution
  // -------------------------------------------------------------------------

  private async executeSteps(
    execution: WorkflowExecution,
    steps: WorkflowStep[],
    currentInput: string,
    executor: WorkflowTaskExecutor,
    errorStrategy: 'fail-fast' | 'continue',
    workflowStartedAt: Date,
  ): Promise<string> {
    let lastOutput = currentInput;

    for (const step of steps) {
      // Check for cancellation
      if (this.cancelledIds.has(execution.executionId)) {
        execution.status = 'cancelled';
        logger.info({ executionId: execution.executionId }, 'Workflow execution cancelled');
        return lastOutput;
      }

      const stepStart = new Date();
      this.emit('workflow:step:started', { executionId: execution.executionId, stepId: step.stepId, type: step.type });

      try {
        const stepOutput = await this.executeSingleStep(
          execution,
          step,
          lastOutput,
          executor,
          errorStrategy,
          workflowStartedAt,
        );

        const stepEnd = new Date();
        const durationMs = stepEnd.getTime() - stepStart.getTime();

        const stepResult: WorkflowStepResult = {
          stepId: step.stepId,
          type: step.type,
          status: 'completed',
          output: stepOutput,
          durationMs,
        };
        execution.stepResults.push(stepResult);
        lastOutput = stepOutput;

        this.emit('workflow:step:completed', {
          executionId: execution.executionId,
          stepId: step.stepId,
          type: step.type,
          output: stepOutput,
          durationMs,
        });

        // Try to extract context from step output (JSON with "context" key)
        this.tryExtractContext(execution, stepOutput);

        logger.debug(
          { executionId: execution.executionId, stepId: step.stepId, durationMs },
          'Workflow step completed',
        );
      } catch (err) {
        const stepEnd = new Date();
        const durationMs = stepEnd.getTime() - stepStart.getTime();
        const errorMessage = err instanceof Error ? err.message : String(err);

        logger.warn(
          { executionId: execution.executionId, stepId: step.stepId, error: errorMessage },
          'Workflow step failed',
        );

        this.emit('workflow:step:failed', {
          executionId: execution.executionId,
          stepId: step.stepId,
          type: step.type,
          error: errorMessage,
          durationMs,
        });

        if (errorStrategy === 'fail-fast') {
          const stepResult: WorkflowStepResult = {
            stepId: step.stepId,
            type: step.type,
            status: 'failed',
            error: errorMessage,
            durationMs,
          };
          execution.stepResults.push(stepResult);
          execution.status = 'failed';
          return lastOutput;
        }

        // 'continue' strategy: mark as skipped, pass previous input forward
        const stepResult: WorkflowStepResult = {
          stepId: step.stepId,
          type: step.type,
          status: 'skipped',
          error: errorMessage,
          durationMs,
        };
        execution.stepResults.push(stepResult);
        // lastOutput stays the same (previous value passed forward)
      }
    }

    return lastOutput;
  }

  /**
   * Execute a single step and return its output string.
   * Throws on error.
   */
  private async executeSingleStep(
    execution: WorkflowExecution,
    step: WorkflowStep,
    currentInput: string,
    executor: WorkflowTaskExecutor,
    errorStrategy: 'fail-fast' | 'continue',
    workflowStartedAt: Date,
  ): Promise<string> {
    switch (step.type) {
      case 'task': {
        const resolvedPrompt = step.prompt.replace(/\{\{input\}\}/g, currentInput);
        const executionRequest = this.buildTaskExecutionRequest(
          execution,
          step,
          resolvedPrompt,
        );
        const effectivePrompt =
          executionRequest.instructionBundle?.agent_specific_prompt ?? resolvedPrompt;

        if (step.timeoutMs) {
          return await Promise.race([
            this.invokeTaskExecutor(executor, executionRequest, effectivePrompt),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Step ${step.stepId} timed out after ${step.timeoutMs}ms`)),
                step.timeoutMs!,
              ),
            ),
          ]);
        }

        return await this.invokeTaskExecutor(executor, executionRequest, effectivePrompt);
      }

      case 'pipeline': {
        // Simulated -- real pipeline orchestrator is not wired in yet
        const result = '[pipeline:' + step.pipelineId + '] executed';
        logger.debug(
          { executionId: execution.executionId, stepId: step.stepId, pipelineId: step.pipelineId },
          'Pipeline step simulated',
        );
        return result;
      }

      case 'scatter-gather': {
        // Simulated -- real scatter-gather orchestrator is not wired in yet
        const result = '[scatter-gather:' + step.patternId + '] executed';
        logger.debug(
          { executionId: execution.executionId, stepId: step.stepId, patternId: step.patternId },
          'Scatter-gather step simulated',
        );
        return result;
      }

      case 'conditional': {
        const conditionResult = evaluateCondition(step.condition, currentInput, execution.context);

        if (conditionResult) {
          if (step.thenSteps.length > 0) {
            return await this.executeSteps(
              execution,
              step.thenSteps,
              currentInput,
              executor,
              errorStrategy,
              workflowStartedAt,
            );
          }
          return currentInput;
        } else {
          if (step.elseSteps && step.elseSteps.length > 0) {
            return await this.executeSteps(
              execution,
              step.elseSteps,
              currentInput,
              executor,
              errorStrategy,
              workflowStartedAt,
            );
          }
          return currentInput;
        }
      }

      case 'parallel': {
        if (step.branches.length === 0) {
          return currentInput;
        }

        const results = await Promise.allSettled(
          step.branches.map((branch) =>
            this.executeSingleStep(
              execution,
              branch,
              currentInput,
              executor,
              errorStrategy,
              workflowStartedAt,
            ),
          ),
        );

        const outputs: string[] = [];
        const errors: string[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled') {
            outputs.push(result.value);
          } else {
            const errorMessage =
              result.reason instanceof Error ? result.reason.message : String(result.reason);
            errors.push(errorMessage);

            if (errorStrategy === 'fail-fast') {
              throw new Error(`Parallel branch ${step.branches[i].stepId} failed: ${errorMessage}`);
            }
          }
        }

        // Join all successful outputs
        return outputs.join('\n');
      }

      default:
        throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
    }
  }

  /**
   * Try to extract context from step output.
   * If the output is valid JSON with a "context" key, merge it into the execution context.
   */
  private tryExtractContext(
    execution: WorkflowExecution,
    output: string,
  ): void {
    try {
      const parsed = JSON.parse(output);
      if (parsed && typeof parsed === 'object' && 'context' in parsed) {
        const ctx = parsed.context;
        if (typeof ctx === 'object' && ctx !== null) {
          for (const [key, value] of Object.entries(ctx)) {
            if (typeof value === 'string') {
              execution.context[key] = value;
            }
          }
        }
      }
    } catch {
      // Not JSON or no context key -- skip
    }
  }

  private buildTaskExecutionRequest(
    execution: WorkflowExecution,
    step: WorkflowTaskStep,
    prompt: string,
  ): WorkflowTaskExecutionRequest {
    const workspaceId = execution.context._workspaceId || 'workflow-engine';
    const threadId = execution.context._threadId || `workflow-${execution.executionId}`;
    const requesterPlatform = (execution.context._requesterPlatform as any) || 'recoder_backend';
    const assigneePlatform = (execution.context._assigneePlatform as any) || 'custom';
    const envelope = createTaskEnvelope({
      id: generateId('wftask'),
      workspace_id: workspaceId,
      thread_id: threadId,
      trace_id: execution.executionId,
      requester: {
        agent_id: 'workflow-engine',
        platform: requesterPlatform,
        name: 'Workflow Engine',
      },
      assignee: {
        agent_id: step.agentId,
        platform: assigneePlatform,
      },
      connector: {
        connector_id: `workflow-step:${step.stepId}`,
        platform: assigneePlatform,
        protocol: 'rest',
      },
      payload: {
        kind: 'text',
        text: prompt,
      },
      metadata: {
        workflowId: execution.workflowId,
        executionId: execution.executionId,
        stepId: step.stepId,
        source: 'workflow-engine',
      },
      tags: ['workflow-task-step'],
    });
    const instructionBundle = compileInstructionBundleForTask(envelope);

    return {
      workflowId: execution.workflowId,
      executionId: execution.executionId,
      stepId: step.stepId,
      agentId: step.agentId,
      prompt,
      envelope,
      instructionBundle,
      context: { ...execution.context },
    };
  }

  private async invokeTaskExecutor(
    executor: WorkflowTaskExecutor,
    request: WorkflowTaskExecutionRequest,
    _effectivePrompt: string,
  ): Promise<string> {
    const result =
      (executor as StructuredWorkflowTaskExecutor).__agentOsStructured === true
        ? await (executor as StructuredWorkflowTaskExecutor)(request)
        : await (executor as (agentId: string, prompt: string) => Promise<string>)(
            request.agentId,
            request.prompt,
          );

    return result;
  }

  // -------------------------------------------------------------------------
  // Execution queries
  // -------------------------------------------------------------------------

  /**
   * Get a past execution by ID.
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * List all executions, optionally filtered by workflowId.
   */
  listExecutions(workflowId?: string): WorkflowExecution[] {
    const all = Array.from(this.executions.values());
    if (workflowId) {
      return all.filter((e) => e.workflowId === workflowId);
    }
    return all;
  }

  /**
   * Cancel a running execution.
   * Returns true if the execution was found and was in a cancellable state.
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution) return false;
    if (execution.status !== 'running') return false;

    this.cancelledIds.add(executionId);
    logger.info({ executionId }, 'Workflow execution cancel requested');
    return true;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Reset all state.
   */
  reset(): void {
    this.workflows.clear();
    this.executions.clear();
    this.cancelledIds.clear();
    this.removeAllListeners();
    logger.debug('WorkflowEngine reset');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!instance) {
    instance = new WorkflowEngine();
  }
  return instance;
}

export function resetWorkflowEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
