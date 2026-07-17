/**
 * lance-napi.client — structural contracts + the degrade-safe loader for the
 * EMBEDDED Lance vector surface. Mirrors the loader seam proven in
 * `packages/rag/src/vector-store/lance-client.ts`:
 *
 *   1. in-process napi addon (`lance_npm_bindings.node`, built from
 *      `crates/lance/npm-bindings`) — zero subprocess, zero network,
 *   2. the `@lancedb/lancedb` SDK (prebuilt native binaries) when installed,
 *   3. `null` when neither is provisioned — the adapter then degrades to a
 *      truthful no-op store. NOTHING here ever throws.
 *
 * NO `process.env` reads (ARCHITECTURE §10.8): the native dir arrives via the
 * injected `MemoryConfig` (bootstrap folds `LANCE_NATIVE_DIR`/`RECODER_NATIVE_DIR`).
 * The Electron `process.resourcesPath` probe is packaging detection, not config.
 * The backend compiles to CommonJS, so a plain `require()` dlopen's the `.node`.
 */
import { join } from 'node:path';
import { createRequire } from 'node:module';

// ── Async module contracts (what the adapter consumes) ───────────────────────

/** A row as written to / read from a Lance table (schema inferred from data). */
export interface LanceRow {
  /** The point id, JSON-encoded (`string | number` survives the roundtrip). */
  id_json: string;
  /** The embedding vector. */
  vector: number[];
  /** Opaque payload serialized as JSON (Lance has no native nested any). */
  payload_json: string;
}

/** Builder returned by `LanceTable.vectorSearch`. */
export interface LanceVectorQuery {
  limit(n: number): LanceVectorQuery;
  /** Resolve to rows with the L2 `_distance` attached. */
  toArray(): Promise<Array<LanceRow & { _distance?: number }>>;
}

/** A Lance table handle. */
export interface LanceTable {
  add(rows: LanceRow[]): Promise<void>;
  delete(predicate: string): Promise<void>;
  vectorSearch(vector: number[]): LanceVectorQuery;
}

/** A Lance connection handle (one per data dir). */
export interface LanceConnection {
  tableNames(): Promise<string[]>;
  openTable(name: string): Promise<LanceTable>;
  createTable(name: string, data: LanceRow[]): Promise<LanceTable>;
}

/** The minimal module shape the adapter depends on. */
export interface LanceModule {
  connect(uri: string): Promise<LanceConnection>;
}

// ── Native napi addon contracts (sync surface of `lance_npm_bindings.node`) ──

interface NativeLanceTable {
  add(rowsJson: string): void;
  delete(predicate: string): void;
  vectorSearchToArray(vectorJson: string, limit: number): string;
}

interface NativeLanceConnection {
  tableNames(): string[];
  openTable(name: string): NativeLanceTable | null;
  createTable(name: string, dataJson: string, optsJson: string): NativeLanceTable;
}

interface NativeLanceAddon {
  connect(uri: string): NativeLanceConnection;
}

// ── native → async facade ────────────────────────────────────────────────────

function wrapNativeTable(native: NativeLanceTable): LanceTable {
  return {
    async add(rows: LanceRow[]): Promise<void> {
      native.add(JSON.stringify(rows));
    },
    async delete(predicate: string): Promise<void> {
      native.delete(predicate);
    },
    vectorSearch(vector: number[]): LanceVectorQuery {
      let capped = 0; // 0 = unlimited
      const query: LanceVectorQuery = {
        limit(n: number): LanceVectorQuery {
          capped = n;
          return query;
        },
        async toArray(): Promise<Array<LanceRow & { _distance?: number }>> {
          const json = native.vectorSearchToArray(JSON.stringify(vector), capped);
          return JSON.parse(json) as Array<LanceRow & { _distance?: number }>;
        },
      };
      return query;
    },
  };
}

