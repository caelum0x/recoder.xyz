#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const TARGETS = [
  'app/coverage/coverage-summary.json',
  'docker-backend/coverage/coverage-summary.json',
  'recoder-web/coverage/coverage-summary.json',
  'recoder-frontend/coverage/coverage-summary.json',
  'recoder-agency/coverage/coverage-summary.json',
  'recoder-studio/coverage/coverage-summary.json',
  'recoder-pm/coverage/coverage-summary.json',
];

const minLines = Number(process.env.COVERAGE_MIN_LINES ?? 70);
const minStatements = Number(process.env.COVERAGE_MIN_STATEMENTS ?? 70);
const minFunctions = Number(process.env.COVERAGE_MIN_FUNCTIONS ?? 70);
const minBranches = Number(process.env.COVERAGE_MIN_BRANCHES ?? 60);

const totals = {
  lines: { total: 0, covered: 0 },
  statements: { total: 0, covered: 0 },
  functions: { total: 0, covered: 0 },
  branches: { total: 0, covered: 0 },
};

const included = [];

for (const relativePath of TARGETS) {
  const absolutePath = resolve(ROOT, relativePath);
  if (!existsSync(absolutePath)) continue;
  const summary = JSON.parse(readFileSync(absolutePath, 'utf8'));
  const t = summary?.total;
  if (!t) continue;

  included.push(relativePath);
  for (const key of ['lines', 'statements', 'functions', 'branches']) {
    totals[key].total += Number(t[key]?.total ?? 0);
    totals[key].covered += Number(t[key]?.covered ?? 0);
  }
}

if (included.length === 0) {
  console.error('No coverage summary files found.');
  process.exit(1);
}

function pct(bucket) {
  if (!bucket.total) return 0;
  return (bucket.covered / bucket.total) * 100;
}

const report = {
  generatedAt: new Date().toISOString(),
  included,
  aggregate: {
    lines: { ...totals.lines, pct: Number(pct(totals.lines).toFixed(2)) },
    statements: { ...totals.statements, pct: Number(pct(totals.statements).toFixed(2)) },
    functions: { ...totals.functions, pct: Number(pct(totals.functions).toFixed(2)) },
    branches: { ...totals.branches, pct: Number(pct(totals.branches).toFixed(2)) },
  },
  thresholds: {
    lines: minLines,
    statements: minStatements,
    functions: minFunctions,
    branches: minBranches,
  },
};

const outDir = resolve(ROOT, 'logs/coverage');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'aggregate-summary.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));

const failed =
  report.aggregate.lines.pct < minLines ||
  report.aggregate.statements.pct < minStatements ||
  report.aggregate.functions.pct < minFunctions ||
  report.aggregate.branches.pct < minBranches;

if (failed) {
  console.error('Coverage gate failed.');
  process.exit(1);
}

console.log('Coverage gate passed.');
