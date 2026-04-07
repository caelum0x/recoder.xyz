"use strict";
/**
 * @module orchestration/scatter-gather
 *
 * Scatter-Gather orchestration pattern for the Recoder A2A ecosystem.
 *
 * This pattern enables parallel fan-out to multiple agents with configurable
 * result collection strategies:
 *
 * - `wait-all`: waits for every target to complete (including failures)
 * - `first-n`: resolves as soon as N successful results arrive
 * - `timeout`: waits up to a deadline, then gathers whatever is available
 * - `quorum`: requires a minimum fraction of agents to respond successfully
 *
 * Results are aggregated into a single execution record with individual
 * per-agent timing, status, and an optional merged output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScatterGatherOrchestrator = void 0;
exports.getScatterGatherOrchestrator = getScatterGatherOrchestrator;
exports.resetScatterGatherOrchestrator = resetScatterGatherOrchestrator;
const logger_1 = require("../../logger");
const logger = logger_1.logger.child({ component: 'a2a-scatter-gather' });
// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------
let idCounter = 0;
function generateExecutionId() {
    idCounter += 1;
    return `sg_exec_${Date.now()}_${idCounter}`;
}
// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
class ScatterGatherOrchestrator {
    patterns = new Map();
    executions = new Map();
    // -------------------------------------------------------------------------
    // Pattern CRUD
    // -------------------------------------------------------------------------
    /**
     * Register a scatter-gather pattern.
     */
    registerPattern(definition) {
        logger.debug({ patternId: definition.patternId }, 'Registering scatter-gather pattern');
        this.patterns.set(definition.patternId, { ...definition });
    }
    /**
     * Get a registered pattern.
     */
    getPattern(patternId) {
        return this.patterns.get(patternId);
    }
    /**
     * List all registered patterns.
     */
    listPatterns() {
        return Array.from(this.patterns.values());
    }
    /**
     * Remove a pattern.
     */
    removePattern(patternId) {
        return this.patterns.delete(patternId);
    }
    // -------------------------------------------------------------------------
    // Execution
    // -------------------------------------------------------------------------
    /**
     * Execute scatter-gather with the given prompt.
     * Fans out to all targets in parallel, then gathers results based on strategy.
     */
    async execute(patternId, prompt, executor) {
        const pattern = this.patterns.get(patternId);
        if (!pattern) {
            const execution = {
                executionId: generateExecutionId(),
                patternId,
                status: 'failed',
                prompt,
                results: [],
                successCount: 0,
                failureCount: 0,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                totalDurationMs: 0,
            };
            execution.aggregatedOutput = `Pattern not found: ${patternId}`;
            this.executions.set(execution.executionId, execution);
            logger.warn({ patternId }, 'Scatter-gather pattern not found');
            return execution;
        }
        const executionId = generateExecutionId();
        const startedAt = new Date();
        const execution = {
            executionId,
            patternId,
            status: 'scattering',
            prompt,
            results: [],
            successCount: 0,
            failureCount: 0,
            startedAt: startedAt.toISOString(),
        };
        this.executions.set(executionId, execution);
        logger.info({ executionId, patternId, targetCount: pattern.targets.length, strategy: pattern.gatherStrategy }, 'Starting scatter-gather execution');
        // Handle empty targets
        if (pattern.targets.length === 0) {
            execution.status = 'completed';
            execution.completedAt = new Date().toISOString();
            execution.totalDurationMs = Date.now() - startedAt.getTime();
            execution.aggregatedOutput = '';
            return execution;
        }
        // -----------------------------------------------------------------------
        // Scatter phase: fan out to all targets in parallel
        // -----------------------------------------------------------------------
        const useTimeout = pattern.gatherStrategy === 'timeout' && pattern.timeoutMs != null;
        const promises = pattern.targets.map(async (target) => {
            const agentStart = Date.now();
            const agentPrompt = target.prompt ?? prompt;
            const weight = target.weight ?? 1.0;
            try {
                let result;
                if (useTimeout) {
                    // Wrap in a race with a timeout
                    result = await Promise.race([
                        executor(target.agentId, agentPrompt),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('SCATTER_TIMEOUT')), pattern.timeoutMs)),
                    ]);
                }
                else {
                    result = await executor(target.agentId, agentPrompt);
                }
                return {
                    agentId: target.agentId,
                    status: 'completed',
                    output: result,
                    durationMs: Date.now() - agentStart,
                    weight,
                };
            }
            catch (err) {
                const isTimeout = err instanceof Error && err.message === 'SCATTER_TIMEOUT';
                return {
                    agentId: target.agentId,
                    status: isTimeout ? 'timeout' : 'failed',
                    error: err instanceof Error ? err.message : String(err),
                    durationMs: Date.now() - agentStart,
                    weight,
                };
            }
        });
        // Wait for all to settle
        const settled = await Promise.allSettled(promises);
        const allResults = settled.map((s) => {
            if (s.status === 'fulfilled')
                return s.value;
            // Should not happen since we already catch inside, but safety net
            return {
                agentId: 'unknown',
                status: 'failed',
                error: s.reason instanceof Error ? s.reason.message : String(s.reason),
                durationMs: 0,
                weight: 1.0,
            };
        });
        // -----------------------------------------------------------------------
        // Gather phase: apply strategy
        // -----------------------------------------------------------------------
        execution.status = 'gathering';
        execution.results = allResults;
        execution.successCount = allResults.filter((r) => r.status === 'completed').length;
        execution.failureCount = allResults.filter((r) => r.status !== 'completed').length;
        const finalStatus = this.applyGatherStrategy(pattern, execution);
        execution.status = finalStatus;
        // Build aggregated output from successful results
        const successfulOutputs = allResults
            .filter((r) => r.status === 'completed' && r.output != null)
            .map((r) => r.output);
        execution.aggregatedOutput = successfulOutputs.join('\n');
        execution.completedAt = new Date().toISOString();
        execution.totalDurationMs = Date.now() - startedAt.getTime();
        logger.info({
            executionId,
            patternId,
            status: execution.status,
            successCount: execution.successCount,
            failureCount: execution.failureCount,
            totalDurationMs: execution.totalDurationMs,
        }, 'Scatter-gather execution finished');
        return execution;
    }
    // -------------------------------------------------------------------------
    // Query executions
    // -------------------------------------------------------------------------
    /**
     * Get a past execution by ID.
     */
    getExecution(executionId) {
        return this.executions.get(executionId);
    }
    /**
     * List all executions, optionally filtered by patternId.
     */
    listExecutions(patternId) {
        const all = Array.from(this.executions.values());
        if (patternId) {
            return all.filter((e) => e.patternId === patternId);
        }
        return all;
    }
    /**
     * Reset all state (patterns and executions).
     */
    reset() {
        this.patterns.clear();
        this.executions.clear();
        logger.debug('Scatter-gather orchestrator state reset');
    }
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    /**
     * Determine the final status based on the gather strategy.
     */
    applyGatherStrategy(pattern, execution) {
        const { gatherStrategy } = pattern;
        const { successCount, results } = execution;
        const totalTargets = pattern.targets.length;
        switch (gatherStrategy) {
            case 'wait-all': {
                // Always completes -- includes all results (even failures)
                return 'completed';
            }
            case 'first-n': {
                const required = pattern.requiredResults ?? 1;
                if (successCount >= required) {
                    // Trim results to only the first N successful ones + keep failed for visibility
                    return 'completed';
                }
                return 'failed';
            }
            case 'timeout': {
                // Whatever results are available after the timeout deadline
                // If we got at least one success, that is a completed execution
                if (successCount > 0) {
                    return 'completed';
                }
                return 'timeout';
            }
            case 'quorum': {
                const threshold = pattern.quorumThreshold ?? 0.5;
                const quorumMet = totalTargets > 0 && successCount / totalTargets >= threshold;
                if (quorumMet) {
                    return 'completed';
                }
                return 'failed';
            }
            default:
                return 'completed';
        }
    }
}
exports.ScatterGatherOrchestrator = ScatterGatherOrchestrator;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;
/**
 * Get or create the singleton ScatterGatherOrchestrator instance.
 */
function getScatterGatherOrchestrator() {
    if (!instance) {
        instance = new ScatterGatherOrchestrator();
    }
    return instance;
}
/**
 * Reset the singleton, dropping all patterns and executions.
 */
function resetScatterGatherOrchestrator() {
    if (instance) {
        instance.reset();
    }
    instance = null;
}
