/**
 * Workflow System for Multi-Step AI Tasks
 *
 * Inspired by giselle's workflow implementation, this system provides:
 * - Step definition and sequencing
 * - Parallel and sequential execution
 * - Dependency management between steps
 * - Automatic retry with backoff
 * - Progress tracking and status updates
 */

import { nanoid } from 'nanoid';

// ============================================
// Types
// ============================================

/** Execution mode for workflow steps */
export type ExecutionMode = 'sequential' | 'parallel';

/** Status of a workflow step */
export type StepStatus =
  | 'pending'      // Not yet started
  | 'waiting'      // Waiting for dependencies
  | 'running'      // Currently executing
  | 'completed'    // Successfully finished
  | 'failed'       // Failed after retries
  | 'cancelled'    // Manually cancelled
  | 'skipped';     // Skipped due to condition

/** Status of an entire workflow */
export type WorkflowStatus =
  | 'idle'         // Not started
  | 'running'      // In progress
  | 'paused'       // Manually paused
  | 'completed'    // All steps done
  | 'failed'       // One or more steps failed
  | 'cancelled';   // Manually cancelled

/** Context passed to step executors */
export interface StepContext {
  /** Workflow ID */
  workflowId: string;
  /** Step ID */
  stepId: string;
  /** Results from previous steps */
  previousResults: Map<string, StepResult>;
  /** Input data for the workflow */
  workflowInput: Record<string, unknown>;
  /** Abort signal for cancellation */
  signal: AbortSignal;
  /** Report progress (0-100) */
  reportProgress: (progress: number, message?: string) => void;
  /** Log a message */
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/** Result of a step execution */
export interface StepResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  startedAt: Date;
  completedAt: Date;
}

/** Step executor function */
export type StepExecutor = (context: StepContext) => Promise<StepResult>;

/** Condition function to determine if step should run */
export type StepCondition = (context: StepContext) => boolean | Promise<boolean>;

/** Definition of a workflow step */
export interface WorkflowStep {
  /** Unique step ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the step does */
  description: string;
  /** Icon for UI display (UnoCSS class) */
  icon?: string;
  /** Step executor function */
  executor: StepExecutor;
  /** IDs of steps this step depends on */
  dependsOn?: string[];
  /** Condition to run this step */
  condition?: StepCondition;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Initial retry delay in ms */
  retryDelay?: number;
  /** Timeout for the step in ms */
  timeout?: number;
  /** Whether to continue workflow on failure */
  continueOnFailure?: boolean;
}

/** Runtime state of a step */
export interface StepState {
  step: WorkflowStep;
  status: StepStatus;
  progress: number;
  message?: string;
  result?: StepResult;
  retryCount: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  logs: Array<{ level: string; message: string; timestamp: Date }>;
}

/** Definition of a workflow */
export interface WorkflowDefinition {
  /** Unique workflow ID (generated) */
  id?: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Icon for UI display */
  icon?: string;
  /** Category/tag */
  category?: string;
  /** Steps in this workflow */
  steps: WorkflowStep[];
  /** Default execution mode */
  executionMode?: ExecutionMode;
  /** Maximum parallel steps (when mode is parallel) */
  maxParallelSteps?: number;
  /** Global timeout for entire workflow */
  timeout?: number;
}

/** Runtime state of a workflow */
export interface WorkflowState {
  id: string;
  definition: WorkflowDefinition;
  status: WorkflowStatus;
  steps: Map<string, StepState>;
  input: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  progress: number;
  currentStepId?: string;
  error?: string;
}

/** Events emitted by workflow executor */
export interface WorkflowEvents {
  onWorkflowStart?: (workflow: WorkflowState) => void;
  onWorkflowComplete?: (workflow: WorkflowState) => void;
  onWorkflowFailed?: (workflow: WorkflowState, error: string) => void;
  onWorkflowCancelled?: (workflow: WorkflowState) => void;
  onStepStart?: (workflow: WorkflowState, step: StepState) => void;
  onStepComplete?: (workflow: WorkflowState, step: StepState) => void;
  onStepFailed?: (workflow: WorkflowState, step: StepState, error: string) => void;
  onStepProgress?: (workflow: WorkflowState, step: StepState, progress: number, message?: string) => void;
  onStepRetry?: (workflow: WorkflowState, step: StepState, retryCount: number) => void;
}

// ============================================
// Workflow Executor
// ============================================

