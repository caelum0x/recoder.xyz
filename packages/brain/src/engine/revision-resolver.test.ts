import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRevision,
  NO_HEAD_SENTINEL,
  type GitRunner,
} from "./revision-resolver";
import type { ClockPort } from "../ports/clock.port";

const FIXED_CLOCK: ClockPort = {
  nowIso: () => "2026-06-28T12:00:00Z",
  nowMs: () => 1_790_000_000_000,
};

test("resolves a clean revision from git rev-parse + status", async () => {
  const calls: string[][] = [];
  const runGit: GitRunner = async (_repo, args) => {
    calls.push([...args]);
    if (args[0] === "rev-parse") return "abc123def\n";
    if (args[0] === "status") return ""; // clean tree
    return "";
  };
  const rev = await resolveRevision("/repo", { runGit, clock: FIXED_CLOCK });
  assert.equal(rev.head, "abc123def");
  assert.equal(rev.dirty, false);
  assert.equal(rev.resolvedAt, "2026-06-28T12:00:00Z");
  assert.deepEqual(calls[0], ["rev-parse", "HEAD"]);
  assert.deepEqual(calls[1], ["status", "--porcelain"]);
});

test("a non-empty status marks the revision dirty", async () => {
  const runGit: GitRunner = async (_repo, args) =>
    args[0] === "rev-parse" ? "sha\n" : " M src/a.ts\n?? new.ts\n";
  const rev = await resolveRevision("/repo", { runGit, clock: FIXED_CLOCK });
  assert.equal(rev.head, "sha");
  assert.equal(rev.dirty, true);
});

test("a thrown rev-parse degrades to the dirty sentinel (never throws)", async () => {
  const runGit: GitRunner = async () => {
    throw new Error("not a git repository");
  };
  const rev = await resolveRevision("/repo", { runGit, clock: FIXED_CLOCK });
  assert.equal(rev.head, NO_HEAD_SENTINEL);
  assert.equal(rev.dirty, true);
});

test("empty rev-parse output degrades to the dirty sentinel", async () => {
  const runGit: GitRunner = async (_repo, args) =>
    args[0] === "rev-parse" ? "  \n" : "";
  const rev = await resolveRevision("/repo", { runGit, clock: FIXED_CLOCK });
  assert.equal(rev.head, NO_HEAD_SENTINEL);
  assert.equal(rev.dirty, true);
});

test("a HEAD that resolves but a status that throws is treated as dirty (conservative)", async () => {
  const runGit: GitRunner = async (_repo, args) => {
    if (args[0] === "rev-parse") return "sha\n";
    throw new Error("status failed");
  };
  const rev = await resolveRevision("/repo", { runGit, clock: FIXED_CLOCK });
  assert.equal(rev.head, "sha");
  assert.equal(rev.dirty, true);
});
