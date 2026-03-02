#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..", "..");

const TIER2_CONNECTORS = [
  "cursor",
  "windsurf",
  "replit",
  "vscode-copilot",
  "jetbrains",
];

function parseArgs(argv) {
  const out = {
    connector: null,
    all: false,
    assertPromotable: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--connector" && argv[i + 1]) {
      out.connector = String(argv[i + 1]).trim();
      i += 1;
    } else if (arg === "--all") {
      out.all = true;
    } else if (arg === "--assert-promotable") {
      out.assertPromotable = true;
    } else if (arg === "--json") {
      out.json = true;
    }
  }
  return out;
}

function latestMatchingFile(dirPath, suffix) {
  if (!existsSync(dirPath)) return null;
  const files = readdirSync(dirPath)
    .filter((name) => name.endsWith(suffix))
    .map((name) => ({
      name,
      absPath: resolve(dirPath, name),
    }));

  if (files.length === 0) return null;

  files.sort((a, b) => {
    const aTime = statSync(a.absPath).mtimeMs;
    const bTime = statSync(b.absPath).mtimeMs;
    return bTime - aTime;
  });
  return files[0].absPath;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function validateRfcFile(connectorId) {
  const rfcPath = resolve(
    ROOT,
    "shared/src/a2a/rfcs/tier2",
    `${connectorId}.md`,
  );
  const errors = [];
  const warnings = [];

  if (!existsSync(rfcPath)) {
    errors.push(`RFC missing: ${rfcPath}`);
    return { rfcPath, errors, warnings };
  }

  const content = readFileSync(rfcPath, "utf-8");
  const requiredSections = [
    "## Policy Mapping",
    "## Promotion Checklist",
    "## Engineering Estimate",
    "## Evidence Links",
  ];

  for (const section of requiredSections) {
    if (!content.includes(section)) {
      errors.push(`RFC ${connectorId} missing section: ${section}`);
    }
  }

  if (!content.includes("- [ ]")) {
    warnings.push(`RFC ${connectorId} has no unchecked checklist items; verify checklist format`);
  }

  return { rfcPath, errors, warnings };
}

function validateEvidence(connectorId) {
  const phase3Dir = resolve(ROOT, "logs/phase3-gates");
  const releaseDir = resolve(ROOT, "logs/release-evidence");
  const phase3Path = latestMatchingFile(phase3Dir, "-connectors-support.json");
  const releasePath = latestMatchingFile(releaseDir, "-connectors-support.json");

  const errors = [];
  const warnings = [];

  if (!phase3Path) {
    errors.push("Missing Phase 3 connector support artifact in logs/phase3-gates");
  }
  if (!releasePath) {
    errors.push("Missing release connector support artifact in logs/release-evidence");
  }
  if (errors.length > 0) {
    return {
      phase3Path,
      releasePath,
      phase3Status: null,
      releaseStatus: null,
      errors,
      warnings,
    };
  }

  const phase3 = readJson(phase3Path);
  const release = readJson(releasePath);
  const phase3Row = Array.isArray(phase3.connectors)
    ? phase3.connectors.find((row) => row?.id === connectorId)
    : null;
  const releaseRow = Array.isArray(release.connectors)
    ? release.connectors.find((row) => row?.id === connectorId)
    : null;

  if (!phase3Row) {
    errors.push(`Connector '${connectorId}' missing in ${phase3Path}`);
  }
  if (!releaseRow) {
    errors.push(`Connector '${connectorId}' missing in ${releasePath}`);
  }

  const phase3Status = phase3Row?.status || null;
  const releaseStatus = releaseRow?.status || null;

  if (phase3Status && phase3Status !== releaseStatus) {
    warnings.push(
      `Status mismatch between artifacts for ${connectorId}: phase3=${phase3Status}, release=${releaseStatus}`,
    );
  }

  return {
    phase3Path,
    releasePath,
    phase3Status,
    releaseStatus,
    errors,
    warnings,
  };
}

function validateConnector(connectorId, options) {
  const rfc = validateRfcFile(connectorId);
  const evidence = validateEvidence(connectorId);
  const errors = [...rfc.errors, ...evidence.errors];
  const warnings = [...rfc.warnings, ...evidence.warnings];

  if (options.assertPromotable) {
    const promotableStates = new Set(["supported", "ga", "promoted"]);
    const effectiveStatus = evidence.releaseStatus || evidence.phase3Status;
    if (!effectiveStatus || !promotableStates.has(String(effectiveStatus).toLowerCase())) {
      errors.push(
        `Connector '${connectorId}' is not promotable. Latest status is '${effectiveStatus || "unknown"}'`,
      );
    }
  }

  return {
    connectorId,
    ok: errors.length === 0,
    rfcPath: rfc.rfcPath,
    phase3Path: evidence.phase3Path,
    releasePath: evidence.releasePath,
    phase3Status: evidence.phase3Status,
    releaseStatus: evidence.releaseStatus,
    errors,
    warnings,
  };
}

function renderTextSummary(results, assertPromotable) {
  console.log("Tier-2 connector promotion validator");
  console.log(`Mode: ${assertPromotable ? "assert-promotable" : "checklist"}`);
  console.log("");

  for (const result of results) {
    console.log(`- ${result.connectorId}: ${result.ok ? "PASS" : "FAIL"}`);
    if (result.phase3Status || result.releaseStatus) {
      console.log(
        `  status phase3/release: ${result.phase3Status || "n/a"} / ${result.releaseStatus || "n/a"}`,
      );
    }
    for (const warning of result.warnings) {
      console.log(`  warning: ${warning}`);
    }
    for (const error of result.errors) {
      console.log(`  error: ${error}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const connectors = args.all
    ? TIER2_CONNECTORS
    : args.connector
      ? [args.connector]
      : [];

  if (connectors.length === 0) {
    console.error("Usage: node validate-tier2-promotion.mjs --all | --connector <id> [--assert-promotable] [--json]");
    process.exit(2);
  }

  const invalid = connectors.filter((id) => !TIER2_CONNECTORS.includes(id));
  if (invalid.length > 0) {
    console.error(`Unknown connector(s): ${invalid.join(", ")}`);
    console.error(`Allowed: ${TIER2_CONNECTORS.join(", ")}`);
    process.exit(2);
  }

  const results = connectors.map((connectorId) =>
    validateConnector(connectorId, { assertPromotable: args.assertPromotable }),
  );
  const ok = results.every((row) => row.ok);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok,
          mode: args.assertPromotable ? "assert-promotable" : "checklist",
          results,
        },
        null,
        2,
      ),
    );
  } else {
    renderTextSummary(results, args.assertPromotable);
  }

  process.exit(ok ? 0 : 1);
}

main();

