import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AgentBridgeService, TaskAssignment } from './AgentBridgeService.js';

const DOCKER_BACKEND_URL = process.env['DOCKER_BACKEND_URL'] || 'http://localhost:3100';
const MAX_OUTPUT_CHARS = 12_000;

interface CommandResult {
  command: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface PackageScripts {
  test?: string;
  lint?: string;
  build?: string;
}

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated]` : text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectPackageManager(cwd: string): 'pnpm' | 'yarn' | 'npm' | null {
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';
  if (existsSync(path.join(cwd, 'package.json'))) return 'npm';
  return null;
}

function readPackageScripts(cwd: string): PackageScripts {
  const packageJsonPath = path.join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) return {};

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: PackageScripts };
    return pkg.scripts || {};
  } catch {
    return {};
  }
}

function buildScriptCommand(
  packageManager: 'pnpm' | 'yarn' | 'npm',
  scriptName: 'test' | 'lint' | 'build',
): string[] {
  if (packageManager === 'yarn') return ['yarn', scriptName];
  if (packageManager === 'pnpm') return ['pnpm', scriptName];
  return ['npm', 'run', scriptName];
}

function pickExecutionPlan(prompt: string, cwd: string): string[][] {
  const lowered = prompt.toLowerCase();
  const commands: string[][] = [
    ['pwd'],
    ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
    ['git', 'status', '--short'],
  ];

  const packageManager = detectPackageManager(cwd);
  const scripts = readPackageScripts(cwd);
  if (!packageManager) return commands;

  if (/\btest|verify|spec\b/.test(lowered) && scripts.test) {
    commands.push(buildScriptCommand(packageManager, 'test'));
  } else if (/\blint|format|check\b/.test(lowered) && scripts.lint) {
    commands.push(buildScriptCommand(packageManager, 'lint'));
  } else if (/\bbuild|preview|deploy\b/.test(lowered) && scripts.build) {
    commands.push(buildScriptCommand(packageManager, 'build'));
  }

  return commands;
}

async function runCommand(command: string[], cwd: string, timeoutMs = 60_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({
        command,
        cwd,
        exitCode: 124,
        stdout: truncate(stdout),
        stderr: truncate(`${stderr}\nCommand timed out after ${timeoutMs}ms`),
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        exitCode: 1,
        stdout: truncate(stdout),
        stderr: truncate(`${stderr}\n${error.message}`),
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        exitCode: code ?? 1,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
      });
    });
  });
}

function writeArtifacts(taskId: string, prompt: string, context: Record<string, unknown>, results: CommandResult[]) {
  const artifactDir = path.join(process.cwd(), '.recoder', 'artifacts', taskId);
  mkdirSync(artifactDir, { recursive: true });

  const reportPath = path.join(artifactDir, 'report.md');
  const commandsPath = path.join(artifactDir, 'commands.json');

  const report = [
    '# Recoder Space Task Execution Report',
    '',
    `- Task ID: ${taskId}`,
    `- Prompt: ${prompt}`,
    `- Working Directory: ${process.cwd()}`,
    '',
    '## Context',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '',
    '## Commands',
    ...results.flatMap((result) => [
      `### ${result.command.join(' ')}`,
      '',
      `- Exit code: ${result.exitCode}`,
      `- CWD: ${result.cwd}`,
      '',
      '#### stdout',
      '```text',
      result.stdout || '(empty)',
      '```',
      '',
      '#### stderr',
      '```text',
      result.stderr || '(empty)',
      '```',
      '',
    ]),
  ].join('\n');

  writeFileSync(reportPath, report, 'utf8');
  writeFileSync(commandsPath, JSON.stringify(results, null, 2), 'utf8');

  return {
    report: { path: reportPath, content: report },
    commands: { path: commandsPath, content: readFileSync(commandsPath, 'utf8') },
  };
}

async function claimTask(token: string, bridge: AgentBridgeService, taskId: string): Promise<void> {
  const sessionId = bridge.getSessionId();
  if (!sessionId) {
    throw new Error('Bridge session is not registered yet');
  }

  const response = await fetch(`${DOCKER_BACKEND_URL}/api/a2a/tasks/${encodeURIComponent(taskId)}/claim`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      agent_id: bridge.getAgentId(),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Task claim failed (${response.status}): ${text}`);
  }
}

export function installRecoderSpaceAutoWorker(
  bridge: AgentBridgeService,
  getToken: () => Promise<string | null>,
): void {
  bridge.on('task.assigned', (assignment: TaskAssignment) => {
    void (async () => {
      const token = await getToken();
      if (!token) return;

      try {
        await claimTask(token, bridge, assignment.taskId);

        bridge.sendProgress(assignment.taskId, 10, 'Claimed task in current Recoder Space');
        await sleep(150);

        const commands = pickExecutionPlan(assignment.prompt, process.cwd());
        const results: CommandResult[] = [];

        for (let index = 0; index < commands.length; index += 1) {
          const command = commands[index];
          const progress = 20 + Math.round(((index + 1) / commands.length) * 60);
          bridge.sendProgress(assignment.taskId, progress, `Running: ${command.join(' ')}`);
          const result = await runCommand(command, process.cwd());
          results.push(result);
        }

        const artifacts = writeArtifacts(
          assignment.taskId,
          assignment.prompt,
          assignment.context,
          results,
        );

        const failedCommands = results.filter((result) => result.exitCode !== 0);
        const summary = failedCommands.length === 0
          ? `Completed local execution for task: ${assignment.prompt}`
          : `Completed local execution with ${failedCommands.length} failing command(s) for task: ${assignment.prompt}`;

        bridge.completeTask(assignment.taskId, {
          text: summary,
          data: {
            source: 'recoder-space-auto-worker',
            workspaceId: bridge.getWorkspaceId(),
            commandCount: results.length,
            failedCommandCount: failedCommands.length,
            commands: results.map((result) => ({
              command: result.command.join(' '),
              exitCode: result.exitCode,
            })),
          },
          artifacts: [
            {
              key: `${assignment.taskId}-report.md`,
              artifact_type: 'report',
              mime_type: 'text/markdown',
              content: artifacts.report.content,
              path: artifacts.report.path,
            },
            {
              key: `${assignment.taskId}-commands.json`,
              artifact_type: 'log',
              mime_type: 'application/json',
              content: artifacts.commands.content,
              path: artifacts.commands.path,
            },
          ],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown task execution error';
        bridge.failTask(assignment.taskId, message);
      }
    })();
  });
}
