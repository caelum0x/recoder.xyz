/**
 * `AgentOsConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 * This REPLACES the legacy `service-container.ts`, which read `process.env`
 * directly (`AGENT_OS_REPOSITORY`, `AGENT_OS_DATABASE_URL`, `AGENT_OS_STATE_FILE`)
 * and exported a mutable `agentOsContainer` singleton (domain doc §1, §7 —
 * REPLACE).
 *
 * The foundational `AppConfig` (Phase 0) does not yet carry an `agentOs` slice,
 * so this accessor derives what it can from existing slices (`database`,
 * `internal`, `runtime`) and applies degrade-safe defaults for the rest. A
 * future `AppConfig.agentOs` slice (bootstrap-owned) can supply the NATS URL,
 * outbox cadence, and feature flags; until then the fail-safe posture holds
 * (domain doc §8):
 *   - no database url  -> repository falls back to json/memory, `health.repository = down`.
 *   - no NATS url      -> outbox publisher is a log-only sink, `health.outbox = down`.
 * `AgentOsConfigOverrides` is the seam bootstrap uses to inject the
 * not-yet-in-AppConfig values without any domain code reading the environment.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** Which state-of-record driver backs the repository port. */
export const agentOsRepositoryDriverSchema = z.enum(['postgres', 'json', 'memory']);
export type AgentOsRepositoryDriver = z.infer<typeof agentOsRepositoryDriverSchema>;

export const agentOsConfigSchema = z.object({
  /** The selected repository driver (postgres when a db url is present, else memory). */
  repositoryDriver: agentOsRepositoryDriverSchema,
  /** Postgres connection string for the state-of-record; `null` -> degrade to json/memory. */
  databaseUrl: z.string().nullable(),
  /** JSON-file state path for the `json` driver (dev/degrade); `null` -> memory. */
  stateFilePath: z.string().nullable(),
  /** NATS url for the CloudEvents outbox transport; `null` -> log-only sink. */
  natsUrl: z.string().nullable(),
  /** NATS subject prefix the outbox publishes CloudEvents onto. */
  natsSubjectPrefix: z.string(),
  /** Outbox drain interval (ms). The at-least-once loop cadence. */
  outboxDrainIntervalMs: z.number().int().positive(),
  /** Max outbox records claimed per drain pass. */
  outboxDrainBatchSize: z.number().int().positive(),
  /** True when an `INTERNAL_SERVICE_KEY` is configured (gates `/internal/agent-os/*`). */
  internalServiceKeyPresent: z.boolean(),
  /** Feature flag: brain service (RECODER_BRAIN_ENABLED). Off by default; no-op when off. */
  brainEnabled: z.boolean(),
  /** Feature flag: code-graph index (RECODER_CODE_GRAPH_ENABLED). Off by default. */
  codeGraphEnabled: z.boolean(),
  /** Feature flag: squads (leader-routing + autopilots ported from multica). */
  squadsEnabled: z.boolean(),
  /** Feature flag: the squad autopilot loop (cron→beads→conductor). Opt-in. */
  squadAutopilotEnabled: z.boolean(),
  /**
   * The squad every autopilot dispatch routes through (leader-first / weighted
   * via {@link SquadService.route}). `null` ⇒ no squad configured, so the
   * autopilot uses the flat default dispatch (degrade-truthful pass-through).
   */
  squadId: z.string().nullable(),
  /** Autopilot tick cadence (ms). */
  squadAutopilotIntervalMs: z.number().int().positive(),
  /** Max conductor dispatches per autopilot tick (bounds burst launches). */
  squadAutopilotMaxPerTick: z.number().int().positive(),
  isProduction: z.boolean(),
});

export type AgentOsConfig = z.infer<typeof agentOsConfigSchema>;

/** The not-yet-in-AppConfig agent-os values bootstrap may inject. */
export interface AgentOsConfigOverrides {
  readonly repositoryDriver?: AgentOsRepositoryDriver;
  readonly databaseUrl?: string | null;
  readonly stateFilePath?: string | null;
  readonly natsUrl?: string | null;
  readonly natsSubjectPrefix?: string;
  readonly outboxDrainIntervalMs?: number;
  readonly outboxDrainBatchSize?: number;
  readonly brainEnabled?: boolean;
  readonly codeGraphEnabled?: boolean;
  readonly squadsEnabled?: boolean;
  readonly squadAutopilotEnabled?: boolean;
  readonly squadAutopilotIntervalMs?: number;
  readonly squadAutopilotMaxPerTick?: number;
  readonly squadId?: string | null;
}

const DEFAULT_NATS_SUBJECT_PREFIX = 'recoder.agent-os';
const DEFAULT_OUTBOX_DRAIN_INTERVAL_MS = 2_000;
const DEFAULT_OUTBOX_DRAIN_BATCH_SIZE = 100;
const DEFAULT_SQUAD_AUTOPILOT_INTERVAL_MS = 30_000;
const DEFAULT_SQUAD_AUTOPILOT_MAX_PER_TICK = 3;

/**
 * Project the agent-os slice out of the whole config. Derives the values
 * `AppConfig` already carries (`database.url`, `internal.serviceKeyPresent`,
 * `runtime.isProduction`) and defaults the rest degrade-safe. The repository
 * driver is chosen fail-safe: an explicit override wins; else `postgres` when a
 * db url resolves; else `json` when a state file is set; else `memory`.
 * `overrides` is the seam bootstrap uses to supply NATS / feature flags without
 * env reads.
 */
export function sliceAgentOsConfig(
  app: AppConfig,
  overrides: AgentOsConfigOverrides = {},
): AgentOsConfig {
  const databaseUrl = overrides.databaseUrl ?? app.database.url ?? null;
  const stateFilePath = overrides.stateFilePath ?? null;
  const repositoryDriver: AgentOsRepositoryDriver =
    overrides.repositoryDriver ??
    (databaseUrl ? 'postgres' : stateFilePath ? 'json' : 'memory');

  return agentOsConfigSchema.parse({
    repositoryDriver,
    databaseUrl,
    stateFilePath,
    natsUrl: overrides.natsUrl ?? null,
    natsSubjectPrefix: overrides.natsSubjectPrefix ?? DEFAULT_NATS_SUBJECT_PREFIX,
    outboxDrainIntervalMs:
      overrides.outboxDrainIntervalMs ?? DEFAULT_OUTBOX_DRAIN_INTERVAL_MS,
    outboxDrainBatchSize:
      overrides.outboxDrainBatchSize ?? DEFAULT_OUTBOX_DRAIN_BATCH_SIZE,
    internalServiceKeyPresent: app.internal.serviceKeyPresent,
    brainEnabled: overrides.brainEnabled ?? false,
    codeGraphEnabled: overrides.codeGraphEnabled ?? false,
    squadsEnabled: overrides.squadsEnabled ?? true,
    squadAutopilotEnabled: overrides.squadAutopilotEnabled ?? false,
    squadAutopilotIntervalMs:
      overrides.squadAutopilotIntervalMs ?? DEFAULT_SQUAD_AUTOPILOT_INTERVAL_MS,
    squadAutopilotMaxPerTick:
      overrides.squadAutopilotMaxPerTick ?? DEFAULT_SQUAD_AUTOPILOT_MAX_PER_TICK,
    squadId: overrides.squadId ?? null,
    isProduction: app.runtime.isProduction,
  });
}
