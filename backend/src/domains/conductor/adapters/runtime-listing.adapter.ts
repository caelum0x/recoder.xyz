/**
 * `runtime-listing.adapter` — the runtime-SELECTION surface behind
 * `GET /api/conductor/runtimes`: every runtime a workspace can be created with,
 * with TRUTHFUL per-runtime availability.
 *
 * Two runtime families, matching the execution-path split in
 * runtime-substrate-selector.ts:
 *  - `cli` — the headless coding-agent CLIs (claude/codex/…), PATH-probed fresh
 *    per call via the package's `runtimeAvailability` (never a cached assumption).
 *  - `in_process` — the native openfang runtime. Availability is the REAL
 *    engine probe of the registered `in_process` substrate (addon loaded +
 *    kernel booted — the env the desktop supervisor injects: addon path,
 *    OPENFANG_HOME/CONFIG, BYOK keys). Unwired or engine-absent ⇒
 *    `available:false` with the truthful reason, never hidden and never faked.
 */
import {
  runtimeAvailability,
  type RuntimeAvailability,
} from '@recoder/substrate';
import type { ConductorRegistry } from './substrate-registry.adapter.js';
import { IN_PROCESS_RUNTIME_IDS } from './runtime-substrate-selector.js';

/** One selectable runtime with truthful availability (CLI or in-process). */
export interface ConductorRuntimeView {
  readonly runtimeId: string;
  /** Which execution path selecting this runtime dispatches to. */
  readonly kind: 'cli' | 'in_process';
  readonly available: boolean;
  /** CLI-only: the probed binary name + resolved PATH hit (absent when not found). */
  readonly bin?: string;
  readonly path?: string;
  /** Truthful blocker when `available:false`. */
  readonly reason?: string;
}

export interface ListRuntimesDeps {
  readonly registry: ConductorRegistry;
  /** CLI PATH-probe seam — defaults to the package's `runtimeAvailability`. */
  readonly probeCli?: () => Promise<readonly RuntimeAvailability[]>;
}

/**
 * List every selectable runtime: the PATH-probed CLIs plus the in-process
 * openfang runtime(s) with their live engine availability. Degrade-safe: a
 * throwing probe becomes a truthful `available:false` entry, never a fake.
 */
export async function listConductorRuntimes(
  deps: ListRuntimesDeps
): Promise<readonly ConductorRuntimeView[]> {
  const probeCli = deps.probeCli ?? runtimeAvailability;
  const cli: ConductorRuntimeView[] = (await probeCli()).map(r => ({
    runtimeId: r.runtimeId,
    kind: 'cli',
    bin: r.bin,
    path: r.path,
    available: r.available,
  }));
  const inProcess = await Promise.all(
    IN_PROCESS_RUNTIME_IDS.map(runtimeId =>
      inProcessRuntimeView(runtimeId, deps.registry)
    )
  );
  return [...cli, ...inProcess];
}

/** Truthful availability for one in-process runtime via its registered substrate. */
async function inProcessRuntimeView(
  runtimeId: string,
  registry: ConductorRegistry
): Promise<ConductorRuntimeView> {
  const base = { runtimeId, kind: 'in_process' as const };
  if (!registry.registry.list().includes('in_process')) {
    return {
      ...base,
      available: false,
      reason: 'in-process/openfang substrate not wired into the registry',
    };
  }
  try {
    const availability = await registry.getFull('in_process').available();
    if (availability.available) return { ...base, available: true };
    return {
      ...base,
      available: false,
      reason: availability.reason ?? 'in-process runtime unavailable',
    };
  } catch (err) {
    return {
      ...base,
      available: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
