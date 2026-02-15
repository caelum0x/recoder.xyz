#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    dataset: "tools/evals/composer/dataset.json",
    results: "tools/evals/composer/sample-results.json",
    output: "tools/evals/composer/latest.json",
    minPassRate: 0.8,
    strict: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--") continue;
    if (t === "--dataset") args.dataset = argv[++i];
    else if (t === "--results") args.results = argv[++i];
    else if (t === "--output") args.output = argv[++i];
    else if (t === "--min-pass-rate") args.minPassRate = Number(argv[++i]);
    else if (t === "--strict") args.strict = true;
    else if (t === "-h" || t === "--help") {
      console.log(
        "Usage: node scripts/score-composer-dataset.js [--dataset <file>] [--results <file>] [--output <file>] [--min-pass-rate <n>] [--strict]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${t}`);
    }
  }
  return args;
}

function readJson(filePath) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) throw new Error(`File not found: ${full}`);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function byId(arr) {
  const map = new Map();
  for (const item of arr) {
    if (item && typeof item.id === "string") map.set(item.id, item);
  }
  return map;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function scoreCase(datasetCase, resultCase) {
  const reasons = [];
  const expected = datasetCase.expected || {};
  const changes = Array.isArray(resultCase?.changes) ? resultCase.changes : [];
  const changedFiles = new Set(changes.map((c) => c.file).filter(Boolean));
  const textBlob = normalizeText(
    changes
      .map((c) => [c.file || "", c.diff || "", c.summary || ""].join("\n"))
      .join("\n")
  );

  for (const f of expected.files_touched || []) {
    if (!changedFiles.has(f)) reasons.push(`missing expected file: ${f}`);
  }
  for (const needle of expected.required_snippets || []) {
    if (!textBlob.includes(normalizeText(needle))) {
      reasons.push(`missing required snippet: ${needle}`);
    }
  }
  for (const needle of expected.forbidden_snippets || []) {
    if (textBlob.includes(normalizeText(needle))) {
      reasons.push(`contains forbidden snippet: ${needle}`);
    }
  }

  return {
    id: datasetCase.id,
    title: datasetCase.title || datasetCase.id,
    critical: !!datasetCase.critical,
    status: reasons.length === 0 ? "pass" : "fail",
    reasons,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const dataset = readJson(args.dataset);
  const results = readJson(args.results);

  if (!Array.isArray(dataset) || dataset.length === 0) {
    throw new Error("Dataset must be a non-empty array.");
  }
  if (!results || !Array.isArray(results.cases)) {
    throw new Error("Results must include a 'cases' array.");
  }

  const resultMap = byId(results.cases);
  const scored = dataset.map((c) => {
    const r = resultMap.get(c.id);
    if (!r) {
      return {
        id: c.id,
        title: c.title || c.id,
        critical: !!c.critical,
        status: "fail",
        reasons: ["missing result case"],
      };
    }
    return scoreCase(c, r);
  });

  const total = scored.length;
  const passed = scored.filter((x) => x.status === "pass").length;
  const failedCritical = scored.filter((x) => x.status !== "pass" && x.critical).length;
  const passRate = total === 0 ? 0 : passed / total;

  const report = {
    generated_at_utc: new Date().toISOString(),
    dataset: path.resolve(args.dataset),
    results: path.resolve(args.results),
    metrics: {
      composer_case_pass_rate: Number(passRate.toFixed(4)),
      composer_failed_critical_cases: failedCritical,
    },
    summary: {
      total_cases: total,
      passed_cases: passed,
      failed_cases: total - passed,
      min_pass_rate: args.minPassRate,
      strict: args.strict,
    },
    cases: scored,
  };

  const out = path.resolve(args.output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  console.log("== Composer Dataset Score ==");
  console.log(`dataset: ${path.resolve(args.dataset)}`);
  console.log(`results: ${path.resolve(args.results)}`);
  console.log(`output:  ${out}`);
  console.log("");
  for (const c of scored) {
    const tag = c.status === "pass" ? "PASS" : "FAIL";
    console.log(`${tag} ${c.id}${c.critical ? " [critical]" : ""}`);
    for (const reason of c.reasons) console.log(`  - ${reason}`);
  }
  console.log("");
  console.log(`pass_rate: ${passRate.toFixed(4)}`);
  console.log(`failed_critical: ${failedCritical}`);

  const failedGate = passRate < args.minPassRate || (args.strict && failedCritical > 0);
  if (failedGate) {
    console.error(
      `composer score gate: FAIL (pass_rate=${passRate.toFixed(4)}, min=${args.minPassRate}, failed_critical=${failedCritical})`
    );
    process.exit(1);
  }
  console.log("composer score gate: PASS");
}

main();
