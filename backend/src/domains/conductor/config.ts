/**
 * `ConductorConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * This is where the scattered `process.env` reads that used to live in
 * `conductor/tmux-path.ts` (`CONDUCTOR_TMUX_BIN`, `RECODER_TMUX_BUILD_PATH`),
 * `conductor/tmux-control-mode.ts` (`TMUX_CONTROL_MODE`), and
 * `conductor/resource-governor.ts` (the caps) are FOLDED into one config slice.
 *
 * The foundational `AppConfig` (Phase 0) does not yet carry a `conductor` slice,
 * so this accessor derives `isProduction` from `runtime` and applies degrade-safe
 * defaults for everything else. Bootstrap is the ONLY place `process.env` is
 * read; it injects the not-yet-in-AppConfig values through
 * {@link ConductorConfigOverrides} (mirrors the governance domain's
 * `withGovernanceOverrides` seam). Until bootstrap wires it, the fail-safe
 * posture holds:
 *   - `tmuxBin: null`        -> the tmux substrate resolves the vendored/PATH
 *                               binary itself and reports `available:false` when
 *                               absent (never a faked launch).
 *   - `tmuxControlMode:false`-> the real-time `%output` listener stays off; the
 *                               poller tailer is the truthful default.
 *
 * NOTE (bootstrap wiring needed): `bootstrap/config.ts` must read the conductor
 * env vars and pass them via `sliceConductorConfig(app, overrides)`. This file
 * deliberately does NOT edit `shared/app-config.ts` or `bootstrap/` (guarded);
 * the override seam keeps every env read in bootstrap.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

export const conductorConfigSchema = z.object({
  /**
   * Absolute path to the pinned tmux binary (was `CONDUCTOR_TMUX_BIN` /
   * `RECODER_TMUX_BUILD_PATH`). `null` -> the tmux substrate resolves the
   * vendored build or system PATH itself and reports truthful availability.
   */
  tmuxBin: z.string().nullable(),
  /**
   * Opt-in real-time tmux control-mode (`-CC`) `%output` stream (was
   * `TMUX_CONTROL_MODE=1`). `false` -> the poller tailer is used; any control-mode
   * failure also degrades back to the poller.
   */
  tmuxControlMode: z.boolean(),
  /** Root dir isolated git worktrees are created under (was `CONDUCTOR_WORKTREE_ROOT`). */
  worktreeRoot: z.string(),
  /** Repo root the worktrees branch from (was `CONDUCTOR_REPO_ROOT`); `null` -> per-project. */
  repoRoot: z.string().nullable(),
  /** Resource-governor admission caps (were the `CONDUCTOR_MAX_*` / `*_DISK_GB` vars). */
  caps: z.object({
    maxConcurrentWorkspaces: z.number().int().positive(),
    maxConcurrentPerUser: z.number().int().positive(),
    maxTmuxSessions: z.number().int().positive(),
    minFreeDiskGb: z.number().nonnegative(),
    maxWorktreeDiskGb: z.number().nonnegative(),
  }),
  /**
   * Whether a Daytona API key is configured (presence-only). `false` -> the
   * daytona substrate is registered but reports `available:false`.
   */
  daytonaCredsPresent: z.boolean(),
  /**
   * Whether an SSH host+key is configured for the ssh substrate (presence-only).
   * `false` -> the ssh substrate is never registered (selection degrades to tmux).
   */
  sshCredsPresent: z.boolean(),
  isProduction: z.boolean(),
});

export type ConductorConfig = z.infer<typeof conductorConfigSchema>;

/** Default admission caps (mirror the legacy `resource-governor.DEFAULT_LIMITS`). */
export const DEFAULT_CONDUCTOR_CAPS: ConductorConfig['caps'] = {
  maxConcurrentWorkspaces: 10,
  maxConcurrentPerUser: 5,
  maxTmuxSessions: 50,
  minFreeDiskGb: 5,
  maxWorktreeDiskGb: 50,
};

/** Default worktree root (mirror the legacy `substrate-in-process` fallback). */
export const DEFAULT_WORKTREE_ROOT = '/tmp/recoder-worktrees';

/**
 * The not-yet-in-AppConfig conductor values bootstrap may inject. Every field is
 * optional so a partial override still yields a valid, degrade-safe config.
 */
export interface ConductorConfigOverrides {
  readonly tmuxBin?: string | null;
  readonly tmuxControlMode?: boolean;
  readonly worktreeRoot?: string;
  readonly repoRoot?: string | null;
  readonly caps?: Partial<ConductorConfig['caps']>;
  readonly daytonaCredsPresent?: boolean;
  readonly sshCredsPresent?: boolean;
}

/**
 * Project the conductor slice out of the whole config. Derives `isProduction`
 * from `runtime` and defaults the rest degrade-safe. `overrides` is the seam
 * bootstrap uses to supply the tmux binary / control-mode flag / caps / substrate
 * creds without any domain code reading the environment.
 */
export function sliceConductorConfig(
  app: AppConfig,
  overrides: ConductorConfigOverrides = {},
): ConductorConfig {
  return conductorConfigSchema.parse({
    tmuxBin: overrides.tmuxBin ?? null,
    tmuxControlMode: overrides.tmuxControlMode ?? false,
    worktreeRoot: overrides.worktreeRoot ?? DEFAULT_WORKTREE_ROOT,
    repoRoot: overrides.repoRoot ?? null,
    caps: { ...DEFAULT_CONDUCTOR_CAPS, ...(overrides.caps ?? {}) },
    daytonaCredsPresent: overrides.daytonaCredsPresent ?? false,
    sshCredsPresent: overrides.sshCredsPresent ?? false,
    isProduction: app.runtime.isProduction,
  });
}

/** Conductor config as it stands with only degrade-safe defaults (no overrides). */
export const withConductorOverrides = sliceConductorConfig;
