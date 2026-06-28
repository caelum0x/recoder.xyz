import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProvenance } from "./provenance-builder";
import type { SourceProvenance } from "../domain/provenance";

function entry(
  source: SourceProvenance["source"],
  contributed: boolean,
  itemCount = contributed ? 1 : 0,
): SourceProvenance {
  return contributed
    ? { source, contributed: true, itemCount, detail: `${source} ok` }
    : {
        source,
        contributed: false,
        itemCount,
        degradeReason: "not_configured",
        detail: `${source} dark`,
      };
}

test("entries are ordered repo, memory, docs, tasks, activity", () => {
  const prov = buildProvenance([
    entry("activity", false),
    entry("repo", true),
    entry("tasks", false),
    entry("memory", true),
    entry("docs", false),
  ]);
  assert.deepEqual(
    prov.sources.map((s) => s.source),
    ["repo", "memory", "docs", "tasks", "activity"],
  );
});

test("degraded is exactly the non-contributing subset (truthful)", () => {
  const prov = buildProvenance([
    entry("repo", true),
    entry("memory", false),
    entry("docs", true),
    entry("tasks", false),
    entry("activity", false),
  ]);
  assert.deepEqual(
    prov.degraded.map((s) => s.source),
    ["memory", "tasks", "activity"],
  );
  // Contributors are never listed as degraded.
  assert.ok(!prov.degraded.some((s) => s.source === "repo"));
  assert.ok(!prov.degraded.some((s) => s.source === "docs"));
});

test("all-contributing yields an empty degraded list", () => {
  const prov = buildProvenance([
    entry("repo", true),
    entry("memory", true),
    entry("docs", true),
    entry("tasks", true),
    entry("activity", true),
  ]);
  assert.equal(prov.degraded.length, 0);
});
