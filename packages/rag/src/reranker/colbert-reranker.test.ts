import { describe, expect, it, vi } from "vitest";
import { createColbertReranker } from "./colbert-reranker";
import { createNoopReranker } from "./noop-reranker";

const candidates = [
	{ text: "alpha", score: 0.9 },
	{ text: "beta", score: 0.8 },
	{ text: "gamma", score: 0.7 },
];

describe("createColbertReranker", () => {
	it("is a no-op when no URL is configured", async () => {
		const reranker = createColbertReranker({ url: undefined });
		const out = await reranker.rerank("q", candidates);
		expect(out.map((c) => c.text)).toEqual(["alpha", "beta", "gamma"]);
		expect(out.every((c) => c.rerankScore === undefined)).toBe(true);
	});

	it("reorders candidates by late-interaction score", async () => {
		const fetchImpl = vi.fn(async () =>
			new Response(
				JSON.stringify({
					results: [
						{ index: 2, score: 9.1 },
						{ index: 0, score: 3.2 },
						{ index: 1, score: 1.0 },
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		) as unknown as typeof fetch;

		const reranker = createColbertReranker({
			url: "http://localhost/rerank",
			fetchImpl,
		});
		const out = await reranker.rerank("q", candidates);
		expect(out.map((c) => c.text)).toEqual(["gamma", "alpha", "beta"]);
		expect(out[0]?.rerankScore).toBe(9.1);
		expect(out[0]?.originalIndex).toBe(2);
	});

	it("falls back to original order on non-2xx", async () => {
		const fetchImpl = vi.fn(
			async () => new Response("nope", { status: 503 }),
		) as unknown as typeof fetch;
		const reranker = createColbertReranker({
			url: "http://localhost/rerank",
			fetchImpl,
		});
		const out = await reranker.rerank("q", candidates);
		expect(out.map((c) => c.text)).toEqual(["alpha", "beta", "gamma"]);
	});

	it("falls back to original order when the service is unreachable", async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;
		const reranker = createColbertReranker({
			url: "http://localhost/rerank",
			fetchImpl,
		});
		const out = await reranker.rerank("q", candidates);
		expect(out.map((c) => c.text)).toEqual(["alpha", "beta", "gamma"]);
	});

	it("falls back on malformed response without throwing", async () => {
		const fetchImpl = vi.fn(async () =>
			new Response(JSON.stringify({ results: [{ index: 99, score: 1 }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		) as unknown as typeof fetch;
		const reranker = createColbertReranker({
			url: "http://localhost/rerank",
			fetchImpl,
		});
		const out = await reranker.rerank("q", candidates);
		expect(out.map((c) => c.text)).toEqual(["alpha", "beta", "gamma"]);
	});
});

describe("createNoopReranker", () => {
	it("preserves order and assigns originalIndex", async () => {
		const out = await createNoopReranker().rerank("q", candidates);
		expect(out.map((c) => c.originalIndex)).toEqual([0, 1, 2]);
	});
});
