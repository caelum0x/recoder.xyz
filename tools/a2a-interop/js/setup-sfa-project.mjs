#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CSV_PATH = resolve(ROOT, "issues/slack-for-agents/ISSUE_TRACKER.csv");
const DEFAULT_TITLE = "Slack for Agents Execution";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...opts });
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    owner: null,
    projectTitle: DEFAULT_TITLE,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.dryRun = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--owner") args.owner = argv[++i] ?? null;
    else if (arg === "--title") args.projectTitle = argv[++i] ?? DEFAULT_TITLE;
  }
  return args;
}

function detectOwnerRepo() {
  const r = run("git", ["remote", "get-url", "origin"]);
  if (r.status !== 0) return null;
  const m = r.stdout.trim().match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], full: `${m[1]}/${m[2]}` };
}

function parseCsv(file) {
  const raw = readFileSync(file, "utf8").trim().split("\n");
  const headers = raw[0].split(",");
  return raw.slice(1).map((line) => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    return obj;
  });
}

function ghJson(args, allowFailure = false) {
  const r = run("gh", args);
  if (r.status !== 0) {
    if (!allowFailure) {
      const out = (r.stderr || r.stdout || "").trim();
      if (out.toLowerCase().includes("project")) {
        throw new Error(
          `GitHub project API failed. Ensure auth has project scope: gh auth refresh -s project\n${out}`,
        );
      }
      throw new Error(out || `gh ${args.join(" ")} failed`);
    }
    return null;
  }
  return JSON.parse(r.stdout);
}

function getOrCreateProject(owner, title, dryRun) {
  const projects = ghJson(["project", "list", "--owner", owner, "--format", "json"]);
  const existing = projects.projects?.find((p) => p.title === title) ?? null;
  if (existing) return existing;
  if (dryRun) {
    return { id: "DRY_PROJECT_ID", number: -1, title };
  }
  const created = ghJson([
    "project",
    "create",
    "--owner",
    owner,
    "--title",
    title,
    "--format",
    "json",
  ]);
  return created;
}

function ensureSingleSelectField(owner, projectNumber, fieldName, options, dryRun) {
  const fieldList = ghJson([
    "project",
    "field-list",
    String(projectNumber),
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  let field = fieldList.fields?.find((f) => f.name === fieldName);
  if (!field && !dryRun) {
    ghJson([
      "project",
      "field-create",
      String(projectNumber),
      "--owner",
      owner,
      "--name",
      fieldName,
      "--data-type",
      "SINGLE_SELECT",
      "--single-select-options",
      options.join(","),
      "--format",
      "json",
    ]);
    const refreshed = ghJson([
      "project",
      "field-list",
      String(projectNumber),
      "--owner",
      owner,
      "--format",
      "json",
    ]);
    field = refreshed.fields?.find((f) => f.name === fieldName);
  }
  return field ?? null;
}

function mapIssuesBySfaId(repoFull) {
  const issues = ghJson([
    "issue",
    "list",
    "--repo",
    repoFull,
    "--limit",
    "200",
    "--search",
    "SFA-",
    "--json",
    "number,title,url",
  ]);
  const map = new Map();
  for (const issue of issues) {
    const m = issue.title.match(/\[(SFA-\d+)\]/);
    if (m) map.set(m[1], issue);
  }
  return map;
}

function existingProjectItems(owner, projectNumber) {
  const items = ghJson([
    "project",
    "item-list",
    String(projectNumber),
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  const urls = new Set();
  for (const it of items.items ?? []) {
    const url = it.content?.url;
    if (url) urls.add(url);
  }
  return urls;
}

function findOptionId(field, optionName) {
  return field?.options?.find((o) => o.name === optionName)?.id ?? null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(CSV_PATH)) {
    console.error(`Missing ${CSV_PATH}`);
    process.exit(1);
  }
  const remote = detectOwnerRepo();
  if (!remote) {
    console.error("Could not detect GitHub origin remote.");
    process.exit(1);
  }
  const owner = args.owner ?? "@me";
  const repoFull = remote.full;

  const tickets = parseCsv(CSV_PATH);
  console.log(`Loaded ${tickets.length} tickets from ISSUE_TRACKER.csv`);
  console.log(`Target owner: ${owner}`);
  console.log(`Target repo for issues: ${repoFull}`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : "apply"}`);

  const project = getOrCreateProject(owner, args.projectTitle, args.dryRun);
  console.log(`Project: ${project.title} (#${project.number})`);

  if (args.dryRun) {
    console.log("Dry-run stops before field/item mutation.");
    return;
  }

  const projectView = ghJson([
    "project",
    "view",
    String(project.number),
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  const projectId = projectView.id;
  if (!projectId) {
    throw new Error("Could not resolve project ID from gh project view.");
  }

  const sprintField = ensureSingleSelectField(
    owner,
    project.number,
    "Sprint",
    ["Sprint 1", "Sprint 2", "Sprint 3", "Tier-2 Backlog"],
    args.dryRun,
  );
  const priorityField = ensureSingleSelectField(
    owner,
    project.number,
    "Priority",
    ["P0", "P1", "P2"],
    args.dryRun,
  );

  const sfaIssues = mapIssuesBySfaId(repoFull);
  const existingUrls = existingProjectItems(owner, project.number);

  for (const t of tickets) {
    const issue = sfaIssues.get(t.id);
    if (!issue) {
      console.log(`SKIP ${t.id}: no matching GitHub issue found`);
      continue;
    }
    if (!existingUrls.has(issue.url)) {
      ghJson([
        "project",
        "item-add",
        String(project.number),
        "--owner",
        owner,
        "--url",
        issue.url,
        "--format",
        "json",
      ]);
      console.log(`ADDED ${t.id} -> project item`);
    }
  }

  const refreshed = ghJson([
    "project",
    "item-list",
    String(project.number),
    "--owner",
    owner,
    "--format",
    "json",
  ]);
  const itemBySfa = new Map();
  for (const it of refreshed.items ?? []) {
    const title = it.content?.title || "";
    const m = title.match(/\[(SFA-\d+)\]/);
    if (m) itemBySfa.set(m[1], it.id);
  }

  for (const t of tickets) {
    const itemId = itemBySfa.get(t.id);
    if (!itemId) continue;

    if (sprintField) {
      const sprintOptionId = findOptionId(sprintField, t.sprint);
      if (sprintOptionId) {
        ghJson([
          "project",
          "item-edit",
          "--id",
          itemId,
          "--project-id",
          projectId,
          "--field-id",
          sprintField.id,
          "--single-select-option-id",
          sprintOptionId,
        ]);
      }
    }

    if (priorityField) {
      const priorityOptionId = findOptionId(priorityField, t.priority);
      if (priorityOptionId) {
        ghJson([
          "project",
          "item-edit",
          "--id",
          itemId,
          "--project-id",
          projectId,
          "--field-id",
          priorityField.id,
          "--single-select-option-id",
          priorityOptionId,
        ]);
      }
    }

    console.log(`UPDATED ${t.id}: Sprint=${t.sprint}, Priority=${t.priority}`);
  }
}

main();
