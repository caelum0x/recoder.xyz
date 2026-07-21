/**
 * dmux operator-console adapter — the optional view layer over the tmux substrate.
 *
 * Per docs/subsystems/substrate.md §4.3 and docs/RECODER-PRODUCT-ARCHITECTURE.md §8c
 * (LOCKED): dmux is a vendored multiplexer (apps/desktop/engines/dmux) used as an OPTIONAL operator
 * grid over N parallel agents. It is NEVER on the critical path — if dmux is absent,
 * the Conductor substrate is fully functional via tmux alone.
 *
 * dmux is an interactive TUI (Ink/React over tmux) that a human operator attaches to.
 * It manages its own project-scoped tmux session, worktree-backed panes, and AI-agent
 * launches. The Conductor runs headless agent sessions in `recoder-*` tmux sessions;
 * dmux can observe and interact with those sessions since they share one tmux server.
 *
 * This adapter:
 *   - resolves the dmux binary (vendored apps/desktop/engines/dmux or system PATH)
 *   - reports truthful availability
 *   - launches dmux as an operator console for a repo
 *   - bridges conductor workspaces → dmux-visible tmux sessions
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { createLogger } from '../../shared/logger.js';
import { TMUX_BIN, TMUX_IS_VENDORED } from './tmux-path.js';
import { fail, ok, type InvokeResult } from './types.js';

const exec = promisify(execFile);
const logger = createLogger('conductor:dmux');

/**
 * Environment that pins dmux to the SAME tmux binary the Conductor drives.
 *
 * dmux resolves its tmux binary from `DMUX_TMUX_BIN`/`CONDUCTOR_TMUX_BIN` (see
 * apps/desktop/engines/dmux/src/utils/tmuxBin.ts, which mirrors this package's tmux-path.ts). Without
 * this, a vendored/pinned tmux would be invisible to the operator console and dmux
 * would fall back to a system `tmux` on PATH — a different tmux server that cannot see
 * the conductor's `recoder-*` sessions. Propagating it makes the bridge real: one
 * tmux server, observed by both the headless conductor and the operator console.
 *
 * When tmux is just system `tmux` (not vendored), we add nothing — dmux's own PATH
 * resolution is already correct and identical.
 */
export function dmuxTmuxEnv(): NodeJS.ProcessEnv {
  if (!TMUX_IS_VENDORED) return {};
  return { DMUX_TMUX_BIN: TMUX_BIN, CONDUCTOR_TMUX_BIN: TMUX_BIN };
}

/**
 * Resolve the dmux binary. Order:
 *   1. CONDUCTOR_DMUX_BIN env override.
 *   2. The vendored apps/desktop/engines/dmux/dmux launcher (with a built dist/).
 *   3. System `dmux` on PATH (returns the bare name for `command -v` resolution).
 */
export function resolveDmuxBin(): string {
  if (process.env.CONDUCTOR_DMUX_BIN && existsSync(process.env.CONDUCTOR_DMUX_BIN)) {
    return process.env.CONDUCTOR_DMUX_BIN;
  }
  // Resolve the vendored launcher relative to the repo root (contains apps/desktop/engines/dmux/dmux).
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const vendored = path.join(dir, 'apps', 'desktop', 'engines', 'dmux', 'dmux');
    const vendoredDist = path.join(dir, 'apps', 'desktop', 'engines', 'dmux', 'dist', 'index.js');
    if (existsSync(vendored) && existsSync(vendoredDist)) {
      return vendored;
    }
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) break; // hit repo root
    dir = path.dirname(dir);
  }
  return 'dmux'; // fall back to system PATH
}

export interface DmuxAvailability {
  /** Is dmux usable as an operator console? */
  available: boolean;
  /** Resolved binary path (vendored, override, or system 'dmux'). */
  bin: string;
  /** True when the resolved binary is the vendored apps/desktop/engines/dmux build. */
  vendored: boolean;
  /** The tmux binary dmux will be pinned to (shared with the conductor). */
  tmuxBin: string;
  /** True when that tmux is the vendored/pinned binary (not bare system PATH). */
  tmuxPinned: boolean;
  /** Truthful reason when unavailable. */
  reason?: string;
}

