import { spawn } from 'node:child_process';
import path from 'node:path';

/** A symmetric, history-backed relationship between two source files. */
export type CoChangeEdge = {
  left: string;
  right: string;
  /** Number of bounded history commits that changed both files. */
  commits: number;
  /** Jaccard similarity over commits that changed either file. */
  confidence: number;
};

export type CoChangeHistoryOptions = {
  maxCommits?: number;
  /** Ignore broad formatting/vendor commits that touch more source files than this. */
  maxFilesPerCommit?: number;
  minSharedCommits?: number;
  minConfidence?: number;
  /** Prevent one generated or central file from dominating the snapshot. */
  maxNeighborsPerFile?: number;
  /** Override local git history input for embedded hosts or deterministic callers. */
  reader?: GitHistoryReader;
};

export type GitHistoryReader = (
  repoRoot: string,
  maxCommits: number,
) => Promise<readonly (readonly string[])[]>;

const DEFAULT_MAX_COMMITS = 500;
const DEFAULT_MAX_FILES_PER_COMMIT = 50;
const DEFAULT_MIN_SHARED_COMMITS = 2;
const DEFAULT_MIN_CONFIDENCE = 0.1;
const DEFAULT_MAX_NEIGHBORS = 20;
const MAX_GIT_LOG_BYTES = 16 * 1024 * 1024;

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function probability(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

function normalizeRepoPath(value: string): string | null {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return null;
  if (normalized.split('/').some((part) => !part || part === '..')) return null;
  return path.posix.normalize(normalized);
}

/** Parse the NUL-delimited output produced by {@link readGitHistory}. */
export function parseGitHistoryLog(output: string): string[][] {
  const commits: string[][] = [];
  for (const segment of output.split('\x1e\0').slice(1)) {
    const files = segment
      .replace(/^\r?\n/, '')
      .split('\0')
      .map(normalizeRepoPath)
      .filter((file): file is string => file !== null);
    if (files.length > 0) commits.push([...new Set(files)]);
  }
  return commits;
}

/** Read a bounded, rename-resolved commit/file stream from the local checkout. */
export const readGitHistory: GitHistoryReader = async (repoRoot, maxCommits) =>
  new Promise((resolve) => {
    const child = spawn('git', [
      'log',
      '--no-merges',
      '--find-renames',
      '--format=%x1e',
      '--name-only',
      '-z',
      '-n',
      String(maxCommits),
      '--',
    ], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (commits: string[][]): void => {
      if (settled) return;
      settled = true;
      resolve(commits);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_GIT_LOG_BYTES) {
        child.kill();
        finish([]);
        return;
      }
      chunks.push(chunk);
    });
    child.once('error', () => finish([]));
    child.once('close', (code) => {
      if (code !== 0 || bytes > MAX_GIT_LOG_BYTES) {
        finish([]);
        return;
      }
      finish(parseGitHistoryLog(Buffer.concat(chunks).toString('utf8')));
    });
  });

/**
 * Turn commit membership into a sparse co-change graph. Similarity is based on
 * real commit overlap, while large sweeping commits and weak one-off pairs are
 * excluded so review evidence stays useful.
 */
export function buildCoChangeEdges(
  commits: readonly (readonly string[])[],
  sourceFiles: readonly string[],
  options: CoChangeHistoryOptions = {},
): CoChangeEdge[] {
  const sourceSet = new Set(sourceFiles);
  const maxFilesPerCommit = positiveInt(options.maxFilesPerCommit, DEFAULT_MAX_FILES_PER_COMMIT);
  const minSharedCommits = positiveInt(options.minSharedCommits, DEFAULT_MIN_SHARED_COMMITS);
  const minConfidence = probability(options.minConfidence, DEFAULT_MIN_CONFIDENCE);
  const maxNeighbors = positiveInt(options.maxNeighborsPerFile, DEFAULT_MAX_NEIGHBORS);
  const changes = new Map<string, number>();
  const pairs = new Map<string, { left: string; right: string; commits: number }>();

  for (const commit of commits) {
    const files = [...new Set(commit)]
      .filter((file) => sourceSet.has(file))
      .sort();
    if (files.length < 2 || files.length > maxFilesPerCommit) continue;
    for (const file of files) changes.set(file, (changes.get(file) ?? 0) + 1);
    for (let leftIndex = 0; leftIndex < files.length - 1; leftIndex += 1) {
      const left = files[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < files.length; rightIndex += 1) {
        const right = files[rightIndex];
        if (!right) continue;
        const key = `${left}\0${right}`;
        const prior = pairs.get(key);
        pairs.set(key, { left, right, commits: (prior?.commits ?? 0) + 1 });
      }
    }
  }

  const candidates = [...pairs.values()].flatMap((pair): CoChangeEdge[] => {
    if (pair.commits < minSharedCommits) return [];
    const union = (changes.get(pair.left) ?? 0) + (changes.get(pair.right) ?? 0) - pair.commits;
    if (union <= 0) return [];
    const confidence = pair.commits / union;
    if (confidence < minConfidence) return [];
    return [{ ...pair, confidence: Math.round(confidence * 10_000) / 10_000 }];
  }).sort((a, b) =>
    b.commits - a.commits ||
    b.confidence - a.confidence ||
    a.left.localeCompare(b.left) ||
    a.right.localeCompare(b.right));

  const neighbors = new Map<string, number>();
  const kept: CoChangeEdge[] = [];
  for (const edge of candidates) {
    if ((neighbors.get(edge.left) ?? 0) >= maxNeighbors) continue;
    if ((neighbors.get(edge.right) ?? 0) >= maxNeighbors) continue;
    kept.push(edge);
    neighbors.set(edge.left, (neighbors.get(edge.left) ?? 0) + 1);
    neighbors.set(edge.right, (neighbors.get(edge.right) ?? 0) + 1);
  }
  return kept.sort((a, b) => a.left.localeCompare(b.left) || a.right.localeCompare(b.right));
}

/** Index bounded local git history; a non-git checkout simply has no history evidence. */
export async function indexGitCoChanges(
  repoRoot: string,
  sourceFiles: readonly string[],
  options: CoChangeHistoryOptions = {},
): Promise<CoChangeEdge[]> {
  const maxCommits = positiveInt(options.maxCommits, DEFAULT_MAX_COMMITS);
  const commits = await (options.reader ?? readGitHistory)(repoRoot, maxCommits).catch(() => []);
  return buildCoChangeEdges(commits, sourceFiles, options);
}
