/**
 * The interactive herd loop: poll → render → keys. Digit keys attach to the
 * matching row's tmux session (stdio handed to the real tmux client, so it is
 * a REAL terminal view of the agent, not a wrapped interpretation); on tmux
 * detach/exit the loop resumes. `q` quits, `r` forces a refresh.
 */
import { spawnSync } from 'node:child_process';
import type { Workspace } from '@recoder/agent-os';
import { HerdBackendError } from './client.js';
import { fetchHerdSnapshot } from './snapshot.js';
import { attachTargets, renderFrame } from './render.js';

export interface HerdOptions {
  backend: string;
  token?: string;
  pollMs?: number;
  tmuxBin?: string;
}

function attach(w: Workspace, tmuxBin: string): void {
  if (!w.sessionName) {
    process.stdout.write(`\nworkspace ${w.workspaceId} has no live session to attach\n`);
    return;
  }
  // Hand the terminal to the real tmux client; returns when the user detaches.
  spawnSync(tmuxBin, ['attach-session', '-t', w.sessionName], { stdio: 'inherit' });
}

export async function runHerd(opts: HerdOptions): Promise<void> {
  const pollMs = opts.pollMs ?? 2000;
  const tmuxBin = opts.tmuxBin ?? process.env['HERD_TMUX_BIN'] ?? 'tmux';
  let targets: Workspace[] = [];
  let alive = true;
  let paused = false;

  async function draw(): Promise<void> {
    if (paused) return;
    let frame: string;
    try {
      const { workspaces, waits } = await fetchHerdSnapshot(opts.backend, opts.token);
      targets = attachTargets(workspaces, waits);
      frame = renderFrame({ workspaces, waits, backend: opts.backend });
    } catch (err) {
      targets = [];
      frame =
        err instanceof HerdBackendError
          ? `RECODER HERD\n\n  ${err.message}\n\n[r] retry · q quit`
          : `RECODER HERD\n\n  ${err instanceof Error ? err.message : String(err)}\n\n[r] retry · q quit`;
    }
    if (!paused && alive) {
      process.stdout.write(`\x1b[2J\x1b[H${frame}\n`);
    }
  }

  const timer = setInterval(() => void draw(), pollMs);
  const stdin = process.stdin;
  const rawCapable = stdin.isTTY;
  if (rawCapable) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', (key: string) => {
      if (key === 'q' || key === '') {
        alive = false;
        clearInterval(timer);
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        return;
      }
      if (key === 'r') {
        void draw();
        return;
      }
      const n = Number.parseInt(key, 10);
      if (n >= 1 && n <= targets.length) {
        // Suspend rendering + raw mode while the real tmux client owns the TTY.
        paused = true;
        stdin.setRawMode(false);
        stdin.pause();
        attach(targets[n - 1], tmuxBin);
        stdin.setRawMode(true);
        stdin.resume();
        paused = false;
        void draw();
      }
    });
  }

  await draw();
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!alive) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    if (!rawCapable) {
      // Non-TTY: render once per poll forever is unhelpful — behave like --once.
      alive = false;
      clearInterval(timer);
      clearInterval(check);
      resolve();
    }
  });
}
