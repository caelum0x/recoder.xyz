import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMem0Memory,
  buildMem0Request,
} from "../memory/mem0-memory";
import type {
  Mem0Request,
  Mem0Response,
  Mem0Transport,
} from "../memory/mem0-memory";

const ok = (text: string): Mem0Response => ({ ok: true, status: 200, text });

test("recall maps mem0 search results to BrainMemory[]", async () => {
  const transport: Mem0Transport = async () =>
    ok(
      JSON.stringify({
        results: [
          {
            id: "m1",
            memory: "prefers pnpm over npm",
            score: 0.91,
            metadata: { topic: "tooling" },
          },
          { id: "m2", memory: "deploys via PM2", score: 0.5 },
        ],
      }),
    );

  const memory = createMem0Memory({ transport, baseUrl: "http://mem0:8888" });
  const rows = await memory.recall("how does the user deploy", 5);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: "m1",
    text: "prefers pnpm over npm",
    score: 0.91,
    metadata: { topic: "tooling" },
  });
  assert.deepEqual(rows[1], { id: "m2", text: "deploys via PM2", score: 0.5 });
});

test("recall builds a POST /search with query, top_k and user filter", async () => {
  const captured: Mem0Request[] = [];
  const transport: Mem0Transport = async (request) => {
    captured.push(request);
    return ok(JSON.stringify({ results: [] }));
  };

  const memory = createMem0Memory({
    transport,
    baseUrl: "http://mem0:8888/",
    apiKey: "k-123",
    userId: "arhan",
  });
  await memory.recall("hello", 7);

  assert.equal(captured.length, 1);
  const request = captured[0];
  assert.equal(request.method, "POST");
  assert.equal(request.url, "http://mem0:8888/search");
  assert.equal(request.headers["X-API-Key"], "k-123");
  assert.deepEqual(JSON.parse(request.body), {
    query: "hello",
    top_k: 7,
    filters: { user_id: "arhan" },
  });
});

test("recall accepts a bare results array and drops textless hits", async () => {
  const transport: Mem0Transport = async () =>
    ok(JSON.stringify([{ id: "a", memory: "kept" }, { id: "b" }]));
  const memory = createMem0Memory({ transport, baseUrl: "http://mem0:8888" });
  const rows = await memory.recall("x", 3);
  assert.deepEqual(rows, [{ id: "a", text: "kept" }]);
});

test("remember posts the correct add shape to /memories", async () => {
  const captured: Mem0Request[] = [];
  const transport: Mem0Transport = async (request) => {
    captured.push(request);
    return ok(JSON.stringify({ results: [] }));
  };

  const memory = createMem0Memory({
    transport,
    baseUrl: "http://mem0:8888",
    userId: "arhan",
  });
  await memory.remember("the build OOMs on the Hetzner box", { kind: "lesson" });

  assert.equal(captured.length, 1);
  const request = captured[0];
  assert.equal(request.url, "http://mem0:8888/memories");
  assert.deepEqual(JSON.parse(request.body), {
    messages: [{ role: "user", content: "the build OOMs on the Hetzner box" }],
    user_id: "arhan",
    metadata: { kind: "lesson" },
  });
});

test("remember omits metadata when none is given", async () => {
  let body = "";
  const transport: Mem0Transport = async (request) => {
    body = request.body;
    return ok("{}");
  };
  const memory = createMem0Memory({ transport, baseUrl: "http://mem0:8888" });
  await memory.remember("a bare fact");
  assert.deepEqual(JSON.parse(body), {
    messages: [{ role: "user", content: "a bare fact" }],
    user_id: "recoder",
  });
});

test("recall degrades to [] when the transport throws", async () => {
  const transport: Mem0Transport = async () => {
    throw new Error("ECONNREFUSED");
  };
  const memory = createMem0Memory({ transport, baseUrl: "http://mem0:8888" });
  assert.deepEqual(await memory.recall("anything", 3), []);
});

test("recall degrades to [] on non-200", async () => {
  const transport: Mem0Transport = async () => ({
    ok: false,
    status: 401,
    text: '{"detail":"unauthorized"}',
  });
  const memory = createMem0Memory({ transport, baseUrl: "http://mem0:8888" });
  assert.deepEqual(await memory.recall("x", 1), []);
});

test("recall degrades to [] on unparseable JSON", async () => {
  const transport: Mem0Transport = async () => ok("not json at all");
  const memory = createMem0Memory({ transport, baseUrl: "http://mem0:8888" });
  assert.deepEqual(await memory.recall("x", 1), []);
});

test("remember never throws when the transport throws", async () => {
  const transport: Mem0Transport = async () => {
    throw new Error("server down");
  };
  const memory = createMem0Memory({ transport, baseUrl: "http://mem0:8888" });
  await assert.doesNotReject(() => memory.remember("x", { a: 1 }));
});

test("missing base url degrades: recall [] and remember no-op (no transport call)", async () => {
  let calls = 0;
  const transport: Mem0Transport = async () => {
    calls += 1;
    return ok("{}");
  };
  const memory = createMem0Memory({ transport, baseUrl: "" });
  assert.deepEqual(await memory.recall("x", 1), []);
  await memory.remember("y");
  assert.equal(calls, 0);
});

test("buildMem0Request omits X-API-Key when no key is configured", () => {
  const request = buildMem0Request("http://mem0:8888", "", "/search", {
    query: "q",
  });
  assert.equal(request.headers["X-API-Key"], undefined);
  assert.equal(request.headers["content-type"], "application/json");
});
