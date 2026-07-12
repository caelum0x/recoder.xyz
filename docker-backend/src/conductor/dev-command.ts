/**
 * dev-command — detect the command that runs a workspace's app (its dev server)
 * so the cockpit's "Run" tab can offer a one-click "Start Run", conductor-style.
 *
 * Host-worktree variant of the container DevServerManager: we read the project
 * files in the workspace's OWN worktree (package.json scripts + lockfile for the
 * package manager, else common Python/static entrypoints) and return a single
 * command string. Detection is best-effort and degrade-safe — an unrecognized
 * project returns null, and the UI lets the user type their own command.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getWorkspace } from './workspace-service.js';

export interface DevCommand {
  /** The shell command to run in the worktree (e.g. "pnpm run dev"). */
  command: string;
  /** A short human label for the button/tooltip. */
  label: string;
}

type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

function detectPackageManager(dir: string): PackageManager {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'bun.lockb'))) return 'bun';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** Preferred dev scripts, in priority order. */
const DEV_SCRIPTS = ['dev', 'start', 'serve', 'develop'];

/**
 * Detect a runnable dev command for a project directory. Returns null when the
 * project shape isn't recognized (never guesses a command that would just fail).
 */
export async function detectDevCommand(worktreePath: string): Promise<DevCommand | null> {
  // Node / JS project — prefer a package.json dev script with the right runner.
  const pkgPath = join(worktreePath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      const pm = detectPackageManager(worktreePath);
      const runner = pm === 'npm' ? 'npm run' : `${pm} run`;
      for (const script of DEV_SCRIPTS) {
        if (typeof scripts[script] === 'string' && scripts[script].trim()) {
          return { command: `${runner} ${script}`, label: `${pm} run ${script}` };
        }
      }
    } catch {
      // Malformed package.json — fall through to the other detectors.
    }
  }

  // Python web frameworks / entrypoints.
  if (existsSync(join(worktreePath, 'manage.py'))) {
    return { command: 'python manage.py runserver', label: 'Django dev server' };
  }
  for (const entry of ['app.py', 'main.py', 'wsgi.py']) {
    if (existsSync(join(worktreePath, entry))) {
      return { command: `python ${entry}`, label: `python ${entry}` };
    }
  }

  // Plain static site.
  if (existsSync(join(worktreePath, 'index.html'))) {
    return { command: 'python3 -m http.server 8000', label: 'static server :8000' };
  }

  return null;
}

/**
 * Resolve the dev command for a workspace by id (via its worktree). Returns null
 * when the workspace has no worktree or its project shape isn't recognized.
 */
export async function workspaceDevCommand(workspaceId: string): Promise<DevCommand | null> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace?.worktreePath) return null;
  return detectDevCommand(workspace.worktreePath);
}
