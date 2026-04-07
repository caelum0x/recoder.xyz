"use strict";
/**
 * @module task-result-aggregator
 *
 * Service that collects and aggregates results from multiple agents working on
 * related subtasks of a parent task. Supports four aggregation strategies:
 *
 * - **all**: Merge all successful results (sequential fan-in).
 * - **first-wins**: Take the first successful result (competitive race).
 * - **majority**: Select the result with the most agreement, falling back to
 *   highest score when no group meets the threshold.
 * - **weighted**: Score each result by (weight * score) and select the winner.
 *
 * The aggregator reads task state from the `TaskLifecycleService` store and
 * produces an `AggregatedResult` summary with merged artifacts, subtask
 * summaries, and overall status.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskResultAggregator = void 0;
exports.getTaskResultAggregator = getTaskResultAggregator;
exports.resetTaskResultAggregator = resetTaskResultAggregator;
const logger_1 = require("../logger");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const logger = (0, logger_1.createLogger)('a2a-task-result-aggregator');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SUCCEEDED_STATES = new Set(['succeeded', 'completed']);
function isSucceeded(state) {
    return SUCCEEDED_STATES.has(state);
}
/**
 * Merge artifacts from multiple subtask results. When two results share the
 * same filename, keep the one from the higher-scoring / preferred agent.
 * Each artifact is tagged with a `source` (agentId) for provenance.
 */
