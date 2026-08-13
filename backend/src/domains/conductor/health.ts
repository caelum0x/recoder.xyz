/**
 * Truthful conductor health (ARCHITECTURE §10.1). The terminal product reports
 * the state of its execution substrates and its persistence, never a faked `up`:
 *
 *  - `substrate:<id>` — one engine line per known substrate. `up` when the
 *    substrate is registered and available; `down` (with the truthful reason:
 *    missing tmux/creds/not-wired) otherwise. With NO substrate available the
 *    module cannot launch work and reports `down`.
 *  - `workspace-db`   — the persistence pool the conductor-owned tables bind to;
 *    `degraded` when unreachable (the module still serves reads/reconcile from
 *    the bounded in-process store).
 *
 * Rollup: no substrate available → `down` (cannot launch). Otherwise `degraded`
 * when the DB is unreachable or only opt-in substrates are available; else `up`.
 * So a substrate-less boot is truthfully `down`, and a DB-less boot `degraded` —
 * never a fabricated `up`.
 *
 * NOTE (fleet health CUT): the legacy `conductor-health.ts` imported a dangling
 * `fleet/getFleetHealth` (domain doc §7); that import is intentionally dropped —
 * this domain reports substrate + persistence truth only.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../../shared/health-types.js';
import type { ConductorConfig } from './config.js';
import type { SubstrateAvailabilityView } from './types.js';

export interface ConductorHealthDeps {
  readonly config: ConductorConfig;
  readonly substrates: readonly SubstrateAvailabilityView[];
  /** Whether the persistence executor backing the conductor tables is connectable. */
  readonly repositoryAvailable: boolean;
  /** Live `/terminal` + `/sync` subscriber count (surfaced in detail). */
  readonly liveConnections: number;
}

/** Build the conductor component health from substrate availability + persistence. */
export function buildConductorHealth(deps: ConductorHealthDeps): ComponentHealth {
  const { substrates, repositoryAvailable, liveConnections } = deps;

  const substrateEngines: readonly EngineStatus[] = substrates.map((s) =>
    s.available
      ? { name: `substrate:${s.id}`, status: 'up' as HealthStatus }
      : { name: `substrate:${s.id}`, status: 'down' as HealthStatus, reason: s.reason ?? 'unavailable' },
  );

  const workspaceDb: EngineStatus = repositoryAvailable
    ? { name: 'workspace-db', status: 'up' }
    : {
        name: 'workspace-db',
        status: 'down',
        reason: 'persistence pool unavailable — workspaces served from the in-process store',
      };

  const engines: readonly EngineStatus[] = [...substrateEngines, workspaceDb];

  const anySubstrate = substrates.some((s) => s.available);
  // Truthful health keys on the ACTUAL configured default substrate (Loom in
  // production, tmux_worktree in dev/test) — never a hardcoded one. If the default
  // runtime an unqualified launch rides is down, health degrades even when some
  // opt-in substrate is up, so we never report `up` while default launches fail.
  const defaultSubstrate = substrates.find(
    (s) => s.id === deps.config.defaultSubstrate,
  );
  const defaultUp = defaultSubstrate?.available === true;

  let status: HealthStatus;
  if (!anySubstrate) {
    status = 'down'; // cannot launch any work
  } else if (!defaultUp || !repositoryAvailable) {
    status = 'degraded'; // only opt-in substrates, or DB down
  } else {
    status = 'up';
  }

  const base = {
    name: 'conductor',
    status,
    degraded: status !== 'up',
    engines,
    detail: {
      availableSubstrates: substrates.filter((s) => s.available).map((s) => s.id),
      tmuxControlMode: deps.config.tmuxControlMode,
      liveConnections,
    },
  };

  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
