/**
 * `NapiLoader` — the ONE degrade-safe loader for every in-process `.node` native
 * addon (openfang, tensorzero embedded-gateway, governance kernel). It folds the
 * per-engine `conductor/openfang-native.ts` + tensorzero-gateway loaders into a
 * single spec-driven implementation.
 *
 * SEAM CONTRACT (never violated):
 *  - Resolve the addon path WITHOUT building: explicit env path → Electron
 *    `resourcesPath/native/<file>` → `backend/engines/rust/<crate>/target/{release,
 *    debug}/<file>` → per-crate `crates/<pkg>/target/...`. First existing wins.
 *  - `load()` `require()`s the resolved path via `createRequire`, runs the spec's
 *    optional `validate` (liveness), caches the module, probes its version.
 *  - A missing / wrong-arch / broken `.node` returns `null` — NEVER throws — so
 *    the calling adapter degrades to its daemon/loopback fallback or `down`.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from '../../../shared/logger.js';
import type { NapiLoaderPort, NapiLoadSpec, NapiModule } from '../ports/napi-loader.port.js';

export interface NapiLoaderOptions {
  /** Pinned repo root (from `EnginesConfig.repoRoot`); else walk up from here. */
  readonly repoRoot?: string | null;
  /** Env accessor for the explicit-path lookup (bootstrap-injected; no direct env reads elsewhere). */
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam: replace the real `require()` with a stub factory. */
  readonly requireOverride?: (addonPath: string) => unknown;
}

export class NapiLoader implements NapiLoaderPort {
  private readonly cache = new Map<string, NapiModule<unknown> | null>();
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    private readonly log: Logger,
    private readonly options: NapiLoaderOptions = {},
  ) {
    this.env = options.env ?? process.env;
  }

  resolvePath(spec: NapiLoadSpec): string | null {
    const explicit = this.env[spec.env]?.trim();
    if (explicit) return existsSync(explicit) ? explicit : null;

    const candidates: string[] = [];

    // Electron packaged app: extraResources lands the .node in Resources/native/.
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) candidates.push(join(resourcesPath, 'native', spec.fileName));

    const root = this.resolveRepoRoot(spec);
    if (root) {
      const crateBase = join(root, 'backend', 'engines', 'rust', spec.crateDir);
      const wsTarget = join(crateBase, 'target');
      candidates.push(
        join(wsTarget, 'release', spec.fileName),
        join(wsTarget, 'debug', spec.fileName),
      );
      if (spec.cratePackage) {
        const crateTarget = join(crateBase, 'crates', spec.cratePackage, 'target');
        candidates.push(
          join(crateTarget, 'release', spec.fileName),
          join(crateTarget, 'debug', spec.fileName),
        );
      }
    }
    return candidates.find((path) => existsSync(path)) ?? null;
  }

  load<T>(spec: NapiLoadSpec<T>): NapiModule<T> | null {
    const cached = this.cache.get(spec.engineId);
    if (cached !== undefined) return cached as NapiModule<T> | null;

    // resolvePath only reads the path fields (env/fileName/crateDir), never the
    // generic `validate`/`probeVersion` — the widening cast is safe.
    const addonPath = this.resolvePath(spec as NapiLoadSpec);
    if (!addonPath) {
      this.log.info(
        { engineId: spec.engineId },
        'native addon (.node) not built — staying on daemon/loopback path (degrade-safe)',
      );
      this.cache.set(spec.engineId, null);
      return null;
    }

    try {
      // CommonJS build: the native `require` dlopen's the `.node` directly.
      const addon = (
        this.options.requireOverride ? this.options.requireOverride(addonPath) : require(addonPath)
      ) as T;

      if (spec.validate && !spec.validate(addon)) {
        this.log.warn(
          { engineId: spec.engineId, addonPath },
          'native addon loaded but validate() failed — degrading',
        );
        this.cache.set(spec.engineId, null);
        return null;
      }

      const version = this.probeVersion(spec, addon);
      const loaded: NapiModule<T> = { addon, path: addonPath, version };
      this.cache.set(spec.engineId, loaded as NapiModule<unknown>);
      this.log.info(
        { engineId: spec.engineId, addonPath, version },
        'native addon loaded — in-process engine active',
      );
      return loaded;
    } catch (err) {
      this.log.warn(
        { err: message(err), engineId: spec.engineId, addonPath },
        'native addon require() failed — degrading to daemon/loopback path',
      );
      this.cache.set(spec.engineId, null);
      return null;
    }
  }

  evict(engineId: string): void {
    this.cache.delete(engineId);
  }

  private probeVersion<T>(spec: NapiLoadSpec<T>, addon: T): string {
    if (!spec.probeVersion) return 'unknown';
    try {
      return spec.probeVersion(addon) ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private resolveRepoRoot(spec: NapiLoadSpec): string | undefined {
    if (this.options.repoRoot && existsSync(this.options.repoRoot)) return this.options.repoRoot;
    // Walk up from this module to the dir holding `backend/engines/rust/<crate>/Cargo.toml`.
    let dir: string;
    try {
      dir = __dirname;
    } catch {
      return undefined;
    }
    for (let i = 0; i < 12; i++) {
      if (existsSync(join(dir, 'backend', 'engines', 'rust', spec.crateDir, 'Cargo.toml'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
