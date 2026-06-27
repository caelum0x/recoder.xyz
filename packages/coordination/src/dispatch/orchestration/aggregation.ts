/**
 * aggregation — combine results from multiple agents working one parent task.
 *
 * MERGED from `docker-backend/src/a2a/task-result-aggregator.ts`. The four
 * strategies are ported verbatim in behavior and mapped onto coordination's
 * `AggregationStrategy` domain values:
 *   domain 'all'          ← source 'all'         (merge all successful)
 *   domain 'first_success'← source 'first-wins'  (competitive race winner)
 *   domain 'majority'     ← source 'majority'    (largest-agreement group)
 *   domain 'best_score'   ← source 'weighted'    (max weight*score)
 *
 * Pure: no lifecycle-service read (the source's `collectSubtaskResults` was the
 * impure half — that becomes a store read in the manager). This module operates
 * purely on already-collected `SubtaskResult[]`.
 */

import type { AggregationStrategy } from '../../domain';

export type SubtaskArtifact = { filename: string; content: string };

export type SubtaskResult = {
  taskId: string;
  agentId: string;
  platform?: string;
  state: string;
  resultText?: string;
  artifacts?: SubtaskArtifact[];
  score?: number;
  completedAt?: string;
  error?: string;
};

export type MergedArtifact = { filename: string; content: string; source: string };

export type AggregatedResult = {
  parentTaskId: string;
  strategy: AggregationStrategy;
  status: 'complete' | 'partial' | 'failed';
  successCount: number;
  totalCount: number;
  resultText: string;
  artifacts: MergedArtifact[];
  subtaskSummaries: Array<{
    taskId: string;
    agentId: string;
    state: string;
    selected: boolean;
  }>;
};

export type AggregationInput = {
  parentTaskId: string;
  subtaskResults: SubtaskResult[];
  strategy: AggregationStrategy;
  /** For 'majority': minimum agreement threshold (default 0.5). */
  majorityThreshold?: number;
  /** For 'best_score': weight per agent (agentId → weight). */
  weights?: Record<string, number>;
};

const SUCCEEDED_STATES = new Set(['succeeded', 'completed']);

function isSucceeded(state: string): boolean {
  return SUCCEEDED_STATES.has(state);
}

function computeStatus(
  successCount: number,
  totalCount: number,
): 'complete' | 'partial' | 'failed' {
  if (totalCount === 0) {
    return 'failed';
  }
  if (successCount === totalCount) {
    return 'complete';
  }
  return successCount > 0 ? 'partial' : 'failed';
}

function mergeArtifacts(
  results: SubtaskResult[],
  preferredAgentId?: string,
): MergedArtifact[] {
  const merged = new Map<
    string,
    { filename: string; content: string; source: string; score: number }
  >();
  for (const result of results) {
    if (!result.artifacts) {
      continue;
    }
    for (const artifact of result.artifacts) {
      const existing = merged.get(artifact.filename);
      const score = result.score ?? 0;
      const isPreferred = result.agentId === preferredAgentId;
      if (!existing || isPreferred || score > existing.score) {
        merged.set(artifact.filename, {
          filename: artifact.filename,
          content: artifact.content,
          source: result.agentId,
          score,
        });
      }
    }
  }
  return [...merged.values()].map(({ filename, content, source }) => ({
    filename,
    content,
    source,
  }));
}

function summaries(
  results: SubtaskResult[],
  selectedIds: Set<string>,
): AggregatedResult['subtaskSummaries'] {
  return results.map((r) => ({
    taskId: r.taskId,
    agentId: r.agentId,
    state: r.state,
    selected: selectedIds.has(r.taskId),
  }));
}

function aggregateAll(input: AggregationInput): AggregatedResult {
  const succeeded = input.subtaskResults.filter((r) => isSucceeded(r.state));
  const selectedIds = new Set(succeeded.map((r) => r.taskId));
  return {
    parentTaskId: input.parentTaskId,
    strategy: input.strategy,
    status: computeStatus(succeeded.length, input.subtaskResults.length),
    successCount: succeeded.length,
    totalCount: input.subtaskResults.length,
    resultText: succeeded
      .map((r) => r.resultText ?? '')
      .filter(Boolean)
      .join('\n\n'),
    artifacts: mergeArtifacts(succeeded),
    subtaskSummaries: summaries(input.subtaskResults, selectedIds),
  };
}

