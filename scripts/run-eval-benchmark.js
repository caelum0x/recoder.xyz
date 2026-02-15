#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const args = {
    cases: "tools/evals/cases.json",
    output: "tools/evals/latest.json",
    runsDir: "tools/evals/runs",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--cases") args.cases = argv[++i];
    else if (token === "--output") args.output = argv[++i];
    else if (token === "--runs-dir") args.runsDir = argv[++i];
    else if (token === "-h" || token === "--help") {
      console.log(
        "Usage: node scripts/run-eval-benchmark.js [--cases <file>] [--output <file>] [--runs-dir <dir>]"
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
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function runCase(c) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let firstOutputAt = null;

    const child = spawn(c.command, {
      cwd: process.cwd(),
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const onOutput = () => {
      if (firstOutputAt === null) firstOutputAt = Date.now();
    };

    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);

    child.on("close", (code) => {
      const endedAt = Date.now();
      const durationMs = endedAt - startedAt;
      const firstOutputMs = (firstOutputAt ?? endedAt) - startedAt;
      resolve({
        id: c.id,
        name: c.name,
        critical: !!c.critical,
        command: c.command,
        status: code === 0 ? "pass" : "fail",
        exit_code: code ?? 1,
        duration_ms: durationMs,
        first_output_ms: firstOutputMs,
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const cases = readJson(args.cases);
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Cases file must be a non-empty JSON array.");
  }

  const results = [];
  for (const c of cases) {
    if (!c || typeof c.command !== "string" || typeof c.id !== "string") {
      throw new Error("Each case must include string fields: id, command.");
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await runCase(c);
    results.push(result);
    const marker = result.status === "pass" ? "PASS" : "FAIL";
    console.log(`${marker} ${result.id} (${result.duration_ms}ms, first_output=${result.first_output_ms}ms)`);
  }

  const total = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const failedCritical = results.filter((r) => r.status !== "pass" && r.critical).length;
  const durations = results.map((r) => r.duration_ms);
  const firstOutputs = results.map((r) => r.first_output_ms);

  const report = {
    generated_at_utc: new Date().toISOString(),
    source: "tools/evals/cases.json",
    total_cases: total,
    passed_cases: passed,
    failed_cases: total - passed,
    metrics: {
      task_success_rate: total === 0 ? 0 : Number((passed / total).toFixed(4)),
      first_pass_accept_rate: total === 0 ? 0 : Number((passed / total).toFixed(4)),
      median_time_to_first_token_ms: Math.round(median(firstOutputs)),
      median_time_to_apply_ms: Math.round(median(durations)),
      p95_end_to_end_request_latency_ms: Math.round(percentile(durations, 95)),
      critical_incidents_per_week: failedCritical,
    },
    cases: results,
  };

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  const runsDir = path.resolve(args.runsDir);
  fs.mkdirSync(runsDir, { recursive: true });
  const runFile = path.join(runsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(runFile, `${JSON.stringify(report, null, 2)}\n`);

  console.log("");
  console.log(`Wrote benchmark report: ${outputPath}`);
  console.log(`Wrote run artifact: ${runFile}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
