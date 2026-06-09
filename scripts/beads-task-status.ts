import { execFileSync } from 'node:child_process';

function main(): void {
  const issueId = process.argv[2];
  const args = issueId ? ['show', issueId, '--json'] : ['ready', '--json'];
  const output = execFileSync('bd', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(output.trim());
}

main();
