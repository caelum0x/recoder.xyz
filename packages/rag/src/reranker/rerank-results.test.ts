import { describe, expect, it } from "vitest";
import type { QueryResult } from "../query-service/types";
import { createNoopReranker } from "./noop-reranker";
import { rerankResults } from "./rerank-results";
import type { RerankerPort } from "./types";

const results: QueryResult[] = [
	{ chunk: { content: "alpha", index: 0 }, similarity: 0.9, metadata: {} },
	{ chunk: { content: "beta", index: 1 }, similarity: 0.8, metadata: {} },
	{ chunk: { content: "gamma", index: 2 }, similarity: 0.7, metadata: {} },
];

describe("rerankResults", () => {
	it("returns results unchanged for the no-op reranker", async () => {
		const out = await rerankResults(createNoopReranker(), "q", results);
		expect(out.map((r) => r.chunk.content)).toEqual(["alpha", "beta", "gamma"]);
	});

	it("reorders QueryResults and attaches rerankScore to additional", async () => {
		const reranker: RerankerPort = {
			async rerank(_q, candidates) {
				return [
					{ ...candidates[2], originalIndex: 2, rerankScore: 5 },
					{ ...candidates[0], originalIndex: 0, rerankScore: 4 },
					{ ...candidates[1], originalIndex: 1, rerankScore: 3 },
				] as never;
			},
		};
		const out = await rerankResults(reranker, "q", results);
		expect(out.map((r) => r.chunk.content)).toEqual(["gamma", "alpha", "beta"]);
		expect(out[0]?.additional?.rerankScore).toBe(5);
	});

	it("falls back to original results when the reranker throws", async () => {
		const reranker: RerankerPort = {
			async rerank() {
				throw new Error("boom");
			},
		};
		const out = await rerankResults(reranker, "q", results);
		expect(out.map((r) => r.chunk.content)).toEqual(["alpha", "beta", "gamma"]);
	});

	it("falls back when the reranker drops results", async () => {
		const reranker: RerankerPort = {
			async rerank(_q, candidates) {
				return [{ ...candidates[0], originalIndex: 0 }] as never;
			},
		};
		const out = await rerankResults(reranker, "q", results);
		expect(out).toEqual(results);
	});

	it("short-circuits for 0 or 1 result", async () => {
		const single = [results[0]];
		const out = await rerankResults(createNoopReranker(), "q", single);
		expect(out).toBe(single);
	});
});
