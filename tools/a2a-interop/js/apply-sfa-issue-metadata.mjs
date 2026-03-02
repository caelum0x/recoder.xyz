#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CSV = resolve(ROOT, "issues/slack-for-agents/ISSUE_TRACKER.csv");

function run(args) {
  return spawnSync("gh", args, { cwd: ROOT, encoding: "utf8" });
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function detectRepo() {
  const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return null;
  const m = r.stdout.trim().match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const out = {};
    headers.forEach((h, i) => {
      out[h] = cols[i] ?? "";
    });
    return out;
  });
}

function sprintLabelFor(sprint) {
  if (sprint === "Sprint 1") return "sprint/1";
  if (sprint === "Sprint 2") return "sprint/2";
  if (sprint === "Sprint 3") return "sprint/3";
  return "sprint/tier2";
}

function ensureLabel(repo, name, color, desc) {
  const r = run(["label", "create", name, "--repo", repo, "--color", color, "--description", desc, "--force"]);
  if (r.status !== 0) console.error(`label-fail ${name}: ${r.stderr || r.stdout}`);
}

function main() {
  const repo = detectRepo();
  if (!repo) fail("Could not detect origin repo");
  const rows = parseCsv(readFileSync(CSV, "utf8"));

  ensureLabel(repo, "sprint/1", "A2EEEF", "SFA Sprint 1");
  ensureLabel(repo, "sprint/2", "C5DEF5", "SFA Sprint 2");
  ensureLabel(repo, "sprint/3", "DBEDFF", "SFA Sprint 3");
  ensureLabel(repo, "sprint/tier2", "EDEDED", "SFA Tier-2 backlog");

  const list = run(["issue", "list", "--repo", repo, "--limit", "200", "--search", "SFA-", "--json", "number,title"]);
  if (list.status !== 0) fail(list.stderr || list.stdout);
  const issues = JSON.parse(list.stdout);
  const byId = new Map();
  for (const i of issues) {
    const m = i.title.match(/\[(SFA-\d+)\]/);
    if (m) byId.set(m[1], i.number);
  }

  for (const row of rows) {
    const num = byId.get(row.id);
    if (!num) {
      console.log(`skip ${row.id}: issue not found`);
      continue;
    }
    const sprintLabel = sprintLabelFor(row.sprint);
    const edit = run(["issue", "edit", String(num), "--repo", repo, "--add-label", sprintLabel]);
    if (edit.status !== 0) {
      console.error(`edit-fail ${row.id}: ${edit.stderr || edit.stdout}`);
      continue;
    }
    console.log(`updated ${row.id} #${num} -> ${sprintLabel}`);
  }
}

main();

