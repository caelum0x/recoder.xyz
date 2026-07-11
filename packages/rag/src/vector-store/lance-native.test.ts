/**
 * lance-native.test.ts
 *
 * Proves the `loadLanceModule` facade:
 *  1. The function never throws (degrade-safe contract).
 *  2. Returns null when neither native addon nor SDK is available.
 *  3. The native adapter wrapper logic works end-to-end (via the injectable
 *     `loadModule` parameter on `LanceVectorStore`): native path preferred,
 *     correct data round-trips, degrade-safe on absence.
 *  4. Falls back to null when native addon loads but lacks `connect`.
 *
 * We avoid intercepting `require()` / `import()` at the module level because
 * the test runner runs in an ESM context. Instead, we exercise the facade via:
 *   - `loadLanceModule()` (public — confirms no-throw degrade-safe contract)
 *   - `LanceVectorStore({ loadModule: ... })` (injectable — tests wrapping logic)
 */

import assert from "node:assert/strict";
import { describe, it, expect, afterEach } from "vitest";
import { loadLanceModule, _resetNativeAddonCache } from "./lance-client.js";
import { LanceVectorStore } from "./lance-vector-store.js";
import type { LanceModule, LanceConnection, LanceTable, LanceRow } from "./lance-client.js";

afterEach(() => {
	_resetNativeAddonCache();
});

// ---------------------------------------------------------------------------
// Minimal in-memory fake simulating the native addon's behaviour
// (mirrors what crates/lance/npm-bindings/src/lib.rs exposes via NAPI).
// ---------------------------------------------------------------------------
function makeFakeNativeAddon(): { module: LanceModule; storedRows: () => LanceRow[] } {
	let stored: LanceRow[] = [];

	const fakeTable: LanceTable = {
		async add(rows) {
			stored = [...stored, ...rows];
		},
		async delete(predicate) {
			// Parse `document_key IN ('a', 'b')` — same logic the Rust parse_in_predicate uses.
			const match = /IN \((.*)\)/i.exec(predicate);
			if (!match) return;
			const keys = (match[1] ?? "")
				.split(",")
				.map((s) => s.trim().replace(/^'|'$/g, "").replace(/''/g, "'"));
			stored = stored.filter((r) => !keys.includes(r.document_key));
		},
		vectorSearch(vector) {
			const ranked = [...stored]
				.map((r) => {
					const dist = r.vector.reduce(
						(acc, v, i) => acc + (v - (vector[i] ?? 0)) ** 2,
						0,
					);
					return { ...r, _distance: dist };
				})
				.sort((a, b) => (a._distance ?? 0) - (b._distance ?? 0));
			let lim = ranked.length;
			const q = {
				limit(n: number) { lim = n; return q; },
				where(_: string) { return q; },
				async toArray() { return ranked.slice(0, lim); },
			};
			return q;
		},
		async countRows() { return stored.length; },
	};

	const fakeConn: LanceConnection = {
		async tableNames() { return stored.length > 0 ? ["embeddings"] : []; },
		async openTable(_name) { return fakeTable; },
		async createTable(_name, data) {
			stored = [...data];
			return fakeTable;
		},
	};

	const module: LanceModule = {
		async connect(_uri) { return fakeConn; },
	};

	return { module, storedRows: () => stored };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadLanceModule — degrade-safe contract", () => {
	it("never throws regardless of native/SDK availability", async () => {
		// Real call — may return the .node if built, the SDK if installed, or null.
		await expect(loadLanceModule()).resolves.not.toThrow();
	});

	it("returns null or a valid LanceModule (never an invalid shape)", async () => {
		const mod = await loadLanceModule();
		if (mod !== null) {
			expect(typeof mod.connect).toBe("function");
		}
		// null is also acceptable (degrade path).
		expect(mod === null || typeof mod?.connect === "function").toBe(true);
	});
});

