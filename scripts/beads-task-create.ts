import { execFileSync } from 'node:child_process';

const title = process.argv.slice(2).join(' ').trim();

if (!title) {
  console.error('Usage: pnpm beads:task:create "Task title"');
  process.exit(1);
}

const output = execFileSync(
  'bd',
  ['create', title, '--description=Created through Recoder Agent OS Beads adapter.', '-t', 'task', '-p', '2', '--json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);

console.log(output.trim());
