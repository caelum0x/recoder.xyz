/**
 * Canonical task intents for Recoder Agent OS task specs.
 *
 * These intents describe the high-level kind of work an agent can accept.
 * They are intentionally product-facing rather than connector-facing so
 * planners, routers, and runtimes can share one vocabulary.
 */

export type TaskIntent =
  | 'bugfix'
  | 'feature_delivery'
  | 'platform_hardening'
  | 'refactor'
  | 'code_review'
  | 'test_generation'
  | 'verification'
  | 'documentation'
  | 'research'
  | 'release'
  | 'incident_response'
  | 'migration'
  | 'handoff'
  | 'custom';

export const TaskIntentEnum = {
  Bugfix: 'bugfix' as const satisfies TaskIntent,
  FeatureDelivery: 'feature_delivery' as const satisfies TaskIntent,
  PlatformHardening: 'platform_hardening' as const satisfies TaskIntent,
  Refactor: 'refactor' as const satisfies TaskIntent,
  CodeReview: 'code_review' as const satisfies TaskIntent,
  TestGeneration: 'test_generation' as const satisfies TaskIntent,
  Verification: 'verification' as const satisfies TaskIntent,
  Documentation: 'documentation' as const satisfies TaskIntent,
  Research: 'research' as const satisfies TaskIntent,
  Release: 'release' as const satisfies TaskIntent,
  IncidentResponse: 'incident_response' as const satisfies TaskIntent,
  Migration: 'migration' as const satisfies TaskIntent,
  Handoff: 'handoff' as const satisfies TaskIntent,
  Custom: 'custom' as const satisfies TaskIntent,
} as const;

export const TASK_INTENTS: readonly TaskIntent[] = [
  TaskIntentEnum.Bugfix,
  TaskIntentEnum.FeatureDelivery,
  TaskIntentEnum.PlatformHardening,
  TaskIntentEnum.Refactor,
  TaskIntentEnum.CodeReview,
  TaskIntentEnum.TestGeneration,
  TaskIntentEnum.Verification,
  TaskIntentEnum.Documentation,
  TaskIntentEnum.Research,
  TaskIntentEnum.Release,
  TaskIntentEnum.IncidentResponse,
  TaskIntentEnum.Migration,
  TaskIntentEnum.Handoff,
  TaskIntentEnum.Custom,
] as const;

const TASK_INTENT_SET = new Set<string>(TASK_INTENTS);

export function isTaskIntent(value: string): value is TaskIntent {
  return TASK_INTENT_SET.has(value);
}
