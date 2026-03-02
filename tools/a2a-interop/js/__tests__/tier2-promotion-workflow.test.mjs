import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const SCRIPT = resolve(ROOT, "tools/a2a-interop/js/tier2-promotion-workflow.mjs");

function run(args) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
  });
}

function writeArtifacts(baseDir, connectorStatus = "backlog", gateOverrides = {}) {
  const phase3Dir = resolve(baseDir, "phase3");
  const releaseDir = resolve(baseDir, "release");
  mkdirSync(phase3Dir, { recursive: true });
  mkdirSync(releaseDir, { recursive: true });

  const phase3Path = resolve(phase3Dir, "x-connectors-support.json");
  const releasePath = resolve(releaseDir, "x-connectors-support.json");

  const phase3 = {
    support_gate_inputs: {
      support_gates_pass: false,
      no_skip_closeout_precondition: false,
      ...gateOverrides,
    },
    connectors: [
      { id: "cursor", tier: "tier2", status: connectorStatus, reason: "fixture" },
      { id: "windsurf", tier: "tier2", status: "backlog", reason: "fixture" },
      { id: "replit", tier: "tier2", status: "backlog", reason: "fixture" },
      { id: "vscode-copilot", tier: "tier2", status: "backlog", reason: "fixture" },
      { id: "jetbrains", tier: "tier2", status: "backlog", reason: "fixture" },
    ],
  };

  const release = {
    connectors: phase3.connectors,
  };

  writeFileSync(phase3Path, JSON.stringify(phase3, null, 2));
  writeFileSync(releasePath, JSON.stringify(release, null, 2));
  return { phase3Path, releasePath };
}

test("status returns initialized backlog state", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tier2-workflow-status-"));
  const stateFile = resolve(tmp, "state.json");
  const res = run(["status", "--state-file", stateFile, "--json"]);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const json = JSON.parse(res.stdout);
  assert.equal(Array.isArray(json.connectors), true);
  assert.equal(json.connectors.length, 5);
  assert.equal(json.connectors.every((row) => row.stage === "backlog"), true);
});

test("validate backlog->pilot fails when tier1/no-skip gates are false", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tier2-workflow-fail-"));
  const stateFile = resolve(tmp, "state.json");
  const { phase3Path, releasePath } = writeArtifacts(tmp, "backlog", {
    support_gates_pass: false,
    no_skip_closeout_precondition: false,
  });

  const res = run([
    "validate",
    "--connector",
    "cursor",
    "--to",
    "pilot",
    "--phase3",
    phase3Path,
    "--release",
    releasePath,
    "--state-file",
    stateFile,
    "--json",
  ]);
  assert.equal(res.status, 1);
  const json = JSON.parse(res.stdout);
  assert.equal(json.ok, false);
  assert.match(JSON.stringify(json.errors), /Tier-1 support gates are not passing/);
});

test("transition backlog->pilot applies when gates pass", () => {
  const tmp = mkdtempSync(join(tmpdir(), "tier2-workflow-pass-"));
  const stateFile = resolve(tmp, "state.json");
  const { phase3Path, releasePath } = writeArtifacts(tmp, "backlog", {
    support_gates_pass: true,
    no_skip_closeout_precondition: true,
  });

  const res = run([
    "transition",
    "--connector",
    "cursor",
    "--to",
    "pilot",
    "--apply",
    "--approved-by",
    "test-bot",
    "--reason",
    "pilot request approved",
    "--phase3",
    phase3Path,
    "--release",
    releasePath,
    "--state-file",
    stateFile,
    "--json",
  ]);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const json = JSON.parse(res.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.transition.to, "pilot");

  const state = JSON.parse(readFileSync(stateFile, "utf-8"));
  const cursor = state.connectors.find((row) => row.id === "cursor");
  assert.equal(cursor.stage, "pilot");
  assert.equal(cursor.history.length, 1);
});
