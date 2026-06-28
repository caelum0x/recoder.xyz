import { test } from "node:test";
import assert from "node:assert/strict";
import { runSource } from "./source-runner";
import type { BrainMemory } from "../domain/memory.types";

function memInput(run: (() => Promise<BrainMemory[]>) | null) {
  return {
    source: "memory" as const,
    run,
    fallback: [] as BrainMemory[],
    countItems: (rows: BrainMemory[]) => rows.length,
    configuredDetail: "mem0 recall",
    notConfiguredDetail: "memory port not wired",
  };
}

test("an unwired source is not_configured and never runs anything", async () => {
  const out = await runSource(memInput(null));
  assert.deepEqual(out.value, []);
  assert.equal(out.provenance.contributed, false);
  assert.equal(out.provenance.degradeReason, "not_configured");
  assert.match(out.provenance.detail, /not wired/);
});

test("a source that returns items contributes with a truthful count", async () => {
  const out = await runSource(
    memInput(async () => [
      { id: "m1", text: "a" },
      { id: "m2", text: "b" },
    ]),
  );
  assert.equal(out.value.length, 2);
  assert.equal(out.provenance.contributed, true);
  assert.equal(out.provenance.itemCount, 2);
  assert.equal(out.provenance.degradeReason, undefined);
  assert.match(out.provenance.detail, /2 item/);
});

test("a source that returns nothing is honestly 'empty', not 'contributed'", async () => {
  const out = await runSource(memInput(async () => []));
  assert.equal(out.provenance.contributed, false);
  assert.equal(out.provenance.degradeReason, "empty");
  assert.equal(out.provenance.itemCount, 0);
});

test("a source that throws degrades to the fallback + 'unavailable' (never throws)", async () => {
  const out = await runSource(
    memInput(async () => {
      throw new Error("mem0 unreachable");
    }),
  );
  assert.deepEqual(out.value, []);
  assert.equal(out.provenance.contributed, false);
  assert.equal(out.provenance.degradeReason, "unavailable");
  assert.match(out.provenance.detail, /mem0 unreachable/);
});
