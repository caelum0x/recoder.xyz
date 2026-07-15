/**
 * `NapiLoaderPort` — the contract for loading an in-process `.node` native
 * addon. It resolves the addon path (explicit env override → engines/rust target
 * → per-crate target → Electron resources), `require()`s it once, caches the
 * module, and probes its version. The load is DEGRADE-SAFE by construction:
 * a missing / wrong-arch / broken `.node` returns `null` so the calling adapter
 * falls to its daemon/loopback fallback or a truthful `down` — it NEVER throws.
 *
 * This folds `conductor/openfang-native.ts` + the tensorzero embedded-gateway
 * loader into one implementation with per-engine specs.
 */

/** The resolved handle to a loaded native addon plus its probed metadata. */
export interface NapiModule<T = unknown> {
  /** The `require()`d native addon exports (the `#[napi]` surface). */
  readonly addon: T;
  /** Absolute path the `.node` was loaded from. */
  readonly path: string;
  /** Probed version string when the addon exposes one (else `unknown`). */
  readonly version: string;
}

/**
 * How to find + validate one engine's `.node`. `env` names the explicit-path env
 * var (e.g. `OPENFANG_NATIVE_ADDON`); `fileName` is the built addon filename
 * (e.g. `openfang_napi.node`); `crateDir` is the engine's dir under
 * `backend/engines/rust/` used to build the workspace/per-crate target
 * candidates; `validate` is an optional liveness check (e.g. `addon.ping()`).
 */
export interface NapiLoadSpec<T = unknown> {
  /** The engine id (for logging + the cache key). */
  readonly engineId: string;
  /** Env var holding an explicit absolute `.node` path (first-priority). */
  readonly env: string;
  /** The built addon filename to search target dirs for. */
  readonly fileName: string;
  /** The engine dir under `backend/engines/rust/` (target-dir resolution). */
  readonly crateDir: string;
  /** Optional cargo package name for the per-crate `crates/<pkg>/target` path. */
  readonly cratePackage?: string;
  /** Optional liveness validation run right after `require()` (return false → reject). */
  readonly validate?: (addon: T) => boolean;
  /** Optional version reader (return the version string; errors are swallowed). */
  readonly probeVersion?: (addon: T) => string | undefined;
}

export interface NapiLoaderPort {
  /**
   * Resolve the addon path for a spec WITHOUT loading it, or `null` when no built
   * `.node` exists. Pure filesystem check — safe to call on a fresh checkout.
   */
  resolvePath(spec: NapiLoadSpec): string | null;

  /**
   * Load + cache a native addon for a spec. Returns the module on success, or
   * `null` when the `.node` is absent / fails to `require` / fails `validate`.
   * Never throws. Subsequent calls return the cached module.
   */
  load<T>(spec: NapiLoadSpec<T>): NapiModule<T> | null;

  /** Drop the cached module for an engine id (next `load` re-resolves). */
  evict(engineId: string): void;
}
