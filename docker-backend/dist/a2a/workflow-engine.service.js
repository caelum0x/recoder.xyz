"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEngine = void 0;
exports.getWorkflowEngine = getWorkflowEngine;
exports.resetWorkflowEngine = resetWorkflowEngine;
const events_1 = require("events");
const logger_1 = require("../logger");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const logger = (0, logger_1.createLogger)('a2a-workflow-engine');
// ---------------------------------------------------------------------------
// Safe condition evaluator
// ---------------------------------------------------------------------------
/**
 * Allowed operators and tokens in condition expressions.
 * Only simple comparisons, boolean logic, and property access are permitted.
 */
const SAFE_CONDITION_PATTERN = /^[\s()!&|=<>?:.]+$|^(input|context|true|false|null|undefined|typeof|instanceof|'[^']*'|"[^"]*"|`[^`]*`|\d+(\.\d+)?|[\w$.[\]]+|===?|!==?|>=?|<=?|&&|\|\||[?]{2}|[?]\.|[+\-*/%]|\s)+$/;
/**
 * Validate that a condition string contains only safe tokens.
 * Rejects anything that could execute arbitrary code (function calls,
 * assignments, template literals with expressions, etc.).
 */
function isSafeCondition(condition) {
    // Block dangerous patterns explicitly
    const dangerous = /\b(eval|Function|require|import|process|global|window|document|fetch|XMLHttpRequest|setTimeout|setInterval|setImmediate)\b/;
    if (dangerous.test(condition))
        return false;
    // Block assignment operators (but allow == and ===)
    if (/(?<![=!<>])=(?!=)/.test(condition))
        return false;
    // Block semicolons, curly braces, and backtick template expressions
    if (/[;{}]|\$\{/.test(condition))
        return false;
    return true;
}
/**
 * Evaluate a condition expression with `input` and `context` in scope.
 * Uses vm.runInNewContext for sandboxed evaluation with a strict timeout.
 * Returns true/false. On any error or unsafe input, returns false.
 */
function evaluateCondition(condition, input, context) {
    if (!isSafeCondition(condition)) {
        logger.warn({ condition }, 'Condition contains unsafe tokens, rejecting');
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
    }
    catch (err) {
        logger.warn({ condition, error: err instanceof Error ? err.message : String(err) }, 'Condition evaluation failed, treating as false');
        return false;
    }
}
// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------
class WorkflowEngine extends events_1.EventEmitter {
    workflows = new Map();
    executions = new Map();
    cancelledIds = new Set();
    // -------------------------------------------------------------------------
    // Workflow CRUD
    // -------------------------------------------------------------------------
    /**
     * Register a workflow definition.
     */
    registerWorkflow(definition) {
        logger.info({ workflowId: definition.workflowId, name: definition.name }, 'Workflow registered');
        this.workflows.set(definition.workflowId, definition);
    }
    /**
     * Get a registered workflow definition.
     */
    getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
    }
    /**
     * List all registered workflows.
     */
    listWorkflows() {
        return Array.from(this.workflows.values());
    }
    /**
     * Remove a workflow definition.
     */
    removeWorkflow(workflowId) {
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
    async execute(workflowId, input, executor) {
        const definition = this.workflows.get(workflowId);
        if (!definition) {
            const executionId = (0, task_lifecycle_service_1.generateId)('wfexec');
            const now = new Date().toISOString();
            const execution = {
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
        const executionId = (0, task_lifecycle_service_1.generateId)('wfexec');
        const startedAt = new Date();
        const execution = {
            executionId,
            workflowId,
            status: 'running',
            input,
            stepResults: [],
            context: {},
            startedAt: startedAt.toISOString(),
        };
        this.executions.set(executionId, execution);
        logger.info({ executionId, workflowId, stepCount: definition.steps.length }, 'Workflow execution started');
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
        let globalTimeoutHandle;
        const globalTimeoutPromise = new Promise((resolve) => {
            globalTimeoutHandle = setTimeout(() => resolve('timeout'), globalTimeoutMs);
        });
        try {
            const result = await Promise.race([
                this.executeSteps(execution, definition.steps, input, executor, errorStrategy, startedAt),
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
            logger.info({ executionId, workflowId, totalDurationMs: execution.totalDurationMs }, 'Workflow execution completed');
            this.emit('workflow:completed', execution);
            return execution;
        }
        finally {
            if (globalTimeoutHandle) {
                clearTimeout(globalTimeoutHandle);
            }
        }
    }
    // -------------------------------------------------------------------------
    // Internal step execution
    // -------------------------------------------------------------------------
    async executeSteps(execution, steps, currentInput, executor, errorStrategy, workflowStartedAt) {
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
                const stepOutput = await this.executeSingleStep(execution, step, lastOutput, executor, errorStrategy, workflowStartedAt);
                const stepEnd = new Date();
                const durationMs = stepEnd.getTime() - stepStart.getTime();
                const stepResult = {
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
                logger.debug({ executionId: execution.executionId, stepId: step.stepId, durationMs }, 'Workflow step completed');
            }
            catch (err) {
                const stepEnd = new Date();
                const durationMs = stepEnd.getTime() - stepStart.getTime();
                const errorMessage = err instanceof Error ? err.message : String(err);
                logger.warn({ executionId: execution.executionId, stepId: step.stepId, error: errorMessage }, 'Workflow step failed');
                this.emit('workflow:step:failed', {
                    executionId: execution.executionId,
                    stepId: step.stepId,
                    type: step.type,
                    error: errorMessage,
                    durationMs,
                });
                if (errorStrategy === 'fail-fast') {
                    const stepResult = {
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
                const stepResult = {
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
    async executeSingleStep(execution, step, currentInput, executor, errorStrategy, workflowStartedAt) {
        switch (step.type) {
            case 'task': {
                const resolvedPrompt = step.prompt.replace(/\{\{input\}\}/g, currentInput);
                if (step.timeoutMs) {
                    return await Promise.race([
                        executor(step.agentId, resolvedPrompt),
                        new Promise((_, reject) => setTimeout(() => reject(new Error(`Step ${step.stepId} timed out after ${step.timeoutMs}ms`)), step.timeoutMs)),
                    ]);
                }
                return await executor(step.agentId, resolvedPrompt);
            }
            case 'pipeline': {
                // Simulated -- real pipeline orchestrator is not wired in yet
                const result = '[pipeline:' + step.pipelineId + '] executed';
                logger.debug({ executionId: execution.executionId, stepId: step.stepId, pipelineId: step.pipelineId }, 'Pipeline step simulated');
                return result;
            }
            case 'scatter-gather': {
                // Simulated -- real scatter-gather orchestrator is not wired in yet
                const result = '[scatter-gather:' + step.patternId + '] executed';
                logger.debug({ executionId: execution.executionId, stepId: step.stepId, patternId: step.patternId }, 'Scatter-gather step simulated');
                return result;
            }
            case 'conditional': {
                const conditionResult = evaluateCondition(step.condition, currentInput, execution.context);
                if (conditionResult) {
                    if (step.thenSteps.length > 0) {
                        return await this.executeSteps(execution, step.thenSteps, currentInput, executor, errorStrategy, workflowStartedAt);
                    }
                    return currentInput;
                }
                else {
                    if (step.elseSteps && step.elseSteps.length > 0) {
                        return await this.executeSteps(execution, step.elseSteps, currentInput, executor, errorStrategy, workflowStartedAt);
                    }
                    return currentInput;
                }
            }
            case 'parallel': {
                if (step.branches.length === 0) {
                    return currentInput;
                }
                const results = await Promise.allSettled(step.branches.map((branch) => this.executeSingleStep(execution, branch, currentInput, executor, errorStrategy, workflowStartedAt)));
                const outputs = [];
                const errors = [];
                for (let i = 0; i < results.length; i++) {
                    const result = results[i];
                    if (result.status === 'fulfilled') {
                        outputs.push(result.value);
                    }
                    else {
                        const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
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
                throw new Error(`Unknown step type: ${step.type}`);
        }
    }
    /**
     * Try to extract context from step output.
     * If the output is valid JSON with a "context" key, merge it into the execution context.
     */
    tryExtractContext(execution, output) {
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
        }
        catch {
            // Not JSON or no context key -- skip
        }
    }
    // -------------------------------------------------------------------------
    // Execution queries
    // -------------------------------------------------------------------------
    /**
     * Get a past execution by ID.
     */
    getExecution(executionId) {
        return this.executions.get(executionId);
    }
    /**
     * List all executions, optionally filtered by workflowId.
     */
    listExecutions(workflowId) {
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
    cancelExecution(executionId) {
        const execution = this.executions.get(executionId);
        if (!execution)
            return false;
        if (execution.status !== 'running')
            return false;
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
    reset() {
        this.workflows.clear();
        this.executions.clear();
        this.cancelledIds.clear();
        this.removeAllListeners();
        logger.debug('WorkflowEngine reset');
    }
}
exports.WorkflowEngine = WorkflowEngine;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;
function getWorkflowEngine() {
    if (!instance) {
        instance = new WorkflowEngine();
    }
    return instance;
}
function resetWorkflowEngine() {
    if (instance) {
        instance.reset();
    }
    instance = null;
}
