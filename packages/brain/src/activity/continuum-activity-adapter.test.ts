// Real-engine tests for the in-process continuum activity adapter.
//
// No mocks: these run the REAL @recoder/continuum engine against a real temp store
// (CONTINUUM_DATA), seeding real episodes in continuum's on-disk ndjson format and asserting
// real recall/recent/profile/snapshot output. The previous version mocked a subprocess `exec`;
// the shell-out is gone (F2), so this exercises the actual fused engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point continuum at a fresh temp store BEFORE the engine is first imported. The adapter
// only type-imports continuum (erased at runtime) and lazy-imports the engine on first use,
// so config.mjs reads this CONTINUUM_DATA at that first call — not at this file's import.
const DATA_DIR = mkdtempSync(join(tmpdir(), "recoder-continuum-"));
process.env["CONTINUUM_DATA"] = DATA_DIR;
const STORE = join(DATA_DIR, "episodes.ndjson");

// Constructing the concrete class (not the factory) gives typed access to recent()/snapshot().
// createContinuumActivity has no import side effects (type-only continuum import is erased).
import { ContinuumActivity } from "../activity/continuum-activity-adapter";

// Write a real episode in continuum's ndjson format (one JSON object per line) — the exact
// shape loadEpisodes() parses from disk. appendEpisode is the daemon's own writer; replicating
// the on-disk line here keeps the test free of a write-path import and exercises the real read.
function writeEpisode(ep: Record<string, unknown>): void {
  appendFileSync(STORE, JSON.stringify(ep) + "\n");
}

test("empty store degrades gracefully (real engine, no episodes written)", async () => {
  const activity = new ContinuumActivity();
  // First call lazy-imports the engine → reads the temp CONTINUUM_DATA → no episodes file → [].
  assert.deepEqual(await activity.recall("anything", 5), []);
  assert.deepEqual(await activity.recent(), []);
  assert.equal(await activity.snapshot(), null);
});

test("populated store: recall maps real engine rows to BrainActivity", async () => {
  writeEpisode({
    start: Date.now() - 2000,
    end: Date.now() - 1500,
    app: "Terminal",
    text: "deployed the recoder brain to production",
    source_mix: ["terminal"],
    content_hash: "c1",
  });
  writeEpisode({
    start: Date.now() - 1000,
    end: Date.now(),
    app: "VS Code",
    text: "edited the continuum activity adapter",
    source_mix: ["editor"],
    content_hash: "c2",
  });

  const activity = new ContinuumActivity();
  const rows = await activity.recall("continuum", 5);

  // Lexical recall matches the episode whose text contains "continuum".
  assert.ok(rows.length >= 1, "recall should return at least the matching episode");
  const match = rows.find((r) => r.app === "VS Code");
  assert.ok(match, "the VS Code episode should be recalled");
  assert.equal(match?.who, "you");
  assert.equal(match?.type, "unknown"); // no label.type set → engine default
  assert.ok(match?.id.startsWith("ep_"));
});

test("recent (catchUp) returns all recent episodes newest-first", async () => {
  const activity = new ContinuumActivity();
  const rows = await activity.recent(12);
  assert.equal(rows.length, 2);
  // Newest first: the VS Code episode (c2) has the later end time.
  assert.equal(rows[0].app, "VS Code");
  assert.equal(rows[1].app, "Terminal");
});

test("profile maps the real heuristic profile (apps/recurring)", async () => {
  const activity = new ContinuumActivity();
  const profile = await activity.profile();
  assert.ok(profile);
  assert.equal(profile?.kind, "heuristic"); // no llm configured → heuristic
  assert.ok(profile?.apps.includes("Terminal"));
  assert.ok(profile?.apps.includes("VS Code"));
});

test("snapshot returns a real one-line user snapshot", async () => {
  const activity = new ContinuumActivity();
  const snap = await activity.snapshot();
  assert.ok(snap);
  assert.ok(
    snap!.toLowerCase().includes("terminal") || snap!.toLowerCase().includes("vs code"),
  );
});

test("answer returns real evidence sources (and null answer without an LLM)", async () => {
  const activity = new ContinuumActivity();
  const result = await activity.answer("continuum adapter", 5);
  // No llm wired → synthesized answer is null; sources are always real recall rows.
  assert.equal(result.answer, null);
  assert.ok(result.sources.length >= 1, "answer should ground in at least one episode");
  assert.ok(result.sources.some((r) => r.app === "VS Code"));
});

