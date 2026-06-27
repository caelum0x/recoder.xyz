/**
 * Codex runtime bridge — adapted from `ts/oh-my-codex/src/runtime/bridge.ts`.
 *
 * Optional sidecar over the `omx-runtime` Rust binary that owns authority/dispatch/mailbox
 * state for multi-pane codex teams. In the Recoder runtime this is **strictly optional and
 * off by default**: canonical task/approval/coordination state lives in `@recoder/agent-os`,
 * never in this sidecar. We keep the bridge only as a best-effort source of *informational*
 * readiness/authority snapshots that a driver may attach as log frames.
 *
 * Gating: enabled ONLY when `OMX_RUNTIME_BRIDGE === '1'` (note: stricter than the original's
 * "enabled unless '0'", because here it must be opt-in, not opt-out). When disabled or when
 * the binary is absent, every method is a no-op that returns `null` — it never throws into a
 * run and never green-washes a missing binary.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type AuthoritySnapshot = {
  owner: string | null;
  lease_id: string | null;
  leased_until: string | null;
  stale: boolean;
  stale_reason: string | null;
};

export type ReadinessSnapshot = {
  ready: boolean;
  reasons: string[];
};

export type CodexRuntimeBridgeOptions = {
  /** Explicit state dir (defaults to none — bridge reads default omx-runtime state). */
  stateDir?: string;
  /** Explicit binary path (defaults to OMX_RUNTIME_BINARY env or `omx-runtime` on PATH). */
  binaryPath?: string;
  /** Environment to read gating + overrides from (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Existence probe (injectable for tests). */
  exists?: (path: string) => boolean;
};

/** Whether the optional bridge is enabled. Opt-in only: `OMX_RUNTIME_BRIDGE === '1'`. */
export function isBridgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env['OMX_RUNTIME_BRIDGE'] === '1';
}

export function resolveRuntimeBinaryPath(
  options: { env?: Record<string, string | undefined>; exists?: (path: string) => boolean } = {},
): string {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const override = env['OMX_RUNTIME_BINARY']?.trim();
  if (override) return override;

  const cwd = env['PWD'] ?? process.cwd();
  const release = resolve(cwd, 'target', 'release', 'omx-runtime');
  if (exists(release)) return release;
  const debug = resolve(cwd, 'target', 'debug', 'omx-runtime');
  if (exists(debug)) return debug;
  return 'omx-runtime';
}

/**
 * Best-effort, fail-open bridge. Construct freely; if disabled/absent it stays inert.
 */
export class CodexRuntimeBridge {
  private readonly enabled: boolean;
  private readonly binaryPath: string;
  private readonly stateDir?: string;

  constructor(options: CodexRuntimeBridgeOptions = {}) {
    const env = options.env ?? process.env;
    this.enabled = isBridgeEnabled(env) && (options.exists ?? existsSync)(
      options.binaryPath ?? resolveRuntimeBinaryPath({ env, exists: options.exists }),
    )
      ? true
      : false;
    this.binaryPath = options.binaryPath ?? resolveRuntimeBinaryPath({ env, exists: options.exists });
    this.stateDir = options.stateDir;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Read the authority snapshot, or null when disabled/unavailable/erroring. */
  readAuthority(): AuthoritySnapshot | null {
    return this.readSnapshotField<AuthoritySnapshot>('authority');
  }

  /** Read the readiness snapshot, or null when disabled/unavailable/erroring. */
  readReadiness(): ReadinessSnapshot | null {
    return this.readSnapshotField<ReadinessSnapshot>('readiness');
  }

  private readSnapshotField<T>(field: 'authority' | 'readiness'): T | null {
    if (!this.enabled) return null;
    try {
      const args = ['snapshot', '--json'];
      if (this.stateDir) args.push(`--state-dir=${this.stateDir}`);
      const stdout = execFileSync(this.binaryPath, args, {
        encoding: 'utf-8',
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      const snapshot = JSON.parse(stdout) as Record<string, unknown>;
      const value = snapshot[field];
      return (value ?? null) as T | null;
    } catch {
      // Fail open: the bridge is informational; a missing/erroring binary is not a run error.
      return null;
    }
  }
}

let defaultBridge: CodexRuntimeBridge | undefined;

/** Lazily-constructed default bridge (shares process-level enablement). */
export function getDefaultCodexRuntimeBridge(): CodexRuntimeBridge {
  if (!defaultBridge) defaultBridge = new CodexRuntimeBridge();
  return defaultBridge;
}
