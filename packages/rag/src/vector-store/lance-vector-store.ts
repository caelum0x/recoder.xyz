import type { QueryResult } from "../query-service/types";
import {
	type LanceConnection,
	type LanceModule,
	type LanceRow,
	type LanceTable,
	loadLanceModule,
} from "./lance-client";
import type { VectorRecord, VectorStore } from "./types";

export interface LanceVectorStoreConfig {
	/**
	 * Lance database URI. Local directory (e.g. `/var/lib/recoder/lance`) or a
	 * remote LanceDB Cloud / service URI (`db://...`). Sourced from env by the
	 * factory; never hardcode secrets.
	 */
	uri: string;
	/** Logical table name. Defaults to `embeddings`. */
	tableName?: string;
	/**
	 * Injectable module loader (for tests). Defaults to the lazy dynamic import
	 * of `@lancedb/lancedb`.
	 */
	loadModule?: () => Promise<LanceModule | null>;
}

const DEFAULT_TABLE = "embeddings";

function escapeSqlLiteral(value: string): string {
	// Lance uses SQL-style predicate strings; single-quote escape by doubling.
	return value.replace(/'/g, "''");
}

function toRow<TMetadata extends Record<string, unknown>>(
	record: VectorRecord<TMetadata>,
): LanceRow {
	return {
		document_key: record.documentKey,
		content: record.chunk.content,
		chunk_index: record.chunk.index,
		vector: record.chunk.embedding,
		metadata_json: JSON.stringify(record.metadata ?? {}),
	};
}

/**
 * Lance/LanceDB-backed implementation of the {@link VectorStore} port.
 *
 * Degrade-safe by construction: it does not connect until first use, and if the
 * `@lancedb/lancedb` SDK is not installed/provisioned, `isReady()` returns
 * `false` with a truthful {@link skipReason}. The factory uses that to fall back
 * to the in-memory store. No method here throws merely because Lance is absent.
 *
 * Distance handling: LanceDB returns L2 `_distance` by default. We convert it to
 * a bounded similarity in (0, 1] via `1 / (1 + distance)` so it composes with
 * the shared `QueryResult.similarity` contract and threshold filtering.
 */
export class LanceVectorStore<
	TMetadata extends Record<string, unknown> = Record<string, never>,
> implements VectorStore<TMetadata>
{
	readonly backend = "lance";

	readonly #uri: string;
	readonly #tableName: string;
	readonly #loadModule: () => Promise<LanceModule | null>;

	#connection: LanceConnection | null = null;
	#unavailableReason: string | null = null;
	#initPromise: Promise<void> | null = null;

	constructor(config: LanceVectorStoreConfig) {
		this.#uri = config.uri;
		this.#tableName = config.tableName ?? DEFAULT_TABLE;
		this.#loadModule = config.loadModule ?? loadLanceModule;
	}

	async isReady(): Promise<boolean> {
		await this.#ensureConnection();
		return this.#connection !== null;
	}

	async skipReason(): Promise<string | null> {
		await this.#ensureConnection();
		return this.#unavailableReason;
	}

	async upsert(records: VectorRecord<TMetadata>[]): Promise<void> {
		if (records.length === 0) return;
		const table = await this.#table();
		if (!table) return; // Not provisioned: caller checks isReady() to branch.

		// Replace semantics per document: delete then add.
		const keys = [...new Set(records.map((r) => r.documentKey))];
		await this.#deleteKeys(table, keys);
		await table.add(records.map(toRow));
	}

	async delete(documentKeys: string[]): Promise<void> {
		if (documentKeys.length === 0) return;
		const table = await this.#table();
		if (!table) return;
		await this.#deleteKeys(table, documentKeys);
	}

	async search(
		queryEmbedding: number[],
		limit = 10,
		similarityThreshold?: number,
	): Promise<QueryResult<TMetadata>[]> {
		const table = await this.#table();
		if (!table) return [];

		const rows = await table
			.vectorSearch(queryEmbedding)
			.limit(Math.max(1, limit))
			.toArray();

		const results: QueryResult<TMetadata>[] = [];
		for (const row of rows) {
			const distance = row._distance ?? 0;
			const similarity = 1 / (1 + Math.max(0, distance));
			if (
				similarityThreshold !== undefined &&
				similarity < similarityThreshold
			) {
				continue;
			}
			results.push({
				chunk: { content: row.content, index: row.chunk_index },
				similarity,
				metadata: this.#parseMetadata(row.metadata_json),
			});
		}
		return results.slice(0, Math.max(0, limit));
	}

	#parseMetadata(json: string): TMetadata {
		try {
			return (JSON.parse(json) ?? {}) as TMetadata;
		} catch {
			return {} as TMetadata;
		}
	}

	async #deleteKeys(table: LanceTable, keys: string[]): Promise<void> {
		if (keys.length === 0) return;
		const list = keys.map((k) => `'${escapeSqlLiteral(k)}'`).join(", ");
		await table.delete(`document_key IN (${list})`);
	}

	async #table(): Promise<LanceTable | null> {
		await this.#ensureConnection();
		const conn = this.#connection;
		if (!conn) return null;

		const names = await conn.tableNames();
		if (names.includes(this.#tableName)) {
			return conn.openTable(this.#tableName);
		}
		// Lance infers schema from data; create empty-but-typed by overwrite on
		// first add instead. Defer creation until we have a row.
		return new LazyCreateTable(conn, this.#tableName);
	}

	async #ensureConnection(): Promise<void> {
		if (this.#connection || this.#unavailableReason) return;
		if (!this.#initPromise) {
			this.#initPromise = this.#connect();
		}
		await this.#initPromise;
	}

	async #connect(): Promise<void> {
		const mod = await this.#loadModule();
		if (!mod) {
			this.#unavailableReason =
				"Lance vector store backend not provisioned: the '@lancedb/lancedb' " +
				"SDK is not installable in this environment (native prebuilt binaries " +
				"/ crates/lance build required). Provision the Lance SDK or a LanceDB " +
				"service, then set LANCE_DB_PATH (or LANCE_DB_URI). Falling back to the " +
				"in-memory vector store.";
			return;
		}
		try {
			this.#connection = await mod.connect(this.#uri);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.#unavailableReason = `Lance connect("${redactUri(this.#uri)}") failed: ${message}. Falling back to the in-memory vector store.`;
		}
	}
}