/** Check whether dmux is installed and runnable (truthful, never assumed). */
export async function dmuxAvailability(): Promise<DmuxAvailability> {
  const bin = resolveDmuxBin();
  const vendored = bin !== 'dmux';
  const tmuxBin = TMUX_BIN;
  const tmuxPinned = TMUX_IS_VENDORED;
  if (!vendored && !process.env.CONDUCTOR_DMUX_BIN) {
    // System PATH check for `dmux`.
    try {
      await exec('command', ['-v', 'dmux'], { shell: '/bin/sh' });
      return { available: true, bin: 'dmux', vendored: false, tmuxBin, tmuxPinned };
    } catch {
      return {
        available: false,
        bin: 'dmux',
        vendored: false,
        tmuxBin,
        tmuxPinned,
        reason: 'dmux not found on PATH and no vendored build at apps/desktop/engines/dmux/dist',
      };
    }
  }
  // Vendored/override: verify the launcher + dist exist.
  if (!existsSync(bin)) {
    return { available: false, bin, vendored, tmuxBin, tmuxPinned, reason: `dmux binary not found at ${bin}` };
  }
  return { available: true, bin, vendored, tmuxBin, tmuxPinned };
}

export interface DmuxLaunchInput {
  /** Absolute path to the git repo the operator console should open. */
  repoPath: string;
  /** Extra args forwarded to dmux verbatim. */
  extraArgs?: string[];
}

export interface DmuxLaunchResult {
  pid: number;
  bin: string;
  repoPath: string;
  command: string[];
}

/**
 * Launch dmux as an operator console for a repo.
 *
 * dmux is an interactive TUI that needs a real TTY. When invoked from the backend
 * (no TTY) it is spawned detached so the operator can attach in their terminal.
 * Returns the pid + exact command for the caller to surface (e.g. an attach hint).
 */
export function launchDmuxConsole(input: DmuxLaunchInput): DmuxLaunchResult {
  const bin = resolveDmuxBin();
  const args = [input.repoPath, ...(input.extraArgs ?? [])];
  // Pin dmux to the conductor's tmux binary so the console shares one tmux server.
  const tmuxEnv = dmuxTmuxEnv();
  const child = spawn(bin, args, {
    detached: true,
    stdio: 'ignore',
    cwd: input.repoPath,
    env: { ...process.env, ...tmuxEnv },
  });
  child.on('error', (err) => {
    logger.warn({ err, bin, repoPath: input.repoPath }, 'dmux console launch failed (best effort)');
  });
  child.unref();
  logger.info(
    { pid: child.pid, bin, repoPath: input.repoPath, tmuxBin: tmuxEnv.DMUX_TMUX_BIN ?? '(system PATH)' },
    'dmux operator console launched',
  );
  return { pid: child.pid!, bin, repoPath: input.repoPath, command: [bin, ...args] };
}

/**
 * The command line an operator should run manually to attach a dmux console.
 *
 * When tmux is vendored/pinned, the command is prefixed with the env assignment so a
 * manually-launched console attaches to the same tmux server as the conductor.
 */
export function dmuxAttachCommand(repoPath: string): string {
  const bin = resolveDmuxBin();
  const tmuxEnv = dmuxTmuxEnv();
  const prefix = tmuxEnv.DMUX_TMUX_BIN ? `DMUX_TMUX_BIN='${tmuxEnv.DMUX_TMUX_BIN}' ` : '';
  return `${prefix}${bin} ${repoPath}`;
}

/**
 * Bridge conductor workspace tmux sessions → dmux-visible sessions.
 *
 * The conductor creates `recoder-<workspaceId>` tmux sessions; dmux operates on the
 * same tmux server, so these are observable. This lists which conductor sessions are
 * live right now (queried directly from tmux — survives restarts).
 */
