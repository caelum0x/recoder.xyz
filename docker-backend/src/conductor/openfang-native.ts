/**
 * openfang-native — degrade-safe loader for the openfang-napi native addon.
 *
 * SEAM CONTRACT (from the build directive):
 *   - Prefer the native .node addon (direct in-process call) when present.
 *   - Fall back gracefully to the existing subprocess/loopback/TS path when
 *     the .node is absent (no build, wrong arch, ENOSPC during build, etc.).
 *   - NEVER throw to the caller; all failures become `undefined`.
 *   - NEVER fake success.
 *
 * Resolution order for the .node binary (first existing wins):
 *   1. `OPENFANG_NATIVE_ADDON` env — absolute path to a prebuilt .node.
 *   2. `<repo>/crates/openfang/crates/openfang-napi/target/release/openfang_napi.node`
 *   3. `<repo>/crates/openfang/crates/openfang-napi/target/debug/openfang_napi.node`
 *
 * BUILD DEFERRAL NOTE:
 *   The .node file is produced by `cargo build -p openfang-napi --release`.
 *   At authoring time (~4.2 GB free disk) the build was deferred because the
 *   full workspace link requires 7-9 GB.  When disk is reclaimed, run:
 *
 *     cd crates/openfang && cargo build -p openfang-napi --release
 *
 *   The facade will auto-detect the .node on next server start — no config change
 *   needed.
 */
import { existsSync } from 'node:fs';
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:openfang-native');

/** Env var for an explicit .node path (mirrors the subprocess OPENFANG_BIN pattern). */
export const OPENFANG_NATIVE_ADDON_ENV = 'OPENFANG_NATIVE_ADDON';

/**
 * The subset of the openfang-napi native addon surface that this facade needs.
 * Mirrors the `#[napi]` exports in `crates/openfang/crates/openfang-napi/src/lib.rs`.
 */
export interface OpenfangNativeAddon {
  /** Fast liveness probe — returns `true`. */
  ping(): boolean;
  /** Returns a JSON string with the native addon version. */
  nativeVersion(): string;
  /** Bootstrap a kernel config and return a JSON health summary. */
  bootstrapKernel(configPath?: string | null): Promise<string>;
  /** Run a single agent-loop turn in-process; returns a JSON result string. */
  runAgent(agentId: string, message: string, configPath?: string | null): Promise<string>;
}

// Singleton: loaded once, then cached.
let _addon: OpenfangNativeAddon | undefined;
let _loaded = false;

/**
 * Injectable require seam — tests can replace this with a factory that returns
 * a stub addon without needing to touch the real native .node dlopen path.
 * Production code leaves this as `undefined` (uses the real require() call).
 */
let _requireOverride: ((addonPath: string) => OpenfangNativeAddon) | undefined;

/**
 * Walk up the directory tree from `__dirname` to find the repo root
 * (the directory containing `crates/openfang/Cargo.toml`).
 */
function findRepoRoot(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { existsSync: fsExists } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { dirname: pathDirname, join: pathJoin } = require('node:path') as typeof import('node:path');
  let dir: string;
  try {
    dir = __dirname;
  } catch {
    return undefined;
  }
  for (let i = 0; i < 12; i++) {
    if (fsExists(pathJoin(dir, 'crates', 'openfang', 'Cargo.toml'))) {
      return dir;
    }
    const parent = pathDirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve the native addon path WITHOUT building.  Returns the first existing
 * candidate, or `undefined` when no built .node is present.
 */
export function resolveNativeAddonPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[OPENFANG_NATIVE_ADDON_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }

  const root = findRepoRoot();
  if (!root) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('node:path') as typeof import('node:path');
  const base = join(root, 'crates', 'openfang', 'crates', 'openfang-napi', 'target');
  const candidates = [
    join(base, 'release', 'openfang_napi.node'),
    join(base, 'debug', 'openfang_napi.node'),
  ];
  return candidates.find((p) => existsSync(p));
}

/**
 * Load the native addon (degrade-safe).
 *
 * Returns the addon interface when the .node loads + pings successfully, or
 * `undefined` when absent / broken.  Never throws.
 */
export function loadNativeAddon(env: NodeJS.ProcessEnv = process.env): OpenfangNativeAddon | undefined {
  if (_loaded) return _addon;
  _loaded = true;

  const addonPath = resolveNativeAddonPath(env);
  if (!addonPath) {
    logger.info(
      'openfang native addon (.node) not built — staying on subprocess/loopback path. ' +
        'Build with: cd crates/openfang && cargo build -p openfang-napi --release',
    );
    return undefined;
  }

  try {
    // Use the test override if present; else use the real require().
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const raw: OpenfangNativeAddon = _requireOverride
      ? _requireOverride(addonPath)
      : (require(addonPath) as OpenfangNativeAddon);

    // Liveness probe — confirm the addon is callable before caching.
    if (typeof raw?.ping !== 'function' || raw.ping() !== true) {
      logger.warn(
        { addonPath },
        'openfang native addon loaded but ping() failed — falling back to subprocess path',
      );
      return undefined;
    }

    _addon = raw;
    const version = (() => {
      try {
        return JSON.parse(raw.nativeVersion?.() ?? '{}');
      } catch {
        return {};
      }
    })();
    logger.info(
      { addonPath, version },
      'openfang native addon loaded — in-process engine active (subprocess path disabled)',
    );
    return _addon;
  } catch (err) {
    logger.warn(
      { err, addonPath },
      'openfang native addon require() failed — falling back to subprocess/loopback path (degrade-safe)',
    );
    return undefined;
  }
}

/** Reset the singleton — used by tests to restore a clean loader state. */
export function __resetNativeAddonForTest(): void {
  _addon = undefined;
  _loaded = false;
  _requireOverride = undefined;
}

/**
 * Test seam: inject a require override so the loader returns a stub addon
 * without calling the real require() + dlopen path.  Always call
 * `__resetNativeAddonForTest()` in afterEach to restore the default behavior.
 *
 * Usage:
 * ```ts
 * __setRequireOverrideForTest((_path) => makeStubAddon());
 * ```
 */
export function __setRequireOverrideForTest(
  factory: (addonPath: string) => OpenfangNativeAddon,
): void {
  _requireOverride = factory;
}
