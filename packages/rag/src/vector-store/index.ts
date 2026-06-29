export {
	type CreateVectorStoreOptions,
	createReadyVectorStore,
	createVectorStore,
	LANCE_ENV_VARS,
	LANCE_TABLE_ENV_VAR,
	resolveLanceUri,
} from "./factory";
export {
	type LanceConnection,
	type LanceModule,
	type LanceRow,
	type LanceTable,
	type LanceVectorQuery,
	loadLanceModule,
} from "./lance-client";
export {
	LanceVectorStore,
	type LanceVectorStoreConfig,
} from "./lance-vector-store";
export { cosineSimilarity, MemoryVectorStore } from "./memory-vector-store";
export type { VectorRecord, VectorStore } from "./types";
