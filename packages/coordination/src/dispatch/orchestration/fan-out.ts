/**
 * fan-out — N agents in parallel over DISJOINT lock scopes.
 *
 * MERGED from multi-dispatch's `fan_out` pattern. The coordination invariant
 * added here (design §3 file tree: "fan-out … disjoint lock scopes enforced"):
 * each parallel slot must own a non-overlapping path partition, so N writers
 * never collide. When the target paths cannot be partitioned 1:1 with the
 * available agents, slots are limited to the number of distinct path partitions
 * (you cannot fan two exclusive writers onto the same path).
 *
 * Pure: ranked agents + target paths + concurrency cap → disjoint slots.
 */

import type { OrchestrationPlan, PlanInput, DispatchSlot } from './plan';

/**
 * Partition `paths` across up to `n` buckets, round-robin, so each bucket is a
 * disjoint subset. Empty buckets are dropped (no slot writes nothing).
 */
export function partitionPaths(paths: string[], n: number): string[][] {
  if (n <= 0 || paths.length === 0) {
    return [];
  }
  const buckets: string[][] = Array.from({ length: Math.min(n, paths.length) }, () => []);
  paths.forEach((path, index) => {
    buckets[index % buckets.length].push(path);
  });
  return buckets.filter((bucket) => bucket.length > 0);
}

export function planFanOut(input: PlanInput): OrchestrationPlan {
  const agentCount = Math.min(input.rankedAgentIds.length, input.maxConcurrency);
  const partitions = partitionPaths(input.targetPaths, agentCount);
  const slotCount = Math.min(agentCount, partitions.length);

  const slots: DispatchSlot[] = [];
  for (let index = 0; index < slotCount; index += 1) {
    slots.push({
      agentId: input.rankedAgentIds[index],
      pathGlobs: partitions[index],
      stage: 0,
      lockKind: 'exclusive',
      reason: `fan_out: disjoint partition ${index + 1}/${slotCount}`,
    });
  }

  return {
    pattern: 'fan_out',
    slots,
    aggregation: input.aggregation ?? 'all',
    cancelLosers: false,
  };
}
