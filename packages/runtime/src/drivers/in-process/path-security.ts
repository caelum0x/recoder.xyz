import * as path from 'node:path';

/**
 * Fused from `ts/open-agents/packages/agent/tools/path-security.ts` +
 * `tools/utils.ts` (the workspace-containment + dotenv guards). Kept dependency-free
 * (no @open-agents/sandbox import) so the in-process driver compiles inside
 * `@recoder/runtime`. These are the same security boundaries the original tools enforced.
 */

/** Whether a path's basename starts with `.env` (dotenv family, sensitive). */
export function isDotEnvFilePath(filePath: string): boolean {
  const basename = path.basename(filePath.split('\\').join('/')).toLowerCase();
  return basename.startsWith('.env');
}

/**
 * Whether `filePath` is within (or equal to) `directory`. Used as the path-traversal
 * boundary for every file tool. Ported verbatim from open-agents `isPathWithinDirectory`.
 */
export function isPathWithinDirectory(filePath: string, directory: string): boolean {
  const resolvedDir = path.resolve(directory);
  const resolvedPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedDir, filePath);
  return resolvedPath.startsWith(resolvedDir + path.sep) || resolvedPath === resolvedDir;
}

/**
 * Resolve a workspace-relative (or absolute) path and return the absolute form only if it
 * stays inside the workspace; otherwise `null`. Mirrors open-agents `resolveWorkspacePath`.
 */
export function resolveWorkspacePath(
  filePath: string,
  workingDirectory: string,
): string | null {
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workingDirectory, filePath);
  return isPathWithinDirectory(absolutePath, workingDirectory) ? absolutePath : null;
}

/** Whether the requested/absolute path resolves to a dotenv file (sensitive read/write). */
export function isSensitiveDotEnvPath(params: {
  requestedPath: string;
  absolutePath: string;
}): boolean {
  return isDotEnvFilePath(params.requestedPath) || isDotEnvFilePath(params.absolutePath);
}

/**
 * Convert a path into a compact, model-friendly display path. Ported from open-agents
 * `toDisplayPath`: paths inside the workspace are returned relative; outside stay absolute.
 */
export function toDisplayPath(filePath: string, workingDirectory: string): string {
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workingDirectory, filePath);

  if (!isPathWithinDirectory(absolutePath, workingDirectory)) {
    return absolutePath.replace(/\\/g, '/');
  }

  const relativePath = path.relative(workingDirectory, absolutePath);
  if (relativePath === '') return '.';
  return relativePath.replace(/\\/g, '/');
}
