/**
 * `EnginesConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` (Phase 0) does not yet carry an `engines` slice,
 * so this accessor derives what it can (`isProduction`, the internal-service key
 * for `/internal/engines/*`, the conductor repo/worktree roots that anchor CLI +
 * napi path resolution) and applies degrade-safe defaults for the rest. The
 * per-engine binary/venv/napi paths + loopback URLs + feature flags are the
 * scattered `*_BIN` / `*_URL` / `*_NATIVE_ADDON` env reads; bootstrap folds them
 * into `EnginesConfigOverrides` so NO engines domain code reads the environment.
 *
 * NOTE (bootstrap wiring needed): `bootstrap/config.ts` must read the engine env
 * vars and pass them via `sliceEnginesConfig(app, overrides)`. This file
 * deliberately does NOT edit `shared/app-config.ts` or `bootstrap/*` (guarded);
 * the override seam keeps every env read in bootstrap. Fail-safe until wired:
 * every path is `null` and every loopback URL is unset → each engine resolves
 * its own binding (target dir / venv / PATH) and reports truthful availability.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** A resolved binding path (absolute) or `null` when the operator did not pin one. */
const nullablePath = z.string().min(1).nullable();

/** An externally-managed engine URL (skip-spawn seam) or `null`. */
const nullableUrl = z.string().url().nullable();

export const enginesConfigSchema = z.object({
  isProduction: z.boolean(),

  /** `INTERNAL_SERVICE_KEY` for `/internal/engines/*` (presence gate). */
  internalServiceKeyPresent: z.boolean(),
  internalServiceKey: z.string().nullable(),

  /**
   * Repo root the CLI + napi + sidecar path resolvers walk from (mirrors the
   * conductor's `CONDUCTOR_REPO_ROOT`). `null` → the loaders walk up from
   * `__dirname` to find `backend/engines/**` themselves.
   */
  repoRoot: z.string().nullable(),

  /** Absolute root dir of the cloned `backend/engines/py/pal-mcp-server`. `null` → default. */
  palRootDir: z.string().nullable(),

  /**
   * Explicit `.node` paths per napi engine (was `OPENFANG_NATIVE_ADDON` etc.).
   * `null` → the napi loader resolves from the engines/rust target dir.
   */
  napiPaths: z.object({
    openfang: nullablePath,
    tensorzero: nullablePath,
    governance: nullablePath,
  }),

  /** Explicit daemon binary paths (was `*_BIN`). `null` → resolve from target dir. */
  daemonBins: z.object({
    colbert: nullablePath,
    'ops-recorder': nullablePath,
    multica: nullablePath,
    ziti: nullablePath,
    'tensorzero-loopback': nullablePath,
  }),

  /**
   * Externally-managed daemon/sidecar URLs (was `*_URL`). When set, the
   * supervisor SKIPS spawning and trusts + probes this instance.
   */
  externalUrls: z.object({
    colbert: nullableUrl,
    'ops-recorder': nullableUrl,
    multica: nullableUrl,
    ziti: nullableUrl,
    'tensorzero-loopback': nullableUrl,
    mem0: nullableUrl,
    'browser-use': nullableUrl,
  }),

  /** Python interpreter paths per sidecar (was `*_PYTHON`). `null` → resolve venv. */
  sidecarPython: z.object({
    mem0: nullablePath,
    'browser-use': nullablePath,
    'pal-mcp': nullablePath,
  }),

  /**
   * Per-engine feature flags. A disabled engine is never bound and reports
   * `down` with reason "disabled". Default: every engine enabled (the loader
   * still degrades when its binding is absent).
   */
  enabled: z.record(z.string(), z.boolean()),

  /** Whether the napi-first path is preferred (false → daemon/loopback only). */
  napiFirst: z.boolean(),
});

export type EnginesConfig = z.infer<typeof enginesConfigSchema>;

/** The not-yet-in-AppConfig engine values bootstrap injects (all env reads there). */
export interface EnginesConfigOverrides {
  readonly repoRoot?: string | null;
  readonly palRootDir?: string | null;
  readonly napiPaths?: Partial<EnginesConfig['napiPaths']>;
  readonly daemonBins?: Partial<EnginesConfig['daemonBins']>;
  readonly externalUrls?: Partial<EnginesConfig['externalUrls']>;
  readonly sidecarPython?: Partial<EnginesConfig['sidecarPython']>;
  readonly enabled?: Readonly<Record<string, boolean>>;
  readonly napiFirst?: boolean;
}

const NULL_NAPI = { openfang: null, tensorzero: null, governance: null };
const NULL_DAEMON_BINS = {
  colbert: null,
  'ops-recorder': null,
  multica: null,
  ziti: null,
  'tensorzero-loopback': null,
};
const NULL_URLS = {
  colbert: null,
  'ops-recorder': null,
  multica: null,
  ziti: null,
  'tensorzero-loopback': null,
  mem0: null,
  'browser-use': null,
};
const NULL_SIDECAR_PY = { mem0: null, 'browser-use': null, 'pal-mcp': null };

/**
 * Project the engines slice out of the whole config. Derives `isProduction` +
 * the internal-service key + the conductor repo/worktree roots that `AppConfig`
 * already carries and defaults the rest degrade-safe. `overrides` is the seam
 * bootstrap uses to supply the per-engine paths/URLs/flags with no env reads.
 */
export function sliceEnginesConfig(
  app: AppConfig,
  overrides: EnginesConfigOverrides = {},
): EnginesConfig {
  return enginesConfigSchema.parse({
    isProduction: app.runtime.isProduction,
    internalServiceKeyPresent: app.internal.serviceKeyPresent,
    internalServiceKey: app.internal.serviceKey,
    repoRoot: overrides.repoRoot ?? null,
    palRootDir: overrides.palRootDir ?? null,
    napiPaths: { ...NULL_NAPI, ...overrides.napiPaths },
    daemonBins: { ...NULL_DAEMON_BINS, ...overrides.daemonBins },
    externalUrls: { ...NULL_URLS, ...overrides.externalUrls },
    sidecarPython: { ...NULL_SIDECAR_PY, ...overrides.sidecarPython },
    enabled: overrides.enabled ?? {},
    napiFirst: overrides.napiFirst ?? true,
  });
}

/** Whether an engine is enabled (default true when unspecified). */
export function isEngineEnabled(config: EnginesConfig, engineId: string): boolean {
  return config.enabled[engineId] ?? true;
}
