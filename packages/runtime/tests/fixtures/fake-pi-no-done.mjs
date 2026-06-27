#!/usr/bin/env node
// Offline fake of `pi` that emits the recorded stream but NEVER the terminal `agent_end`,
// then exits 0. Used to assert the pi driver's fail-safe terminal synthesis: a driver that
// yields no terminal frame must still be wrapped in a single failing terminal by the driver.
//
// This is a sibling of fake-pi.mjs; it exists as a separate binary because the runtime's
// offline env-builder allow-lists env keys, so a behavior flag cannot be passed via env.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, 'pi-run-stream.jsonl');

if (args.includes('--version')) {
  process.stdout.write('pi 0.0.0-fake\n');
  process.exit(0);
}

const lines = readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter((l) => l.trim().length > 0 && !l.includes('"agent_end"'));

for (const line of lines) {
  await new Promise((resolve, reject) => {
    process.stdout.write(line + '\n', (err) => (err ? reject(err) : resolve()));
  });
}
process.exit(0);
