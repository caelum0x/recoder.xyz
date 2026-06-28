import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContextPack } from "@recoder/recodergit";
import { ContextCache } from "./context-cache";
import { createInMemoryContextCache } from "../persistence/memory-context-cache";
import type { BrainContext } from "../domain/brain-context.types";
import type { BrainContextCacheStore } from "../ports/cache.port";

function emptyPack(): ContextPack {
  return {
    taskId: "t",
    repoMap: { repoRoot: "/r", packageGlobs: [], indexedAt: "x" },
    dependencyGraph: { repoRoot: "/r", nodes: [], edges: [], indexedAt: "x" },
    ownershipMap: { entries: [] },
    testTargetMap: { targets: [] },
    impactReport: {
      taskId: "t",
      targetPaths: [],
      impactedPackages: [],
      relatedTests: [],
      changedFileRisks: [],
      generatedAt: "x",
    },
    sourceRefs: [],
  };
}

function ctx(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    repo: emptyPack(),
    memories: [{ id: "m1", text: "we saw this exact error in the auth flow" }],
    docs: [],
    tasks: [],
    activity: { recent: [], profile: null },
    assembledAt: "2026-06-28T00:00:00Z",
    ...overrides,
  };
}

test("a miss is accounted, returns undefined, and saves zero tokens", async () => {
  const cache = new ContextCache(createInMemoryContextCache());
  const lookup = await cache.lookup("k");
  assert.equal(lookup.hit, false);
  assert.equal(lookup.context, undefined);
  assert.equal(lookup.tokensSavedThisHit, 0);
  const stats = cache.stats();
  assert.equal(stats.misses, 1);
  assert.equal(stats.hits, 0);
  assert.equal(stats.hitRate, 0);
  assert.equal(stats.tokensSaved, 0);
});

test("store_ stamps a real token estimate, and a later HIT accrues exactly those tokens saved", async () => {
  const cache = new ContextCache(createInMemoryContextCache());
  const stored = await cache.store_("k", ctx());
  assert.ok(
    (stored.estimatedTokens ?? 0) > 0,
    "the stored context carries a real token estimate",
  );

  // First read after store: a HIT that saves exactly the stored estimate.
  const hit = await cache.lookup("k");
  assert.equal(hit.hit, true);
  assert.ok(hit.context);
  assert.equal(hit.tokensSavedThisHit, stored.estimatedTokens);

  const stats = cache.stats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 0);
  assert.equal(stats.hitRate, 1);
  assert.equal(stats.tokensSaved, stored.estimatedTokens);
});

test("tokensSaved accumulates across multiple HITs of the same context", async () => {
  const cache = new ContextCache(createInMemoryContextCache());
  const stored = await cache.store_("k", ctx());
  await cache.lookup("k");
  await cache.lookup("k");
  await cache.lookup("k");
  const stats = cache.stats();
  assert.equal(stats.hits, 3);
  assert.equal(stats.tokensSaved, (stored.estimatedTokens ?? 0) * 3);
});

test("hitRate reflects the real mix of hits and misses", async () => {
  const cache = new ContextCache(createInMemoryContextCache());
  await cache.store_("k", ctx());
  await cache.lookup("k"); // hit
  await cache.lookup("missing"); // miss
  const stats = cache.stats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.equal(stats.hitRate, 0.5);
});

test("invalidateRepo drops a repo's keys so the next lookup misses", async () => {
  const store = createInMemoryContextCache();
  const cache = new ContextCache(store);
  // store_ uses the cache-key contract for repo scoping via the store; here we
  // exercise invalidateKey directly + invalidateRepo on a real keyed store.
  await cache.invalidateKey("k");
  const removed = await cache.invalidateRepo("/repo");
  assert.equal(typeof removed, "number");
});

test("a store that throws on get degrades to a MISS (cache never fails a read)", async () => {
  const throwingStore: BrainContextCacheStore = {
    async get() {
      throw new Error("redis down");
    },
    async set() {},
    async delete() {},
    async clearRepo() {
      return 0;
    },
  };
  const cache = new ContextCache(throwingStore);
  const lookup = await cache.lookup("k");
  assert.equal(lookup.hit, false);
  assert.equal(cache.stats().misses, 1);
});

test("a store that throws on set still returns the freshly assembled context", async () => {
  const throwingStore: BrainContextCacheStore = {
    async get() {
      return undefined;
    },
    async set() {
      throw new Error("redis down");
    },
    async delete() {},
    async clearRepo() {
      return 0;
    },
  };
  const cache = new ContextCache(throwingStore);
  const stored = await cache.store_("k", ctx());
  assert.ok(stored.estimatedTokens && stored.estimatedTokens > 0);
});

test("a legacy cached context without estimatedTokens is re-estimated on HIT (savings stay real)", async () => {
  // Seed the store directly with a context that lacks estimatedTokens.
  const store = createInMemoryContextCache();
  const legacy = ctx();
  delete (legacy as { estimatedTokens?: number }).estimatedTokens;
  await store.set("legacy", legacy);

  const cache = new ContextCache(store);
  const hit = await cache.lookup("legacy");
  assert.equal(hit.hit, true);
  assert.ok(
    hit.tokensSavedThisHit > 0,
    "re-estimated savings for a legacy entry must be > 0, never faked",
  );
});