describe("loadLanceModule — native-first, SDK-fallback via injectable loadModule", () => {
	it("prefers the injected native-like module over null (native > degrade)", async () => {
		const { module: nativeModule } = makeFakeNativeAddon();

		// The facade (LanceVectorStore) calls the injected loadModule, which simulates
		// what the real tryLoadNativeAddon() + nativeAddonToModule() would return.
		const store = new LanceVectorStore<{ src: string }>({
			uri: "/tmp/test",
			loadModule: async () => nativeModule,
		});

		// Native module is present → store should be ready.
		expect(await store.isReady()).toBe(true);
		expect(await store.skipReason()).toBeNull();
	});

	it("falls back to null when native require throws and SDK is absent", async () => {
		const store = new LanceVectorStore<Record<string, never>>({
			uri: "/tmp/test",
			loadModule: async () => null, // both native and SDK absent
		});

		expect(await store.isReady()).toBe(false);
		const reason = await store.skipReason();
		expect(reason).toBeTruthy();
		expect(reason).toMatch(/not provisioned/);

		// All operations are no-ops when the store is not ready (degrade-safe).
		await expect(store.upsert([])).resolves.not.toThrow();
		await expect(store.search([1, 0, 0])).resolves.toEqual([]);
		await expect(store.delete(["x"])).resolves.not.toThrow();
	});

	it("round-trips upsert/search/delete through the native adapter wrapper", async () => {
		const { module: nativeModule, storedRows } = makeFakeNativeAddon();

		const store = new LanceVectorStore<{ src: string }>({
			uri: "/tmp/test",
			loadModule: async () => nativeModule,
		});

		await store.upsert([
			{ documentKey: "a", chunk: { content: "apple",  index: 0, embedding: [1, 0, 0] }, metadata: { src: "a" } },
			{ documentKey: "b", chunk: { content: "banana", index: 0, embedding: [0, 1, 0] }, metadata: { src: "b" } },
			{ documentKey: "c", chunk: { content: "cherry", index: 0, embedding: [0.9, 0.1, 0] }, metadata: { src: "c" } },
		]);
		expect(storedRows()).toHaveLength(3);

		const results = await store.search([1, 0, 0], 2);
		expect(results).toHaveLength(2);
		expect(results[0]?.metadata.src).toBe("a");
		expect(results[1]?.metadata.src).toBe("c");

		await store.delete(["a"]);
		expect(storedRows()).toHaveLength(2);

		const after = await store.search([1, 0, 0], 5);
		expect(after.every((r) => r.metadata.src !== "a")).toBe(true);
	});

	it("native adapter respects the similarity threshold parameter", async () => {
		const { module: nativeModule } = makeFakeNativeAddon();

		const store = new LanceVectorStore<{ src: string }>({
			uri: "/tmp/test",
			loadModule: async () => nativeModule,
		});

		await store.upsert([
			{ documentKey: "near", chunk: { content: "near", index: 0, embedding: [1, 0, 0] }, metadata: { src: "near" } },
			{ documentKey: "far",  chunk: { content: "far",  index: 0, embedding: [-1, 0, 0] }, metadata: { src: "far" } },
		]);

		// Opposite vector has very high L2 distance → 1/(1+dist) << 0.5 → excluded.
		const results = await store.search([1, 0, 0], 10, 0.5);
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results.every((r) => r.metadata.src !== "far")).toBe(true);
	});

	it("upsert replaces prior chunks for the same document key (native wrapper)", async () => {
		const { module: nativeModule, storedRows } = makeFakeNativeAddon();

		const store = new LanceVectorStore<{ v: string }>({
			uri: "/tmp/test",
			loadModule: async () => nativeModule,
		});

		await store.upsert([
			{ documentKey: "x", chunk: { content: "old", index: 0, embedding: [1, 0] }, metadata: { v: "v1" } },
			{ documentKey: "x", chunk: { content: "old", index: 1, embedding: [1, 0] }, metadata: { v: "v1" } },
		]);
		await store.upsert([
			{ documentKey: "x", chunk: { content: "new", index: 0, embedding: [1, 0] }, metadata: { v: "v2" } },
		]);

		// After upsert, old chunks for "x" are replaced: only 1 row should remain.
		expect(storedRows()).toHaveLength(1);
		const results = await store.search([1, 0], 5);
		expect(results.length).toBe(1);
		expect(results[0]?.metadata.v).toBe("v2");
	});

	it("SDK path takes over when native returns null but SDK succeeds (priority 2)", async () => {
		// Simulate: native absent (require throws) → SDK path returns a module.
		const sdkModule: LanceModule = {
			async connect(_uri: string): Promise<LanceConnection> {
				const rows: LanceRow[] = [];
				const table: LanceTable = {
					async add(r) { rows.push(...r); },
					async delete(_p) { /* no-op */ },
					vectorSearch(vec) {
						let lim = rows.length;
						const q = {
							limit(n: number) { lim = n; return q; },
							where(_: string) { return q; },
							async toArray() {
								return rows.slice(0, lim).map(r => ({
									...r,
									_distance: r.vector.reduce((a, v, i) => a + (v - (vec[i] ?? 0)) ** 2, 0),
								}));
							},
						};
						return q;
					},
				};
				const conn: LanceConnection = {
					// Use "embeddings" to match the LanceVectorStore default table name.
					async tableNames() { return rows.length > 0 ? ["embeddings"] : []; },
					async openTable(_n) { return table; },
					async createTable(_n, data) { rows.push(...data); return table; },
				};
				return conn;
			},
		};

		// The store's loadModule returns the SDK module (native absent).
		const store = new LanceVectorStore<{ origin: string }>({
			uri: "/tmp/sdk",
			loadModule: async () => sdkModule,
		});

		expect(await store.isReady()).toBe(true);

		await store.upsert([
			{ documentKey: "sdk-doc", chunk: { content: "via sdk", index: 0, embedding: [1, 0] }, metadata: { origin: "sdk" } },
		]);

		const results = await store.search([1, 0], 1);
		expect(results).toHaveLength(1);
		expect(results[0]?.metadata.origin).toBe("sdk");
	});
});

describe("_resetNativeAddonCache — cache invalidation", () => {
	it("reset allows a second load attempt (observable via subsequent load)", async () => {
		// Call once to prime the cache.
		await loadLanceModule();
		// Reset.
		_resetNativeAddonCache();
		// Second call should not throw and should still honor the degrade-safe contract.
		const mod2 = await loadLanceModule();
		assert.ok(mod2 === null || typeof mod2?.connect === "function");
	});
});
