/**
 * openfang-native — degrade-safe loader for the openfang-napi native addon.
 *
 * REAL in-process fusion. The openfang-napi `.node` has the actual openfang
 * engine compiled in (kernel + runtime/wasmtime + memory/sqlite + channels +
 * skills + hands + wire + extensions). This facade loads it and calls the engine
 * directly in the Node process — no subprocess, no loopback HTTP, no stub.
 *
 * SEAM CONTRACT:
 *   - Prefer the native `.node` (direct in-process call) when present.
 *   - Degrade to the subprocess/loopback path only when the `.node` is absent
 *     (no build, wrong arch, ENOSPC during build, etc.).
 *   - NEVER throw to the caller; all failures become `undefined`.
 *   - NEVER fake success.
 *
 * Resolution order for the `.node` (first existing wins):
 *   1. `OPENFANG_NATIVE_ADDON` env — absolute path to a prebuilt `.node`.
 *   2. `<repo>/crates/openfang/target/{release,debug}/openfang_napi.node`
 *      (the shared workspace target — where `cargo build -p openfang-napi` puts it,
 *      after the cdylib is copied to the `.node` name).
 *   3. `<repo>/crates/openfang/crates/openfang-napi/target/{release,debug}/openfang_napi.node`
 *      (per-crate target fallback).
 *
 * Build:  cd crates/openfang && cargo build -p openfang-napi --release
 *         then copy target/release/libopenfang_napi.<dylib|so|dll> → openfang_napi.node
 *         (scripts/build-native-addons.sh openfang does this automatically).
 */
import { existsSync } from 'node:fs';
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:openfang-native');

/** Env var for an explicit .node path (mirrors the subprocess OPENFANG_BIN pattern). */
export const OPENFANG_NATIVE_ADDON_ENV = 'OPENFANG_NATIVE_ADDON';

/**
 * A live, booted kernel handle (the JS side of the Rust `OpenfangEngine` class).
 * Every method calls the real in-process kernel and returns a JSON string.
 */
export interface OpenfangEngineInstance {
  // reads
  health(): string;
  listAgents(): string;
  listActiveHands(): string;
  listHandDefinitions(): string;
  listTriggers(agentId?: string | null): string;
  listBindings(): string;
  listModels(): string;
  listSkills(): string;
  usageSummary(agentId?: string | null): string;
  sessionUsageCost(agentId: string): string;
  listAgentSessions(agentId: string): string;
  // agent lifecycle (writes)
  runAgent(agentId: string, message: string): string;
  activateAgent(agentId: string): string;
  stopAgentRun(agentId: string): string;
  killAgent(agentId: string): string;
  resetSession(agentId: string): string;
  clearAgentHistory(agentId: string): string;
  setAgentModel(agentId: string, model: string, provider?: string | null): string;
  setAgentSkills(agentId: string, skills: string[]): string;
  // hands lifecycle (writes)
  activateHand(handId: string): string;
  pauseHand(instanceId: string): string;
  resumeHand(instanceId: string): string;
  deactivateHand(instanceId: string): string;
  // triggers + skills (writes)
  removeTrigger(triggerId: string): string;
  setTriggerEnabled(triggerId: string, enabled: boolean): string;
  reloadSkills(): string;
}

/** The `OpenfangEngine` Rust class as seen from JS (factory `boot` → static method). */
export interface OpenfangEngineClass {
  boot(configPath?: string | null): OpenfangEngineInstance;
}

/**
 * The openfang-napi native addon surface. Mirrors the `#[napi]` exports in
 * `crates/openfang/crates/openfang-napi/src/lib.rs`.
 */
export interface OpenfangNativeAddon {
  /** Fast liveness probe — returns `true`. */
  ping(): boolean;
  /** JSON string with the native addon version + `build_mode: "full"`. */
  nativeVersion(): string;
  /** JSON: `{ ok, hands: [{id,name,description}] }` — the compiled-in bundled Hands. */
  bundledHandsJson(): string;
  /** The engine class; `boot()` returns a live in-process kernel handle. */
  OpenfangEngine: OpenfangEngineClass;
}

