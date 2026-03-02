#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..", "..");

const MARKER_START = "<!-- AUTO-PUBLISHED:TIER1-STATUS:START -->";
const MARKER_END = "<!-- AUTO-PUBLISHED:TIER1-STATUS:END -->";
const TIER1_IDS = new Set(["codex", "claude"]);

function parseArgs(argv) {
  const args = {
    phase3: null,
    release: null,
    target: resolve(ROOT, "SUPPORTED_CONNECTORS.md"),
    check: false,
    json: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--phase3" && argv[i + 1]) {
      args.phase3 = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--release" && argv[i + 1]) {
      args.release = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--target" && argv[i + 1]) {
      args.target = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function latestMatchingFile(dirPath, suffix) {
  if (!existsSync(dirPath)) return null;
  const files = readdirSync(dirPath)
    .filter((name) => name.endsWith(suffix))
    .map((name) => resolve(dirPath, name));

  if (files.length === 0) return null;
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0];
}

function resolveArtifacts(args) {
  const phase3Path = args.phase3 || latestMatchingFile(resolve(ROOT, "logs/phase3-gates"), "-connectors-support.json");
  const releasePath = args.release || latestMatchingFile(resolve(ROOT, "logs/release-evidence"), "-connectors-support.json");

  if (phase3Path && existsSync(phase3Path)) {
    return { source: "phase3-gates", path: phase3Path, phase3Path, releasePath };
  }
  if (releasePath && existsSync(releasePath)) {
    return { source: "release-evidence", path: releasePath, phase3Path, releasePath };
  }
  throw new Error("No connector support artifact found. Run phase3 gates/evidence first or pass --phase3/--release.");
}

function loadArtifact(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function normalizeTier1Rows(artifact) {
  const rows = Array.isArray(artifact.connectors) ? artifact.connectors : [];
  const tier1 = rows.filter((row) => TIER1_IDS.has(String(row?.id || "")));
  const ordered = ["codex", "claude"].map((id) => tier1.find((row) => row.id === id)).filter(Boolean);
  if (ordered.length !== 2) {
    throw new Error("Artifact is missing tier-1 connector rows for codex/claude.");
  }
  return ordered;
}

function buildManagedBlock(meta) {
  const lines = [];
  lines.push(MARKER_START);
  lines.push("## Auto-Published Tier-1 Status");
  lines.push("");
  lines.push(`Generated at: ${meta.generatedAt}`);
  lines.push(`Artifact source: \`${meta.source}\``);
  lines.push(`Artifact file: \`${meta.artifactRel}\``);
  lines.push("");
  lines.push("| Connector | Tier | Status | Reason |");
  lines.push("|---|---|---|---|");
  for (const row of meta.tier1Rows) {
    lines.push(`| \`${row.id}\` | ${row.tier || "tier1"} | ${row.status || "unknown"} | ${row.reason || ""} |`);
  }

  if (meta.supportInputs && Object.keys(meta.supportInputs).length > 0) {
    lines.push("");
    lines.push("Gate inputs:");
    lines.push("| Input | Value |");
    lines.push("|---|---|");
    const keys = [
      "release_evidence",
      "smoke_phase1",
      "smoke_queue",
      "smoke_static",
      "a2a_interop",
      "a2a_runtime",
      "a2a_production_smoke",
      "ga_ready",
      "support_gates_pass",
      "no_skip_closeout_precondition",
    ];
    for (const key of keys) {
      if (Object.hasOwn(meta.supportInputs, key)) {
        lines.push(`| \`${key}\` | ${String(meta.supportInputs[key])} |`);
      }
    }
  }

  lines.push(MARKER_END);
  lines.push("");
  return lines.join("\n");
}

function upsertManagedBlock(existing, block) {
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + MARKER_END.length);
    const needsSep = before.endsWith("\n") ? "" : "\n";
    return `${before}${needsSep}${block}${after.replace(/^\n*/, "\n")}`;
  }

  const suffix = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${suffix}${block}`;
}

function extractManagedBlock(existing) {
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }
  return existing.slice(startIdx, endIdx + MARKER_END.length).trimEnd();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifacts = resolveArtifacts(args);
  const artifact = loadArtifact(artifacts.path);
  const tier1Rows = normalizeTier1Rows(artifact);

  const meta = {
    source: artifacts.source,
    artifactRel: relative(ROOT, artifacts.path) || artifacts.path,
    generatedAt: artifact.generated_at_utc || new Date().toISOString(),
    tier1Rows,
    supportInputs: artifact.support_gate_inputs || {},
  };

  const managedBlock = buildManagedBlock(meta);
  const targetPath = args.target;
  const current = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : "";
  const next = upsertManagedBlock(current, managedBlock);
  const currentBlock = extractManagedBlock(current);
  const changed = currentBlock === null
    ? true
    : currentBlock !== managedBlock.trimEnd();

  if (args.json) {
    console.log(JSON.stringify({
      ok: !args.check || !changed,
      changed,
      source: meta.source,
      artifact: meta.artifactRel,
      target: relative(ROOT, targetPath) || targetPath,
      tier1: tier1Rows.map((row) => ({ id: row.id, status: row.status })),
    }, null, 2));
  } else {
    console.log(`Tier-1 status source: ${meta.source}`);
    console.log(`Artifact: ${meta.artifactRel}`);
    console.log(`Target: ${relative(ROOT, targetPath) || targetPath}`);
    console.log(`Changed: ${changed ? "yes" : "no"}`);
  }

  if (args.check) {
    process.exit(changed ? 1 : 0);
  }

  if (!args.dryRun && changed) {
    writeFileSync(targetPath, next);
  }
}

main();
