#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const days = process.env.CHANGELOG_DAYS ?? '7';
const outputPath = resolve(ROOT, 'CHANGELOG_WEEKLY.md');

const log = spawnSync(
  'git',
  ['log', `--since=${days} days ago`, '--pretty=format:%h|%an|%s'],
  { cwd: ROOT, encoding: 'utf8' }
);

if (log.status !== 0) {
  console.error(log.stderr || log.stdout || 'Failed to read git history');
  process.exit(1);
}

const lines = log.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const header = `# Weekly Changelog\n\nGenerated: ${new Date().toISOString()}\nWindow: last ${days} days\n\n`;

if (lines.length === 0) {
  writeFileSync(outputPath, `${header}No commits in this window.\n`);
  console.log(`Wrote ${outputPath}`);
  process.exit(0);
}

const entries = lines.map((line) => {
  const [sha, author, subject] = line.split('|');
  return `- ${subject} (\`${sha}\`, ${author})`;
});

writeFileSync(outputPath, `${header}${entries.join('\n')}\n`);
console.log(`Wrote ${outputPath} with ${entries.length} entries.`);