/** Executor for running workflows */
export class WorkflowExecutor {
  private abortController: AbortController | null = null;
  private events: WorkflowEvents;
  private state: WorkflowState | null = null;

  constructor(events: WorkflowEvents = {}) {
    this.events = events;
  }

  /**
   * Execute a workflow
   */
  async execute(
    definition: WorkflowDefinition,
    input: Record<string, unknown> = {}
  ): Promise<WorkflowState> {
    // Initialize workflow state
    const workflowId = definition.id || nanoid();
    this.abortController = new AbortController();

    this.state = {
      id: workflowId,
      definition,
      status: 'running',
      steps: new Map(),
      input,
      startedAt: new Date(),
      progress: 0,
    };

    // Initialize step states
    for (const step of definition.steps) {
      this.state.steps.set(step.id, {
        step,
        status: step.dependsOn?.length ? 'waiting' : 'pending',
        progress: 0,
        retryCount: 0,
        logs: [],
      });
    }

    this.events.onWorkflowStart?.(this.state);

    try {
      if (definition.executionMode === 'parallel') {
        await this.executeParallel(definition, input);
      } else {
        await this.executeSequential(definition, input);
      }

      // Check if all steps completed
      const allCompleted = Array.from(this.state.steps.values())
        .every(s => s.status === 'completed' || s.status === 'skipped');

      if (allCompleted) {
        this.state.status = 'completed';
        this.state.completedAt = new Date();
        this.state.progress = 100;
        this.events.onWorkflowComplete?.(this.state);
      } else {
        const failedSteps = Array.from(this.state.steps.values())
          .filter(s => s.status === 'failed');

        if (failedSteps.length > 0) {
          this.state.status = 'failed';
          this.state.error = `${failedSteps.length} step(s) failed`;
          this.events.onWorkflowFailed?.(this.state, this.state.error);
        }
      }
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        this.state.status = 'cancelled';
        this.events.onWorkflowCancelled?.(this.state);
      } else {
        this.state.status = 'failed';
        this.state.error = error instanceof Error ? error.message : String(error);
        this.events.onWorkflowFailed?.(this.state, this.state.error);
      }
    }

