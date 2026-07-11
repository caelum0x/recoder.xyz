import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createReadyVectorStore, createVectorStore } from "./factory.ts";
import type {
	LanceConnection,
	LanceModule,
	LanceRow,
	LanceTable,
} from "./lance-client.ts";
import { LanceVectorStore } from "./lance-vector-store.ts";
import { cosineSimilarity, MemoryVectorStore } from "./memory-vector-store.ts";
import type { VectorRecord } from "./types.ts";

type Meta = { source: string };

function record(
	documentKey: string,
	index: number,
	embedding: number[],
	source: string,
): VectorRecord<Meta> {
	return {
		documentKey,
		chunk: { content: `chunk-${documentKey}-${index}`, index, embedding },
		metadata: { source },
	};
}

describe("cosineSimilarity", () => {
	it("returns 1 for identical vectors", () => {
		assert.ok(Math.abs(cosineSimilarity([1, 0, 1], [1, 0, 1]) - 1) < 1e-9);
	});

	it("returns 0 for orthogonal vectors", () => {
		assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
	});

	it("degrades safely on zero/mismatched vectors", () => {
		assert.equal(cosineSimilarity([], []), 0);
		assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
		assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0);
	});
});

describe("MemoryVectorStore", () => {
	it("is always ready with no skip reason", async () => {
		const store = new MemoryVectorStore<Meta>();
		assert.equal(store.backend, "memory");
		assert.equal(await store.isReady(), true);
		assert.equal(await store.skipReason(), null);
	});

	it("upserts and searches by similarity, honoring limit", async () => {
		const store = new MemoryVectorStore<Meta>();
		await store.upsert([
			record("a", 0, [1, 0, 0], "a"),
			record("b", 0, [0, 1, 0], "b"),
			record("c", 0, [0.9, 0.1, 0], "c"),
		]);

		const results = await store.search([1, 0, 0], 2);
		assert.equal(results.length, 2);
		// Closest first; metadata round-trips.
		assert.equal(results[0]?.metadata.source, "a");
		assert.equal(results[1]?.metadata.source, "c");
		assert.ok((results[0]?.similarity ?? 0) >= (results[1]?.similarity ?? 0));
	});

	it("filters by similarity threshold (normalized to 0..1)", async () => {
		const store = new MemoryVectorStore<Meta>();
		await store.upsert([
			record("a", 0, [1, 0, 0], "a"),
			record("opp", 0, [-1, 0, 0], "opp"),
		]);
		// Opposite vector normalizes to 0 similarity; threshold 0.5 excludes it.
		const results = await store.search([1, 0, 0], 10, 0.5);
		assert.equal(results.length, 1);
		assert.equal(results[0]?.metadata.source, "a");
	});

	it("upsert replaces prior chunks for the same document key", async () => {
		const store = new MemoryVectorStore<Meta>();
		await store.upsert([
			record("a", 0, [1, 0, 0], "v1"),
			record("a", 1, [1, 0, 0], "v1"),
		]);
		await store.upsert([record("a", 0, [1, 0, 0], "v2")]);
		assert.equal(store.documentCount(), 1);
		const results = await store.search([1, 0, 0], 10);
		assert.equal(results.length, 1);
		assert.equal(results[0]?.metadata.source, "v2");
	});

	it("deletes documents", async () => {
		const store = new MemoryVectorStore<Meta>();
		await store.upsert([
			record("a", 0, [1, 0, 0], "a"),
			record("b", 0, [0, 1, 0], "b"),
		]);
		await store.delete(["a"]);
		assert.equal(store.documentCount(), 1);
		const results = await store.search([1, 0, 0], 10);
		assert.equal(results.every((r) => r.metadata.source !== "a"), true);
	});
});

