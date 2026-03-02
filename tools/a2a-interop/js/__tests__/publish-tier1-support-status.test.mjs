import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const SCRIPT = resolve(ROOT, "tools/a2a-interop/js/publish-tier1-support-status.mjs");

function run(args, cwd = ROOT) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd,
    encoding: "utf-8",
  });
}

function makeArtifact(path, status = "experimental") {
  const payload = {
    generated_at_utc: "2026-02-25T00:00:00Z",
    support_gate_inputs: {
      release_evidence: "PASS",
      smoke_phase1: "PASS",
      smoke_queue: "PASS",
      smoke_static: "PASS",
      a2a_interop: "PASS",
      ga_ready: false,
      support_gates_pass: false,
    },
    connectors: [
      { id: "codex", tier: "tier1", status, reason: "test reason codex" },
      { id: "claude", tier: "tier1", status, reason: "test reason claude" },
      { id: "cursor", tier: "tier2", status: "backlog", reason: "deferred" },
    ],
  };
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

test("publishes tier-1 block into target ledger file", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tier1-publish-"));
  const artifactsDir = resolve(tmp, "logs");
  mkdirSync(artifactsDir, { recursive: true });
  const phase3Path = resolve(artifactsDir, "phase3-connectors-support.json");
  const targetPath = resolve(tmp, "SUPPORTED_CONNECTORS.md");

  makeArtifact(phase3Path, "supported");
  writeFileSync(targetPath, "# Supported Connectors Ledger\n\n");

  const result = run(["--phase3", phase3Path, "--target", targetPath, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const next = readFileSync(targetPath, "utf-8");
  assert.match(next, /AUTO-PUBLISHED:TIER1-STATUS:START/);
  assert.match(next, /\| `codex` \| tier1 \| supported \|/);
  assert.match(next, /\| `claude` \| tier1 \| supported \|/);
});

test("--check fails when target is stale and passes after publish", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tier1-check-"));
  const artifactsDir = resolve(tmp, "logs");
  mkdirSync(artifactsDir, { recursive: true });
  const phase3Path = resolve(artifactsDir, "phase3-connectors-support.json");
  const targetPath = resolve(tmp, "SUPPORTED_CONNECTORS.md");

  makeArtifact(phase3Path, "experimental");
  writeFileSync(targetPath, "# Supported Connectors Ledger\n\n");

  const staleCheck = run(["--phase3", phase3Path, "--target", targetPath, "--check"]);
  assert.equal(staleCheck.status, 1);

  const publish = run(["--phase3", phase3Path, "--target", targetPath]);
  assert.equal(publish.status, 0, publish.stderr || publish.stdout);

  const freshCheck = run(["--phase3", phase3Path, "--target", targetPath, "--check"]);
  assert.equal(freshCheck.status, 0, freshCheck.stderr || freshCheck.stdout);
});
