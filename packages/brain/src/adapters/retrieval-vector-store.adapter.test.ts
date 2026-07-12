import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RetrievalVectorStore,
  createRetrievalVectorStore,
} from "./retrieval-vector-store.adapter";
import type {
  RetrievalSearchPort,
  RetrievalSearchResultLike,
} from "./retrieval-vector-store.adapter";

/** A fake retrieval engine that records calls and returns a canned result. */
function fakeEngine(
  result: RetrievalSearchResultLike | (() => Promise<RetrievalSearchResultLike>),
): RetrievalSearchPort & { calls: Array<{ query: string; topK?: number }> } {
  const calls: Array<{ query: string; topK?: number }> = [];
  return {
    calls,
    async search(query, topK) {
      calls.push({ query, topK });
      return typeof result === "function" ? result() : result;
    },
  };
}

test("maps retrieval passages through the port to BrainPassage[] (provenance preserved)", async () => {
  const engine = fakeEngine({
    status: "ok",
    passages: [
      {
        id: "p1",
        text: "the answer is 42",
        score: 0.87,
        source: "guide.md",
        docId: "doc_1",
        chunkIndex: 3,
        payload: { source: "guide.md", docId: "doc_1", chunkIndex: 3, extra: "x" },
      },
    ],
  });
  const store = createRetrievalVectorStore({ engine });

  const passages = await store.search("what is the answer", 5);

  assert.equal(passages.length, 1);
  assert.deepEqual(passages[0], {
    text: "the answer is 42",
    similarity: 0.87,
    documentKey: "doc_1",
    title: "guide.md",
    metadata: { source: "guide.md", docId: "doc_1", chunkIndex: 3, extra: "x" },
  });
  // by-text contract: engine is asked with the query + a positive topK.
  assert.deepEqual(engine.calls, [{ query: "what is the answer", topK: 5 }]);
});

test("omits optional provenance fields the engine did not provide", async () => {
  const engine = fakeEngine({
    status: "ok",
    passages: [{ id: 7, text: "bare passage", score: 0.5 }],
  });
  const store = createRetrievalVectorStore({ engine });

  const passages = await store.search("q", 3);

  assert.deepEqual(passages, [{ text: "bare passage", similarity: 0.5 }]);
  assert.equal("documentKey" in passages[0], false);
  assert.equal("title" in passages[0], false);
  assert.equal("metadata" in passages[0], false);
});

test("clamps out-of-range scores into the [0,1] similarity the port contracts", async () => {
  const engine = fakeEngine({
    status: "ok",
    passages: [
      { id: 1, text: "over", score: 1.42 },
      { id: 2, text: "under", score: -0.3 },
      { id: 3, text: "nan", score: Number.NaN },
    ],
  });
  const store = createRetrievalVectorStore({ engine });

  const passages = await store.search("q", 10);

  assert.deepEqual(
    passages.map((p) => p.similarity),
    [1, 0, 0],
  );
});

test("degrades to [] when the engine reports not_configured (no embedder / no QDRANT_URL)", async () => {
  const engine = fakeEngine({
    status: "not_configured",
    passages: [],
    reason: "retrieval not configured (no embedder and/or vector store available)",
  });
  const store = createRetrievalVectorStore({ engine });

  const passages = await store.search("anything", 5);

  assert.deepEqual(passages, []);
  // The engine WAS consulted (truthful) — it just returned unconfigured.
  assert.equal(engine.calls.length, 1);
});

test("degrades to [] and never throws when the injected engine throws", async () => {
  const engine = fakeEngine(async () => {
    throw new Error("boom");
  });
  const store = createRetrievalVectorStore({ engine });

  const passages = await store.search("anything", 5);
  assert.deepEqual(passages, []);
});

test("empty / whitespace query is a no-op — the engine is never called", async () => {
  const engine = fakeEngine({ status: "ok", passages: [] });
  const store = createRetrievalVectorStore({ engine });

  assert.deepEqual(await store.search("", 5), []);
  assert.deepEqual(await store.search("   ", 5), []);
  assert.equal(engine.calls.length, 0);
});

test("normalizes a non-positive limit to a sane topK and truncates to it", async () => {
  const engine = fakeEngine({
    status: "ok",
    passages: Array.from({ length: 12 }, (_, i) => ({
      id: i,
      text: `p${i}`,
      score: 0.9,
    })),
  });
  const store = new RetrievalVectorStore({ engine });

  // limit 0 -> default topK 8, and results are capped to it.
  const passages = await store.search("q", 0);
  assert.equal(passages.length, 8);
  assert.deepEqual(engine.calls[0], { query: "q", topK: 8 });
});
