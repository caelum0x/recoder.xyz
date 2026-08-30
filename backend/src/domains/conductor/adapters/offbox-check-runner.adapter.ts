/**
 * Remote check execution over Recoder's existing cloud-sandbox gateway. The
 * current workspace delta is copied as a bounded binary git patch onto a fresh
 * clone, so checks assess the candidate head rather than the remote default.
 */
import { gzipSync } from 'node:zlib';
import { execFileSafe } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { CloudSandboxGatewayPort } from '../ports/cloud-sandbox.port.js';
import type {
  LocalCheckRun,
  OffboxCheckExecutorPort,
  OffboxCheckSpec,
} from '../services/check-run.service.js';

const MAX_PATCH_BYTES = 2 * 1024 * 1024;

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function detail(value: string): string {
  return value.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 200) ?? '';
}

function errorRows(checks: readonly OffboxCheckSpec[], reason: string): readonly LocalCheckRun[] {
  return checks.map(check => ({ name: check.name, status: 'error', detail: reason.slice(0, 200) }));
}

export function createOffboxCheckExecutor(
  gateway: CloudSandboxGatewayPort,
  logger: Logger,
): OffboxCheckExecutorPort {
  return {
    async run(
      workspace: Workspace,
      checks: readonly OffboxCheckSpec[],
      timeoutMs: number,
    ): Promise<readonly LocalCheckRun[]> {
      if (checks.length === 0) return [];
      if (!workspace.worktreePath) return errorRows(checks, 'workspace worktree unavailable');
      if (!gateway.isEnabled() || !(await gateway.isAvailable().catch(() => false))) {
        return errorRows(checks, 'off-box sandbox is unavailable');
      }

      let remoteUrl: string;
      let baseSha: string;
      let patch: string;
      try {
        const [remote, base, diff, status] = await Promise.all([
          execFileSafe('git', ['-C', workspace.worktreePath, 'remote', 'get-url', 'origin']),
          execFileSafe('git', ['-C', workspace.worktreePath, 'rev-parse', `${workspace.baseRef}^{commit}`]),
          execFileSafe('git', ['-C', workspace.worktreePath, 'diff', '--binary', workspace.baseRef, '--', '.'], {
            maxBuffer: MAX_PATCH_BYTES + 1,
          }),
          execFileSafe('git', ['-C', workspace.worktreePath, 'status', '--porcelain']),
        ]);
        remoteUrl = remote.stdout.trim();
        baseSha = base.stdout.trim();
        patch = diff.stdout;
        if (status.stdout.split(/\r?\n/).some(line => line.startsWith('?? '))) {
          return errorRows(checks, 'off-box sync refuses untracked files; add them to git first');
        }
      } catch (err) {
        return errorRows(checks, err instanceof Error ? `off-box sync failed: ${err.message}` : 'off-box sync failed');
      }
      if (!remoteUrl || !baseSha) return errorRows(checks, 'off-box sync needs a git origin and resolvable base');
      if (Buffer.byteLength(patch) > MAX_PATCH_BYTES) {
        return errorRows(checks, `off-box patch exceeds ${MAX_PATCH_BYTES} bytes`);
      }

      let sandboxId: string | null = null;
      try {
        const sandbox = await gateway.provision({ runId: `check_${workspace.workspaceId}` });
        sandboxId = sandbox.id;
        const root = sandbox.workDir ?? await gateway.getWorkDir(sandbox.id);
        const repoDir = `${root.replace(/\/$/, '')}/repo`;
        const seed = await gateway.exec(
          sandbox.id,
          `rm -rf repo && git clone --no-checkout ${q(remoteUrl)} repo && cd repo && git checkout --detach ${q(baseSha)}`,
          { cwd: root, timeoutSecs: 300 },
        );
        if (seed.exitCode !== 0) {
          return errorRows(checks, `off-box checkout failed: ${detail(seed.output) || `exit ${seed.exitCode ?? 'unknown'}`}`);
        }
        if (patch) {
          const payload = gzipSync(Buffer.from(patch)).toString('base64');
          const applied = await gateway.exec(
            sandbox.id,
            `printf %s ${q(payload)} | base64 -d | gzip -d | git apply --binary`,
            { cwd: repoDir, timeoutSecs: 120 },
          );
          if (applied.exitCode !== 0) {
            return errorRows(checks, `off-box patch apply failed: ${detail(applied.output) || `exit ${applied.exitCode ?? 'unknown'}`}`);
          }
        }

        const prepared = new Set<string>();
        const results: LocalCheckRun[] = [];
        for (const check of checks) {
          if (check.prepare) {
            const key = JSON.stringify([check.prepare.command, ...check.prepare.args]);
            if (!prepared.has(key)) {
              const command = [check.prepare.command, ...check.prepare.args].map(q).join(' ');
              const run = await gateway.exec(sandbox.id, command, {
                cwd: repoDir,
                timeoutSecs: Math.max(1, Math.ceil(timeoutMs / 1_000)),
              });
              if (run.exitCode !== 0) {
                results.push(...errorRows(checks.slice(results.length), `off-box prepare failed: ${detail(run.output) || `exit ${run.exitCode ?? 'unknown'}`}`));
                break;
              }
              prepared.add(key);
            }
          }
          const command = [check.command, ...check.args].map(q).join(' ');
          const run = await gateway.exec(sandbox.id, command, {
            cwd: repoDir,
            timeoutSecs: Math.max(1, Math.ceil(timeoutMs / 1_000)),
          });
          const outputDetail = detail(run.output);
          results.push({
            name: check.name,
            status: run.exitCode === 0 ? 'pass' : run.exitCode == null ? 'error' : 'fail',
            ...(outputDetail ? { detail: outputDetail } : {}),
          });
        }
        return results;
      } catch (err) {
        logger.warn({ err, workspaceId: workspace.workspaceId }, 'off-box check execution failed');
        return errorRows(checks, err instanceof Error ? err.message : 'off-box check execution failed');
      } finally {
        if (sandboxId) await gateway.destroy(sandboxId).catch(() => undefined);
      }
    },
  };
}
