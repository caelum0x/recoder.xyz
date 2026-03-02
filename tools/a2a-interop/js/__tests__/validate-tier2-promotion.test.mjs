import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const SCRIPT = resolve(ROOT, "tools/a2a-interop/js/validate-tier2-promotion.mjs");

function run(args) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
  });
}

test("supports --all --json and returns 5 Tier-2 connectors", () => {
  const result = run(["--all", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.mode, "checklist");
  assert.equal(Array.isArray(json.results), true);
  assert.equal(json.results.length, 5);
  for (const row of json.results) {
    assert.equal(typeof row.connectorId, "string");
    assert.equal(typeof row.ok, "boolean");
  }
});

test("supports single-connector validation in checklist mode", () => {
  const result = run(["--connector", "cursor", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.results.length, 1);
  assert.equal(json.results[0].connectorId, "cursor");
  assert.equal(json.mode, "checklist");
});

test("returns usage error for unknown connector", () => {
  const result = run(["--connector", "does-not-exist"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown connector/);
});

test("returns usage error when no selector is provided", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

