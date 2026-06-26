import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Engine resolver — makes the Brain's vendored real engines DISCOVERABLE so they
 * light up without a global install once built, and reports HOW each one will be
 * reached (vendored node entry, env-pinned binary, or a bare PATH name).
 *
 * Pure + deterministic given an injected `exists()` + `env`: every probe of the
 * filesystem flows through `exists`, every secret/URL through `env`. The real
 * defaults (`fs.existsSync`, `process.env`) are only used when nothing is
 * injected, so this stays trivially testable with no filesystem or environment.
 *
 * Resolution NEVER fails: an absent vendored build and an absent env override
 * both degrade to the bare PATH name — byte-identical to each adapter's prior
 * hard-coded default — so wiring this into the factory defaults can only add
 * discovery, never change behavior when nothing resolves.
 */

/** How an exec engine is reachable. */
export type EngineKind = "node" | "path" | "none";

/** A resolved exec engine: the command + any fixed arg prefix to run it. */
export interface ResolvedExecEngine {
  /** `node` for a vendored entry, the binary name/path otherwise. */
  readonly kind: EngineKind;
  /** Command to spawn (`node`, an env-pinned path, or a PATH name). */
  readonly cmd: string;
  /** Fixed args prepended before the adapter's own argv (e.g. the entry path). */
  readonly args: string[];
}

/** mem0 is an HTTP surface: resolved to a base URL or null when unconfigured. */
export interface ResolvedMem0 {
  readonly baseUrl: string | null;
}

/** context7 is key-gated: resolved to whether a key is present (never the key). */
export interface ResolvedContext7 {
  readonly apiKey: boolean;
}

/** The full resolution across every Brain engine. */
export interface ResolvedEngines {
  readonly recodergit: ResolvedExecEngine;
  readonly continuum: ResolvedExecEngine;
  readonly bd: ResolvedExecEngine;
  readonly mem0: ResolvedMem0;
  readonly context7: ResolvedContext7;
}

/** Filesystem existence probe (the seam tests fake). */
export type ExistsFn = (path: string) => boolean;

/** Read-only environment view (the seam tests fake). */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export interface ResolveEnginesOptions {
  /** Monorepo root the vendored paths are resolved against (defaults to a walk). */
  readonly root?: string;
  /** Environment source (defaults to process.env). */
  readonly env?: EnvLike;
  /** Filesystem existence probe (defaults to fs.existsSync). */
  readonly exists?: ExistsFn;
}

/** Vendored built recodergit CLI entry, relative to the monorepo root. */
const RECODERGIT_VENDORED = ["ts", "recodergit", "gitnexus", "dist", "cli", "index.js"];
/** Vendored zero-dep continuum CLI entry, relative to the monorepo root. */
const CONTINUUM_VENDORED = ["ts", "continuum", "bin", "continuum.mjs"];
/** Marker that identifies the monorepo root when walking up from a start dir. */
const ROOT_MARKER = "pnpm-workspace.yaml";

/**
 * Find the monorepo root by walking up from `start` until the workspace marker
 * is found. Degrades to `start` when no marker exists (e.g. the package consumed
 * outside the monorepo), where the vendored paths simply won't exist and every
 * exec engine falls back to its PATH name.
 */
function findRepoRoot(start: string, exists: ExistsFn): string {
  let dir = start;
  for (;;) {
    if (exists(join(dir, ROOT_MARKER))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
}

interface ResolveExecInput {
  /** Absolute vendored node entry path, or null when the engine has none. */
  readonly vendored: string | null;
  /** Env-pinned binary path/name override, if any. */
  readonly envBin: string | undefined;
  /** Bare PATH name used as the final fallback. */
  readonly pathName: string;
  readonly exists: ExistsFn;
}

/**
 * Resolve one exec engine. Precedence: a present vendored build (run via node) >
 * an env-pinned binary > the bare PATH name. The last branch is identical to the
 * adapter's prior default, so "nothing resolves" stays a no-op.
 */
function resolveExec(input: ResolveExecInput): ResolvedExecEngine {
  if (input.vendored && input.exists(input.vendored)) {
    return { kind: "node", cmd: "node", args: [input.vendored] };
  }
  const envBin = input.envBin?.trim();
  if (envBin) {
    return { kind: "path", cmd: envBin, args: [] };
  }
  return { kind: "path", cmd: input.pathName, args: [] };
}

/**
 * Resolve every Brain engine from an injected filesystem + environment. Pure and
 * deterministic: with the same `root`, `env`, and `exists`, the result is fixed.
 */
export function resolveEngines(
  options: ResolveEnginesOptions = {},
): ResolvedEngines {
  const exists = options.exists ?? existsSync;
  const env = options.env ?? process.env;
  const root = options.root ?? findRepoRoot(process.cwd(), exists);

  const recodergit = resolveExec({
    vendored: join(root, ...RECODERGIT_VENDORED),
    envBin: env["RECODERGIT_BIN"],
    pathName: "gitnexus",
    exists,
  });
  const continuum = resolveExec({
    vendored: join(root, ...CONTINUUM_VENDORED),
    envBin: env["CONTINUUM_BIN"],
    pathName: "continuum",
    exists,
  });
  const bd = resolveExec({
    vendored: null,
    envBin: env["BD_BIN"],
    pathName: "bd",
    exists,
  });

  const mem0Base = env["MEM0_BASE_URL"]?.trim();
  return {
    recodergit,
    continuum,
    bd,
    mem0: { baseUrl: mem0Base ? mem0Base : null },
    context7: { apiKey: Boolean(env["CONTEXT7_API_KEY"]?.trim()) },
  };
}

/**
 * Resolve a single exec engine's command, honoring an explicit override exactly
 * as the adapter's old `bin` option did (override -> PATH-style cmd, no prefix).
 * Used by the factory defaults so an injected binary keeps prior behavior while
 * an absent override opts into vendored discovery.
 */
export function resolveExecEngine(
  engine: "recodergit" | "continuum" | "bd",
  override?: string,
  options?: ResolveEnginesOptions,
): ResolvedExecEngine {
  const pinned = override?.trim();
  if (pinned) {
    return { kind: "path", cmd: pinned, args: [] };
  }
  return resolveEngines(options)[engine];
}