function aggregateFirstSuccess(input: AggregationInput): AggregatedResult {
  const succeeded = input.subtaskResults.filter((r) => isSucceeded(r.state));
  const first = input.subtaskResults.find((r) => isSucceeded(r.state));
  const selectedIds = new Set<string>(first ? [first.taskId] : []);
  return {
    parentTaskId: input.parentTaskId,
    strategy: input.strategy,
    status: first ? 'complete' : 'failed',
    successCount: succeeded.length,
    totalCount: input.subtaskResults.length,
    resultText: first?.resultText ?? '',
    artifacts: first ? mergeArtifacts([first]) : [],
    subtaskSummaries: summaries(input.subtaskResults, selectedIds),
  };
}

function aggregateMajority(input: AggregationInput): AggregatedResult {
  const threshold = input.majorityThreshold ?? 0.5;
  const succeeded = input.subtaskResults.filter((r) => isSucceeded(r.state));
  if (succeeded.length === 0) {
    return {
      parentTaskId: input.parentTaskId,
      strategy: input.strategy,
      status: 'failed',
      successCount: 0,
      totalCount: input.subtaskResults.length,
      resultText: '',
      artifacts: [],
      subtaskSummaries: summaries(input.subtaskResults, new Set()),
    };
  }

  const groups = new Map<string, SubtaskResult[]>();
  for (const r of succeeded) {
    const key = r.resultText ?? '';
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  let largest: SubtaskResult[] = [];
  for (const group of groups.values()) {
    if (group.length > largest.length) {
      largest = group;
    }
  }

  const agreement = largest.length / succeeded.length;
  const highestScore = (pool: SubtaskResult[]): SubtaskResult =>
    pool.reduce((best, r) => ((r.score ?? 0) > (best.score ?? 0) ? r : best), pool[0]);

  const winner = agreement >= threshold ? highestScore(largest) : highestScore(succeeded);
  const selected = agreement >= threshold ? largest : [winner];
  const selectedIds = new Set(selected.map((r) => r.taskId));

  return {
    parentTaskId: input.parentTaskId,
    strategy: input.strategy,
    status: computeStatus(succeeded.length, input.subtaskResults.length),
    successCount: succeeded.length,
    totalCount: input.subtaskResults.length,
    resultText: winner.resultText ?? '',
    artifacts: mergeArtifacts(selected, winner.agentId),
    subtaskSummaries: summaries(input.subtaskResults, selectedIds),
  };
}

function aggregateBestScore(input: AggregationInput): AggregatedResult {
  const weights = input.weights ?? {};
  const succeeded = input.subtaskResults.filter((r) => isSucceeded(r.state));
  if (succeeded.length === 0) {
    return {
      parentTaskId: input.parentTaskId,
      strategy: input.strategy,
      status: 'failed',
      successCount: 0,
      totalCount: input.subtaskResults.length,
      resultText: '',
      artifacts: [],
      subtaskSummaries: summaries(input.subtaskResults, new Set()),
    };
  }

  const hasExplicit = Object.keys(weights).length > 0;
  const candidates = hasExplicit
    ? succeeded.filter((r) => (weights[r.agentId] ?? 0) !== 0)
    : succeeded;

  if (candidates.length === 0) {
    return {
      parentTaskId: input.parentTaskId,
      strategy: input.strategy,
      status: computeStatus(succeeded.length, input.subtaskResults.length),
      successCount: succeeded.length,
      totalCount: input.subtaskResults.length,
      resultText: '',
      artifacts: [],
      subtaskSummaries: summaries(input.subtaskResults, new Set()),
    };
  }

  const scored = candidates
    .map((r) => ({ result: r, weighted: (weights[r.agentId] ?? 1) * (r.score ?? 0) }))
    .sort((a, b) => b.weighted - a.weighted);
  const winner = scored[0].result;
  const selectedIds = new Set([winner.taskId]);

  return {
    parentTaskId: input.parentTaskId,
    strategy: input.strategy,
    status: computeStatus(succeeded.length, input.subtaskResults.length),
    successCount: succeeded.length,
    totalCount: input.subtaskResults.length,
    resultText: winner.resultText ?? '',
    artifacts: mergeArtifacts([winner], winner.agentId),
    subtaskSummaries: summaries(input.subtaskResults, selectedIds),
  };
}

/** Aggregate per the strategy. Empty input → a failed result. */
export function aggregateResults(input: AggregationInput): AggregatedResult {
  if (input.subtaskResults.length === 0) {
    return {
      parentTaskId: input.parentTaskId,
      strategy: input.strategy,
      status: 'failed',
      successCount: 0,
      totalCount: 0,
      resultText: '',
      artifacts: [],
      subtaskSummaries: [],
    };
  }
  switch (input.strategy) {
    case 'all':
      return aggregateAll(input);
    case 'first_success':
      return aggregateFirstSuccess(input);
    case 'majority':
      return aggregateMajority(input);
    case 'best_score':
      return aggregateBestScore(input);
  }
}
