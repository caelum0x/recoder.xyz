#!/usr/bin/env npx tsx
/**
 * generate-changelog.ts
 *
 * Lightweight changelog generator for the recoder.xyz monorepo.
 * Reads git log since the last tag (or last 7 days if no tags exist),
 * groups commits by conventional-commit type, and appends a dated
 * section to CHANGELOG.md.
 *
 * Usage:
 *   npx tsx scripts/generate-changelog.ts
 *   npx tsx scripts/generate-changelog.ts --since=2026-02-01
 *   npx tsx scripts/generate-changelog.ts --dry-run
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const CHANGELOG_PATH = resolve(ROOT, "CHANGELOG.md");

const CHANGELOG_HEADER = `# Changelog

All notable changes to Recoder.xyz will be documented in this file.

`;

/** Map conventional-commit prefixes to human-readable section headers. */
const TYPE_MAP: Record<string, string> = {
  feat: "Added",
  fix: "Fixed",
  perf: "Performance",
  security: "Security",
  docs: "Documentation",
  refactor: "Refactored",
  test: "Tests",
  ci: "CI/CD",
  build: "Build",
  chore: "Chores",
  style: "Styles",
  revert: "Reverted",
};

/** Display order for section headers (types listed first appear first). */
const SECTION_ORDER = [
  "Added",
  "Fixed",
  "Security",
  "Performance",
  "Refactored",
  "Documentation",
  "Tests",
  "CI/CD",
  "Build",
  "Styles",
  "Reverted",
  "Chores",
  "Other",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function parseArgs(): { since: string; dryRun: boolean } {
  let since = "";
  let dryRun = false;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--since=")) {
      since = arg.replace("--since=", "");
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { since, dryRun };
}

/**
 * Determine the starting point for the log window.
 * Priority: --since flag > last git tag > 7 days ago.
 */
function resolveStartDate(flagValue: string): string {
  if (flagValue) {
    return flagValue;
  }

  // Try to get the most recent tag
  const lastTag = git("describe --tags --abbrev=0 2>/dev/null");
  if (lastTag) {
    const tagDate = git(`log -1 --format=%ai ${lastTag}`);
    if (tagDate) {
      return tagDate.split(" ")[0]; // YYYY-MM-DD
    }
  }

  // Fallback: 7 days ago
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

interface CommitEntry {
  hash: string;
  type: string;
  scope: string;
  subject: string;
  breaking: boolean;
}

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

function parseCommit(line: string): CommitEntry | null {
  // line format: "hash DELIMITER subject"
  const DELIM = "|||";
  const idx = line.indexOf(DELIM);
  if (idx === -1) return null;

  const hash = line.slice(0, idx).trim();
  const raw = line.slice(idx + DELIM.length).trim();
  if (!hash || !raw) return null;

  const match = raw.match(CONVENTIONAL_RE);
  if (match) {
    return {
      hash,
      type: match[1].toLowerCase(),
      scope: match[2] || "",
      subject: match[4],
      breaking: match[3] === "!",
    };
  }

  // Non-conventional commit — bucket under "Other"
  return {
    hash,
    type: "__other__",
    scope: "",
    subject: raw,
    breaking: false,
  };
}

function groupCommits(
  commits: CommitEntry[]
): Map<string, CommitEntry[]> {
  const groups = new Map<string, CommitEntry[]>();

  for (const c of commits) {
    const section = TYPE_MAP[c.type] ?? "Other";
    if (!groups.has(section)) {
      groups.set(section, []);
    }
    groups.get(section)!.push(c);
  }

  return groups;
}

function formatEntry(c: CommitEntry): string {
  const scope = c.scope ? `**${c.scope}**: ` : "";
  const breaking = c.breaking ? " **BREAKING**" : "";
  return `- ${scope}${c.subject}${breaking} (\`${c.hash}\`)`;
}

function buildMarkdown(
  groups: Map<string, CommitEntry[]>,
  date: string
): string {
  const lines: string[] = [];
  lines.push(`## [Unreleased] - ${date}`);
  lines.push("");

  for (const section of SECTION_ORDER) {
    const entries = groups.get(section);
    if (!entries || entries.length === 0) continue;

    lines.push(`### ${section}`);
    for (const entry of entries) {
      lines.push(formatEntry(entry));
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { since, dryRun } = parseArgs();
  const startDate = resolveStartDate(since);
  const today = new Date().toISOString().split("T")[0];

  console.log(`Generating changelog from ${startDate} to ${today}...`);

  // Fetch commits
  const DELIM = "|||";
  const raw = git(
    `log --since="${startDate}" --pretty=format:"%h${DELIM}%s" --no-merges`
  );

  if (!raw) {
    console.log("No commits found in the specified range.");
    return;
  }

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const commits: CommitEntry[] = [];
  for (const line of lines) {
    const parsed = parseCommit(line);
    if (parsed) {
      commits.push(parsed);
    }
  }

  if (commits.length === 0) {
    console.log("No parsable commits found.");
    return;
  }

  console.log(`Found ${commits.length} commits.`);

  const groups = groupCommits(commits);
  const newSection = buildMarkdown(groups, today);

  if (dryRun) {
    console.log("\n--- DRY RUN OUTPUT ---\n");
    console.log(newSection);
    return;
  }

  // Read existing changelog or create fresh
  let existing = "";
  if (existsSync(CHANGELOG_PATH)) {
    existing = readFileSync(CHANGELOG_PATH, "utf8");
  }

  let output: string;

  if (existing.startsWith("# Changelog")) {
    // Insert new section after the header block (first blank line after header)
    const headerEnd = existing.indexOf("\n\n");
    if (headerEnd !== -1) {
      const header = existing.slice(0, headerEnd + 2);
      const rest = existing.slice(headerEnd + 2);
      output = header + newSection + "\n" + rest;
    } else {
      output = existing + "\n\n" + newSection;
    }
  } else {
    output = CHANGELOG_HEADER + newSection + "\n";
  }

  writeFileSync(CHANGELOG_PATH, output, "utf8");
  console.log(`Updated ${CHANGELOG_PATH}`);
}

main();
