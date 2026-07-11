import { test } from "node:test";
import assert from "node:assert/strict";
import { createInProcessMemory, InProcessMemory } from "./in-process-memory";

test("recall returns [] on an empty store", async () => {
  const mem = createInProcessMemory();
  const results = await mem.recall("anything", 5);
  assert.deepEqual(results, []);
});

test("remember stores a memory; recall returns it on a matching query", async () => {
  const mem = createInProcessMemory();
  await mem.remember("prefers pnpm over npm");
  const results = await mem.recall("pnpm", 5);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.text, "prefers pnpm over npm");
  assert.ok(results[0]!.id, "id is populated");
});

test("recall is case-insensitive", async () => {
  const mem = createInProcessMemory();
  await mem.remember("Deploys via PM2 on Hetzner");
  const results = await mem.recall("pm2", 5);
  assert.equal(results.length, 1);
});

test("recall returns up to limit results", async () => {
  const mem = createInProcessMemory();
  await mem.remember("auth flow is broken");
  await mem.remember("auth token expired");
  await mem.remember("auth middleware missing");
  const results = await mem.recall("auth", 2);
  assert.equal(results.length, 2);
});

test("recall returns [] when no stored memory matches the query", async () => {
  const mem = createInProcessMemory();
  await mem.remember("prefers pnpm over npm");
  const results = await mem.recall("rust cargo", 5);
  assert.deepEqual(results, []);
});

test("remember stores metadata alongside the text", async () => {
  const mem = createInProcessMemory();
  await mem.remember("OOM during Next build", { kind: "lesson", severity: "high" });
  const results = await mem.recall("OOM", 1);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0]!.metadata, { kind: "lesson", severity: "high" });
});

test("remember with empty text is a no-op (size stays 0)", async () => {
  const mem = createInProcessMemory();
  await mem.remember("");
  assert.equal(mem.size(), 0);
});

test("remember never throws (degrade-safe)", async () => {
  const mem = createInProcessMemory();
  await assert.doesNotReject(() => mem.remember("x"));
});

test("recall never throws even on empty query (degrade-safe)", async () => {
  const mem = createInProcessMemory();
  await mem.remember("something");
  const results = await mem.recall("", 5);
  assert.deepEqual(results, []);
});

test("each remember call produces a unique id (immutable, no collision)", async () => {
  const mem = createInProcessMemory();
  await mem.remember("fact A");
  await mem.remember("fact B");
  assert.equal(mem.size(), 2);
  // Both entries are independently recalled.
  const all = await mem.recall("fact", 10);
  assert.equal(all.length, 2);
  const ids = new Set(all.map((m) => m.id));
  assert.equal(ids.size, 2, "each memory has a unique id");
});

test("InProcessMemory satisfies the MemoryPort contract (recall + remember)", async () => {
  const mem: import("../ports/memory.port").MemoryPort = new InProcessMemory();
  await mem.remember("brain fusion complete");
  const rows = await mem.recall("brain", 3);
  assert.equal(rows[0]!.text, "brain fusion complete");
});
