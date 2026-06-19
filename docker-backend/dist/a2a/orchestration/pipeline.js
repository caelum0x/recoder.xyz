"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineOrchestrator = void 0;
exports.getPipelineOrchestrator = getPipelineOrchestrator;
exports.resetPipelineOrchestrator = resetPipelineOrchestrator;
const logger_1 = require("../../logger");
const task_lifecycle_service_1 = require("../task-lifecycle.service");
const compiled_instructions_1 = require("../compiled-instructions");
const a2a_1 = require("@recoder/shared/a2a");
const logger = logger_1.logger.child({ component: 'a2a-pipeline' });
// ---------------------------------------------------------------------------
// Output transforms
// ---------------------------------------------------------------------------
function applyOutputTransform(output, transform) {
    switch (transform) {
        case 'json-extract': {
            try {
                const parsed = JSON.parse(output);
                if (parsed && typeof parsed === 'object' && 'result' in parsed) {
                    return typeof parsed.result === 'string'
                        ? parsed.result
                        : JSON.stringify(parsed.result);
                }
            }
            catch {
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
class PipelineOrchestrator {
    pipelines = new Map();
    executions = new Map();
    /** Set of execution IDs that have been cancelled (checked during step loop). */
    cancelledIds = new Set();
    // -------------------------------------------------------------------------
    // Pipeline CRUD
    // -------------------------------------------------------------------------
    /**
     * Register a pipeline definition.
     */
    registerPipeline(definition) {
        logger.info({ pipelineId: definition.pipelineId, name: definition.name }, 'Pipeline registered');
        this.pipelines.set(definition.pipelineId, definition);
    }
    /**
     * Get a registered pipeline definition.
     */
    getPipeline(pipelineId) {
        return this.pipelines.get(pipelineId);
    }
    /**
     * List all registered pipelines.
     */
    listPipelines() {
        return Array.from(this.pipelines.values());
    }
    /**
     * Remove a pipeline definition.
     */
    removePipeline(pipelineId) {
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
    async execute(pipelineId, input, executor) {
        const definition = this.pipelines.get(pipelineId);
        if (!definition) {
            const executionId = (0, task_lifecycle_service_1.generateId)('exec');
            const now = new Date().toISOString();
            const execution = {
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
        const executionId = (0, task_lifecycle_service_1.generateId)('exec');
        const startedAt = new Date();
        const execution = {
            executionId,
            pipelineId,
            status: 'running',
            input,
            currentStepIndex: 0,
            stepResults: [],
            startedAt: startedAt.toISOString(),
        };
        this.executions.set(executionId, execution);
        logger.info({ executionId, pipelineId, stepCount: definition.steps.length }, 'Pipeline execution started');
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
        let lastSuccessfulOutput;
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
            let stepResult;
            try {
                // Create a timeout race if step.timeoutMs is specified
                const timeoutMs = step.timeoutMs ?? 30000;
                const request = this.buildTaskExecutionRequest(execution, step, resolvedPrompt);
                const result = await Promise.race([
                    this.invokeTaskExecutor(executor, request),
                    new Promise((_, reject) => setTimeout(() => reject(new Error(`Step ${step.stepId} timed out after ${timeoutMs}ms`)), timeoutMs)),
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
                logger.debug({ executionId, stepId: step.stepId, durationMs: stepResult.durationMs }, 'Pipeline step completed');
            }
            catch (err) {
                const stepCompletedAt = new Date();
                const errorMessage = err instanceof Error ? err.message : String(err);
                logger.warn({ executionId, stepId: step.stepId, error: errorMessage }, 'Pipeline step failed');
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
        logger.info({ executionId, pipelineId, totalDurationMs: execution.totalDurationMs }, 'Pipeline execution completed');
        return execution;
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
     * List all executions, optionally filtered by pipelineId.
     */
    listExecutions(pipelineId) {
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
    cancelExecution(executionId) {
        const execution = this.executions.get(executionId);
        if (!execution)
            return false;
        if (execution.status !== 'running')
            return false;
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
    reset() {
        this.pipelines.clear();
        this.executions.clear();
        this.cancelledIds.clear();
        logger.debug('PipelineOrchestrator reset');
    }
    buildTaskExecutionRequest(execution, step, prompt) {
        const envelope = (0, a2a_1.createTaskEnvelope)({
            id: (0, task_lifecycle_service_1.generateId)('pipe-task'),
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
            instructionBundle: (0, compiled_instructions_1.compileInstructionBundleForTask)(envelope),
        };
    }
    async invokeTaskExecutor(executor, request) {
        return executor.__agentOsStructured === true
            ? executor(request)
            : executor(request.agentId, request.prompt);
    }
}
exports.PipelineOrchestrator = PipelineOrchestrator;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;
function getPipelineOrchestrator() {
    if (!instance) {
        instance = new PipelineOrchestrator();
    }
    return instance;
}
function resetPipelineOrchestrator() {
    instance = null;
}
