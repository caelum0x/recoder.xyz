import type { ActionContext, ActionResult, RegisteredAction } from './types';
import { actionRegistry, getAction, isValidActionId } from './index';

/**
 * Action execution options
 */
export interface ExecuteActionOptions {
  /** Action ID to execute */
  actionId: string;
  /** Action payload */
  payload: unknown;
  /** Execution context */
  context: ActionContext;
  /** Callback for action start */
  onStart?: (actionId: string) => void;
  /** Callback for action completion */
  onComplete?: (actionId: string, result: ActionResult) => void;
  /** Callback for action error */
  onError?: (actionId: string, error: Error) => void;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Batch execution options
 */
export interface BatchExecuteOptions {
  /** Actions to execute */
  actions: Array<{
    actionId: string;
    payload: unknown;
  }>;
  /** Shared execution context */
  context: ActionContext;
  /** Whether to stop on first error */
  stopOnError?: boolean;
  /** Maximum concurrent executions */
  concurrency?: number;
  /** Callback for each action completion */
  onActionComplete?: (actionId: string, result: ActionResult, index: number) => void;
}

/**
 * Batch execution result
 */
export interface BatchExecuteResult {
  /** Overall success status */
  success: boolean;
  /** Results for each action */
  results: Array<{
    actionId: string;
    result: ActionResult;
  }>;
  /** Number of successful actions */
  successCount: number;
  /** Number of failed actions */
  failureCount: number;
  /** Total execution time in milliseconds */
  totalTime: number;
}

/**
 * Execute a single action
 */
export async function executeAction(options: ExecuteActionOptions): Promise<ActionResult> {
  const { actionId, payload, context, onStart, onComplete, onError, timeout = 30000 } = options;

  // Validate action exists
  if (!isValidActionId(actionId)) {
    const error = new Error(`Unknown action: ${actionId}`);
    onError?.(actionId, error);
    return {
      success: false,
      error: error.message,
    };
  }

  const action = getAction(actionId);
  if (!action) {
    const error = new Error(`Action not found: ${actionId}`);
    onError?.(actionId, error);
    return {
      success: false,
      error: error.message,
    };
  }

  // Validate payload against schema
  const validationResult = action.definition.payload.safeParse(payload);
  if (!validationResult.success) {
    const error = new Error(`Invalid payload: ${validationResult.error.message}`);
    onError?.(actionId, error);
    return {
      success: false,
      error: 'Invalid payload',
      errorDetails: validationResult.error.errors,
    };
  }

  onStart?.(actionId);

  try {
    // Execute with timeout
    const result = await Promise.race([
      action.execute(validationResult.data, context),
      new Promise<ActionResult>((_, reject) =>
        setTimeout(() => reject(new Error('Action execution timed out')), timeout)
      ),
    ]);

    onComplete?.(actionId, result);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(actionId, err);
    return {
      success: false,
      error: err.message,
      errorDetails: error,
    };
  }
}

/**
 * Execute multiple actions in sequence or parallel
 */
export async function batchExecute(options: BatchExecuteOptions): Promise<BatchExecuteResult> {
  const {
    actions,
    context,
    stopOnError = false,
    concurrency = 1,
    onActionComplete,
  } = options;

  const startTime = Date.now();
  const results: Array<{ actionId: string; result: ActionResult }> = [];
  let successCount = 0;
  let failureCount = 0;

  if (concurrency === 1) {
    // Sequential execution
    for (let i = 0; i < actions.length; i++) {
      const { actionId, payload } = actions[i];
      const result = await executeAction({ actionId, payload, context });

      results.push({ actionId, result });
      onActionComplete?.(actionId, result, i);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        if (stopOnError) {
          break;
        }
      }
    }
  } else {
    // Parallel execution with concurrency limit
    const queue = [...actions];
    const inFlight: Promise<void>[] = [];
    let index = 0;

    const processNext = async (): Promise<void> => {
      if (queue.length === 0) return;
      if (stopOnError && failureCount > 0) return;

      const currentIndex = index++;
      const { actionId, payload } = queue.shift()!;
      const result = await executeAction({ actionId, payload, context });

      results[currentIndex] = { actionId, result };
      onActionComplete?.(actionId, result, currentIndex);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }

      await processNext();
    };

    // Start initial batch
    for (let i = 0; i < Math.min(concurrency, actions.length); i++) {
      inFlight.push(processNext());
    }

    await Promise.all(inFlight);
  }

  return {
    success: failureCount === 0,
    results,
    successCount,
    failureCount,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Create an action executor with pre-configured context
 */
export function createActionExecutor(context: ActionContext) {
  return {
    /**
     * Execute a single action
     */
    execute: (actionId: string, payload: unknown, options?: Partial<ExecuteActionOptions>) =>
      executeAction({ actionId, payload, context, ...options }),

    /**
     * Execute multiple actions
     */
    batch: (
      actions: Array<{ actionId: string; payload: unknown }>,
      options?: Partial<Omit<BatchExecuteOptions, 'actions' | 'context'>>
    ) => batchExecute({ actions, context, ...options }),

    /**
     * Get the context
     */
    getContext: () => context,

    /**
     * Create a new executor with updated context
     */
    withContext: (updates: Partial<ActionContext>) =>
      createActionExecutor({ ...context, ...updates }),
  };
}

/**
 * Execution history entry
 */
export interface ExecutionHistoryEntry {
  id: string;
  actionId: string;
  payload: unknown;
  result: ActionResult;
  timestamp: number;
  duration: number;
}

/**
 * Action executor with history tracking
 */
export class TrackedActionExecutor {
  private context: ActionContext;
  private history: ExecutionHistoryEntry[] = [];
  private maxHistorySize: number;

  constructor(context: ActionContext, maxHistorySize = 100) {
    this.context = context;
    this.maxHistorySize = maxHistorySize;
  }

  async execute(actionId: string, payload: unknown): Promise<ActionResult> {
    const startTime = Date.now();
    const result = await executeAction({ actionId, payload, context: this.context });
    const duration = Date.now() - startTime;

    const entry: ExecutionHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      actionId,
      payload,
      result,
      timestamp: startTime,
      duration,
    };

    this.history.push(entry);

    // Trim history if needed
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }

    return result;
  }

  getHistory(): ExecutionHistoryEntry[] {
    return [...this.history];
  }

  getLastExecution(): ExecutionHistoryEntry | undefined {
    return this.history[this.history.length - 1];
  }

  clearHistory(): void {
    this.history = [];
  }

  getContext(): ActionContext {
    return this.context;
  }

  setContext(context: ActionContext): void {
    this.context = context;
  }
}
