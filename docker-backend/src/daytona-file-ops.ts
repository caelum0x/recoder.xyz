/**
 * Daytona File Operations Bridge
 *
 * Provides file I/O, exec, and workspace helpers that route through
 * the Daytona toolbox proxy instead of Docker.  Used by server.ts
 * whenever a container entry has `daytona: true`.
 *
 * All operations delegate to DaytonaClient (daytona-client.ts) which
 * already handles auth, base64 wrapping, and toolbox URL discovery.
 */

import { getDaytonaClient, type ExecResult, type DaytonaFileInfo } from './daytona-client.js';
import { createLogger } from './logger.js';

const logger = createLogger('daytona-file-ops');

// ── Container entry type shared with server.ts ──

export interface ContainerEntry {
  id: string;
  lastActive: number;
  port: number;
  ptyPort: number;
  backgroundDev?: boolean;
  userId?: string;
  /** When true, this is a Daytona sandbox — not a Docker container */
  daytona?: boolean;
  /** Preview URL for Daytona sandboxes (e.g. https://3000-<id>.sandbox.recoder.xyz) */
  daytonaPreviewUrl?: string;
}

/**
 * Check whether a container entry represents a Daytona sandbox.
 */
export function isDaytonaSandbox(entry: ContainerEntry | undefined): entry is ContainerEntry & { daytona: true } {
  return !!(entry && (entry as any).daytona === true);
}

// ── File operations ──
// These operations use the native Toolbox filesystem API via DaytonaClient,
// which automatically falls back to exec-based commands if native endpoints fail.

/**
 * Write a file into a Daytona sandbox.
 * The file path should be relative to /home/daytona (e.g. "src/App.tsx").
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
export async function daytonaWriteFile(sandboxId: string, relativePath: string, content: string): Promise<void> {
  const dc = getDaytonaClient();
  const fullPath = `/home/daytona/${relativePath}`;
  logger.info({ sandboxId: sandboxId.slice(0, 12), path: relativePath }, 'Daytona: writing file');

  // Retry up to 3 times with backoff for transient Daytona API failures
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await dc.uploadFile(sandboxId, fullPath, content);
      return;
    } catch (err: any) {
      lastError = err;
      logger.warn(
        { sandboxId: sandboxId.slice(0, 12), path: relativePath, attempt, error: err.message },
        'Daytona: file write attempt failed',
      );
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 500));
      }
    }
  }
  throw lastError!;
}

/**
 * Write multiple files into a Daytona sandbox in parallel batches.
 * Uses the native Toolbox filesystem API with exec-based fallback per file.
 */
export async function daytonaWriteFiles(
  sandboxId: string,
  files: Array<{ path: string; content: string }>,
): Promise<{ failed: Array<{ path: string; error: string }> }> {
  const dc = getDaytonaClient();
  const failed: Array<{ path: string; error: string }> = [];
  const BATCH = 10;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(f => dc.uploadFile(sandboxId, `/home/daytona/${f.path}`, f.content)),
    );
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        failed.push({ path: batch[idx].path, error: (r.reason as Error)?.message || 'write failed' });
      }
    });
  }

  return { failed };
}

/**
 * Read a file from a Daytona sandbox.
 * Returns the file content as a string.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
export async function daytonaReadFile(sandboxId: string, relativePath: string): Promise<string> {
  const dc = getDaytonaClient();
  const fullPath = `/home/daytona/${relativePath}`;
  return dc.downloadFile(sandboxId, fullPath);
}

/**
 * Delete a file or directory from a Daytona sandbox.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
export async function daytonaDeleteFile(sandboxId: string, relativePath: string): Promise<void> {
  const dc = getDaytonaClient();
  const fullPath = `/home/daytona/${relativePath}`;
  try {
    await dc.deleteFileNative(sandboxId, fullPath);
  } catch (nativeErr) {
    logger.warn(
      { sandboxId: sandboxId.slice(0, 12), path: relativePath, error: (nativeErr as Error).message },
      'Native filesystem delete failed, falling back to exec-based delete',
    );
    await dc.execCommand(sandboxId, `rm -rf '/home/daytona/${relativePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
  }
}

/**
 * Rename/move a file inside a Daytona sandbox.
 * Uses native mkdir for the target directory, then exec for the mv operation.
 */