describe("factory env-based selection (degrade-safe)", () => {
	it("returns memory store when no Lance env is set", () => {
		const store = createVectorStore<Meta>({ env: {} });
		assert.equal(store.backend, "memory");
	});

	it("returns lance adapter when LANCE_DB_PATH is set", () => {
		const store = createVectorStore<Meta>({
			env: { LANCE_DB_PATH: "/tmp/lance" },
		});
		assert.equal(store.backend, "lance");
	});

	it("returns lance adapter when LANCE_DB_URI is set", () => {
		const store = createVectorStore<Meta>({
			env: { LANCE_DB_URI: "db://example" },
		});
		assert.equal(store.backend, "lance");
	});

	it("createReadyVectorStore falls back to memory with a truthful skipReason when SDK absent", async () => {
		const { store, skipReason } = await createReadyVectorStore<Meta>({
			env: { LANCE_DB_PATH: "/tmp/lance" },
			// Simulate SDK not provisioned.
			loadModule: async () => null,
		});
		assert.equal(store.backend, "memory");
		assert.ok(skipReason, "expected a skip reason");
		assert.match(skipReason ?? "", /not provisioned/);
		// Fallback store is functional.
		await store.upsert([record("a", 0, [1, 0, 0], "a")]);
		const results = await store.search([1, 0, 0], 1);
		assert.equal(results.length, 1);
	});
});

describe("LanceVectorStore against a fake SDK", () => {
	// Minimal in-memory fake implementing the LanceModule structural contract.
	function makeFakeModule(): { module: LanceModule; rows: () => LanceRow[] } {
		let stored: LanceRow[] = [];
		const table: LanceTable = {
			async add(rows) {
				stored = [...stored, ...rows];
			},
			async delete(predicate) {
				// Parse: document_key IN ('a', 'b')
				const match = predicate.match(/IN \((.*)\)/);
				if (!match) return;
				const keys = (match[1] ?? "")
					.split(",")
					.map((s) => s.trim().replace(/^'|'$/g, "").replace(/''/g, "'"));
				stored = stored.filter((r) => !keys.includes(r.document_key));
			},
			vectorSearch(vector) {
				const ranked = [...stored]
					.map((r) => {
						const distance = r.vector.reduce(
							(acc, v, i) => acc + (v - (vector[i] ?? 0)) ** 2,
							0,
						);
						return { ...r, _distance: distance };
					})
					.sort((a, b) => (a._distance ?? 0) - (b._distance ?? 0));
				let lim = ranked.length;
				const query = {
					limit(n: number) {
						lim = n;
						return query;
					},
					where() {
						return query;
					},
					async toArray() {
						return ranked.slice(0, lim);
					},
				};
				return query;
			},
		};
		const connection: LanceConnection = {
			async tableNames() {
				return stored.length > 0 ? ["embeddings"] : [];
			},
			async openTable() {
				return table;
			},
			async createTable(_name, data) {
				stored = [...data];
				return table;
			},
		};
		return {
			module: { async connect() {
				return connection;
			} },
			rows: () => stored,
		};
	}

	it("reports ready and round-trips upsert/search/delete via the SDK", async () => {
		const fake = makeFakeModule();
		const store = new LanceVectorStore<Meta>({
			uri: "/tmp/lance",
			loadModule: async () => fake.module,
		});

		assert.equal(store.backend, "lance");
		assert.equal(await store.isReady(), true);
		assert.equal(await store.skipReason(), null);

		await store.upsert([
			record("a", 0, [1, 0, 0], "a"),
			record("b", 0, [0, 1, 0], "b"),
		]);
		assert.equal(fake.rows().length, 2);

		const results = await store.search([1, 0, 0], 1);
		assert.equal(results.length, 1);
		assert.equal(results[0]?.metadata.source, "a");
		assert.ok((results[0]?.similarity ?? 0) > 0);

		await store.delete(["a"]);
		const after = await store.search([1, 0, 0], 5);
		assert.equal(after.every((r) => r.metadata.source !== "a"), true);
	});

	it("is degrade-safe when the SDK cannot be loaded", async () => {
		const store = new LanceVectorStore<Meta>({
			uri: "/tmp/lance",
			loadModule: async () => null,
		});
		assert.equal(await store.isReady(), false);
		const reason = await store.skipReason();
		assert.match(reason ?? "", /not provisioned/);
		// No throws on operations.
		await store.upsert([record("a", 0, [1, 0, 0], "a")]);
		assert.deepEqual(await store.search([1, 0, 0]), []);
		await store.delete(["a"]);
	});

	it("redacts credentials from connect failures", async () => {
		const store = new LanceVectorStore<Meta>({
			uri: "db://user:secret@host/db",
			loadModule: async () => ({
				async connect() {
					throw new Error("boom");
				},
			}),
		});
		assert.equal(await store.isReady(), false);
		const reason = await store.skipReason();
		assert.ok(reason);
		assert.equal(reason?.includes("secret"), false);
	});
});
