import type { AgentCapability, AgentSurface } from '@recoder/agent-os';
import type { HeadlessMode } from '../contracts/headless-mode';

/**
 * Static metadata describing a driver: which surfaces it serves, which headless modes
 * it supports, its CLI binary, and its declared capabilities. Used by the registry to
 * resolve a `TaskSpec`/`AgentProfile` to a concrete driver + variant.
 */
export type DriverDescriptor = {
  /** Stable driver id, e.g. `claude-code`, `codex`, `pi-print`. */
  id: string;
  /** Surface kind this driver presents to the adapter layer. */
  kind: AgentSurface | 'browser_agent';
  /** Surfaces this driver can satisfy (usually `[kind]`, but recoder_code may delegate). */
  surfaces: readonly (AgentSurface | 'browser_agent')[];
  /** Headless modes supported, in preference order (first is default). */
  modes: readonly HeadlessMode[];
  /** Declared static capabilities (refined at runtime by capability-resolver). */
  capabilities: readonly AgentCapability[];
  /** CLI metadata for process-based drivers (absent for in-process drivers). */
  cli?: {
    /** Default binary name (overridable via RuntimeConfig.cliPaths). */
    binary: string;
    /** Argument that prints a version string for the presence/version probe. */
    versionArg?: string;
    /** node_modules/.bin name, if installable as a local dependency. */
    binName?: string;
  };
  /** Whether this driver runs in-process (no child process). */
  inProcess?: boolean;
  /** Human-readable label. */
  label: string;
};

export function defaultModeOf(descriptor: DriverDescriptor): HeadlessMode {
  const mode = descriptor.modes[0];
  if (!mode) {
    throw new Error(`Driver descriptor ${descriptor.id} declares no headless modes.`);
  }
  return mode;
}

export function supportsSurface(
  descriptor: DriverDescriptor,
  surface: AgentSurface | 'browser_agent',
): boolean {
  return descriptor.surfaces.includes(surface);
}

export function supportsMode(descriptor: DriverDescriptor, mode: HeadlessMode): boolean {
  return descriptor.modes.includes(mode);
}
