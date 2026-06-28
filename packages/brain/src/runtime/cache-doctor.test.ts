import { test } from "node:test";
import assert from "node:assert/strict";
import { runCacheDoctor } from "./cache-doctor";
import type { CacheStats } from "../engine/context-cache";

function stats(overrides: Partial<CacheStats> = {}): CacheStats {
  return { hits: 0, misses: 0, hitRate: 0, tokensSaved: 0, ...overrides };
}

test("with no reads, the doctor is honestly unavailable (not a fake '0 saved, all good')", () => {
  const report = runCacheDoctor(stats());
  assert.equal(report.available, false);
  assert.equal(report.tokensSaved, 0);
  assert.match(report.detail, /not yet read/);
});

test("surfaces the headline metric: tokens saved + hit rate", () => {
  const report = runCacheDoctor(
    stats({ hits: 3, misses: 1, hitRate: 0.75, tokensSaved: 4200 }),
  );
  assert.equal(report.available, true);
  assert.equal(report.tokensSaved, 4200);
  assert.equal(report.hits, 3);
  assert.equal(report.misses, 1);
  assert.equal(report.hitRate, 0.75);
  assert.match(report.detail, /4200 tokens/);
  assert.match(report.detail, /75% reuse/);
});

test("a read with only misses is available but reports zero savings (truthful)", () => {
  const report = runCacheDoctor(stats({ misses: 2, hitRate: 0 }));
  assert.equal(report.available, true);
  assert.equal(report.tokensSaved, 0);
  assert.match(report.detail, /0 hit/);
});
