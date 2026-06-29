/**
 * `recoder conductor` — end-to-end client for the parallel-agent conductor.
 *
 * Subcommands hit `/api/conductor/*` (workspaces: list/create/get/diff/merge/pr/
 * archive, raw tmux sessions, health) and the device-flow auth endpoints at
 * `/api/auth/cli/*`. Backend URL + credential are resolved from the environment
 * and the `~/.recoder/auth.json` token store via `recoder-config`.
 *
 * Every command is degrade-safe and truthful: it prints the real backend error
 * (including "not authenticated" / "cannot reach backend") rather than faking
 * success, and surfaces approval-gate 409s from PR/merge as a clear next step.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createConductorClient, type ConductorWorkspace } from '../services/conductor-client';
import { createConductorAuthClient } from '../services/conductor-auth';
import {
  resolveBackendUrl,
  resolveCredential,
  readAuthData,
  clearAuthData,
} from '../services/recoder-config';

function stateColor(state: string): string {
  switch (state) {
    case 'merged':
    case 'ready':
      return chalk.green(state);
    case 'running':
    case 'merging':
    case 'setting_up':
      return chalk.cyan(state);
    case 'awaiting_approval':
    case 'awaiting_review':
    case 'changes_requested':
      return chalk.yellow(state);
    case 'failed':
    case 'cancelled':
      return chalk.red(state);
    default:
      return chalk.gray(state);
  }
}

function printWorkspaceRow(ws: ConductorWorkspace): void {
  console.log(
    `  ${chalk.white(ws.workspaceId)}  ${stateColor(ws.state)}  ` +
      `${chalk.gray(ws.runtimeId)}  ${chalk.gray(ws.branch)} ← ${chalk.gray(ws.baseRef)}`,
  );
}

function printWorkspaceDetail(ws: ConductorWorkspace): void {
  console.log(chalk.cyan('\nWorkspace'));
  console.log(`  ID:        ${chalk.white(ws.workspaceId)}`);
  console.log(`  State:     ${stateColor(ws.state)}`);
  console.log(`  Runtime:   ${ws.runtimeId} (${ws.substrate})`);
  console.log(`  Branch:    ${ws.branch} ← ${ws.baseRef}`);
  console.log(`  Space:     ${ws.spaceId} / project ${ws.projectId} / task ${ws.taskId}`);
  if (ws.runId) console.log(`  Run:       ${ws.runId}`);
  if (ws.worktreePath) console.log(`  Worktree:  ${ws.worktreePath}`);
  if (ws.sessionName) console.log(`  Session:   ${ws.sessionName}`);
  console.log(`  Created:   ${ws.createdAt} by ${ws.createdBy}`);
}

/** Require a credential; print guidance and return false when absent. */
function ensureAuthenticated(): boolean {
  if (resolveCredential()) {
    return true;
  }
  console.log(chalk.yellow('\nNot authenticated.'));
  console.log(chalk.gray('Run "recoder conductor login" (device flow), or set one of:'));
  console.log(chalk.gray('  RECODER_API_KEY=sk_...    (first-party platform key)'));
  console.log(chalk.gray('  RECODER_TOKEN=<token>     (explicit bearer token)\n'));
  return false;
}