// Singletons: loaded/booted once, then cached.
let _addon: OpenfangNativeAddon | undefined;
let _loaded = false;
let _engine: OpenfangEngineInstance | undefined;
let _engineTried = false;

/**
 * Injectable require seam — tests replace this with a factory returning a stub
 * addon without touching the real `.node` dlopen path. Production leaves it
 * `undefined` (uses the real `require()`).
 */
let _requireOverride: ((addonPath: string) => OpenfangNativeAddon) | undefined;

/** Walk up from `__dirname` to the repo root (dir containing `crates/openfang/Cargo.toml`). */
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
 * Resolve the native addon path WITHOUT building. Returns the first existing
 * candidate, or `undefined` when no built `.node` is present.
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
  const wsTarget = join(root, 'crates', 'openfang', 'target');
  const crateTarget = join(root, 'crates', 'openfang', 'crates', 'openfang-napi', 'target');
  const candidates = [
    join(wsTarget, 'release', 'openfang_napi.node'),
    join(wsTarget, 'debug', 'openfang_napi.node'),
    join(crateTarget, 'release', 'openfang_napi.node'),
    join(crateTarget, 'debug', 'openfang_napi.node'),
  ];
  return candidates.find((p) => existsSync(p));
}

/**
 * Load the native addon (degrade-safe). Returns the addon when the `.node` loads
 * and `ping()` succeeds, or `undefined` when absent/broken. Never throws.
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
    const raw: OpenfangNativeAddon = _requireOverride
      ? _requireOverride(addonPath)
      : (require(addonPath) as OpenfangNativeAddon);

    if (typeof raw?.ping !== 'function' || raw.ping() !== true) {
      logger.warn({ addonPath }, 'openfang native addon loaded but ping() failed — falling back');
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
    logger.warn({ err, addonPath }, 'openfang native addon require() failed — falling back (degrade-safe)');
    return undefined;
  }
}

/**
 * The bundled Hands compiled into the engine, or `undefined` when the addon is
 * absent. A pure read — no kernel boot needed, so this works even without config
 * or API keys. This is the native replacement for `GET :4200/api/hands`.
 */
export function nativeBundledHands(
  env: NodeJS.ProcessEnv = process.env,
): Array<{ id: string; name: string; description: string }> | undefined {
  const addon = loadNativeAddon(env);
  if (!addon || typeof addon.bundledHandsJson !== 'function') return undefined;
  try {
    const parsed = JSON.parse(addon.bundledHandsJson());
    if (parsed?.ok && Array.isArray(parsed.hands)) return parsed.hands;
    return undefined;
  } catch (err) {
    logger.warn({ err }, 'nativeBundledHands: failed to parse addon output — degrading');
    return undefined;
  }
}

/**
 * Boot the in-process kernel once and cache the handle. Returns `undefined` when
 * the addon is absent OR the kernel fails to boot (missing config, etc.). Never
 * throws. Boot is lazy: the first caller that needs a live engine pays for it.
 */
export function getOpenfangEngine(env: NodeJS.ProcessEnv = process.env): OpenfangEngineInstance | undefined {
  if (_engineTried) return _engine;
  _engineTried = true;

  const addon = loadNativeAddon(env);
  if (!addon?.OpenfangEngine || typeof addon.OpenfangEngine.boot !== 'function') return undefined;

  const configPath = env.OPENFANG_CONFIG?.trim() || null;
  try {
    _engine = addon.OpenfangEngine.boot(configPath);
    logger.info('openfang kernel booted in-process — engine handle cached');
    return _engine;
  } catch (err) {
    logger.warn({ err }, 'openfang kernel boot failed in-process — degrading to subprocess/loopback path');
    return undefined;
  }
}

/** Reset the singletons — used by tests to restore a clean loader state. */
export function __resetNativeAddonForTest(): void {
  _addon = undefined;
  _loaded = false;
  _engine = undefined;
  _engineTried = false;
  _requireOverride = undefined;
}

/**
 * Test seam: inject a require override so the loader returns a stub addon without
 * calling the real `require()` + dlopen. Always pair with `__resetNativeAddonForTest()`.
 */
export function __setRequireOverrideForTest(
  factory: (addonPath: string) => OpenfangNativeAddon,
): void {
  _requireOverride = factory;
}
