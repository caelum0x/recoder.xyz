import { z } from 'zod';
import { GovernanceConfigError } from './errors';
import { RISK_TIERS, type RiskTier } from './domain/risk-tier';

/**
 * governance-config — zod-validated configuration for the Governance facade.
 *
 * Every risky default is conservative: auto-approval is OFF, the daemon is
 * assumed absent (so the fallback path is the default), and the auto-approve
 * ceiling is `medium`. Validation FAILS CLOSED — an invalid config throws
 * GovernanceConfigError rather than silently using unsafe defaults.
 */

const riskTierSchema = z.enum(RISK_TIERS as unknown as [RiskTier, ...RiskTier[]]);

export const tierRouteSchema = z.object({
  model: z.string().min(1),
  runtime: z.enum(['claude_code', 'codex', 'recoder_code', 'generic']),
  costHint: z.number().min(0).max(1),
});

export const governanceConfigSchema = z.object({
  /** Unix-domain-socket path to the Rust governance daemon (DEFERRED). */
  daemonSocketPath: z.string().optional(),
  /** Whether the in-process FFI fallback is permitted (DEFERRED — no cdylib here). */
  ffiFallbackEnabled: z.boolean().default(false),
  /** When true, governance records to its in-memory audit chain. */
  auditEnabled: z.boolean().default(true),
  /** Path to a SQLite audit DB (DEFERRED — in-memory store used until daemon). */
  auditDbPath: z.string().optional(),

  /** Auto-approval behavior. */
  autoApprove: z
    .object({
      enabled: z.boolean().default(false),
      ceiling: riskTierSchema.default('medium'),
    })
    .default({ enabled: false, ceiling: 'medium' }),

  /** Per-tier approval requirement + timeout overrides (ms). */
  approvalTimeouts: z
    .object({
      high: z.number().int().nonnegative().default(30 * 60 * 1000),
      critical: z.number().int().nonnegative().default(15 * 60 * 1000),
    })
    .default({ high: 30 * 60 * 1000, critical: 15 * 60 * 1000 }),

  /** tier -> model/runtime routing catalog overrides. */
  routing: z
    .object({
      low: tierRouteSchema.optional(),
      medium: tierRouteSchema.optional(),
      high: tierRouteSchema.optional(),
      critical: tierRouteSchema.optional(),
    })
    .default({}),

  /** Extra forbidden-write globs merged with the auth/billing/security defaults. */
  forbiddenPathGlobs: z.array(z.string()).default([]),

  /** OPA evaluator endpoint (DEFERRED — TS evaluator is the default). */
  opaEndpoint: z.string().url().optional(),
});

export type GovernanceConfig = z.infer<typeof governanceConfigSchema>;
export type GovernanceConfigInput = z.input<typeof governanceConfigSchema>;

/** Parse + validate a config. Throws GovernanceConfigError on invalid input. */
export function loadGovernanceConfig(input: GovernanceConfigInput = {}): GovernanceConfig {
  const parsed = governanceConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new GovernanceConfigError('Invalid governance config', {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return parsed.data;
}

/** Fully-defaulted conservative config. */
export function defaultGovernanceConfig(): GovernanceConfig {
  return loadGovernanceConfig({});
}
