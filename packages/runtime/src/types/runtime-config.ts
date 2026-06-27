import { z } from 'zod';
import type { AgentSurface } from '@recoder/agent-os';

/**
 * Validated configuration for a runtime instance. No secrets are inlined here;
 * env overrides are documented in `config/env-keys.ts`.
 */
export const runtimeConfigSchema = z.object({
  /** Global cap on concurrent runs across all surfaces. */
  maxConcurrentRuns: z.number().int().positive().default(8),
  /** Optional per-surface concurrency caps. */
  perSurfaceConcurrency: z.record(z.string(), z.number().int().positive()).default({}),
  /** Wall-clock timeout for a single run, in ms. */
  wallClockTimeoutMs: z.number().int().positive().default(30 * 60 * 1000),
  /** Idle timeout: max ms with no frame before the run is timed out. */
  idleTimeoutMs: z.number().int().positive().default(5 * 60 * 1000),
  /** Bounded backpressure queue depth between driver and consumer. */
  backpressureQueueDepth: z.number().int().positive().default(1024),
  /** Per-surface CLI binary path overrides (no defaults — resolved at runtime). */
  cliPaths: z.record(z.string(), z.string()).default({}),
  /** Default execution environment kind when policy/task do not pin one. */
  defaultEnv: z.enum(['local', 'sandbox', 'hosted', 'browser', 'external']).default('local'),
  /** Extra regex source strings to redact from frames/logs before emit + journal. */
  redactionPatterns: z.array(z.string()).default([]),
  /** Journal store selection. */
  journalStore: z.enum(['memory', 'jsonl']).default('memory'),
  /** Directory used by the jsonl journal store (must be provided when journalStore=jsonl). */
  journalDir: z.string().optional(),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type RuntimeConfigInput = z.input<typeof runtimeConfigSchema>;

export type SurfaceConcurrency = Partial<Record<AgentSurface | 'browser_agent', number>>;
