/**
 * `backup.ts` — a logical `pg_dump`/`pg_restore` wrapper for the control-plane
 * database. The `/internal/persistence/backup` edge is approval-gated (a
 * governance write); this module only performs the dump when invoked and
 * degrades to a truthful `down`-shaped failure when `pg_dump` is absent or the
 * DB is unconfigured — never a fabricated success.
 */
import { spawn } from 'node:child_process';
import type { Logger } from '../../../shared/logger.js';
import type { PersistenceConfig } from '../config.js';

export interface BackupResult {
  readonly ok: boolean;
  /** Absolute path to the produced dump file, when ok. */
  readonly path?: string;
  readonly bytes?: number;
  readonly reason?: string;
}

/**
 * Create a logical backup at `outPath` using `pg_dump` in custom format. Never
 * throws — returns a truthful result. Requires `databaseUrl` + `pg_dump` on PATH.
 */
export async function createBackup(cfg: PersistenceConfig, outPath: string, log: Logger): Promise<BackupResult> {
  if (!cfg.databaseUrl) {
    return { ok: false, reason: 'no database configured' };
  }
  return runPgTool('pg_dump', ['--format=custom', '--no-owner', '--file', outPath, cfg.databaseUrl], outPath, log);
}

/** Restore a custom-format dump into the configured database. */
export async function restoreBackup(cfg: PersistenceConfig, dumpPath: string, log: Logger): Promise<BackupResult> {
  if (!cfg.databaseUrl) {
    return { ok: false, reason: 'no database configured' };
  }
  return runPgTool('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', cfg.databaseUrl, dumpPath], dumpPath, log);
}

function runPgTool(bin: string, args: readonly string[], resultPath: string, log: Logger): Promise<BackupResult> {
  return new Promise<BackupResult>((resolve) => {
    let child;
    try {
      child = spawn(bin, args as string[], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, reason: `${bin} unavailable: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    let stderr = '';
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', (err) => {
      // ENOENT → binary not installed; degrade truthfully.
      resolve({ ok: false, reason: `${bin} not available on PATH (${err.message})` });
    });
    child.on('close', (code) => {
      if (code === 0) {
        log.info({ bin, path: resultPath }, 'backup/restore completed');
        resolve({ ok: true, path: resultPath });
      } else {
        log.warn({ bin, code, stderr: stderr.slice(0, 500) }, 'backup/restore failed');
        resolve({ ok: false, reason: `${bin} exited ${code}` });
      }
    });
  });
}
