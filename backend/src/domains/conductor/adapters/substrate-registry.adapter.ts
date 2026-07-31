/**
 * `createConductorRegistry` — composes the `@recoder/substrate` registry over the
 * concrete substrates this deployment has wired, and reports TRUTHFUL per-id
 * availability.
 *
 * Selection ladder (domain doc §5): `tmux_worktree` (local default) → `daytona`
 * (remote, creds-gated) → `in_process`/`openfang` (opt-in) → `ssh` (creds-gated).
 * The concrete substrate impls are INJECTED (bootstrap / the serial integration
 * step wires the real tmux/daytona/ssh substrates promoted into the package or
 * still resident in the legacy `src/conductor/`); this adapter never invents a
 * stub, so an id with no registered substrate fails truthfully via the package's
 * `SubstrateNotRegisteredError` and is reported `available:false` here.
 *
 * DEGRADE-SAFE: with no substrates wired the registry is empty; `createWorkspace`
 * then fails with the truthful "not registered" error rather than a faked launch,
 * and `availability()` reports every known id as unavailable with the reason.
 */
import { createSubstrateRegistry } from '@recoder/substrate';
import type {
  ConductorSubstrate,
  SubstrateRegistryPort,
} from '../ports/substrate-registry.port.js';
import type { ConductorConfig } from '../config.js';
import type { SubstrateAvailabilityView, SubstrateKind } from '../types.js';

/** Every substrate id the domain knows about (for truthful availability listing). */
const KNOWN_SUBSTRATES: readonly SubstrateKind[] = [
  'tmux_worktree',
  'daytona',
  'in_process',
  'ssh',
  'acp',
];

export interface ConductorRegistry {
  /** The narrow registry port the `WorkspaceEngine` drives (get/list). */
  readonly registry: SubstrateRegistryPort;
  /** Truthful per-substrate availability surfaced by `GET /substrates`. */
  availability(): readonly SubstrateAvailabilityView[];
  /**
   * Resolve the FULL contract (capture/diff/teardown/continueRun) for the review/
   * publish/continue ops — the engine's narrow `registry.get` deliberately omits
   * those. Throws truthfully when the id has no registered substrate.
   */
  getFull(id: SubstrateKind): ConductorSubstrate;
}

export interface ConductorRegistryDeps {
  readonly config: ConductorConfig;
  /**
   * Concrete substrate impls to register (tmux/daytona/in-process/ssh). Injected
   * by the composition root — the adapter registers exactly these and nothing
   * more. Empty ⇒ every launch fails truthfully (never a fabricated success).
   */
  readonly substrates?: readonly ConductorSubstrate[];
}

/** Build the conductor substrate registry + truthful availability reporter. */
export function createConductorRegistry(
  deps: ConductorRegistryDeps
): ConductorRegistry {
  const substrates = deps.substrates ?? [];
  const registry = createSubstrateRegistry({ substrates });
  const registered = new Set<SubstrateKind>(registry.list());
  const fullById = new Map<SubstrateKind, ConductorSubstrate>(
    substrates.map(s => [s.id, s])
  );

  const availability = (): readonly SubstrateAvailabilityView[] =>
    KNOWN_SUBSTRATES.map(id => {
      // The effective pinned tmux binary (config pin, else PATH `tmux`) is a config
      // fact independent of whether the substrate is wired, so surface it on the
      // `tmux_worktree` entry in BOTH branches. This gives the shared-tmux-server
      // invariant (durable-shell unify §A1a) a real source for the wave-side attach.
      const pin =
        id === 'tmux_worktree'
          ? { tmuxBin: deps.config.tmuxBin ?? 'tmux' }
          : {};
      if (registered.has(id)) return { id, available: true, ...pin };
      return {
        id,
        available: false,
        reason: reasonUnavailable(id, deps.config),
        ...pin,
      };
    });

  const getFull = (id: SubstrateKind): ConductorSubstrate => {
    const substrate = fullById.get(id);
    if (!substrate) throw new Error(`substrate not registered: ${id}`);
    return substrate;
  };

  return { registry, availability, getFull };
}

/** Truthful reason an unregistered substrate is unavailable (never hidden). */
function reasonUnavailable(id: SubstrateKind, cfg: ConductorConfig): string {
  switch (id) {
    case 'daytona':
      return cfg.daytonaCredsPresent
        ? 'daytona substrate not wired into the registry'
        : 'DAYTONA_API_KEY not configured';
    case 'ssh':
      return cfg.sshCredsPresent
        ? 'ssh substrate not wired into the registry'
        : 'SSH host/key not configured';
    case 'in_process':
      return 'in-process/openfang substrate not wired into the registry';
    case 'acp':
      return 'acp substrate not wired into the registry (claude-code-acp opt-in)';
    case 'tmux_worktree':
    default:
      return 'tmux_worktree substrate not wired into the registry';
  }
}