function mergeArtifacts(results, preferredAgentId) {
    const merged = new Map();
    for (const result of results) {
        if (!result.artifacts)
            continue;
        for (const artifact of result.artifacts) {
            const existing = merged.get(artifact.filename);
            const score = result.score ?? 0;
            const isPreferred = result.agentId === preferredAgentId;
            if (!existing) {
                merged.set(artifact.filename, {
                    filename: artifact.filename,
                    content: artifact.content,
                    source: result.agentId,
                    score,
                });
            }
            else {
                // Replace if this agent is preferred or has a higher score
                if (isPreferred || score > existing.score) {
                    merged.set(artifact.filename, {
                        filename: artifact.filename,
                        content: artifact.content,
                        source: result.agentId,
                        score,
                    });
                }
            }
        }
    }
    return Array.from(merged.values()).map(({ filename, content, source }) => ({
        filename,
        content,
        source,
    }));
}
function buildSubtaskSummaries(results, selectedIds) {
    return results.map((r) => ({
        taskId: r.taskId,
        agentId: r.agentId,
        state: r.state,
        selected: selectedIds.has(r.taskId),
    }));
}
function computeStatus(successCount, totalCount) {
    if (totalCount === 0)
        return 'failed';
    if (successCount === totalCount)
        return 'complete';
    if (successCount > 0)
        return 'partial';
    return 'failed';
}
// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------
function aggregateAll(input) {
    const { parentTaskId, subtaskResults, strategy } = input;
    const succeeded = subtaskResults.filter((r) => isSucceeded(r.state));
    const selectedIds = new Set(succeeded.map((r) => r.taskId));
    const resultText = succeeded.length > 0
        ? succeeded.map((r) => r.resultText ?? '').filter(Boolean).join('\n\n')
        : '';
    const status = computeStatus(succeeded.length, subtaskResults.length);
    return {
        parentTaskId,
        strategy,
        status,
        successCount: succeeded.length,
        totalCount: subtaskResults.length,
        resultText,
        artifacts: mergeArtifacts(succeeded),
        subtaskSummaries: buildSubtaskSummaries(subtaskResults, selectedIds),
        aggregatedAt: new Date().toISOString(),
    };
}
function aggregateFirstWins(input) {
    const { parentTaskId, subtaskResults, strategy } = input;
    const firstSucceeded = subtaskResults.find((r) => isSucceeded(r.state));
    const succeeded = subtaskResults.filter((r) => isSucceeded(r.state));
    const selectedIds = new Set();
    if (firstSucceeded) {
        selectedIds.add(firstSucceeded.taskId);
    }
    const resultText = firstSucceeded?.resultText ?? '';
    const status = firstSucceeded ? 'complete' : 'failed';
    const artifacts = firstSucceeded
        ? mergeArtifacts([firstSucceeded])
        : [];
    return {
        parentTaskId,
        strategy,
        status,
        successCount: succeeded.length,
        totalCount: subtaskResults.length,
        resultText,
        artifacts,
        subtaskSummaries: buildSubtaskSummaries(subtaskResults, selectedIds),
        aggregatedAt: new Date().toISOString(),
    };
}
function aggregateMajority(input) {
    const { parentTaskId, subtaskResults, strategy, majorityThreshold = 0.5 } = input;
    const succeeded = subtaskResults.filter((r) => isSucceeded(r.state));
    if (succeeded.length === 0) {
        return {
            parentTaskId,
            strategy,
            status: 'failed',
            successCount: 0,
            totalCount: subtaskResults.length,
            resultText: '',
            artifacts: [],
            subtaskSummaries: buildSubtaskSummaries(subtaskResults, new Set()),
            aggregatedAt: new Date().toISOString(),
        };
    }
    // Group by exact resultText match
    const groups = new Map();
    for (const r of succeeded) {
        const key = r.resultText ?? '';
        const group = groups.get(key) ?? [];
        group.push(r);
        groups.set(key, group);
    }
    // Find the largest group
    let largestGroup = [];
    let largestKey = '';
    for (const [key, group] of groups) {
        if (group.length > largestGroup.length) {
            largestGroup = group;
            largestKey = key;
        }
    }
    const agreement = largestGroup.length / succeeded.length;
    let winner;
    let selectedResults;
    if (agreement >= majorityThreshold) {
        // Majority reached -- pick the highest-scoring member of the majority group
        winner = largestGroup.reduce((best, r) => (r.score ?? 0) > (best.score ?? 0) ? r : best, largestGroup[0]);
        selectedResults = largestGroup;
    }
    else {
        // No majority -- fall back to highest-scoring result overall
        winner = succeeded.reduce((best, r) => (r.score ?? 0) > (best.score ?? 0) ? r : best, succeeded[0]);
        selectedResults = [winner];
    }
    const selectedIds = new Set(selectedResults.map((r) => r.taskId));
    return {
        parentTaskId,
        strategy,
        status: computeStatus(succeeded.length, subtaskResults.length),
        successCount: succeeded.length,
        totalCount: subtaskResults.length,
        resultText: winner.resultText ?? '',
        artifacts: mergeArtifacts(selectedResults, winner.agentId),
        subtaskSummaries: buildSubtaskSummaries(subtaskResults, selectedIds),
        aggregatedAt: new Date().toISOString(),
    };
}
function aggregateWeighted(input) {
    const { parentTaskId, subtaskResults, strategy, weights = {} } = input;
    const succeeded = subtaskResults.filter((r) => isSucceeded(r.state));
    if (succeeded.length === 0) {
        return {
            parentTaskId,
            strategy,
            status: 'failed',
            successCount: 0,
            totalCount: subtaskResults.length,
            resultText: '',
            artifacts: [],
            subtaskSummaries: buildSubtaskSummaries(subtaskResults, new Set()),
            aggregatedAt: new Date().toISOString(),
        };
    }
    // Filter out zero-weight agents when weights are explicitly provided
    const hasExplicitWeights = Object.keys(weights).length > 0;
    const candidates = hasExplicitWeights
        ? succeeded.filter((r) => (weights[r.agentId] ?? 0) !== 0)
        : succeeded;
    if (candidates.length === 0) {
        // All agents had zero weight
        return {
            parentTaskId,
            strategy,
            status: computeStatus(succeeded.length, subtaskResults.length),
            successCount: succeeded.length,
            totalCount: subtaskResults.length,
            resultText: '',
            artifacts: [],
            subtaskSummaries: buildSubtaskSummaries(subtaskResults, new Set()),
            aggregatedAt: new Date().toISOString(),
        };
    }
    // Score = weight * score (weight defaults to 1, score defaults to 0)
    const scored = candidates.map((r) => {
        const weight = weights[r.agentId] ?? 1;
        const score = r.score ?? 0;
        return { result: r, weightedScore: weight * score };
    });
    // Sort descending by weighted score
    scored.sort((a, b) => b.weightedScore - a.weightedScore);
    const winner = scored[0].result;
    const selectedIds = new Set([winner.taskId]);
    return {
        parentTaskId,
        strategy,
        status: computeStatus(succeeded.length, subtaskResults.length),
        successCount: succeeded.length,
        totalCount: subtaskResults.length,
        resultText: winner.resultText ?? '',
        artifacts: mergeArtifacts([winner], winner.agentId),
        subtaskSummaries: buildSubtaskSummaries(subtaskResults, selectedIds),
        aggregatedAt: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// TaskResultAggregator
// ---------------------------------------------------------------------------
class TaskResultAggregator {
    lifecycle;
    constructor(lifecycle) {
        this.lifecycle = lifecycle ?? (0, task_lifecycle_service_1.getTaskLifecycleService)();
    }
    /**
     * Collect subtask results by reading task envelopes from the lifecycle
     * service store.
     */
    collectSubtaskResults(parentTaskId, subtaskIds) {
        const results = [];
        for (const taskId of subtaskIds) {
            const svcResult = this.lifecycle.getTask(taskId);
            if (!svcResult.ok) {
                logger.warn({ taskId, parentTaskId }, 'subtask not found during collection');
                continue;
            }
            const envelope = svcResult.data;
            // Map envelope state to aggregator state names
            const state = envelope.state === 'completed' ? 'succeeded' : envelope.state;
            // Extract artifacts from the envelope result
            const artifacts = envelope.result?.artifacts?.map((a) => ({
                filename: a.path ?? a.key,
                content: a.content,
            }));
            results.push({
                taskId: envelope.id,
                agentId: envelope.assignee.agent_id,
                platform: envelope.assignee.platform,
                state,
                resultText: envelope.result?.text,
                artifacts,
                completedAt: envelope.updated_at,
                error: envelope.error?.message,
            });
        }
        return results;
    }
    /**
     * Aggregate subtask results according to the specified strategy.
     */
    aggregate(input) {
        const { strategy, subtaskResults, parentTaskId } = input;
        logger.info({
            parentTaskId,
            strategy,
            subtaskCount: subtaskResults.length,
        }, 'aggregating subtask results');
        // Handle empty input
        if (subtaskResults.length === 0) {
            return {
                parentTaskId,
                strategy,
                status: 'failed',
                successCount: 0,
                totalCount: 0,
                resultText: '',
                artifacts: [],
                subtaskSummaries: [],
                aggregatedAt: new Date().toISOString(),
            };
        }
        let result;
        switch (strategy) {
            case 'all':
                result = aggregateAll(input);
                break;
            case 'first-wins':
                result = aggregateFirstWins(input);
                break;
            case 'majority':
                result = aggregateMajority(input);
                break;
            case 'weighted':
                result = aggregateWeighted(input);
                break;
            default: {
                // Exhaustive check
                const _exhaustive = strategy;
                throw new Error(`Unknown aggregation strategy: ${_exhaustive}`);
            }
        }
        logger.info({
            parentTaskId,
            strategy,
            status: result.status,
            successCount: result.successCount,
            totalCount: result.totalCount,
        }, 'aggregation complete');
        return result;
    }
}
exports.TaskResultAggregator = TaskResultAggregator;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
/** Get or create the default singleton instance. */
function getTaskResultAggregator() {
    if (!_instance) {
        _instance = new TaskResultAggregator();
    }
    return _instance;
}
/** Reset the singleton (for testing). */
function resetTaskResultAggregator() {
    _instance = null;
}
