import type { RuntimeEvidenceArtifact } from '../types/evidence';
import type { ExecutionEnvironment } from '../env/execution-environment';
import { hashArtifactBody } from './artifact-hasher';

/**
 * Capture the working-tree diff at terminal state as an artifact. Runs `git diff` (and a
 * `--stat` summary) in the run's environment. When the cwd is not a git repo or git is
 * absent, returns `null` (no diff to capture) rather than a fake empty artifact.
 */
export async function captureGitDiffArtifact(input: {
  env: ExecutionEnvironment;
  cwd: string;
  signal?: AbortSignal;
}): Promise<RuntimeEvidenceArtifact | null> {
  const isRepo = await input.env.exec({
    command: 'git',
    args: ['rev-parse', '--is-inside-work-tree'],
    cwd: input.cwd,
    signal: input.signal,
  });
  if (isRepo.exitCode !== 0 || isRepo.stdout.trim() !== 'true') {
    return null;
  }

  const diff = await input.env.exec({
    command: 'git',
    args: ['diff', '--no-color', 'HEAD'],
    cwd: input.cwd,
    signal: input.signal,
  });

  const body = diff.stdout;
  if (body.trim().length === 0) {
    return {
      kind: 'git_status',
      status: 'observed',
      title: 'Working tree clean',
      summary: 'No uncommitted changes were present at terminal state.',
      contentType: 'text/plain',
      ...hashArtifactBody(''),
      command: 'git diff --no-color HEAD',
    };
  }

  return {
    kind: 'file_mutation',
    status: 'observed',
    title: 'Working-tree diff',
    summary: `Captured ${countChangedFiles(body)} changed file(s).`,
    contentType: 'text/x-diff',
    ...hashArtifactBody(body),
    command: 'git diff --no-color HEAD',
    metadata: { diff: body },
  };
}

function countChangedFiles(diff: string): number {
  let count = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) count += 1;
  }
  return count;
}