export async function dmuxVisibleSessions(): Promise<string[]> {
  try {
    const { stdout } = await exec(TMUX_BIN, ['list-sessions', '-F', '#{session_name}']);
    return stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('recoder-'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Programmatic pane/layout capability for a multi-agent workspace view.
//
// dmux is an interactive Ink TUI that arranges worktree-backed agent panes over
// ONE project-scoped tmux session (apps/desktop/engines/dmux/src/utils/layoutManager.ts +
// tmux.ts). The Conductor and dmux share a single tmux server (pinned via
// tmux-path.ts / DMUX_TMUX_BIN), so the SAME `select-layout` / `split-window`
// primitives dmux drives are drivable headlessly from the backend against a
// target session. This section exposes that substrate as a small, real
// capability: list panes, create a workspace grid, and apply a layout preset —
// including a dmux-flavored `agent-grid` preset that mirrors dmux's operator
// model (a fixed sidebar column + agent panes).
//
// Every op runs the shared tmux binary directly (execFile, arg-array — never a
// shell, so a caller-supplied target cannot inject). tmux absent / target session
// missing ⇒ the underlying tmux call rejects with the real reason and the port
// returns a truthful `{ ok:false }`. Nothing is fabricated.
// ---------------------------------------------------------------------------

/**
 * The sidebar column width dmux pins for its operator view — mirrored from
 * apps/desktop/engines/dmux/src/utils/tmux.ts `SIDEBAR_WIDTH`. The `agent-grid`
 * preset sets tmux `main-pane-width` to this before a `main-vertical` layout so
 * the headless arrangement matches what the dmux TUI renders.
 */
export const DMUX_SIDEBAR_WIDTH = 40;

/** The layout presets the capability can apply to a target tmux window. */
export type DmuxLayoutPreset =
  | 'agent-grid'
  | 'tiled'
  | 'even-horizontal'
  | 'even-vertical'
  | 'main-vertical'
  | 'main-horizontal';

export interface DmuxLayoutPresetInfo {
  /** The preset name callers pass to `applyLayout`. */
  readonly name: DmuxLayoutPreset;
  /** The native tmux `select-layout` name it maps onto. */
  readonly tmuxLayout: string;
  /** Human-facing description of the resulting arrangement. */
  readonly description: string;
}

/** The catalog of supported presets (static — always truthful, even sans tmux). */
export const DMUX_LAYOUT_PRESETS: readonly DmuxLayoutPresetInfo[] = [
  {
    name: 'agent-grid',
    tmuxLayout: 'main-vertical',
    description:
      'dmux operator view: a fixed sidebar column (main-pane-width pinned to the dmux sidebar width) with the agent panes stacked alongside.',
  },
  { name: 'tiled', tmuxLayout: 'tiled', description: 'Even grid of all panes.' },
  { name: 'even-horizontal', tmuxLayout: 'even-horizontal', description: 'Panes side by side in one row.' },
  { name: 'even-vertical', tmuxLayout: 'even-vertical', description: 'Panes stacked in one column.' },
  { name: 'main-vertical', tmuxLayout: 'main-vertical', description: 'One large pane on the left, the rest stacked on the right.' },
  { name: 'main-horizontal', tmuxLayout: 'main-horizontal', description: 'One large pane on top, the rest in a row below.' },
];

/** A pane in the shared tmux server, as the capability reports it. */
export interface DmuxPaneInfo {
  /** The owning session (present only for the all-sessions listing). */
  readonly session?: string;
  readonly paneId: string;
  readonly index: number;
  readonly active: boolean;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  /** The foreground command running in the pane (e.g. `claude`, `zsh`). */
  readonly command: string;
  readonly title: string;
}

export interface DmuxCreatePanesInput {
  /** The tmux target (session or `session:window`) to build the workspace in. */
  readonly target: string;
  /** Total panes the workspace should hold (1–16); existing panes are kept. */
  readonly count: number;
  /** Optional working directory for the newly-split panes. */
  readonly cwd?: string;
  /** Optional layout preset to apply once the panes exist. */
  readonly layout?: DmuxLayoutPreset;
}

export interface DmuxCreatePanesResult {
  readonly target: string;
  /** The pane ids created by this call (empty when the target already had enough). */
  readonly created: readonly string[];
  /** The full pane set after the operation. */
  readonly panes: readonly DmuxPaneInfo[];
  readonly layout: DmuxLayoutPreset | null;
}

export interface DmuxApplyLayoutInput {
  readonly target: string;
  readonly preset: DmuxLayoutPreset;
}

export interface DmuxApplyLayoutResult {
  readonly target: string;
  readonly preset: DmuxLayoutPreset;
  readonly tmuxLayout: string;
  /** The sidebar width pinned for `agent-grid` (omitted for other presets). */
  readonly sidebarWidth?: number;
  readonly panes: readonly DmuxPaneInfo[];
}

const PANE_FORMAT =
  '#{pane_id}|#{pane_index}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_left}|#{pane_top}|#{pane_current_command}|#{pane_title}';

const MAX_WORKSPACE_PANES = 16;

/**
 * List panes in the shared tmux server. With a `target` (session/window) it lists
 * that window's panes; without one it lists ALL panes across sessions (each
 * carrying its `session`). Throws the real tmux error when tmux is absent.
 */
export async function dmuxListPanes(target?: string): Promise<DmuxPaneInfo[]> {
  const args = target
    ? ['list-panes', '-t', target, '-F', PANE_FORMAT]
    : ['list-panes', '-a', '-F', `#{session_name}|${PANE_FORMAT}`];
  const { stdout } = await exec(TMUX_BIN, args);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parsePaneLine(line, !target));
}

/**
 * Build a multi-agent workspace grid in `target`: split the window until it holds
 * `count` panes, rebalancing to `tiled` between splits so each split has room,
 * then apply the requested preset. Idempotent-ish: an existing target with enough
 * panes creates nothing. Throws the real tmux error (missing session, no tmux).
 */
export async function dmuxCreateWorkspacePanes(input: DmuxCreatePanesInput): Promise<DmuxCreatePanesResult> {
  const count = clampCount(input.count);
  const existing = await dmuxListPanes(input.target);
  const created: string[] = [];
  let splitFrom = input.target;
  for (let i = existing.length; i < count; i++) {
    const args = ['split-window', '-h', '-P', '-F', '#{pane_id}', '-t', splitFrom];
    if (input.cwd) args.push('-c', input.cwd);
    const { stdout } = await exec(TMUX_BIN, args);
    const paneId = stdout.trim();
    created.push(paneId);
    splitFrom = paneId;
    // Rebalance so the next split (and the final layout) has usable space.
    await exec(TMUX_BIN, ['select-layout', '-t', input.target, 'tiled']).catch(() => undefined);
  }
  const layout = input.layout ?? null;
  if (layout) {
    await applyLayoutCommands(input.target, layout);
  }
  const panes = await dmuxListPanes(input.target);
  return { target: input.target, created, panes, layout };
}

/**
 * Apply a layout preset to `target`. `agent-grid` first pins tmux
 * `main-pane-width` to {@link DMUX_SIDEBAR_WIDTH} (dmux's sidebar column) before a
 * `main-vertical` layout; the rest map straight onto native tmux `select-layout`.
 * Throws the real tmux error on a missing target / absent tmux.
 */
export async function dmuxApplyLayout(input: DmuxApplyLayoutInput): Promise<DmuxApplyLayoutResult> {
  const info = DMUX_LAYOUT_PRESETS.find((p) => p.name === input.preset);
  if (!info) {
    throw new Error(`unknown dmux layout preset '${input.preset}'`);
  }
  const sidebarWidth = await applyLayoutCommands(input.target, input.preset);
  const panes = await dmuxListPanes(input.target);
  return {
    target: input.target,
    preset: input.preset,
    tmuxLayout: info.tmuxLayout,
    ...(sidebarWidth != null ? { sidebarWidth } : {}),
    panes,
  };
}

/** One sibling's real worktree, as fed to the worktree-bound grid builder. */
export interface DmuxGridWorktree {
  readonly workspaceId: string;
  /** The sibling's OWN worktree path — this pane's cwd (never a shared repoPath). */
  readonly worktreePath: string;
}

export interface DmuxBuildWorktreeGridInput {
  /** The dedicated operator session to build the grid in (e.g. `recoder-group-<taskGroup>`). */
  readonly session: string;
  /** The ordered siblings; EACH becomes one pane cwd'd to its OWN `worktreePath`. */
  readonly worktrees: readonly DmuxGridWorktree[];
}

export interface DmuxBuildWorktreeGridResult {
  readonly session: string;
  /** True when this call created the session / added panes; false when idempotent no-op. */
  readonly created: boolean;
  /** The per-pane cwds, in pane order == the ordered sibling worktrees fed in (the binding proof). */
  readonly worktreePaths: readonly string[];
  readonly panes: readonly DmuxPaneInfo[];
  readonly layout: 'agent-grid';
}

/**
 * Does the shared tmux server already hold this session? A missing session is the
 * normal case (not an error), so a rejected `has-session` becomes `false`. When
 * tmux itself is absent the subsequent `new-session` rejects and that real error
 * propagates — the caller's port maps it to a truthful `{ ok:false }`.
 */
async function dmuxHasSession(session: string): Promise<boolean> {
  try {
    await exec(TMUX_BIN, ['has-session', '-t', session]);
    return true;
  } catch {
    return false;
  }
}

/** Split one `-h` pane in `session`, cwd'd to `cwd`, rebalancing to `tiled` after. */
async function dmuxSplitWorktreePane(session: string, cwd: string): Promise<string> {
  const { stdout } = await exec(TMUX_BIN, [
    'split-window',
    '-h',
    '-P',
    '-F',
    '#{pane_id}',
    '-t',
    session,
    '-c',
    cwd,
  ]);
  // Rebalance so the next split (and the final agent-grid layout) has usable space.
  await exec(TMUX_BIN, ['select-layout', '-t', session, 'tiled']).catch(() => undefined);
  return stdout.trim();
}

/**
 * Build a WORKTREE-BOUND `agent-grid` in one call — the honest, non-hollow grid:
 * every pane is cwd'd to a DISTINCT real sibling worktree (NEVER a single shared
 * repoPath, NEVER empty panes). Steps:
 *   1. `has-session -t <session>`; else `new-session -d -s <session> -c worktrees[0]`.
 *   2. for each remaining worktree: `split-window -h -c <that worktree>`
 *      (`select-layout tiled` between so each split has room).
 *   3. `applyLayout(agent-grid)` last (only when we created/added panes).
 * Idempotent-ish: an existing session already holding ≥N panes creates nothing
 * (`created:false`). Bound to at most {@link MAX_WORKSPACE_PANES} worktrees.
 * Throws the real tmux error (no tmux, bad path) — the port maps it to `{ ok:false }`.
 */
export async function dmuxBuildWorktreeGrid(
  input: DmuxBuildWorktreeGridInput,
): Promise<DmuxBuildWorktreeGridResult> {
  const targets = input.worktrees.slice(0, MAX_WORKSPACE_PANES);
  const worktreePaths = targets.map((worktree) => worktree.worktreePath);
  const exists = await dmuxHasSession(input.session);
  let created = false;
  if (!exists) {
    // Pane 0 is bound to the FIRST sibling worktree via `new-session -c`.
    await exec(TMUX_BIN, ['new-session', '-d', '-s', input.session, '-c', worktreePaths[0]!]);
    created = true;
    for (let i = 1; i < targets.length; i++) {
      await dmuxSplitWorktreePane(input.session, worktreePaths[i]!);
    }
  } else {
    const existing = await dmuxListPanes(input.session);
    // Only add the panes still missing, each bound to its own worktree.
    for (let i = existing.length; i < targets.length; i++) {
      await dmuxSplitWorktreePane(input.session, worktreePaths[i]!);
      created = true;
    }
  }
  if (created) {
    await applyLayoutCommands(input.session, 'agent-grid');
  }
  const panes = await dmuxListPanes(input.session);
  return { session: input.session, created, worktreePaths, panes, layout: 'agent-grid' };
}

/**
 * The layout capability as a port the MCP binder consumes. Every method wraps the
 * pure tmux functions in a truthful {@link InvokeResult} — a rejected tmux call
 * (no tmux, missing session, bad target) becomes `{ ok:false, reason }`, never a
 * throw across the seam and never a fabricated arrangement.
 */
export interface DmuxLayoutPort {
  presets(): Promise<InvokeResult<{ presets: readonly DmuxLayoutPresetInfo[]; sidebarWidth: number }>>;
  listPanes(input: { target?: string }): Promise<InvokeResult<{ panes: readonly DmuxPaneInfo[] }>>;
  createPanes(input: DmuxCreatePanesInput): Promise<InvokeResult<DmuxCreatePanesResult>>;
  applyLayout(input: DmuxApplyLayoutInput): Promise<InvokeResult<DmuxApplyLayoutResult>>;
  /**
   * Build a WORKTREE-BOUND `agent-grid`: one pane per sibling, EACH cwd'd to its
   * OWN `worktreePath` (never one shared repoPath, never empty panes). `created`
   * is false on an idempotent re-run. Requires ≥1 worktree with a real path, else
   * `{ ok:false }`. Rejected tmux ⇒ `{ ok:false }`, never a throw across the seam.
   */
  buildWorktreeGrid(input: DmuxBuildWorktreeGridInput): Promise<InvokeResult<DmuxBuildWorktreeGridResult>>;
}

/** Build the {@link DmuxLayoutPort} over the shared tmux server. */
export function createDmuxLayoutPort(): DmuxLayoutPort {
  return {
    async presets() {
      return ok({ presets: DMUX_LAYOUT_PRESETS, sidebarWidth: DMUX_SIDEBAR_WIDTH });
    },
    async listPanes(input) {
      try {
        return ok({ panes: await dmuxListPanes(input.target) });
      } catch (err) {
        return fail(`dmux list-panes failed: ${message(err)}`, 'tmux_error');
      }
    },
    async createPanes(input) {
      if (!input.target?.trim()) return fail('dmux panes-create requires a target session', 'bad_input');
      if (!Number.isFinite(input.count) || input.count < 1) {
        return fail('dmux panes-create requires a positive count', 'bad_input');
      }
      try {
        return ok(await dmuxCreateWorkspacePanes(input));
      } catch (err) {
        return fail(`dmux panes-create failed: ${message(err)}`, 'tmux_error');
      }
    },
    async applyLayout(input) {
      if (!input.target?.trim()) return fail('dmux layout-apply requires a target session', 'bad_input');
      if (!DMUX_LAYOUT_PRESETS.some((p) => p.name === input.preset)) {
        return fail(`unknown dmux layout preset '${input.preset}'`, 'bad_input');
      }
      try {
        return ok(await dmuxApplyLayout(input));
      } catch (err) {
        return fail(`dmux layout-apply failed: ${message(err)}`, 'tmux_error');
      }
    },
    async buildWorktreeGrid(input) {
      if (!input.session?.trim()) return fail('dmux build-worktree-grid requires a session', 'bad_input');
      // Bind ONLY siblings with a real worktree path — the honest, non-hollow grid.
      const worktrees = (input.worktrees ?? []).filter(
        (worktree) => typeof worktree.worktreePath === 'string' && worktree.worktreePath.trim(),
      );
      if (worktrees.length === 0) {
        return fail('dmux build-worktree-grid requires at least one worktree with a real path', 'bad_input');
      }
      try {
        return ok(await dmuxBuildWorktreeGrid({ session: input.session, worktrees }));
      } catch (err) {
        return fail(`dmux build-worktree-grid failed: ${message(err)}`, 'tmux_error');
      }
    },
  };
}

/** Run the tmux commands for a preset; returns the pinned sidebar width when set. */
async function applyLayoutCommands(target: string, preset: DmuxLayoutPreset): Promise<number | undefined> {
  const info = DMUX_LAYOUT_PRESETS.find((p) => p.name === preset);
  if (!info) throw new Error(`unknown dmux layout preset '${preset}'`);
  let sidebarWidth: number | undefined;
  if (preset === 'agent-grid') {
    sidebarWidth = DMUX_SIDEBAR_WIDTH;
    await exec(TMUX_BIN, ['set-window-option', '-t', target, 'main-pane-width', String(DMUX_SIDEBAR_WIDTH)]);
  }
  await exec(TMUX_BIN, ['select-layout', '-t', target, info.tmuxLayout]);
  return sidebarWidth;
}

function parsePaneLine(line: string, withSession: boolean): DmuxPaneInfo {
  const parts = line.split('|');
  const session = withSession ? parts.shift() : undefined;
  const [paneId, index, active, width, height, left, top, command, ...titleParts] = parts;
  return {
    ...(session ? { session } : {}),
    paneId: paneId ?? '',
    index: toInt(index),
    active: active === '1',
    width: toInt(width),
    height: toInt(height),
    left: toInt(left),
    top: toInt(top),
    command: command ?? '',
    title: titleParts.join('|'),
  };
}

function clampCount(value: number): number {
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_WORKSPACE_PANES);
}

function toInt(value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
