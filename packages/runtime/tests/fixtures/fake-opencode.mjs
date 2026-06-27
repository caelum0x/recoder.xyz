#!/usr/bin/env node
// Offline fake of the user's `opencode` CLI for deterministic driver tests.
//
// Behavior:
//   --version            -> prints a version line, exits 0
//   run --format json    -> reads stdin (the prompt), echoes the recorded fixture event
//                           stream line-by-line to stdout, exits with FAKE_OPENCODE_EXIT
//                           (default 0). No network, no model spend.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (args.includes('--version')) {
  process.stdout.write('opencode 0.0.0-fake\n');
  process.exit(0);
}

// Drain stdin (the prompt) so the parent's stdin.end() resolves cleanly.
await new Promise((resolve) => {
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      resolve();
    }
  };
  process.stdin.on('data', () => {});
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
  // If stdin was already closed, end may not fire.
  setTimeout(finish, 50);
});

const fixturePath =
  process.env.FAKE_OPENCODE_FIXTURE ?? path.resolve(__dirname, 'opencode-messages.jsonl');
const stream = readFileSync(fixturePath, 'utf8');
process.stdout.write(stream);

const exit = Number(process.env.FAKE_OPENCODE_EXIT ?? '0');
process.exit(Number.isFinite(exit) ? exit : 0);
