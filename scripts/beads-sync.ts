import { execFileSync } from 'node:child_process';

function run(args: string[]): unknown {
  const output = execFileSync('bd', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output);
}

function main(): void {
  const ready = run(['ready', '--json']);
  console.log(JSON.stringify({
    ok: true,
    mode: 'read-only',
    source: 'beads',
    ready,
  }, null, 2));
}

main();