function wrapNativeConnection(native: NativeLanceConnection): LanceConnection {
  return {
    async tableNames(): Promise<string[]> {
      return native.tableNames();
    },
    async openTable(name: string): Promise<LanceTable> {
      const table = native.openTable(name);
      if (!table) throw new Error(`lance-napi: table '${name}' not found`);
      return wrapNativeTable(table);
    },
    async createTable(name: string, data: LanceRow[]): Promise<LanceTable> {
      const table = native.createTable(name, JSON.stringify(data), '{}');
      return wrapNativeTable(table);
    },
  };
}

function isNativeAddon(mod: unknown): mod is NativeLanceAddon {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    typeof (mod as Record<string, unknown>).connect === 'function'
  );
}

// ── Loader ───────────────────────────────────────────────────────────────────

export type LanceModuleLoader = () => Promise<LanceModule | null>;

export interface LanceLoaderOptions {
  /** Directory containing `lance_npm_bindings.node` (from config, NOT env). */
  readonly nativeDir?: string | null;
  /** Test seam: replaces the CJS `require` used for both the addon and the SDK. */
  readonly requireImpl?: (id: string) => unknown;
}

const NATIVE_FILE = 'lance_npm_bindings.node';
const SDK_SPECIFIER = ['@lancedb', 'lancedb'].join('/'); // keep bundlers from statically resolving

/** Candidate `.node` paths: injected native dir first, then Electron resources. */
function nativeCandidates(nativeDir: string | null | undefined): string[] {
  const candidates: string[] = [];
  const dir = nativeDir?.trim();
  if (dir) candidates.push(join(dir, NATIVE_FILE));
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (typeof resourcesPath === 'string' && resourcesPath) {
    candidates.push(join(resourcesPath, 'native', NATIVE_FILE));
  }
  return candidates;
}

/**
 * A CJS `require` that works in both the compiled CommonJS backend and the
 * vitest/ESM transform (where the bare `require` global does not exist).
 * Failure to build one degrades to a thrower the loader catches per-candidate.
 */
function defaultRequire(): (id: string) => unknown {
  try {
    const anchor = typeof __filename === 'string' ? __filename : join(process.cwd(), 'index.js');
    return createRequire(anchor) as (id: string) => unknown;
  } catch {
    return () => {
      throw new Error('require unavailable in this runtime');
    };
  }
}

/**
 * Build the lazy lance loader. The returned function memoizes its result (the
 * `.node` is dlopen'd once per process) and NEVER throws: every failure path
 * resolves to `null` so the adapter degrades truthfully.
 */
export function createLanceModuleLoader(opts: LanceLoaderOptions = {}): LanceModuleLoader {
  const doRequire = opts.requireImpl ?? defaultRequire();
  let cached: LanceModule | null | undefined;

  return async (): Promise<LanceModule | null> => {
    if (cached !== undefined) return cached;

    // Priority 1: in-process napi addon.
    for (const candidate of nativeCandidates(opts.nativeDir)) {
      try {
        const mod = doRequire(candidate);
        if (isNativeAddon(mod)) {
          const addon = mod;
          cached = {
            async connect(uri: string): Promise<LanceConnection> {
              return wrapNativeConnection(addon.connect(uri));
            },
          };
          return cached;
        }
      } catch {
        // MODULE_NOT_FOUND / wrong-arch dlopen failure — try the next candidate.
      }
    }

    // Priority 2: the @lancedb/lancedb SDK (async connect).
    try {
      const sdk = doRequire(SDK_SPECIFIER) as Partial<LanceModule> & {
        default?: Partial<LanceModule>;
      };
      const connect = sdk?.connect ?? sdk?.default?.connect;
      if (typeof connect === 'function') {
        cached = { connect: connect.bind(sdk) as LanceModule['connect'] };
        return cached;
      }
    } catch {
      // SDK not installed — fall through to the truthful null.
    }

    cached = null;
    return cached;
  };
}
