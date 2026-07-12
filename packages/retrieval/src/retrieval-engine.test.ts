import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk.js";
import type { EmbeddingPort } from "./embed.js";
import { createColbertReranker, type RerankerPort } from "./rerank.js";
import type { RerankFetch, RerankHttpResponse } from "./rerank.js";
import { createRetrievalEngine } from "./retrieval-engine.js";
import type { VectorMatch, VectorPoint, VectorStorePort } from "./store.js";

// ── Fakes (no network) ───────────────────────────────────────────────────────

/**
 * Deterministic embedder: a tiny bag-of-chars vector so cosine-like similarity is
 * meaningful in the in-memory store. `provider` marks it configured.
 */
function fakeEmbedder(): EmbeddingPort {
	return {
		provider: "fake",
		async embed(texts: string[]): Promise<number[][]> {
			return texts.map(vectorFor);
		},
	};
}

/** An embedder that is not configured — always returns null (degrade). */
function nullEmbedder(): EmbeddingPort {
	return { provider: "none", async embed() { return null; } };
}

function vectorFor(text: string): number[] {
	// 5-dim vector counting a few marker letters; enough to differentiate docs.
	const markers = ["a", "e", "i", "o", "u"];
	const lower = text.toLowerCase();
	return markers.map((m) => lower.split(m).length - 1);
}

/** In-memory vector store with cosine ranking. `configured` toggles the degrade. */
function fakeStore(configured = true): VectorStorePort & { points: VectorPoint[] } {
	const points: VectorPoint[] = [];
	return {
		configured,
		points,
		async ensureCollection() {
			return configured;
		},
		async upsert(_name: string, pts: VectorPoint[]) {
			if (!configured) return false;
			points.push(...pts);
			return true;
		},
		async search(_name: string, vector: number[], topK: number): Promise<VectorMatch[]> {
			if (!configured) return [];
			return points
				.map((p) => ({ id: p.id, score: cosine(vector, p.vector), payload: p.payload }))
				.sort((a, b) => b.score - a.score)
				.slice(0, topK);
		},
	};
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── chunk ────────────────────────────────────────────────────────────────────

describe("chunkText", () => {
	it("splits on blank lines and indexes chunks", () => {
		const chunks = chunkText("first para\n\nsecond para\n\n\nthird");
		expect(chunks.map((c) => c.text)).toEqual(["first para", "second para", "third"]);
		expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
	});

	it("hard-splits an over-long paragraph by the char budget", () => {
		const long = `${"word ".repeat(50)}`.trim(); // 249 chars, no blank lines
		const chunks = chunkText(long, { maxChars: 40 });
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every((c) => c.text.length <= 40)).toBe(true);
	});

	it("returns [] for empty / whitespace input", () => {
		expect(chunkText("   \n\n  ")).toEqual([]);
	});
});

// ── engine: happy path ───────────────────────────────────────────────────────

describe("createRetrievalEngine", () => {
	it("ingests a document into chunks and retrieves it", async () => {
		const store = fakeStore();
		const engine = createRetrievalEngine({ embedder: fakeEmbedder(), store });

		const ingest = await engine.ingest({
			text: "alpha alpha alpha\n\nbeta beta\n\ngamma content here",
			docId: "d1",
			source: "notes.md",
		});
		expect(ingest.status).toBe("ingested");
		expect(ingest.chunks).toBe(3);
		expect(ingest.upserted).toBe(3);
		expect(store.points).toHaveLength(3);
		// Payload carries the logical grouping + text for later recall.
		expect(store.points[0].payload).toMatchObject({
			docId: "d1",
			source: "notes.md",
			chunkIndex: 0,
		});

		const result = await engine.search("alpha", 2);
		expect(result.status).toBe("ok");
		expect(result.passages.length).toBeGreaterThan(0);
		expect(result.passages.length).toBeLessThanOrEqual(2);
		expect(result.passages[0].text).toContain("alpha");
		expect(result.passages[0].docId).toBe("d1");
	});

	it("reports an empty document truthfully", async () => {
		const engine = createRetrievalEngine({ embedder: fakeEmbedder(), store: fakeStore() });
		const ingest = await engine.ingest({ text: "   \n\n  " });
		expect(ingest.status).toBe("empty");
		expect(ingest.chunks).toBe(0);
		expect(ingest.upserted).toBe(0);
	});

	it("returns ok/[] when the store is configured but empty", async () => {
		const engine = createRetrievalEngine({ embedder: fakeEmbedder(), store: fakeStore() });
		const result = await engine.search("nothing indexed", 5);
		expect(result.status).toBe("ok");
		expect(result.passages).toEqual([]);
	});

	// ── degrade-safe ─────────────────────────────────────────────────────────

	it("degrades to not_configured when the embedder is absent", async () => {
		const engine = createRetrievalEngine({ embedder: nullEmbedder(), store: fakeStore() });

		const ingest = await engine.ingest({ text: "some text here" });
		expect(ingest.status).toBe("not_configured");
		expect(ingest.reason).toMatch(/not configured/);

		const search = await engine.search("query");
		expect(search.status).toBe("not_configured");
		expect(search.passages).toEqual([]);
	});

	it("degrades to not_configured when the vector store is absent", async () => {
		const engine = createRetrievalEngine({
			embedder: fakeEmbedder(),
			store: fakeStore(false),
		});

		const ingest = await engine.ingest({ text: "some text here" });
		expect(ingest.status).toBe("not_configured");

		const search = await engine.search("query");
		expect(search.status).toBe("not_configured");
		expect(search.passages).toEqual([]);
	});

	// ── reranker ───────────────────────────────────────────────────────────────

	it("applies the injected reranker order over the retrieval order", async () => {
		const store = fakeStore();
		// A ColBERT fake that reverses whatever retrieval order it is given.
		const rerankFetch: RerankFetch = async (_url, init) => {
			const body = JSON.parse(init.body) as { passages: string[] };
			// Score ascending by index so the LAST retrieval candidate reranks first.
			const results = body.passages.map((_p, i) => ({ index: i, score: i }));
			return jsonResponse({ results });
		};
		const reranker: RerankerPort = createColbertReranker({
			url: "http://localhost/rerank",
			fetchImpl: rerankFetch,
		});
		const engine = createRetrievalEngine({ embedder: fakeEmbedder(), store, reranker });

		await engine.ingest({ text: "aaaa\n\neeee\n\niiii", docId: "d" });
		const result = await engine.search("aaaa", 3);
		expect(result.reranker).toBe("colbert");
		// Highest colbert score is the last retrieval candidate ⇒ it surfaces first.
		expect(result.passages.length).toBe(3);
		expect(result.passages[0].score).toBeDefined();
	});

	it("preserves retrieval order under the identity reranker", async () => {
		const store = fakeStore();
		const engine = createRetrievalEngine({ embedder: fakeEmbedder(), store });
		await engine.ingest({ text: "aaaa\n\neeee\n\niiii", docId: "d" });
		const result = await engine.search("aaaa", 3);
		expect(result.reranker).toBe("identity");
		expect(result.passages[0].text).toContain("aaaa");
	});
});

function jsonResponse(body: unknown): RerankHttpResponse {
	return {
		ok: true,
		status: 200,
		async json() {
			return body;
		},
	};
}