export function createConductorCommand(): Command {
  const conductor = new Command('conductor')
    .alias('cd')
    .description('Drive the parallel-agent conductor (workspaces, sessions, auth)');

  // --- auth: login / whoami / logout --------------------------------------

  conductor
    .command('login')
    .description('Authenticate to recoder.xyz via device flow (RFC 8628)')
    .option('--client-id <id>', 'OAuth client id for the device grant')
    .option('--url <url>', 'Backend base URL override')
    .action(async (options) => {
      console.log(chalk.cyan('\nRecoder Conductor — Device Login\n'));
      const client = createConductorAuthClient(options.url);
      console.log(chalk.gray(`Backend: ${client.baseUrl}`));

      const result = await client.login({
        clientId: options.clientId,
        onPrompt: (auth) => {
          console.log(chalk.white(`\n1. Open: ${chalk.underline(auth.verificationUri)}`));
          console.log(chalk.white(`2. Enter code: ${chalk.yellow(auth.userCode)}`));
          if (auth.verificationUriComplete) {
            console.log(chalk.gray(`   Or visit directly: ${auth.verificationUriComplete}`));
          }
          console.log(chalk.blue('\nWaiting for authorization...'));
        },
        onPoll: () => process.stdout.write(chalk.gray('.')),
      });

      console.log('');
      if (!result.ok) {
        console.log(chalk.red(`\nLogin failed: ${result.error}`));
        process.exitCode = 1;
        return;
      }
      const email = result.data?.email || 'authenticated user';
      console.log(chalk.green(`\nLogged in as ${email}`));
      console.log(chalk.gray('Token stored at ~/.recoder/auth.json\n'));
    });

  conductor
    .command('whoami')
    .description('Show the current credential + verify it against recoder.xyz')
    .option('--url <url>', 'Backend base URL override')
    .action(async (options) => {
      const cred = resolveCredential();
      const baseUrl = resolveBackendUrl(options.url);
      console.log(chalk.cyan('\nRecoder Conductor — Identity\n'));
      console.log(chalk.gray(`Backend: ${baseUrl}`));

      if (!cred) {
        console.log(chalk.yellow('No credential configured (not authenticated).\n'));
        return;
      }
      console.log(chalk.white(`Credential source: ${cred.source}`));

      const auth = readAuthData();
      if (auth?.user) {
        console.log(chalk.white(`User: ${auth.user.email} (${auth.user.subscription_plan || 'unknown plan'})`));
      }

      // Only a device-flow access token can be verified server-side.
      if (cred.source === 'auth-store' && auth?.access_token) {
        const authClient = createConductorAuthClient(options.url);
        const verify = await authClient.verify(auth.access_token);
        if (verify.ok && verify.data?.valid) {
          console.log(chalk.green('Token verified against recoder.xyz\n'));
        } else if (verify.ok) {
          console.log(chalk.red('Token is no longer valid — run "recoder conductor login"\n'));
        } else {
          console.log(chalk.yellow(`Could not verify token: ${verify.error}\n`));
        }
      } else {
        console.log(chalk.gray('(verify is only available for device-flow tokens)\n'));
      }
    });

  conductor
    .command('logout')
    .description('Remove the stored device-flow token')
    .action(async () => {
      await clearAuthData();
      console.log(chalk.green('\nLogged out — removed ~/.recoder/auth.json\n'));
    });

  // --- health + sessions ---------------------------------------------------

  conductor
    .command('health')
    .description('Show conductor substrate availability')
    .option('--url <url>', 'Backend base URL override')
    .action(async (options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      console.log(chalk.cyan('\nConductor Health\n'));
      console.log(chalk.gray(`Backend: ${client.baseUrl}`));
      const result = await client.health();
      if (!result.ok) {
        console.log(chalk.red(`\nHealth check failed: ${result.error}\n`));
        process.exitCode = 1;
        return;
      }
      const data = result.data!;
      const available = data.available !== false;
      console.log(available ? chalk.green('\nConductor available') : chalk.red('\nConductor unavailable'));
      if (data.reason) console.log(chalk.gray(`Reason: ${data.reason}`));
      console.log(chalk.gray(`\n${JSON.stringify(data, null, 2)}\n`));
    });

  conductor
    .command('sessions')
    .description('List raw tmux sessions managed by the conductor')
    .option('--url <url>', 'Backend base URL override')
    .action(async (options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      const result = await client.listSessions();
      console.log(chalk.cyan('\nConductor Sessions\n'));
      if (!result.ok) {
        console.log(chalk.red(`Failed: ${result.error}\n`));
        process.exitCode = 1;
        return;
      }
      const sessions = result.data || [];
      if (sessions.length === 0) {
        console.log(chalk.gray('No active sessions.\n'));
        return;
      }
      sessions.forEach((s) => console.log(`  ${chalk.white(s.sessionId)}`));
      console.log('');
    });

  // --- workspaces: list / get / create / diff / merge / pr / archive -------

  conductor
    .command('list')
    .alias('ls')
    .description('List conductor workspaces')
    .option('--url <url>', 'Backend base URL override')
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      const result = await client.listWorkspaces();
      if (!result.ok) {
        console.log(chalk.red(`\nFailed to list workspaces: ${result.error}\n`));
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      const workspaces = result.data || [];
      console.log(chalk.cyan(`\nWorkspaces (${workspaces.length})\n`));
      if (workspaces.length === 0) {
        console.log(chalk.gray('No workspaces. Create one with "recoder conductor create".\n'));
        return;
      }
      workspaces.forEach(printWorkspaceRow);
      console.log('');
    });

  conductor
    .command('get <workspaceId>')
    .description('Show a single workspace')
    .option('--url <url>', 'Backend base URL override')
    .option('--json', 'Output raw JSON')
    .action(async (workspaceId, options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      const result = await client.getWorkspace(workspaceId);
      if (!result.ok) {
        console.log(chalk.red(`\nFailed: ${result.error}\n`));
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      printWorkspaceDetail(result.data!);
      console.log('');
    });

  conductor
    .command('create')
    .description('Create + launch a workspace (isolated worktree + agent run)')
    .requiredOption('--space <spaceId>', 'Space id')
    .requiredOption('--project <projectId>', 'Project id')
    .requiredOption('--task <taskId>', 'Task id')
    .requiredOption('--repo <repoPath>', 'Absolute repo path on the backend host')
    .option('--prompt <prompt>', 'Agent prompt (one of --prompt|--command required)')
    .option('--command <command>', 'Raw command to run (one of --prompt|--command required)')
    .option('--runtime <runtimeId>', 'Runtime id (optional — backend planner defaults it)')
    .option('--substrate <substrate>', 'Execution substrate (tmux_worktree|daytona|in_process)')
    .option('--model <model>', 'Model id')
    .option('--branch <branch>', 'Branch name for the worktree')
    .option('--base-ref <baseRef>', 'Base ref to cut the branch from')
    .option('--created-by <user>', 'Creator id', 'cli')
    .option('--url <url>', 'Backend base URL override')
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      if (!ensureAuthenticated()) return;
      if (!options.prompt && !options.command) {
        console.log(chalk.red('\nOne of --prompt or --command is required.\n'));
        process.exitCode = 1;
        return;
      }
      const client = createConductorClient({ baseUrl: options.url });
      console.log(chalk.cyan('\nCreating workspace...\n'));
      const result = await client.createWorkspace({
        spaceId: options.space,
        projectId: options.project,
        taskId: options.task,
        repoPath: options.repo,
        createdBy: options.createdBy,
        prompt: options.prompt,
        command: options.command,
        runtimeId: options.runtime,
        substrate: options.substrate,
        model: options.model,
        branch: options.branch,
        baseRef: options.baseRef,
      });
      if (!result.ok) {
        console.log(chalk.red(`Create failed: ${result.error}`));
        if (result.status === 429) {
          console.log(chalk.yellow('(resource budget exceeded — retry later)'));
        }
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      console.log(chalk.green('Workspace created.'));
      printWorkspaceDetail(result.data!);
      console.log('');
    });

  conductor
    .command('diff <workspaceId>')
    .description("Show the workspace's diff against its base ref")
    .option('--url <url>', 'Backend base URL override')
    .option('--json', 'Output raw JSON')
    .action(async (workspaceId, options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      const result = await client.diffWorkspace(workspaceId);
      if (!result.ok) {
        console.log(chalk.red(`\nDiff failed: ${result.error}\n`));
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      const diff = result.data!;
      if (typeof diff.patch === 'string' && diff.patch.length > 0) {
        console.log(diff.patch);
        return;
      }
      if (Array.isArray(diff.files) && diff.files.length > 0) {
        console.log(chalk.cyan(`\nChanged files (${diff.files.length})\n`));
        diff.files.forEach((f) => {
          const stat = `+${f.additions ?? 0}/-${f.deletions ?? 0}`;
          console.log(`  ${chalk.white(f.path)}  ${chalk.gray(stat)}`);
        });
        console.log('');
        return;
      }
      console.log(chalk.gray('\nNo changes.\n'));
    });

  conductor
    .command('merge <workspaceId>')
    .description('Merge the workspace PR (approval-gated)')
    .option('--strategy <strategy>', 'Merge strategy (merge|squash|rebase)')
    .option('--delete-branch', 'Delete the branch after merge', false)
    .option('--url <url>', 'Backend base URL override')
    .action(async (workspaceId, options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      console.log(chalk.cyan(`\nMerging workspace ${workspaceId}...\n`));
      const result = await client.mergeWorkspace(workspaceId, {
        strategy: options.strategy,
        deleteBranch: options.deleteBranch,
      });
      if (!result.ok) {
        if (result.status === 409) {
          console.log(chalk.yellow(`Approval required: ${result.error}`));
          console.log(chalk.gray('The workspace was moved to awaiting_approval. Approve it, then retry.\n'));
        } else {
          console.log(chalk.red(`Merge failed: ${result.error}\n`));
        }
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green('Merge succeeded.'));
      console.log(chalk.gray(`${JSON.stringify(result.data, null, 2)}\n`));
    });

  conductor
    .command('pr <workspaceId>')
    .description('Open a PR for the workspace branch (approval-gated)')
    .option('--title <title>', 'PR title')
    .option('--body <body>', 'PR body')
    .option('--base <base>', 'Base branch for the PR')
    .option('--draft', 'Open as draft', false)
    .option('--remote <remote>', 'Git remote')
    .option('--url <url>', 'Backend base URL override')
    .action(async (workspaceId, options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      console.log(chalk.cyan(`\nOpening PR for workspace ${workspaceId}...\n`));
      const result = await client.openPr(workspaceId, {
        title: options.title,
        body: options.body,
        base: options.base,
        draft: options.draft,
        remote: options.remote,
      });
      if (!result.ok) {
        if (result.status === 409) {
          console.log(chalk.yellow(`Approval required: ${result.error}`));
          console.log(chalk.gray('The workspace was moved to awaiting_approval. Approve it, then retry.\n'));
        } else {
          console.log(chalk.red(`PR failed: ${result.error}\n`));
        }
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green('PR opened.'));
      if (result.data?.url) console.log(chalk.white(`URL: ${result.data.url}`));
      console.log('');
    });

  conductor
    .command('archive <workspaceId>')
    .description('Archive a finished workspace (stop session, remove worktree)')
    .option('--url <url>', 'Backend base URL override')
    .action(async (workspaceId, options) => {
      if (!ensureAuthenticated()) return;
      const client = createConductorClient({ baseUrl: options.url });
      const result = await client.archiveWorkspace(workspaceId);
      if (!result.ok) {
        console.log(chalk.red(`\nArchive failed: ${result.error}\n`));
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green(`\nWorkspace ${workspaceId} archived.\n`));
    });

  return conductor;
}

export default createConductorCommand;