/** Hide credentials embedded in a remote LanceDB URI before logging. */
function redactUri(uri: string): string {
	try {
		const parsed = new URL(uri);
		if (parsed.password) parsed.password = "***";
		if (parsed.username) parsed.username = "***";
		return parsed.toString();
	} catch {
		// Local filesystem path: safe to show as-is.
		return uri;
	}
}

/**
 * Wraps a connection so the first `add` creates the table (Lance infers schema
 * from the first batch of rows) while later operations open the existing table.
 */
class LazyCreateTable implements LanceTable {
	#real: LanceTable | null = null;
	readonly #conn: LanceConnection;
	readonly #name: string;

	constructor(conn: LanceConnection, name: string) {
		this.#conn = conn;
		this.#name = name;
	}

	async add(rows: LanceRow[]): Promise<void> {
		if (this.#real) {
			await this.#real.add(rows);
			return;
		}
		if (rows.length === 0) return;
		this.#real = await this.#conn.createTable(this.#name, rows, {
			mode: "overwrite",
		});
	}

	async delete(predicate: string): Promise<void> {
		const table = await this.#resolve();
		if (table) await table.delete(predicate);
	}

	vectorSearch(vector: number[]) {
		if (!this.#real) {
			// No table yet -> empty result set.
			return {
				limit() {
					return this;
				},
				where() {
					return this;
				},
				async toArray() {
					return [];
				},
			};
		}
		return this.#real.vectorSearch(vector);
	}

	async #resolve(): Promise<LanceTable | null> {
		if (this.#real) return this.#real;
		const names = await this.#conn.tableNames();
		if (names.includes(this.#name)) {
			this.#real = await this.#conn.openTable(this.#name);
		}
		return this.#real;
	}
}
