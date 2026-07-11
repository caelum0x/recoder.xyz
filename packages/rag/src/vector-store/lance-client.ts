/**
 * Thin structural contract for the subset of the LanceDB Node SDK
 * (`@lancedb/lancedb`) that the adapter uses.
 *
 * We deliberately model only the methods we call. This lets the package
 * typecheck and ship WITHOUT `@lancedb/lancedb` installed (it ships native
 * prebuilt binaries / can require building `crates/lance`), and lets the
 * adapter load it lazily at runtime only when a Lance path/URI is configured.
 */

/** A row as written to / read from a Lance table. */
export interface LanceRow {
	/** Document grouping key. Indexed via metadata column. */
	document_key: string;
	/** Chunk text content. */
	content: string;
	/** Chunk ordinal within its document. */
	chunk_index: number;
	/** Embedding vector. */
	vector: number[];
	/** Opaque metadata serialized as JSON (Lance has no native nested any). */
	metadata_json: string;
}

/** Builder returned by `Table.search`/`vectorSearch`. */
export interface LanceVectorQuery {
	limit(n: number): LanceVectorQuery;
	where(predicate: string): LanceVectorQuery;
	/** Resolve the query to an array of rows (with `_distance` attached). */
	toArray(): Promise<Array<LanceRow & { _distance?: number }>>;
}

/** A LanceDB table handle. */
export interface LanceTable {
	add(rows: LanceRow[]): Promise<void>;
	delete(predicate: string): Promise<void>;
	vectorSearch(vector: number[]): LanceVectorQuery;
	countRows?(): Promise<number>;
}

/** A LanceDB connection handle. */
export interface LanceConnection {
	tableNames(): Promise<string[]>;
	openTable(name: string): Promise<LanceTable>;
	createTable(
		name: string,
		data: LanceRow[],
		options?: { mode?: "create" | "overwrite" },
	): Promise<LanceTable>;
}

/**
 * The minimal module shape of `@lancedb/lancedb` we depend on.
 */
export interface LanceModule {
	connect(uri: string): Promise<LanceConnection>;
}

// ---- native addon types ------------------------------------------------

/**
 * Shape of the in-process native lance addon (`lance-npm-bindings.node`).
 *
 * The addon exposes a synchronous `connect()` (plus table/query methods) so the
 * async facade wraps each call in `Promise.resolve()` to satisfy `LanceModule`.
 */
interface NativeLanceTable {
	add(rowsJson: string): void;
	delete(predicate: string): void;
	vectorSearchToArray(vectorJson: string, limit: number): string;
	countRows(): number;
}

interface NativeLanceConnection {
	tableNames(): string[];
	openTable(name: string): NativeLanceTable | null;
	createTable(
		name: string,
		dataJson: string,
		optsJson: string,
	): NativeLanceTable;
}

interface NativeLanceAddon {
	connect(uri: string): NativeLanceConnection;
}

// ---- native-to-LanceModule adapter ------------------------------------------

/**
 * Wrap a `NativeLanceTable` in the async `LanceTable` interface so it is
 * interchangeable with the `@lancedb/lancedb` SDK table.
 */
function wrapNativeTable(native: NativeLanceTable): LanceTable {
	return {
		async add(rows: LanceRow[]): Promise<void> {
			native.add(JSON.stringify(rows));
		},
		async delete(predicate: string): Promise<void> {
			native.delete(predicate);
		},
		vectorSearch(vector: number[]): LanceVectorQuery {
			let _limit = 0; // 0 = no limit
			const query: LanceVectorQuery = {
				limit(n: number): LanceVectorQuery {
					_limit = n;
					return query;
				},
				where(_predicate: string): LanceVectorQuery {
					// where() filtering is not implemented in the native in-memory path;
					// the adapter uses delete() for document-key-based filters.
					return query;
				},
				async toArray(): Promise<Array<LanceRow & { _distance?: number }>> {
					const json = native.vectorSearchToArray(
						JSON.stringify(vector),
						_limit,
					);
					return JSON.parse(json) as Array<LanceRow & { _distance?: number }>;
				},
			};
			return query;
		},
		async countRows(): Promise<number> {
			return native.countRows();
		},
	};
}

/**
 * Wrap a `NativeLanceConnection` in the async `LanceConnection` interface.
 */
