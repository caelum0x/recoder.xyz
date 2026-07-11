/**
 * Herd frame rendering — pure Workspace[] → ANSI string (no TTY IO here, so
 * the frame is unit-testable and reusable by `--once` scripting). Truthful:
 * exactly the rows the conductor reported, grouped needs_you → working →
 * failed → done, numbered so digit keys attach to the matching session.
 */
import type { Workspace } from '@recoder/agent-os';
import { HERD_STATUS_ORDER, goalLabel, herdStatus, type HerdStatus } from './classify.js';

const ANSI_PATTERN = new RegExp(String.raw`\x1b\[[0-9;]*m`, 'g');

export function stripAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, '');
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const GROUP_TITLE: Record<HerdStatus, string> = {
  needs_you: 'NEEDS YOU',
  working: 'WORKING',
  failed: 'FAILED',
  done: 'DONE',
};

const GROUP_MARK: Record<HerdStatus, string> = {
  needs_you: C.yellow('●'),
  working: C.cyan('◐'),
  failed: C.red('✗'),
  done: C.green('✓'),
};

function timeAgo(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
}

function clamp(s: string, width: number): string {
  return s.length <= width ? s.padEnd(width) : `${s.slice(0, width - 1)}…`;
}

/**
 * Rows in exact render order — the digit key [N] attaches to attachTargets[N-1].
 * Kept as its own export so the key handler and the frame can never disagree.
 */
export function attachTargets(workspaces: Workspace[]): Workspace[] {
  return HERD_STATUS_ORDER.flatMap((status) =>
    workspaces.filter((w) => herdStatus(w.state) === status),
  );
}

export interface FrameInput {
  workspaces: Workspace[];
  backend: string;
  /** Injected for deterministic tests; defaults to wall clock. */
  nowMs?: number;
}

export function renderFrame({ workspaces, backend, nowMs = Date.now() }: FrameInput): string {
  const counts = new Map<HerdStatus, number>();
  for (const w of workspaces) {
    const s = herdStatus(w.state);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const summary = [
    `${counts.get('needs_you') ?? 0} needs you`,
    `${counts.get('working') ?? 0} working`,
    `${counts.get('failed') ?? 0} failed`,
    `${counts.get('done') ?? 0} done`,
  ].join(' · ');

  const lines: string[] = [
    `${C.bold('RECODER HERD')}  ${summary}  ${C.dim(backend)}`,
    '',
  ];

  if (workspaces.length === 0) {
    lines.push(C.dim('  no agents running — create one in the cockpit or POST /api/conductor/workspaces'));
  } else {
    const ordered = attachTargets(workspaces);
    let row = 0;
    for (const status of HERD_STATUS_ORDER) {
      const group = ordered.filter((w) => herdStatus(w.state) === status);
      if (group.length === 0) continue;
      lines.push(C.bold(` ${GROUP_TITLE[status]}`));
      for (const w of group) {
        row += 1;
        const key = row <= 9 ? `[${row}]` : '   ';
        lines.push(
          `  ${GROUP_MARK[status]} ${clamp(goalLabel(w), 44)} ${C.dim(clamp(w.runtimeId, 12))} ${clamp(w.state, 17)} ${C.dim(timeAgo(w.updatedAt, nowMs).padStart(4))}  ${C.dim(key)}`,
        );
      }
      lines.push('');
    }
  }

  lines.push(C.dim('[1-9] attach · r refresh · q quit  (inside tmux: detach with ctrl+b d)'));
  return lines.join('\n');
}
