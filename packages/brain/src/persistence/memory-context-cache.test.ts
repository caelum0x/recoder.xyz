import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack } from "@recoder/recodergit";
import { InMemoryContextCache } from "./memory-context-cache";
import { buildCacheKey } from "../engine/cache-key";
import type { BrainContext } from "../domain/brain-context.types";
import type { Revision } from "../domain/revision";

const REV: Revision = {
  head: "abc",
  dirty: false,
  resolvedAt: "2026-06-28T00:00:00Z",
};

function ctx(): BrainContext {
  return {
    repo: {} as ContextPack,
    memories: [],
    docs: [],
    tasks: [],
    activity: { recent: [], profile: null },
    assembledAt: "2026-06-28T00:00:00Z",
  };
}

function keyFor(repoRoot: string, task: string): string {
  return buildCacheKey({
    repoRoot,
    task,
    focusFiles: [],
    limit: 8,
    revision: REV,
    sourceSet: ["repo"],
  });
}

test("get/set/delete round-trip", async () => {
  const cache = new InMemoryContextCache();
  const k = keyFor("/repo", "a");
  assert.equal(await cache.get(k), undefined);
  await cache.set(k, ctx());
  assert.ok(await cache.get(k));
  await cache.delete(k);
  assert.equal(await cache.get(k), undefined);
});

test("clearRepo removes only the target repo's keys", async () => {
  const cache = new InMemoryContextCache();
  await cache.set(keyFor("/repo-a", "1"), ctx());
  await cache.set(keyFor("/repo-a", "2"), ctx());
  await cache.set(keyFor("/repo-b", "1"), ctx());

  const removed = await cache.clearRepo("/repo-a");
  assert.equal(removed, 2);
  assert.equal(await cache.get(keyFor("/repo-a", "1")), undefined);
  assert.ok(await cache.get(keyFor("/repo-b", "1")), "other repo untouched");
});

test("maxEntries evicts the oldest-inserted entry (FIFO bound)", async () => {
  const cache = new InMemoryContextCache({ maxEntries: 2 });
  const k1 = keyFor("/r", "1");
  const k2 = keyFor("/r", "2");
  const k3 = keyFor("/r", "3");
  await cache.set(k1, ctx());
  await cache.set(k2, ctx());
  await cache.set(k3, ctx()); // evicts k1
  assert.equal(cache.size(), 2);
  assert.equal(await cache.get(k1), undefined);
  assert.ok(await cache.get(k2));
  assert.ok(await cache.get(k3));
});

test("overwriting an existing key does not trip eviction", async () => {
  const cache = new InMemoryContextCache({ maxEntries: 1 });
  const k = keyFor("/r", "1");
  await cache.set(k, ctx());
  await cache.set(k, ctx()); // same key — overwrite, still size 1
  assert.equal(cache.size(), 1);
  assert.ok(await cache.get(k));
});
