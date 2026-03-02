#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

const ALLOWED_TRANSITIONS = new Set([
  "backlog->pilot",
  "pilot->supported",
]);

function usage() {
  console.error(
    "Usage: node tier2-promotion-workflow.mjs <status|validate|transition> " +
      "[--connector <id>] [--to <pilot|supported>] [--apply] [--approved-by <actor>] " +
      "[--reason <text>] [--phase3 <path>] [--release <path>] [--state-file <path>] [--json]",
  );
}

function parseArgs(argv) {
  const out = {
    cmd: argv[0] || "status",
    connector: null,
    to: null,
    apply: false,
    approvedBy: "automation",
    reason: "",
    phase3: null,
    release: null,
    stateFile: resolve(ROOT, "logs", "tier2-promotion-state.json"),
    json: false,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--connector" && argv[i + 1]) {
      out.connector = String(argv[i + 1]).trim();
      i += 1;
    } else if (arg === "--to" && argv[i + 1]) {
      out.to = String(argv[i + 1]).trim();
      i += 1;
    } else if (arg === "--apply") {
      out.apply = true;
    } else if (arg === "--approved-by" && argv[i + 1]) {
      out.approvedBy = String(argv[i + 1]).trim();
      i += 1;
    } else if (arg === "--reason" && argv[i + 1]) {
      out.reason = String(argv[i + 1]);
      i += 1;
    } else if (arg === "--phase3" && argv[i + 1]) {
      out.phase3 = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--release" && argv[i + 1]) {
      out.release = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--state-file" && argv[i + 1]) {
      out.stateFile = resolve(argv[i + 1]);
      i += 1;
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
    .map((name) => resolve(dirPath, name));

  if (files.length === 0) return null;
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function ensureState(stateFile) {
  if (existsSync(stateFile)) {
    return readJson(stateFile);
  }

  return {
    schema_version: "1.0.0",
    updated_at_utc: new Date().toISOString(),
    connectors: TIER2_CONNECTORS.map((id) => ({
      id,
      stage: "backlog",
      history: [],
    })),
  };
}

function writeState(stateFile, data) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(data, null, 2));
}

function findConnectorState(state, connectorId) {
  return state.connectors.find((row) => row.id === connectorId);
}