export async function daytonaRenameFile(sandboxId: string, oldRelPath: string, newRelPath: string): Promise<void> {
  const dc = getDaytonaClient();
  const dir = newRelPath.substring(0, newRelPath.lastIndexOf('/'));

  // Create target directory via native API with exec fallback
  if (dir) {
    try {
      await dc.createDirectoryNative(sandboxId, `/home/daytona/${dir}`);
    } catch {
      await dc.execCommand(sandboxId, `mkdir -p '/home/daytona/${dir.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
    }
  }

  // mv still requires exec — no native rename/move endpoint
  await dc.execCommand(
    sandboxId,
    `mv '/home/daytona/${oldRelPath.replace(/'/g, "'\\''")}' '/home/daytona/${newRelPath.replace(/'/g, "'\\''")}'`,
    { timeoutSecs: 10 },
  );
}

/**
 * Create a directory inside a Daytona sandbox.
 * Uses the native Toolbox filesystem API with exec-based fallback.
 */
export async function daytonaCreateFolder(sandboxId: string, relativePath: string): Promise<void> {
  const dc = getDaytonaClient();
  try {
    await dc.createDirectoryNative(sandboxId, `/home/daytona/${relativePath}`);
  } catch (nativeErr) {
    logger.warn(
      { sandboxId: sandboxId.slice(0, 12), path: relativePath, error: (nativeErr as Error).message },
      'Native filesystem mkdir failed, falling back to exec-based mkdir',
    );
    await dc.execCommand(sandboxId, `mkdir -p '/home/daytona/${relativePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
  }
}

/**
 * List files in a Daytona sandbox directory.
 * Uses the native Toolbox filesystem API, falling back to exec-based find.
 * Returns a list of absolute paths (matching the Docker find-based output).
 */
export async function daytonaListFiles(sandboxId: string, dirPath: string = '/home/daytona'): Promise<string[]> {
  const dc = getDaytonaClient();

  // Try native filesystem list first
  try {
    const entries = await dc.listFilesNative(sandboxId, dirPath);
    // Convert DaytonaFileInfo entries to absolute paths matching the find-based format
    const absDir = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
    return entries.map(e => `${absDir}/${e.name}`);
  } catch (nativeErr) {
    logger.warn(
      { sandboxId: sandboxId.slice(0, 12), dirPath, error: (nativeErr as Error).message },
      'Native filesystem list failed, falling back to exec-based find',
    );
    // Fallback to exec-based find — same as the Docker route, producing same output format
    const result = await dc.execCommand(
      sandboxId,
      `find '${dirPath}' -maxdepth 2 \\( -type f -o -type d \\) 2>/dev/null`,
      { timeoutSecs: 15 },
    );
    return result.output.split('\n').filter(Boolean);
  }
}

// ── Exec operations ──

/**
 * Execute a command in a Daytona sandbox.
 * Returns { output, exitCode }.
 */
export async function daytonaExec(
  sandboxId: string,
  command: string,
  options?: { cwd?: string; timeoutSecs?: number },
): Promise<ExecResult> {
  const dc = getDaytonaClient();
  return dc.execCommand(sandboxId, command, {
    cwd: options?.cwd,
    timeoutSecs: options?.timeoutSecs ?? 30,
  });
}

/**
 * Execute a background command (like a dev server) in a Daytona sandbox.
 * The process is daemonized with nohup/setsid so it outlives the request.
 */
export async function daytonaExecBackground(
  sandboxId: string,
  command: string,
  cwd: string = '/home/daytona',
): Promise<void> {
  const dc = getDaytonaClient();
  const sanitizedCommand = command.replace(/[`$\\]/g, '\\$&');
  const script = `cd "${cwd.replace(/"/g, '\\"')}" && BROWSER=none nohup setsid ${sanitizedCommand} > /tmp/dev.log 2>&1 &`;
  await dc.execCommand(sandboxId, script, { timeoutSecs: 10 });
}

// ── Workspace state ──

/**
 * Get workspace state from a Daytona sandbox (fileCount, hasPackageJson, devServerRunning).
 */
export async function daytonaGetWorkspaceState(
  sandboxId: string,
  previewUrl?: string,
): Promise<{ hasFiles: boolean; fileCount: number; hasPackageJson: boolean; devServerRunning: boolean }> {
  const dc = getDaytonaClient();

  // File count
  let fileCount = 0;
  try {
    const countResult = await dc.execCommand(
      sandboxId,
      'find /workspace -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l',
      { timeoutSecs: 15 },
    );
    fileCount = parseInt(countResult.output.trim(), 10) || 0;
  } catch (err) {
    logger.warn({ sandboxId, err }, 'Daytona: file count failed');
  }

  // package.json
  let hasPackageJson = false;
  try {
    const pkgResult = await dc.execCommand(
      sandboxId,
      'test -f /home/daytona/package.json && echo "yes" || echo "no"',
      { timeoutSecs: 5 },
    );
    hasPackageJson = pkgResult.output.includes('yes');
  } catch {}

  // Dev server check — probe the preview URL if available
  let devServerRunning = false;
  if (previewUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(previewUrl, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      devServerRunning = resp.status < 500;
    } catch {
      // not running
    }
  }
  // Also try checking via exec (curl localhost inside the sandbox)
  if (!devServerRunning) {
    try {
      const curlResult = await dc.execCommand(
        sandboxId,
        'curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || curl -sf -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "000"',
        { timeoutSecs: 5 },
      );
      const code = parseInt(curlResult.output.trim(), 10);
      devServerRunning = code > 0 && code < 500;
    } catch {}
  }

  return { hasFiles: fileCount > 0, fileCount, hasPackageJson, devServerRunning };
}

// ── Container lifecycle ──

/**
 * Ensure a Daytona sandbox is in a running state.
 * Equivalent to ensureContainerRunning for Docker containers.
 */
export async function ensureDaytonaSandboxRunning(
  sandboxId: string,
): Promise<{ running: boolean; restarted: boolean; error?: string }> {
  const dc = getDaytonaClient();
  try {
    const sandbox = await dc.getOrStartSandbox(sandboxId, 30000);
    const isRunning = sandbox.state === 'started' || sandbox.state === 'running';
    const wasRestarted = sandbox.state !== 'started';

    // After restarting a stopped sandbox, all processes (including dev server) are gone.
    // Auto-restart the dev server if package.json exists and has a dev script.
    if (isRunning && wasRestarted) {
      logger.info({ sandboxId }, 'Daytona: sandbox was restarted, checking if dev server needs restart');
      try {
        const checkResult = await dc.execCommand(sandboxId,
          'test -f /home/daytona/package.json && grep -q \'"dev"\' /home/daytona/package.json && echo HAS_DEV || echo NO_DEV',
          { timeoutSecs: 5 },
        );
        if (checkResult.output?.includes('HAS_DEV')) {
          // Check if dev server is already running
          const portCheck = await dc.execCommand(sandboxId,
            'curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000"',
            { timeoutSecs: 5 },
          );
          const code = parseInt(portCheck.output?.trim() || '0', 10);
          if (code === 0 || code >= 500) {
            logger.info({ sandboxId }, 'Daytona: dev server not running after restart, auto-starting');
            await daytonaExecBackground(sandboxId, 'npm run dev -- --host 0.0.0.0 --port 3000', '/home/daytona');
          }
        }
      } catch (devErr: any) {
        logger.warn({ sandboxId, err: devErr.message }, 'Daytona: dev server auto-restart failed (non-fatal)');
      }
    }

    return { running: isRunning, restarted: wasRestarted };
  } catch (err: any) {
    logger.error({ sandboxId, err: err.message }, 'Daytona: failed to ensure sandbox running');
    return { running: false, restarted: false, error: err.message };
  }
}

/**
 * Stop and delete a Daytona sandbox.
 */
export async function daytonaDeleteSandbox(sandboxId: string): Promise<void> {
  const dc = getDaytonaClient();
  try {
    await dc.stopSandbox(sandboxId);
  } catch {
    // May already be stopped
  }
  await dc.deleteSandbox(sandboxId);
}

/**
 * Get logs from a Daytona sandbox (dev server logs).
 */
export async function daytonaGetLogs(sandboxId: string, tail: number = 100): Promise<string> {
  const dc = getDaytonaClient();
  try {
    const result = await dc.execCommand(
      sandboxId,
      `tail -n ${tail} /tmp/dev.log 2>/dev/null || echo "(no dev server logs)"`,
      { timeoutSecs: 10 },
    );
    return result.output;
  } catch (err: any) {
    return `(failed to fetch logs: ${err.message})`;
  }
}
