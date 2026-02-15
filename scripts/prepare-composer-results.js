#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    inboxDir: "tools/evals/composer/inbox",
    sample: "tools/evals/composer/sample-results.json",
    output: "tools/evals/composer/results/latest-results.json",
    requireInbox: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--inbox-dir") args.inboxDir = argv[++i];
    else if (t === "--sample") args.sample = argv[++i];
    else if (t === "--output") args.output = argv[++i];
    else if (t === "--require-inbox") args.requireInbox = true;
    else if (t === "--" || t === "-h" || t === "--help") {
      if (t !== "--") {
        console.log(
          "Usage: node scripts/prepare-composer-results.js [--inbox-dir <dir>] [--sample <file>] [--output <file>] [--require-inbox]"
        );
        process.exit(0);
      }
    } else {
      throw new Error(`Unknown argument: ${t}`);
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeCase(entry) {
  if (!entry || typeof entry.id !== "string") return null;
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  return {
    id: entry.id,
    changes: changes.map((c) => ({
      file: c?.file || "",
      summary: c?.summary || "",
      diff: c?.diff || "",
    })),
  };
}

function extractCases(doc) {
  if (Array.isArray(doc)) return doc.map(normalizeCase).filter(Boolean);
  if (Array.isArray(doc?.cases)) return doc.cases.map(normalizeCase).filter(Boolean);
  const single = normalizeCase(doc);
  return single ? [single] : [];
}

function main() {
  const args = parseArgs(process.argv);
  const inboxDir = path.resolve(args.inboxDir);
  const samplePath = path.resolve(args.sample);
  const outputPath = path.resolve(args.output);

  let source = "sample-fallback";
  let cases = [];
  const filesUsed = [];

  if (fs.existsSync(inboxDir)) {
    const files = fs
      .readdirSync(inboxDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(inboxDir, f));

    if (files.length > 0) {
      const mergedById = new Map();
      for (const file of files) {
        try {
          const doc = readJson(file);
          const extracted = extractCases(doc);
          for (const c of extracted) mergedById.set(c.id, c);
          filesUsed.push(file);
        } catch (err) {
          console.error(`Skipping invalid JSON file: ${file} (${err.message})`);
        }
      }
      if (mergedById.size > 0) {
        source = "inbox";
        cases = Array.from(mergedById.values());
      }
    }
  }

  if (cases.length === 0) {
    if (args.requireInbox) {
      throw new Error("No inbox composer results found and --require-inbox is set.");
    }
    if (!fs.existsSync(samplePath)) {
      throw new Error(`No composer inbox results and sample missing: ${samplePath}`);
    }
    const sample = readJson(samplePath);
    cases = extractCases(sample);
    filesUsed.push(samplePath);
  }

  const out = {
    generated_at_utc: new Date().toISOString(),
    source,
    files_used: filesUsed,
    cases,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(out, null, 2)}\n`);

  console.log("== Prepare Composer Results ==");
  console.log(`source: ${source}`);
  console.log(`cases: ${cases.length}`);
  console.log(`output: ${outputPath}`);
}

main();