function validateRfc(connectorId) {
  const rfcPath = resolve(ROOT, "shared/src/a2a/rfcs/tier2", `${connectorId}.md`);
  const errors = [];
  if (!existsSync(rfcPath)) {
    errors.push(`RFC missing: ${rfcPath}`);
    return { errors, rfcPath };
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
  return { errors, rfcPath };
}

function resolveEvidence(args) {
  const phase3Path = args.phase3 || latestMatchingFile(resolve(ROOT, "logs/phase3-gates"), "-connectors-support.json");
  const releasePath =
    args.release || latestMatchingFile(resolve(ROOT, "logs/release-evidence"), "-connectors-support.json");
  const errors = [];
  if (!phase3Path) errors.push("Missing phase3 connectors-support artifact");
  if (!releasePath) errors.push("Missing release connectors-support artifact");
  if (errors.length > 0) {
    return { errors, phase3Path, releasePath, phase3: null, release: null };
  }
  return {
    errors,
    phase3Path,
    releasePath,
    phase3: readJson(phase3Path),
    release: readJson(releasePath),
  };
}

function evaluateTransition(state, args) {
  const errors = [];
  const warnings = [];
  const checks = [];

  if (!args.connector || !TIER2_CONNECTORS.includes(args.connector)) {
    errors.push(`Unknown or missing connector '${args.connector || ""}'`);
    return { ok: false, errors, warnings, checks };
  }
  if (!args.to || (args.to !== "pilot" && args.to !== "supported")) {
    errors.push("Missing or invalid --to (expected pilot|supported)");
    return { ok: false, errors, warnings, checks };
  }

  const current = findConnectorState(state, args.connector);
  const currentStage = current?.stage || "backlog";
  const transitionKey = `${currentStage}->${args.to}`;
  if (!ALLOWED_TRANSITIONS.has(transitionKey)) {
    errors.push(`Invalid transition ${transitionKey}. Allowed: backlog->pilot, pilot->supported`);
  }
  checks.push({ check: "state_transition", ok: ALLOWED_TRANSITIONS.has(transitionKey), detail: transitionKey });

  const rfc = validateRfc(args.connector);
  checks.push({ check: "rfc_sections", ok: rfc.errors.length === 0, detail: rfc.rfcPath });
  errors.push(...rfc.errors);

  const evidence = resolveEvidence(args);
  checks.push({
    check: "evidence_artifacts_present",
    ok: evidence.errors.length === 0,
    detail: { phase3: evidence.phase3Path, release: evidence.releasePath },
  });
  errors.push(...evidence.errors);

  let phase3Row = null;
  let releaseRow = null;
  let supportInputs = {};
  if (evidence.phase3 && evidence.release) {
    phase3Row = (evidence.phase3.connectors || []).find((row) => row?.id === args.connector) || null;
    releaseRow = (evidence.release.connectors || []).find((row) => row?.id === args.connector) || null;
    supportInputs = evidence.phase3.support_gate_inputs || {};
    if (!phase3Row) errors.push(`Connector '${args.connector}' missing in phase3 artifact`);
    if (!releaseRow) errors.push(`Connector '${args.connector}' missing in release artifact`);
    checks.push({
      check: "connector_in_artifacts",
      ok: Boolean(phase3Row && releaseRow),
      detail: {
        phase3_status: phase3Row?.status || null,
        release_status: releaseRow?.status || null,
      },
    });
  }

  const supportGatesPass = supportInputs.support_gates_pass === true;
  const noSkipCloseout = supportInputs.no_skip_closeout_precondition === true;
  checks.push({
    check: "tier1_support_gates_pass",
    ok: supportGatesPass,
    detail: { support_gates_pass: supportInputs.support_gates_pass ?? null },
  });
  checks.push({
    check: "no_skip_closeout_precondition",
    ok: noSkipCloseout,
    detail: { no_skip_closeout_precondition: supportInputs.no_skip_closeout_precondition ?? null },
  });

  if (!supportGatesPass) {
    errors.push("Tier-1 support gates are not passing; Tier-2 promotion is blocked.");
  }
  if (!noSkipCloseout) {
    errors.push("No-skip Phase 3 closeout precondition is not met; Tier-2 promotion is blocked.");
  }

  if (args.to === "supported") {
    const promotableStates = new Set(["supported", "ga", "promoted"]);
    const effectiveStatus = (releaseRow?.status || phase3Row?.status || "").toLowerCase();
    const promotable = promotableStates.has(effectiveStatus);
    checks.push({
      check: "promotable_status_assertion",
      ok: promotable,
      detail: { effective_status: effectiveStatus || "unknown" },
    });
    if (!promotable) {
      errors.push(
        `Connector '${args.connector}' is not promotable for supported stage (status='${effectiveStatus || "unknown"}').`,
      );
    }
  }

  if (phase3Row && releaseRow && phase3Row.status !== releaseRow.status) {
    warnings.push(`Status mismatch across artifacts: phase3=${phase3Row.status}, release=${releaseRow.status}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks,
    currentStage,
    targetStage: args.to,
    evidence: {
      phase3Path: evidence.phase3Path,
      releasePath: evidence.releasePath,
    },
  };
}

function printStatus(state, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log("Tier-2 Promotion Workflow State");
  console.log(`updated_at_utc: ${state.updated_at_utc}`);
  console.log("");
  console.log("| Connector | Stage | History entries |");
  console.log("|---|---|---|");
  for (const row of state.connectors) {
    console.log(`| ${row.id} | ${row.stage} | ${Array.isArray(row.history) ? row.history.length : 0} |`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = ensureState(args.stateFile);

  if (args.cmd === "status") {
    printStatus(state, args.json);
    return;
  }

  if (args.cmd !== "validate" && args.cmd !== "transition") {
    usage();
    process.exit(2);
  }

  const evaluation = evaluateTransition(state, args);
  const payload = {
    ok: evaluation.ok,
    connector: args.connector,
    from: evaluation.currentStage,
    to: evaluation.targetStage,
    apply: args.apply,
    checks: evaluation.checks,
    warnings: evaluation.warnings,
    errors: evaluation.errors,
    evidence: evaluation.evidence,
  };

  if (args.cmd === "validate" || !args.apply) {
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`Tier-2 workflow validation: ${evaluation.ok ? "PASS" : "FAIL"}`);
      console.log(`connector=${args.connector} from=${evaluation.currentStage} to=${evaluation.targetStage}`);
      for (const check of evaluation.checks) {
        console.log(`- ${check.ok ? "PASS" : "FAIL"} ${check.check}`);
      }
      for (const warning of evaluation.warnings) {
        console.log(`warning: ${warning}`);
      }
      for (const error of evaluation.errors) {
        console.log(`error: ${error}`);
      }
    }
    process.exit(evaluation.ok ? 0 : 1);
  }

  if (!evaluation.ok) {
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    }
    process.exit(1);
  }

  const connectorState = findConnectorState(state, args.connector);
  const transitionRecord = {
    from: connectorState.stage,
    to: args.to,
    decided_at_utc: new Date().toISOString(),
    approved_by: args.approvedBy,
    reason: args.reason || "manual promotion decision",
    evidence: evaluation.evidence,
  };
  connectorState.stage = args.to;
  connectorState.history = Array.isArray(connectorState.history) ? connectorState.history : [];
  connectorState.history.push(transitionRecord);
  state.updated_at_utc = transitionRecord.decided_at_utc;

  writeState(args.stateFile, state);

  const result = {
    ...payload,
    transition: transitionRecord,
    state_file: args.stateFile,
  };
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Applied transition ${args.connector}: ${transitionRecord.from} -> ${transitionRecord.to}`);
    console.log(`state_file=${args.stateFile}`);
  }
}

main();
