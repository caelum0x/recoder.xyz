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

/**
 * Lazily import `@lancedb/lancedb` without a static dependency.
 *
 * Returns `null` (never throws) when the SDK is not installed/provisioned so
 * callers can degrade to the in-memory fallback. The dynamic specifier is built
 * at runtime so bundlers do not try to statically resolve the optional dep.
 */
export async function loadLanceModule(): Promise<LanceModule | null> {
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
