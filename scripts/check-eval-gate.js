#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    thresholds: "tools/evals/thresholds.json",
    report: "tools/evals/latest.json",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--thresholds") {
      args.thresholds = argv[++i];
    } else if (token === "--report") {
      args.report = argv[++i];
    } else if (token === "-h" || token === "--help") {
      console.log(
        "Usage: node scripts/check-eval-gate.js [--thresholds <file>] [--report <file>]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function readJson(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function formatResult(metric, actual, op, target, pass) {
  const status = pass ? "PASS" : "FAIL";
  return `${status.padEnd(5)} ${metric.padEnd(38)} actual=${String(actual).padStart(8)}  ${op}  target=${target}`;
}

function main() {
  const { thresholds: thresholdsPath, report: reportPath } = parseArgs(process.argv);
  const thresholds = readJson(thresholdsPath);
  const report = readJson(reportPath);

  if (!thresholds || typeof thresholds !== "object" || !thresholds.metrics) {
    throw new Error("Thresholds file must include a top-level 'metrics' object.");
  }
  if (!report || typeof report !== "object" || !report.metrics) {
    throw new Error("Report file must include a top-level 'metrics' object.");
  }

  const metricNames = Object.keys(thresholds.metrics);
  if (metricNames.length === 0) {
    throw new Error("No metrics configured in thresholds file.");
  }

  let failed = 0;
  let checked = 0;

  console.log("== Eval Gate ==");
  console.log(`thresholds: ${path.resolve(thresholdsPath)}`);
  console.log(`report:     ${path.resolve(reportPath)}`);
  if (report.generated_at_utc) {
    console.log(`generated:  ${report.generated_at_utc}`);
  }
  console.log("");

  for (const metric of metricNames) {
    const rule = thresholds.metrics[metric];
    const actual = report.metrics[metric];
    checked += 1;

    if (typeof actual !== "number" || Number.isNaN(actual)) {
      failed += 1;
      console.log(formatResult(metric, "missing", "?", rule.value, false));
      continue;
    }

    if (!rule || (rule.type !== "min" && rule.type !== "max") || typeof rule.value !== "number") {
      failed += 1;
      console.log(formatResult(metric, actual, "?", "invalid rule", false));
      continue;
    }

    const pass = rule.type === "min" ? actual >= rule.value : actual <= rule.value;
    if (!pass) failed += 1;
    console.log(
      formatResult(metric, actual, rule.type === "min" ? ">=" : "<=", rule.value, pass)
    );
  }

  console.log("");
  console.log(`metrics checked: ${checked}`);
  console.log(`failures: ${failed}`);

  if (failed > 0) {
    console.error(`eval gate: FAIL (${failed} metric(s) out of threshold)`);
    process.exit(1);
  }

  console.log("eval gate: PASS");
}

main();
