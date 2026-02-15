#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    inboxDir: "tools/evals/composer/inbox",
    minFiles: 1,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--inbox-dir") args.inboxDir = argv[++i];
    else if (t === "--min-files") args.minFiles = Number(argv[++i]);
    else if (t === "--" || t === "-h" || t === "--help") {
      if (t !== "--") {
        console.log("Usage: node scripts/check-composer-inbox.js [--inbox-dir <dir>] [--min-files <n>]");
        process.exit(0);
      }
    } else {
      throw new Error(`Unknown argument: ${t}`);
    }
  }
  return args;
}

function extractCases(doc) {
  if (Array.isArray(doc?.cases)) return doc.cases;
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc.id === "string") return [doc];
  return [];
}

function main() {
  const args = parseArgs(process.argv);
  const inboxDir = path.resolve(args.inboxDir);

  if (!fs.existsSync(inboxDir)) {
    console.error(`composer inbox missing: ${inboxDir}`);
    process.exit(1);
  }

  const jsonFiles = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"));
  if (jsonFiles.length < args.minFiles) {
    console.error(
      `composer inbox validation FAIL: expected at least ${args.minFiles} json file(s), found ${jsonFiles.length}`
    );
    process.exit(1);
  }

  let validFiles = 0;
  let totalCases = 0;
  const missingId = [];

  for (const file of jsonFiles) {
    const full = path.join(inboxDir, file);
    try {
      const doc = JSON.parse(fs.readFileSync(full, "utf8"));
      const cases = extractCases(doc);
      if (cases.length === 0) continue;
      let fileHasValidCase = false;
      for (const c of cases) {
        if (c && typeof c.id === "string") {
          fileHasValidCase = true;
          totalCases += 1;
        } else {
          missingId.push(`${file}: case missing id`);
        }
      }
      if (fileHasValidCase) validFiles += 1;
    } catch (err) {
      missingId.push(`${file}: invalid JSON (${err.message})`);
    }
  }

  console.log("== Composer Inbox Check ==");
  console.log(`inbox: ${inboxDir}`);
  console.log(`json files: ${jsonFiles.length}`);
  console.log(`valid files: ${validFiles}`);
  console.log(`total cases with id: ${totalCases}`);

  if (validFiles < args.minFiles || totalCases === 0 || missingId.length > 0) {
    for (const issue of missingId) console.error(`- ${issue}`);
    console.error("composer inbox validation: FAIL");
    process.exit(1);
  }

  console.log("composer inbox validation: PASS");
}

main();
