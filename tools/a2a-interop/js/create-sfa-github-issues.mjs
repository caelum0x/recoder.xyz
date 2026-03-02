#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE_PATH = resolve(ROOT, "SLACK_FOR_AGENTS_GITHUB_ISSUES.md");

function parseArgs(argv) {
  const args = {
    dryRun: true,
    repoFilter: null,
    idFilter: null,
    targetRepo: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--create") args.dryRun = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--repo") args.repoFilter = argv[++i] ?? null;
    else if (arg === "--id") args.idFilter = argv[++i] ?? null;
    else if (arg === "--target-repo") args.targetRepo = argv[++i] ?? null;
  }

  return args;
}

function parseTickets(markdown) {
  const chunks = markdown.split(/^## (SFA-\d+)/gm);
  const tickets = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const id = chunks[i]?.trim();
    const body = chunks[i + 1] ?? "";
    const title = body.match(/Title:\s*`([^`]+)`/)?.[1]?.trim();
    const labels = body
      .match(/Labels:\s*([^\n]+)/)?.[1]
      ?.split(",")
      .map((s) => s.trim().replace(/^`|`$/g, ""))
      .filter(Boolean) ?? [];
    const repo = body.match(/Repo:\s*`([^`]+)`/)?.[1]?.trim();
    const bodyIndex = body.indexOf("Body:");
    const issueBody = bodyIndex >= 0 ? body.slice(bodyIndex + "Body:".length).trim() : "";

    if (!id || !title || !repo) continue;
    tickets.push({ id, title, labels, repo, body: issueBody });
  }
  return tickets;
}

function runCommand(cmd, args, cwd = ROOT) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8" });
}

function isMissingLabelError(output) {
  const normalized = (output || "").toLowerCase();
  return normalized.includes("label") && normalized.includes("not found");
}

function detectTargetRepo() {
  const remote = runCommand("git", ["remote", "get-url", "origin"]);
  if (remote.status !== 0) return null;
  const url = remote.stdout.trim();
  const httpsMatch = url.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!httpsMatch) return null;
  const owner = httpsMatch[1];
  const repo = httpsMatch[2];
  return `${owner}/${repo}`;
}

function ensureGh() {
  const result = runCommand("gh", ["--version"]);
  if (result.status !== 0) {
    console.error("gh CLI not found. Install GitHub CLI before running with --create.");
    process.exit(1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetRepo = args.targetRepo ?? detectTargetRepo();

  if (!existsSync(SOURCE_PATH)) {
    console.error(`Missing issue source file: ${SOURCE_PATH}`);
    process.exit(1);
  }

  const source = readFileSync(SOURCE_PATH, "utf8");
  let tickets = parseTickets(source);

  if (args.repoFilter) tickets = tickets.filter((t) => t.repo === args.repoFilter);
  if (args.idFilter) tickets = tickets.filter((t) => t.id === args.idFilter);

  if (tickets.length === 0) {
    console.log("No tickets matched filters.");
    return;
  }

  if (!targetRepo) {
    console.error("Could not detect target repo. Pass --target-repo owner/name.");
    process.exit(1);
  }

  console.log(`Found ${tickets.length} tickets.`);
  console.log(`Target repo: ${targetRepo}`);
  console.log(args.dryRun ? "Mode: dry-run" : "Mode: create");

  if (!args.dryRun) ensureGh();

  for (const ticket of tickets) {
    const labelArgs = ticket.labels.flatMap((label) => ["--label", label]);
    const body = `${ticket.id}\n\nSource Repo Path: \`${ticket.repo}\`\n\n${ticket.body}`;
    const cmdArgs = [
      "issue",
      "create",
      "--repo",
      targetRepo,
      "--title",
      ticket.title,
      "--body",
      body,
      ...labelArgs,
    ];

    if (args.dryRun) {
      console.log("\n---");
      console.log(`[DRY] ${ticket.id} -> ${targetRepo} (source path: ${ticket.repo})`);
      console.log(`title: ${ticket.title}`);
      console.log(`labels: ${ticket.labels.join(", ")}`);
      continue;
    }

    const result = runCommand("gh", cmdArgs);
    if (result.status !== 0) {
      const output = result.stderr || result.stdout || "";
      if (isMissingLabelError(output)) {
        const retryArgs = [
          "issue",
          "create",
          "--repo",
          targetRepo,
          "--title",
          ticket.title,
          "--body",
          body,
        ];
        const retry = runCommand("gh", retryArgs);
        if (retry.status === 0) {
          console.log(`CREATED ${ticket.id} (without labels): ${retry.stdout.trim()}`);
          continue;
        }
        console.error(`FAILED ${ticket.id} retry: ${retry.stderr || retry.stdout}`);
        continue;
      }
      console.error(`FAILED ${ticket.id}: ${output}`);
      continue;
    }
    console.log(`CREATED ${ticket.id}: ${result.stdout.trim()}`);
  }
}

main();
