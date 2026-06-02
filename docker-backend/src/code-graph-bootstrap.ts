/**
 * @module code-graph-bootstrap
 *
 * Best-effort, fire-and-forget auto-build of the code knowledge graph when a
 * coding-runtime session starts, so agents can immediately navigate the project
 * (see code-graph.ts + the /api/code-graph/* routes). Enumerates the project's
 * source files in the sandbox, reads them under conservative caps, and stores a
 * graph keyed by projectId.
 *
 * Sandbox-agnostic: the caller provides a single `exec(command) => stdout`
 * function (works for both Daytona sandboxes and Docker containers via the
 * backend's execInContainer router). Non-blocking and fail-safe by contract —
 * callers invoke without awaiting; every path is wrapped so it never throws.
 * Idempotent: skips when a fresh graph already exists for the project.
 */

import { buildCodeGraph, storeGraph, getStoredGraph } from './code-graph.js';
import { createLogger } from './logger';

const logger = createLogger('code-graph-bootstrap');

const MAX_FILES = 400;
const MAX_TOTAL_BYTES = 4_000_000;
const MAX_FILE_BYTES = 200_000;
const READ_BATCH = 25;
const DELIM = '===RECODER_FILE:';

export type SandboxExec = (command: string) => Promise<string>;

const SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'dist-ssr',
  'coverage', '.cache', 'out', '.turbo', '.vercel',
];

const EXTS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py']);

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// POSIX-sh-safe `find`: prune skip dirs with chained `-path` patterns + `-prune -o`
// (no grouping parens, which have tripped dash/sh in this codebase before), then
// print regular files. Extension filtering happens in JS.
function buildFindCommand(): string {
  const prunes = SKIP_DIRS.map((dir) => `-path '*/${dir}/*' -prune`).join(' -o ');
  return `find . ${prunes} -o -type f -print`;
}

function hasAllowedExt(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXTS.has(ext);
}

async function enumerateSourceFiles(exec: SandboxExec): Promise<string[]> {
  const output = await exec(buildFindCommand());
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((p) => p.replace(/^\.\//, ''))
    .filter(hasAllowedExt)
    .slice(0, MAX_FILES);
}

/** Read files in batches via a single `cat`-with-delimiters exec per batch. */
async function readFiles(exec: SandboxExec, paths: string[]): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;

  for (let i = 0; i < paths.length; i += READ_BATCH) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;
    const batch = paths.slice(i, i + READ_BATCH);
    const cmd = batch
      .map((p) => `printf '\\n${DELIM}%s===\\n' ${shQuote(p)}; cat -- ${shQuote(p)} 2>/dev/null || true`)
      .join('; ');

    let output: string;
    try {
      output = await exec(cmd);
    } catch {
      continue; // skip this batch, keep going
    }

    // Split on the delimiter, capturing the path. Result: [pre, path1, body1, path2, body2, ...]
    const parts = output.split(new RegExp(`\\n${DELIM}(.*?)===\\n`));
    for (let j = 1; j + 1 < parts.length; j += 2) {
      const path = parts[j].trim();
      const content = parts[j + 1] ?? '';
      if (!path || content.length > MAX_FILE_BYTES) continue;
      if (totalBytes + content.length > MAX_TOTAL_BYTES) continue;
      totalBytes += content.length;
      files.push({ path, content });
    }
  }
  return files;
}

/**
 * Build and store the code graph for a freshly started session. Fire-and-forget:
 * never throws, logs on failure, no-ops if a graph already exists.
 *
 * @param exec - runs a shell command in the sandbox and returns stdout
 *               (e.g. (cmd) => execInContainer(sandboxId, cmd))
 * @param projectId - key under which the graph is stored
 */
export async function autoBuildCodeGraph(exec: SandboxExec, projectId: string): Promise<void> {
  try {
    if (getStoredGraph(projectId)) {
      return; // already built and still fresh
    }
    const paths = await enumerateSourceFiles(exec);
    if (paths.length === 0) return;
    const files = await readFiles(exec, paths);
    if (files.length === 0) return;
    const graph = buildCodeGraph(files, { maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES });
    storeGraph(projectId, graph);
    logger.info({ projectId, stats: graph.stats }, 'auto-built code graph for session');
  } catch (err) {
    logger.warn({ err, projectId }, 'auto code-graph build failed (non-fatal)');
  }
}
