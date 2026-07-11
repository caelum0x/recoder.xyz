/**
 * napi-loader.ts — safe, degrade-safe loader for the `recoder-governance-napi`
 * native addon.
 *
 * The facade calls `tryLoadNapiModule()` once at startup. If the `.node`
 * binary is present for this arch/platform it is returned; otherwise
 * `undefined` is returned and the caller falls back to the UDS daemon or the
 * pure-TS deny-biased path — whichever is wired.
 *
 * ## Degrade-safe contract
 *
 * - `require()` errors are caught and never re-thrown.
 * - A successfully loaded module that does NOT expose `NapiGovernanceKernel`
 *   is treated as absent (avoids partial-load surprises).
 * - The loader never throws; it always returns the module or `undefined`.
 * - Dynamic `require` is used so bundlers that cannot ship native addons can
 *   omit it at build time (the runtime fallback covers those environments).
 * - All `require` / `require.resolve` calls are deferred into the function body
 *   so ESM module evaluation never fails even in environments without CJS.
 */

export interface NapiGovernanceKernelModule {
  /** The kernel class, matching the #[napi] export from recoder-governance-napi. */
  NapiGovernanceKernel: new () => NapiGovernanceKernelInstance;
  NapiApprovalManager: new () => NapiApprovalManagerInstance;
}

export interface NapiGovernanceKernelInstance {
  decide(
    actor: string,
    task: string,
    action: string,
    target: string,
    contextJson: string,
  ): string;
  enforceTool(tool: string, input: string): string;
  route(
    actor: string,
    task: string,
    action: string,
    target: string,
    contextJson: string,
  ): string;
  recordAudit(
    timestamp: string,
    actor: string,
    action: string,
    detail: string,
    outcome: string,
  ): string;
  verifyAudit(): boolean;
  auditTip(): string;
  auditLen(): number;
}

export interface NapiApprovalManagerInstance {
  requestApproval(requestJson: string): string;
  resolveApproval(requestId: string, decision: string, decidedBy: string): string;
}

/**
 * Candidate module specifiers / paths tried in order. Absolute paths work with
 * both CJS `require()` and `node:module` `createRequire()`. Relative specifiers
 * are tried as-is and will fail silently when absent (degrade-safe).
 *
 * Resolution priority (highest first):
 *   1. `RECODER_NATIVE_DIR` env var — explicit override for CI / custom layouts.
 *   2. `process.resourcesPath` — Electron packaged app: addons land under
 *      Resources/native/ via extraResources in the electron-builder config.
 *   3. Monorepo dev path (`crates/recoder-governance/target/release/...`),
 *      derived at runtime so the file is not tied to a hardcoded developer home.
 *   4. Co-located `.node` next to the compiled JS (production deploy layout).
 *
 * All candidates are tried in order; the first successful `require()` wins. Any
 * path that fails is silently skipped — the loader is degrade-safe and never throws.
 *
 * `__dirname` is not available in pure ESM; we use `import.meta.url` via
 * `new URL(...)` instead, but only when the env supports it (caught + skipped
 * otherwise so CJS environments still work).
 */
function buildCandidatePaths(): string[] {
  const candidates: string[] = [];

  // 1. Explicit override: RECODER_NATIVE_DIR env var (CI / custom layouts).
  const nativeDir = process.env.RECODER_NATIVE_DIR;
  if (nativeDir && nativeDir.trim()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodePath = require('path') as typeof import('path');
      candidates.push(nodePath.join(nativeDir.trim(), 'recoder-governance-napi.node'));
    } catch {
      // path module unavailable — skip
    }
  }

  // 2. Electron packaged app: process.resourcesPath/native/ (set by electron-builder
  //    extraResources, lands the .node files in Resources/native/).
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath && typeof resourcesPath === 'string') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodePath = require('path') as typeof import('path');
      candidates.push(nodePath.join(resourcesPath, 'native', 'recoder-governance-napi.node'));
    } catch {
      // path module unavailable — skip
    }
  }

  // 3. Monorepo dev path: derive from this file's location when possible, so the
  //    path is not hardcoded to a specific developer's home directory.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePath = require('path') as typeof import('path');
    // CJS __dirname: packages/governance/src/napi → up 5 → workspace root
    if (typeof __dirname !== 'undefined') {
      const workspaceRoot = nodePath.resolve(__dirname, '..', '..', '..', '..', '..');
      candidates.push(
        nodePath.join(
          workspaceRoot,
          'crates',
          'recoder-governance',
          'target',
          'release',
          'recoder-governance-napi.node',
        ),
      );
    }
  } catch {
    // __dirname or path not available — fall through to ESM variant below
  }

  try {
    // ESM: use import.meta.url when available. The path module must be loaded
    // dynamically to avoid failing in CJS environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePath = require('path') as typeof import('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeUrl = require('url') as typeof import('url');
    const metaUrl = (
      typeof globalThis !== 'undefined' &&
      (globalThis as Record<string, unknown>)['import_meta_url'] as string | undefined
    ) ?? undefined;
    if (metaUrl) {
      const thisFile = nodeUrl.fileURLToPath(metaUrl);
      // packages/governance/src/napi/napi-loader.ts → up 5 → workspace root
      const workspaceRoot = nodePath.resolve(nodePath.dirname(thisFile), '..', '..', '..', '..', '..');
      candidates.push(
        nodePath.join(
          workspaceRoot,
          'crates',
          'recoder-governance',
          'target',
          'release',
          'recoder-governance-napi.node',
        ),
      );
    }
  } catch {
    // Ignore — previous candidates cover dev environments
  }

  // 4. Co-located next to the compiled JS output (production deploy artifact).
  candidates.push('recoder-governance-napi.node');

  return candidates;
}

let _cached: NapiGovernanceKernelModule | undefined | null = null;

/**
 * Try to load the native addon. Returns the module on success, `undefined`
 * when the addon is not available for this environment.
 *
 * The result is cached after the first call (the addon is loaded once per
 * process lifetime).
 */
export function tryLoadNapiModule(): NapiGovernanceKernelModule | undefined {
  if (_cached !== null) return _cached ?? undefined;

  const candidates = buildCandidatePaths();

  for (const candidate of candidates) {
    try {
      // Prefer createRequire (ESM-compatible) when available; fall back to the
      // CJS global require. Both are caught so neither can crash the process.
      let mod: unknown;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require(candidate);
      } catch {
        // CJS require failed (or not available) — skip this candidate.
        continue;
      }

      if (
        mod !== null &&
        mod !== undefined &&
        typeof mod === 'object' &&
        'NapiGovernanceKernel' in mod &&
        typeof (mod as Record<string, unknown>).NapiGovernanceKernel === 'function'
      ) {
        _cached = mod as NapiGovernanceKernelModule;
        return _cached;
      }
    } catch {
      // Any unexpected error at this candidate — try the next one.
    }
  }

  _cached = undefined;
  return undefined;
}

/** Reset the module cache (for testing only). */
export function _resetNapiModuleCache(): void {
  _cached = null;
}
