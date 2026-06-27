#!/usr/bin/env node
// Offline fake of the user's `pi` CLI for deterministic pi-driver tests.
//
// Behavior:
//   --version           -> prints a version line, exits 0
//   --mode json -p ...   -> emits the recorded pi JSONL event stream to stdout, exits with
//                           FAKE_PI_EXIT (default 0). No network, no model spend.
//   --mode rpc           -> reads RpcCommand JSONL on stdin; on the first `prompt` command it
//                           acks then emits the recorded event stream (events have no `id`),
//                           ending with `agent_end`. Honors `abort` by exiting.
//
// (A no-terminal variant lives in fake-pi-no-done.mjs, since the runtime's offline env-builder
//  allow-lists env keys and a behavior flag cannot be passed to the child via env.)
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

function loadStreamLines() {
  const raw = readFileSync(FIXTURE, 'utf8');
  return raw.split('\n').filter((l) => l.trim().length > 0);
}

async function writeLines(lines) {
  for (const line of lines) {
    await new Promise((resolve, reject) => {
      process.stdout.write(line + '\n', (err) => (err ? reject(err) : resolve()));
    });
  }
}

const mode = (() => {
  const i = args.indexOf('--mode');
  return i !== -1 ? args[i + 1] : 'json';
})();

if (mode === 'rpc') {
  // RPC: wait for the first `prompt` command on stdin, ack it, then stream events.
  let buffer = '';
  let started = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim() === '') continue;
      let cmd;
      try {
        cmd = JSON.parse(line);
      } catch {
        continue;
      }
      if (cmd.type === 'abort') {
        process.exit(0);
      }
      if (cmd.type === 'prompt' && !started) {
        started = true;
        // Ack the prompt command (correlated by id).
        process.stdout.write(
          JSON.stringify({ type: 'response', id: cmd.id, command: 'prompt', success: true }) + '\n',
        );
        await writeLines(loadStreamLines());
        process.exit(Number(process.env.FAKE_PI_EXIT ?? '0'));
      }
    }
  });
} else {
  // json/print: stream the fixture and exit.
  await writeLines(loadStreamLines());
  process.exit(Number(process.env.FAKE_PI_EXIT ?? '0'));
}
