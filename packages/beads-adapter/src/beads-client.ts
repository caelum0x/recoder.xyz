import { execFileSync } from 'node:child_process';
import type { BeadsIssue } from './beads-parser';

export type BeadsCommandRunner = (args: string[]) => string;

export type BeadsClient = {
  ready(): BeadsIssue[];
  show(issueId: string): BeadsIssue | null;
  create(input: { title: string; description: string; type?: string; priority?: number }): BeadsIssue;
  update(issueId: string, args: string[]): BeadsIssue;
  close(issueId: string, reason: string): BeadsIssue;
};

export function createBeadsCliRunner(cwd = process.cwd()): BeadsCommandRunner {
  return (args) => execFileSync('bd', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function parseJson<T>(output: string, fallback: T): T {
  try {
    return JSON.parse(output) as T;
  } catch {
    return fallback;
  }
}

export function createBeadsClient(runner: BeadsCommandRunner = createBeadsCliRunner()): BeadsClient {
  return {
    ready() {
      return parseJson<BeadsIssue[]>(runner(['ready', '--json']), []);
    },
    show(issueId) {
      const result = parseJson<BeadsIssue[]>(runner(['show', issueId, '--json']), []);
      return result[0] ?? null;
    },
    create(input) {
      const result = parseJson<BeadsIssue[]>(
        runner([
          'create',
          input.title,
          `--description=${input.description}`,
          '-t',
          input.type ?? 'task',
          '-p',
          `${input.priority ?? 2}`,
          '--json',
        ]),
        [],
      );
      if (!result[0]) {
        throw new Error('bd create did not return an issue.');
      }
      return result[0];
    },
    update(issueId, args) {
      const result = parseJson<BeadsIssue[]>(runner(['update', issueId, ...args, '--json']), []);
      if (!result[0]) {
        throw new Error(`bd update did not return issue ${issueId}.`);
      }
      return result[0];
    },
    close(issueId, reason) {
      const result = parseJson<BeadsIssue[]>(
        runner(['close', issueId, '--reason', reason, '--json']),
        [],
      );
      if (!result[0]) {
        throw new Error(`bd close did not return issue ${issueId}.`);
      }
      return result[0];
    },
  };
}