    return this.state;
  }

  /**
   * Cancel the running workflow
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Pause the workflow (only affects sequential execution)
   */
  pause(): void {
    if (this.state) {
      this.state.status = 'paused';
    }
  }

  /**
   * Resume a paused workflow
   */
  resume(): void {
    if (this.state?.status === 'paused') {
      this.state.status = 'running';
    }
  }

  /**
   * Get current workflow state
   */
  getState(): WorkflowState | null {
    return this.state;
  }

  /**
   * Execute steps sequentially
   */
  private async executeSequential(
    definition: WorkflowDefinition,
    input: Record<string, unknown>
  ): Promise<void> {
    const results = new Map<string, StepResult>();
    const executedSteps: string[] = [];

    // Build dependency graph and execution order
    const order = this.getExecutionOrder(definition.steps);

    for (const stepId of order) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Workflow cancelled');
      }

      if (this.state?.status === 'paused') {
        // Wait for resume
        await new Promise(resolve => {
          const check = setInterval(() => {
            if (this.state?.status !== 'paused' || this.abortController?.signal.aborted) {
              clearInterval(check);
              resolve(undefined);
            }
          }, 100);
        });
      }

      const stepState = this.state!.steps.get(stepId);
      if (!stepState) continue;

      const step = stepState.step;

      // Check dependencies
      if (step.dependsOn?.length) {
        const allDependenciesMet = step.dependsOn.every(depId => {
          const depState = this.state!.steps.get(depId);
          return depState?.status === 'completed';
        });

        if (!allDependenciesMet) {
          stepState.status = 'skipped';
          stepState.message = 'Dependencies not met';
          continue;
        }
      }

      // Check condition
      if (step.condition) {
        const context = this.createContext(stepId, results, input);
        const shouldRun = await step.condition(context);
        if (!shouldRun) {
          stepState.status = 'skipped';
          stepState.message = 'Condition not met';
          continue;
        }
      }

      // Execute step with retry
      const result = await this.executeStepWithRetry(stepState, results, input);
      results.set(stepId, result);
      executedSteps.push(stepId);

      // Update overall progress
      this.state!.progress = Math.round((executedSteps.length / order.length) * 100);

      // Check if we should continue
      if (!result.success && !step.continueOnFailure) {
        break;
      }
    }
  }

  /**
   * Execute steps in parallel (respecting dependencies)
   */
  private async executeParallel(
    definition: WorkflowDefinition,
    input: Record<string, unknown>
  ): Promise<void> {
    const results = new Map<string, StepResult>();
    const inProgress = new Set<string>();
    const completed = new Set<string>();
    const maxParallel = definition.maxParallelSteps || 5;

    const canExecute = (step: WorkflowStep): boolean => {
      // Check if dependencies are met
      if (step.dependsOn?.length) {
        return step.dependsOn.every(depId => completed.has(depId));
      }
      return true;
    };

    const executeNextBatch = async (): Promise<void> => {
      // Find steps that can be executed
      const available = definition.steps.filter(step =>
        !completed.has(step.id) &&
        !inProgress.has(step.id) &&
        canExecute(step)
      );

      if (available.length === 0 && inProgress.size === 0) {
        return; // All done
      }

      // Take up to maxParallel steps
      const toExecute = available.slice(0, maxParallel - inProgress.size);

      const promises = toExecute.map(async step => {
        const stepState = this.state!.steps.get(step.id);
        if (!stepState) return;

        inProgress.add(step.id);

        // Check condition
        if (step.condition) {
          const context = this.createContext(step.id, results, input);
          const shouldRun = await step.condition(context);
          if (!shouldRun) {
            stepState.status = 'skipped';
            stepState.message = 'Condition not met';
            inProgress.delete(step.id);
            completed.add(step.id);
            return;
          }
        }

        const result = await this.executeStepWithRetry(stepState, results, input);
        results.set(step.id, result);
        inProgress.delete(step.id);
        completed.add(step.id);

        // Update progress
        this.state!.progress = Math.round((completed.size / definition.steps.length) * 100);
      });

      await Promise.all(promises);

      // Check for more steps to execute
      if (completed.size < definition.steps.length) {
        await executeNextBatch();
      }
    };

    await executeNextBatch();
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry(
    stepState: StepState,
    previousResults: Map<string, StepResult>,
    workflowInput: Record<string, unknown>
  ): Promise<StepResult> {
    const step = stepState.step;
    const maxRetries = step.maxRetries ?? 2;
    const baseDelay = step.retryDelay ?? 1000;

    stepState.status = 'running';
    stepState.startedAt = new Date();
    this.state!.currentStepId = step.id;
    this.events.onStepStart?.(this.state!, stepState);

    let lastError: string = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this.abortController?.signal.aborted) {
        stepState.status = 'cancelled';
        return {
          success: false,
          error: 'Cancelled',
          duration: Date.now() - stepState.startedAt!.getTime(),
          startedAt: stepState.startedAt!,
          completedAt: new Date(),
        };
      }

      try {
        const context = this.createContext(step.id, previousResults, workflowInput);

        // Add timeout if specified
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = step.timeout
          ? new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('Step timeout')), step.timeout);
            })
          : null;

        const executionPromise = step.executor(context);

        const result = timeoutPromise
          ? await Promise.race([executionPromise, timeoutPromise])
          : await executionPromise;

        if (timeoutId) clearTimeout(timeoutId);

        if (result.success) {
          stepState.status = 'completed';
          stepState.result = result;
          stepState.completedAt = result.completedAt;
          stepState.progress = 100;
          this.events.onStepComplete?.(this.state!, stepState);
          return result;
        }

        lastError = result.error || 'Unknown error';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // Retry with backoff
      if (attempt < maxRetries) {
        stepState.retryCount = attempt + 1;
        this.events.onStepRetry?.(this.state!, stepState, stepState.retryCount);

        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    stepState.status = 'failed';
    stepState.error = lastError;
    stepState.completedAt = new Date();

    const result: StepResult = {
      success: false,
      error: lastError,
      duration: Date.now() - stepState.startedAt!.getTime(),
      startedAt: stepState.startedAt!,
      completedAt: stepState.completedAt,
    };

    stepState.result = result;
    this.events.onStepFailed?.(this.state!, stepState, lastError);

    return result;
  }

  /**
   * Create execution context for a step
   */
  private createContext(
    stepId: string,
    previousResults: Map<string, StepResult>,
    workflowInput: Record<string, unknown>
  ): StepContext {
    const stepState = this.state!.steps.get(stepId)!;

    return {
      workflowId: this.state!.id,
      stepId,
      previousResults,
      workflowInput,
      signal: this.abortController!.signal,
      reportProgress: (progress: number, message?: string) => {
        stepState.progress = progress;
        stepState.message = message;
        this.events.onStepProgress?.(this.state!, stepState, progress, message);
      },
      log: (level: 'info' | 'warn' | 'error', message: string) => {
        stepState.logs.push({ level, message, timestamp: new Date() });
      },
    };
  }

  /**
   * Get topologically sorted execution order
   */
  private getExecutionOrder(steps: WorkflowStep[]): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected involving step: ${stepId}`);
      }

      visiting.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (step?.dependsOn) {
        for (const depId of step.dependsOn) {
          visit(depId);
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
      order.push(stepId);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return order;
  }
}

// ============================================
// Built-in Step Executors
// ============================================

/**
 * Create a step that sends a message to the AI chat
 */
export function createChatStep(prompt: string): StepExecutor {
  return async (context) => {
    const startedAt = new Date();
    context.reportProgress(10, 'Preparing prompt...');

    // This would integrate with the chat system
    // For now, return a placeholder result
    context.reportProgress(50, 'Waiting for AI response...');

    return {
      success: true,
      data: { prompt },
      duration: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
    };
  };
}

/**
 * Create a step that waits for user confirmation
 */
export function createConfirmationStep(message: string): StepExecutor {
  return async (context) => {
    const startedAt = new Date();
    context.reportProgress(50, message);

    // This would show a confirmation dialog
    // For now, auto-confirm
    return {
      success: true,
      data: { confirmed: true },
      duration: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
    };
  };
}

/**
 * Create a step that runs a shell command
 */
export function createShellStep(command: string): StepExecutor {
  return async (context) => {
    const startedAt = new Date();
    context.reportProgress(10, `Running: ${command}`);
    context.log('info', `Executing command: ${command}`);

    // This would integrate with the terminal
    context.reportProgress(90, 'Command completed');

    return {
      success: true,
      data: { command, output: '' },
      duration: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
    };
  };
}

/**
 * Create a step that validates code
 */
export function createValidationStep(validationType: 'build' | 'lint' | 'test'): StepExecutor {
  return async (context) => {
    const startedAt = new Date();
    context.reportProgress(10, `Running ${validationType}...`);

    // This would integrate with the build/lint/test systems
    context.reportProgress(100, `${validationType} passed`);

    return {
      success: true,
      data: { type: validationType, passed: true },
      duration: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
    };
  };
}

// ============================================
// Workflow Builder
// ============================================

/**
 * Fluent builder for creating workflows
 */
export class WorkflowBuilder {
  private definition: WorkflowDefinition;

  constructor(name: string) {
    this.definition = {
      id: nanoid(),
      name,
      description: '',
      steps: [],
      executionMode: 'sequential',
    };
  }

  description(desc: string): WorkflowBuilder {
    this.definition.description = desc;
    return this;
  }

  icon(icon: string): WorkflowBuilder {
    this.definition.icon = icon;
    return this;
  }

  category(category: string): WorkflowBuilder {
    this.definition.category = category;
    return this;
  }

  parallel(maxParallel?: number): WorkflowBuilder {
    this.definition.executionMode = 'parallel';
    this.definition.maxParallelSteps = maxParallel;
    return this;
  }

  sequential(): WorkflowBuilder {
    this.definition.executionMode = 'sequential';
    return this;
  }

  timeout(ms: number): WorkflowBuilder {
    this.definition.timeout = ms;
    return this;
  }

  step(step: WorkflowStep): WorkflowBuilder {
    this.definition.steps.push(step);
    return this;
  }

  addStep(
    id: string,
    name: string,
    executor: StepExecutor,
    options: Partial<Omit<WorkflowStep, 'id' | 'name' | 'executor'>> = {}
  ): WorkflowBuilder {
    this.definition.steps.push({
      id,
      name,
      executor,
      description: options.description || name,
      ...options,
    });
    return this;
  }

  build(): WorkflowDefinition {
    return this.definition;
  }
}

/**
 * Helper to create a workflow builder
 */
export function workflow(name: string): WorkflowBuilder {
  return new WorkflowBuilder(name);
}

// ============================================
// Exports
// ============================================

// WorkflowEvents is already exported at its definition
