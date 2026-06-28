#!/usr/bin/env node
/**
 * recoder-conductor CLI — the user-facing command for the parallel agent system.
 *
 * Usage:
 *   recoder-conductor run --runtime claude_code --prompt "fix the bug" --repo ./myrepo
 *   recoder-conductor ps                          # list active workspaces
 *   recoder-conductor review <workspaceId>        # show diff + delivery summary
 *   recoder-conductor steer <workspaceId> "yes"   # send input to running agent
 *   recoder-conductor workflow --pattern fan_out --steps '...'  # multi-agent
 *   recoder-conductor health                      # production health
 *   recoder-conductor cleanup                     # prune stale worktrees
 *
 * Talks to the Conductor backend at RECODER_CONDUCTOR_URL (default: http://localhost:3001).
 */
import { execSync } from 'child_process';

const CONDUCTOR_URL = process.env.RECODER_CONDUCTOR_URL || 'http://localhost:3001';
const API = `${CONDUCTOR_URL}/api/conductor`;

function curl(method: string, path: string, body?: unknown): any {
  const args = ['-s', '-X', method, '-H', 'Content-Type: application/json'];
  if (body) args.push('-d', JSON.stringify(body));
  args.push(`${API}${path}`);
  const result = execSync(`curl ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    encoding: 'utf-8',
    timeout: 30_000,
  });
  try {
    return JSON.parse(result);
  } catch {
    return { success: false, error: result };
  }
}

function showWorkspace(ws: any): void {
  const status = ws.state?.padEnd(18) ?? 'unknown';
  const runtime = (ws.runtimeId ?? '—').padEnd(14);
  const id = (ws.workspaceId ?? '').slice(0, 16);
  const branch = ws.branch ?? '—';
  console.log(`  ${id}  ${status}  ${runtime}  ${branch}`);
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'run': {
    const runtimeIdx = rest.indexOf('--runtime');
    const promptIdx = rest.indexOf('--prompt');
    const repoIdx = rest.indexOf('--repo');
    const runtime = runtimeIdx >= 0 ? rest[runtimeIdx + 1] : 'claude_code';
    const prompt = promptIdx >= 0 ? rest[promptIdx + 1] : rest.join(' ');
    const repo = repoIdx >= 0 ? rest[repoIdx + 1] : process.cwd();
    if (!prompt) {
      console.error('Usage: recoder-conductor run --runtime <id> --prompt "..." [--repo ./path]');
      process.exit(1);
    }
    const result = curl('POST', '/workspaces', {
      spaceId: 'cli',
      projectId: 'cli',
      taskId: `cli-${Date.now()}`,
      repoPath: repo,
      runtimeId: runtime,
      prompt,
      createdBy: 'cli-user',
    });
    if (result.success) {
      console.log(`✓ Workspace ${result.data.workspaceId} launched (${result.data.state})`);
      console.log(`  Runtime: ${runtime}`);
      console.log(`  Branch:  ${result.data.branch}`);
      console.log(`  Events:  ${API}/workspaces/${result.data.workspaceId}/events`);
    } else {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }
    break;
  }

  case 'ps': {
    const result = curl('GET', '/workspaces');
    if (result.success && Array.isArray(result.data)) {
      const active = result.data.filter((w: any) => !['archived', 'merged', 'failed', 'cancelled'].includes(w.state));
      console.log(`\n  ${active.length} active workspace(s):\n`);
      console.log('  ID               STATE              RUNTIME         BRANCH');
      console.log('  ───────────────  ──────────────────  ──────────────  ──────────────');
      for (const ws of active) showWorkspace(ws);
      console.log('');
    } else {
      console.error(`✗ ${result.error ?? 'failed to list workspaces'}`);
    }
    break;
  }

  case 'review': {
    const id = rest[0];
    if (!id) {
      console.error('Usage: recoder-conductor review <workspaceId>');
      process.exit(1);
    }
    const [diffResult, deliveryResult] = [
      curl('GET', `/workspaces/${id}/diff`),
      curl('GET', `/workspaces/${id}/delivery`),
    ];
    if (diffResult.success) {
      console.log(`\n  Diff for ${id}:`);
      console.log(`  Changed files: ${diffResult.data.changedFiles}`);
      console.log(`  Untracked:     ${diffResult.data.untracked.length}`);
      if (diffResult.data.stat) {
        console.log(`\n${diffResult.data.stat}`);
      }
    }
    if (deliveryResult.success) {
      console.log(`\n  Delivery:`);
      console.log(`  Exit code:  ${deliveryResult.data.exitCode}`);
      console.log(`  Success:    ${deliveryResult.data.success}`);
      console.log(`  Completed:  ${deliveryResult.data.completedAt}`);
    }
    break;
  }

  case 'steer': {
    const id = rest[0];
    const keys = rest.slice(1).join(' ');
    if (!id || !keys) {
      console.error('Usage: recoder-conductor steer <workspaceId> <input>');
      process.exit(1);
    }
    const result = curl('POST', `/workspaces/${id}/steer`, { keys });
    if (result.success) {
      console.log(`✓ Sent "${keys}" to ${id}`);
    } else {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }
    break;
  }

  case 'workflow': {
    const patternIdx = rest.indexOf('--pattern');
    const pattern = patternIdx >= 0 ? rest[patternIdx + 1] : 'direct';
    console.error('Workflow CLI: use the REST API directly for multi-step workflows.');
    console.error('Example: curl -X POST ' + API + '/workflows -d \'{"pattern":"' + pattern + '",...}\'');
    process.exit(1);
    break;
  }

  case 'health': {
    const result = curl('GET', '/health/full');
    if (result.success) {
      const h = result.data;
      console.log(`\n  Conductor Health: ${h.status.toUpperCase()}`);
      console.log(`  Substrate: ${h.substrate.available ? '✓' : '✗'} (tmux: ${h.substrate.tmux ? '✓' : '✗'}, git: ${h.substrate.git ? '✓' : '✗'})`);
      console.log(`  Workspaces: ${h.workspaces.active} active / ${h.workspaces.total} total`);
      console.log(`  Runtimes:   ${h.runtimes.filter((r: any) => r.available).map((r: any) => r.runtimeId).join(', ') || 'none'}`);
      console.log(`  Resources:  ${h.resources.current.tmuxSessions} sessions, ${h.resources.current.freeDiskGb.toFixed(1)}GB free`);
      console.log(`  Active tails: ${h.activeTails}`);
      console.log(`  dmux:       ${h.dmux.available ? '✓' : '✗'}\n`);
    } else {
      console.error(`✗ ${result.error}`);
    }
    break;
  }

  case 'cleanup': {
    const result = curl('POST', '/cleanup');
    if (result.success) {
      console.log(`✓ Pruned ${result.data.pruned} worktrees, reclaimed ${Math.round(result.data.removedBytes / (1024 * 1024))}MB`);
    } else {
      console.error(`✗ ${result.error}`);
    }
    break;
  }

  case 'cancel': {
    const id = rest[0];
    if (!id) {
      console.error('Usage: recoder-conductor cancel <workspaceId>');
      process.exit(1);
    }
    const result = curl('POST', `/workspaces/${id}/archive`);
    if (result.success) {
      console.log(`✓ Cancelled + archived ${id}`);
    } else {
      console.error(`✗ ${result.error}`);
    }
    break;
  }

  default:
    console.log(`Recoder Conductor CLI — parallel agent orchestration

Usage:
  recoder-conductor run --runtime <id> --prompt "..." [--repo ./path]  Launch an agent
  recoder-conductor ps                                                 List active workspaces
  recoder-conductor review <workspaceId>                               Show diff + delivery
  recoder-conductor steer <workspaceId> <input>                        Send input to agent
  recoder-conductor cancel <workspaceId>                               Cancel + archive
  recoder-conductor health                                             Production health
  recoder-conductor cleanup                                            Prune stale worktrees

Runtimes: claude_code, codex, opencode, recoder_code, pi, gemini_cli, qwen_code, crush
Backend:  ${CONDUCTOR_URL}`);
    break;
}