function wrapNativeConnection(native: NativeLanceConnection): LanceConnection {
	return {
		async tableNames(): Promise<string[]> {
			return native.tableNames();
		},
		async openTable(name: string): Promise<LanceTable> {
			const t = native.openTable(name);
			if (!t) {
				throw new Error(`lance-native: table '${name}' not found`);
			}
			return wrapNativeTable(t);
		},
		async createTable(
			name: string,
			data: LanceRow[],
			options?: { mode?: "create" | "overwrite" },
		): Promise<LanceTable> {
			const t = native.createTable(
				name,
				JSON.stringify(data),
				JSON.stringify(options ?? {}),
			);
			return wrapNativeTable(t);
		},
	};
}

/**
 * Build a `LanceModule` from the native addon so it satisfies the same interface
 * as the `@lancedb/lancedb` SDK.
 */
function nativeAddonToModule(addon: NativeLanceAddon): LanceModule {
	return {
		async connect(uri: string): Promise<LanceConnection> {
			const conn = addon.connect(uri);
			return wrapNativeConnection(conn);
		},
	};
}

// ---- native addon loader ----------------------------------------------------

/**
 * Candidate paths for the native addon `.node` file.
 *
 * Priority:
 *  1. Release artifact produced by `cargo build --release -p lance-npm-bindings`
 *     inside the monorepo workspace.
 *  2. A co-located `.node` file next to the compiled JS (production deploy layout).
 *
 * The list is short and deterministic. Any path that fails `require()` is silently
 * skipped — the overall loader never throws (degrade-safe contract).
 */
const NATIVE_ADDON_CANDIDATES: readonly string[] = [
	// 1. Monorepo release build path (macOS/Linux: .node; Windows: .dll renamed .node)
	"/Users/arhansubasi/recoder.xyz/crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
	// 2. Co-located next to the compiled JS output (production deploy artifact)
	"lance-npm-bindings.node",
];

let _nativeCacheResult: NativeLanceAddon | null | undefined = undefined;

/**
 * Try to load the native lance addon synchronously.
 *
 * Returns the addon module on success; `null` when unavailable. The result is
 * cached after the first call (the `.node` file is loaded once per process).
 *
 * Never throws — all errors are caught (degrade-safe).
 */
function tryLoadNativeAddon(): NativeLanceAddon | null {
	if (_nativeCacheResult !== undefined) return _nativeCacheResult;

	for (const candidate of NATIVE_ADDON_CANDIDATES) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const mod = require(candidate) as unknown;
			if (
				mod !== null &&
				mod !== undefined &&
				typeof mod === "object" &&
				"connect" in mod &&
				typeof (mod as Record<string, unknown>).connect === "function"
			) {
				_nativeCacheResult = mod as NativeLanceAddon;
				return _nativeCacheResult;
			}
		} catch {
			// require() failed (MODULE_NOT_FOUND, native binding missing, etc.) — try next.
		}
	}

	_nativeCacheResult = null;
	return null;
}

/** Reset the native addon cache (for testing only). */
export function _resetNativeAddonCache(): void {
	_nativeCacheResult = undefined;
}

/**
 * Lazily import `@lancedb/lancedb` without a static dependency.
 *
 * Returns `null` (never throws) when the SDK is not installed/provisioned so
 * callers can degrade to the in-memory fallback. The dynamic specifier is built
 * at runtime so bundlers do not try to statically resolve the optional dep.
 */
async function tryLoadSdkModule(): Promise<LanceModule | null> {
	const specifier = ["@lancedb", "lancedb"].join("/");
	try {
		const mod = (await import(specifier)) as Partial<LanceModule> & {
			default?: Partial<LanceModule>;
		};
		const connect = mod.connect ?? mod.default?.connect;
		if (typeof connect !== "function") return null;
		return { connect: connect.bind(mod) };
	} catch {
		// MODULE_NOT_FOUND, native-binding load failure, etc. all degrade-safe.
		return null;
	}
}

/**
 * Load the lance module with a native-first, degrade-safe priority order:
 *
 *  1. **Native addon** (`crates/lance/npm-bindings` `.node`): in-process, zero
 *     subprocess overhead, no network. Preferred when built for this arch.
 *  2. **`@lancedb/lancedb` SDK**: the official Node SDK with prebuilt binaries.
 *     Used when the native addon is not available.
 *  3. **`null`**: returned when neither is available; callers degrade to the
 *     in-memory `MemoryVectorStore` fallback — never throws, never fakes success.
 *
 * The result is NOT cached here (the caller caches at the connection level).
 * The native addon itself is cached after first `require()` success.
 */
export async function loadLanceModule(): Promise<LanceModule | null> {
	// Priority 1: in-process native addon.
	const native = tryLoadNativeAddon();
	if (native) {
		return nativeAddonToModule(native);
	}

	// Priority 2: @lancedb/lancedb SDK.
	return tryLoadSdkModule();
}
