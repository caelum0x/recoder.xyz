import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCacheKey, repoKeyPrefix, type CacheKeyInput } from "./cache-key";
import type { Revision } from "../domain/revision";

const REV: Revision = {
  head: "abc123",
  dirty: false,
  resolvedAt: "2026-06-28T00:00:00Z",
};

function input(overrides: Partial<CacheKeyInput> = {}): CacheKeyInput {
  return {
    repoRoot: "/repo",
    task: "fix the bug",
    focusFiles: ["src/a.ts"],
    limit: 8,
    revision: REV,
    sourceSet: ["repo", "memory"],
    ...overrides,
  };
}

test("same inputs produce the same key (deterministic)", () => {
  assert.equal(buildCacheKey(input()), buildCacheKey(input()));
});

test("key is order-independent in focusFiles and sourceSet", () => {
  const a = buildCacheKey(
    input({ focusFiles: ["a.ts", "b.ts"], sourceSet: ["repo", "memory"] }),
  );
  const b = buildCacheKey(
    input({ focusFiles: ["b.ts", "a.ts"], sourceSet: ["memory", "repo"] }),
  );
  assert.equal(a, b);
});

test("a new git HEAD changes the key (invalidates stale repo intel)", () => {
  const atHead1 = buildCacheKey(input({ revision: { ...REV, head: "head1" } }));
  const atHead2 = buildCacheKey(input({ revision: { ...REV, head: "head2" } }));
  assert.notEqual(atHead1, atHead2);
});

test("dirty flag changes the key (a working-tree edit is not the committed rev)", () => {
  const clean = buildCacheKey(input({ revision: { ...REV, dirty: false } }));
  const dirty = buildCacheKey(input({ revision: { ...REV, dirty: true } }));
  assert.notEqual(clean, dirty);
});

test("taskId, task text, limit, and source-set each affect the key", () => {
  const baseKey = buildCacheKey(input());
  assert.notEqual(baseKey, buildCacheKey(input({ taskId: "task-1" })));
  assert.notEqual(baseKey, buildCacheKey(input({ task: "different" })));
  assert.notEqual(baseKey, buildCacheKey(input({ limit: 16 })));
  assert.notEqual(baseKey, buildCacheKey(input({ sourceSet: ["repo"] })));
});

test("different repos never collide and carry a repo-scoped prefix", () => {
  const a = buildCacheKey(input({ repoRoot: "/repo-a" }));
  const b = buildCacheKey(input({ repoRoot: "/repo-b" }));
  assert.notEqual(a, b);
  assert.ok(a.startsWith(repoKeyPrefix("/repo-a")));
  assert.ok(b.startsWith(repoKeyPrefix("/repo-b")));
});

test("repoKeyPrefix matches the prefix the full key emits (clearRepo contract)", () => {
  const key = buildCacheKey(input({ repoRoot: "/some/repo" }));
  assert.ok(key.startsWith(repoKeyPrefix("/some/repo")));
});
