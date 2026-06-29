import type { LanceModule } from "./lance-client";
import {
	LanceVectorStore,
	type LanceVectorStoreConfig,
} from "./lance-vector-store";
import { MemoryVectorStore } from "./memory-vector-store";
import type { VectorStore } from "./types";

/**
 * Environment variable names that activate the Lance backend. The first one set
 * (non-empty) wins. `LANCE_DB_PATH` is the local-directory convention;
 * `LANCE_DB_URI` covers remote LanceDB Cloud / service URIs.
 */
export const LANCE_ENV_VARS = ["LANCE_DB_PATH", "LANCE_DB_URI"] as const;
export const LANCE_TABLE_ENV_VAR = "LANCE_TABLE_NAME";

export interface CreateVectorStoreOptions {
	/**
	 * Env bag to read from. Defaults to `process.env`. Injectable for tests so we
	 * never depend on ambient process state.
	 */
	env?: Record<string, string | undefined>;
	/** Override the Lance table name (otherwise from {@link LANCE_TABLE_ENV_VAR}). */
	tableName?: string;
	/** Injectable Lance module loader, forwarded to the adapter (tests). */
	loadModule?: () => Promise<LanceModule | null>;
	/** Force a backend regardless of env. */
	backend?: "lance" | "memory";
}

/** Resolve the configured Lance URI from env, or `null` when unset. */
export function resolveLanceUri(
	env: Record<string, string | undefined>,
): string | null {
	for (const name of LANCE_ENV_VARS) {
		const value = env[name]?.trim();
		if (value) return value;
	}
	return null;
}

/**
 * Build a {@link VectorStore} using the degrade-safe selection policy:
 *
 *  1. If `backend: "memory"` or no Lance URI is configured -> in-memory store.
 *  2. Otherwise construct a {@link LanceVectorStore}. Construction never throws
 *     and never connects eagerly; callers use `isReady()` / `skipReason()` to
 *     decide whether to use it or fall back. Use {@link createReadyVectorStore}
 *     to get an already-resolved store with automatic fallback.
 */
export function createVectorStore<
	TMetadata extends Record<string, unknown> = Record<string, never>,
>(options: CreateVectorStoreOptions = {}): VectorStore<TMetadata> {
	const env = options.env ?? process.env;

	if (options.backend === "memory") {
		return new MemoryVectorStore<TMetadata>();
	}

	const uri = resolveLanceUri(env);
	if (options.backend !== "lance" && !uri) {
		return new MemoryVectorStore<TMetadata>();
	}

	const config: LanceVectorStoreConfig = {
		uri: uri ?? "",
		tableName: options.tableName ?? env[LANCE_TABLE_ENV_VAR]?.trim(),
		loadModule: options.loadModule,
	};
	return new LanceVectorStore<TMetadata>(config);
}

/**
 * Like {@link createVectorStore}, but eagerly resolves readiness and falls back
 * to the in-memory store when the Lance backend is not provisioned.
 *
 * Returns the chosen store plus a truthful `skipReason` describing why Lance was
 * not used (or `null` when Lance is active). This is the recommended entry point
 * for production callers that want a single ready store and an audit trail.
 */
export async function createReadyVectorStore<
	TMetadata extends Record<string, unknown> = Record<string, never>,
>(
	options: CreateVectorStoreOptions = {},
): Promise<{ store: VectorStore<TMetadata>; skipReason: string | null }> {
	const candidate = createVectorStore<TMetadata>(options);

	if (candidate.backend === "memory") {
		return { store: candidate, skipReason: null };
	}

	if (await candidate.isReady()) {
		return { store: candidate, skipReason: null };
	}

	const skipReason = await candidate.skipReason();
	return { store: new MemoryVectorStore<TMetadata>(), skipReason };
}
