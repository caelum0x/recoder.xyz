/**
 * `createAcpSubstrate` — a local ConductorSubstrate that runs an ACP agent
 * (`claude-code-acp` / `codex-acp`) over an isolated git worktree, driving it via
 * the {@link AcpAgentDriver} (JSON-RPC over stdio) instead of a tmux PTY.
 *
 * It maps the session-based ACP protocol onto the stateless-handle
 * {@link ConductorSubstrate} contract:
 *  - `launch`  = `git worktree add` (identical to the tmux substrate) → spawn the
 *    agent → `initialize` → `session/new(cwd=worktree)` → fire `session/prompt`
 *    (the task) in the BACKGROUND, buffering `session/update` text for `capture`;
 *  - `capture` = the last N lines of that streamed buffer (polling tailer);
 *  - `alive`   = the agent turn is still running (process up, prompt unresolved);
 *  - `exitCode`= `0` on a clean `end_turn`, the process exit code on a crash,
 *    `undefined` (unknown) while still running — NEVER a fabricated `0`;
 *  - `diff`    = git diff of the worktree (the agent edits files in it, so the
 *    same git-native diff the tmux substrate uses works verbatim);
 *  - `teardown`= stop the agent + `git worktree remove`.
 *
 * RESTART-SURVIVABLE: the agent process + session live in an in-memory `byRef`
 * map, so a backend restart drops them. Because launch returns the agent's ACP
 * `sessionId` as the handle's `sessionName` (the engine persists it to the
 * Workspace record), `continueRun` can EXPLICITLY reattach a persisted handle:
 * spawn a fresh agent → `initialize` → `session/load` (v1 resume; the agent
 * replays history into the buffer). Reattach happens ONLY on that explicit resume
 * — the read-only probes (`capture`/`alive`/`exitCode`) never spawn, so an
 * unresumed restarted workspace reads truthfully "no live session" and a passive
 * reconcile/UI poll can neither boot nor leak an agent. Reattach is GATED on the
 * agent advertising `loadSession`; when it can't (capability absent, worktree gone,
 * agent/git missing), continueRun degrades truthfully to a thrown "lost" rather
 * than fabricating a live handle. Launch, reattach, and teardown are leak-safe: a
 * failed handshake removes the worktree + stops the agent, teardown gracefully
 * `session/cancel`s a live turn (bounded) before the kill, and a teardown racing an
 * in-flight reattach tombstones it so no orphan agent survives.
 *
 * Config-injected (ARCHITECTURE §10.8): the spawn + exec + permission + base-env
 * seams are injectable so it is unit-tested with a fake agent and fake git. The
 * agent's base env defaults to `process.env` but is DENYLIST-stripped of known
 * backend secrets (DB URLs, INTERNAL_SERVICE_KEY, auth/billing/cloud credentials)
 * before the spawn, and can be replaced with a curated env via `processEnv`, so a
 * prompt-injectable agent never inherits the backend's secrets (recoder-x4n1).
 * Degrade-truthful: an unavailable substrate refuses to launch, a
 * dead handle captures `null`. Agent-initiated requests (permission + delegated
 * `fs/*`) are handled by {@link createAcpClientRequestHandler}, bound per-launch
 * to the worktree: permissions use the worktree-isolation policy by default (or an
 * injected `resolvePermission` gate bridge), and fs reads/writes are path-CONTAINED
 * to that worktree — the isolation boundary is enforced, never trusted.
 */
import path from 'node:path';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  execFileSafe,
  which,
  buildSubstrateDiff,
  type ExecOptions,
  type ExecResult,
  type LoggerPort,
  type SubstrateDiff,
} from '@recoder/substrate';
import type {
  ConductorSubstrate,
  ContinueRunInput,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../ports/substrate-registry.port.js';
import type { ConductorConfig } from '../config.js';
import { tmuxNameFor } from '../session-naming.js';
import { AcpAgentDriver, type AcpProcess } from './acp/acp-driver.js';
import { makeAcpProcess } from './acp/acp-process.js';
import type { AcpNotification } from './acp/acp-codec.js';
import {
  createAcpClientRequestHandler,
  type AcpPermissionContext,
  type AcpPermissionDecision,
} from './acp/acp-client-requests.js';
import { structuredUpdateLine } from './acp/acp-session-update.js';

export type ExecFn = (
  bin: string,
  args: readonly string[],
  options?: ExecOptions
) => Promise<ExecResult>;

/** The default ACP agent binary (Zed's Claude Code ACP adapter). */
export const DEFAULT_ACP_COMMAND = 'claude-code-acp';
/** Bound the per-handle output buffer so a chatty agent can't grow unbounded. */
const MAX_BUFFER_LINES = 4000;
/**
 * Bound the buffer by BYTES as well as lines — a `session/load` history replay (or
 * a tool dump) can arrive as one enormous newline-free line that evades the line
 * cap, so cap aggregate bytes and truncate any single over-long line.
 */
const MAX_BUFFER_BYTES = 1_000_000;
const MAX_LINE_BYTES = 64_000;

/**
 * Backend-infrastructure secrets the coding agent has NO business seeing — stripped
 * from the env handed to the (prompt-injectable) agent subprocess. Conservative by
 * design (denylist, not allowlist): infra/auth/billing/cloud secrets only, so the
 * agent KEEPS what it needs (PATH, HOME, ANTHROPIC_API_KEY / OPENAI_API_KEY for LLM
 * auth, GITHUB_TOKEN for git ops, locale). A full curated allowlist can be injected
 * via `processEnv` when a deployment wants to lock this down further.
 */
const SECRET_ENV_PATTERNS: readonly RegExp[] = [
  /SECRET/i, // BETTER_AUTH_SECRET, SESSION_SECRET, JWT_SECRET, *_WEBHOOK_SECRET
  /PASSWORD/i,
  /PASSWD/i,
  /PRIVATE_KEY/i,
  /DATABASE_URL/i, // DATABASE_URL, AUTH_DATABASE_URL, *_DATABASE_URL
  /^DIRECT_URL$/i,
  /^REDIS_URL$/i,
  /^INTERNAL_SERVICE_KEY$/i,
  /^API_KEY_HASH_SALT$/i,
  /^(POLAR|CREEM|PADDLE|DODO)_/i, // MoR billing provider credentials
  /^(CLOUDFLARE|HETZNER|AWS|AZURE|DAYTONA|E2B)_/i, // cloud/infra credentials
];

/** Default predicate: is this env key a known backend secret to withhold from the agent? */
export function isSecretAgentEnvKey(key: string): boolean {
  return SECRET_ENV_PATTERNS.some(re => re.test(key));
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

export interface CreateAcpSubstrateDeps {
  readonly config: Pick<ConductorConfig, 'worktreeRoot'>;
  readonly logger?: LoggerPort;
  /** Child-process seam for git worktree ops; defaults to the package's execFileSafe. */
  readonly exec?: ExecFn;
  /** The ACP agent binary; defaults to `claude-code-acp`. */
  readonly command?: string;
  /** Spawn seam (default: the real child_process-backed AcpProcess); injected in tests. */
  readonly spawn?: (opts: {
    command: string;
    cwd: string;
    env?: NodeJS.ProcessEnv;
  }) => AcpProcess;
  /**
   * Resolve an agent permission request (`session/request_permission`) to
   * allow/deny — the composer injects a bridge to the approval gate here. Default:
   * the worktree-isolation policy (allow in-worktree work, deny shell/network/
   * unknown). The correct ACP outcome is formed by the client-request handler.
   */
  readonly resolvePermission?: (
    ctx: AcpPermissionContext
  ) => Promise<AcpPermissionDecision> | AcpPermissionDecision;
  /** PATH-presence probe (default: `which`); injected in tests to avoid a real binary. */
  readonly probe?: (bin: string) => Promise<boolean>;
  /** Filesystem-presence probe for the worktree (default: `existsSync`); injected in tests. */
  readonly exists?: (path: string) => boolean;
  /**
   * Grace window (ms) `teardown` waits for a `session/cancel`ed turn to wind down
   * before hard-killing the agent. Default 2000; tests inject a small value.
   */
  readonly cancelGraceMs?: number;
  /**
   * Recover the ACP agent binary a workspace was launched with, so `reattach` uses
   * the SAME binary after a restart (the handle carries no env). Default: read the
   * per-worktree marker file; injected in tests. Returns null when none was set.
   */
  readonly readAgentMarker?: (worktreePath: string) => string | null;
  /** Persist the launched ACP agent binary for restart-safe reattach (default: marker file). */
  readonly writeAgentMarker?: (worktreePath: string, agent: string) => void;
  /**
   * The base environment the agent subprocess inherits (default: `process.env`).
   * Injectable so a deployment can hand a curated allowlist AND so tests avoid the
   * real env. Known backend secrets are denylist-stripped from it before the spawn.
   */
  readonly processEnv?: NodeJS.ProcessEnv;
  /** Override the "is this a backend secret to withhold?" predicate (default: {@link isSecretAgentEnvKey}). */
  readonly isSecretEnvKey?: (key: string) => boolean;
}

/** Per-handle live state — the ACP driver + its streamed output + turn status. */
interface AcpRunState {
  readonly driver: AcpAgentDriver;
  readonly output: string[];
  /** Repo the worktree belongs to; '' when unknown (reattach) → teardown degrades to rm. */
  repoPath: string;
  readonly worktreePath: string;
  sessionId: string;
  done: boolean;
  /** `number` = final code, `null` = clean-but-unset, `undefined` = unknown (interrupted). */
  exit: number | null | undefined;
  /** The in-flight turn promise, so teardown can await a `session/cancel`ed turn. */
  turn?: Promise<void>;
}

/** Best-effort text extraction from a `session/update` notification (any nested `text`). */
export function extractUpdateText(params: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') return;
    if (Array.isArray(v)) {
      for (const e of v) walk(e);
      return;
    }
    if (v == null || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') out.push(o.text);
    for (const key of Object.keys(o)) {
      if (key !== 'text') walk(o[key]);
    }
  };
  walk(params);
  return out.join('');
}

export function createAcpSubstrate(
  deps: CreateAcpSubstrateDeps
): ConductorSubstrate {
  const exec: ExecFn = deps.exec ?? execFileSafe;
  const logger = deps.logger ?? NOOP_LOGGER;
  const worktreeRoot = deps.config.worktreeRoot;
  const command = deps.command ?? DEFAULT_ACP_COMMAND;
  const spawnProcess = deps.spawn ?? (opts => makeAcpProcess(opts));

  const byRef = new Map<string, AcpRunState>();
  // In-flight reattach promises, keyed by workspaceId, so concurrent continueRun
  // callers trigger ONE re-spawn, not N.
  const reattaching = new Map<string, Promise<AcpRunState | null>>();
  // Refs torn down while a reattach was in-flight — a tombstone the reattach checks
  // before installing its live agent, so teardown can't be raced into an orphan.
  const tornDown = new Set<string>();
  const exists: (path: string) => boolean = deps.exists ?? existsSync;
  const cancelGraceMs = deps.cancelGraceMs ?? 2000;
  const isSecretEnvKey = deps.isSecretEnvKey ?? isSecretAgentEnvKey;

  /**
   * The env handed to the agent subprocess: the base env (injected or `process.env`)
   * with known backend secrets (DB URLs, INTERNAL_SERVICE_KEY, auth/billing/cloud
   * credentials) DENYLIST-stripped, so a prompt-injectable agent can't exfiltrate
   * them. Used by BOTH launch and reattach so the two spawn paths give the agent the
   * SAME, minimal privilege set.
   */
  function agentBaseEnv(): NodeJS.ProcessEnv {
    const base = deps.processEnv ?? process.env;
    const out: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(base)) {
      if (value !== undefined && !isSecretEnvKey(key)) out[key] = value;
    }
    return out;
  }

  // Per-launch ACP agent binary: a sibling marker file next to the worktree (NOT
  // inside it, so it never pollutes the reviewable diff) records the binary a
  // non-default workspace was launched with, so `reattach` re-spawns the SAME
  // agent after a restart (the handle carries no env). Default binary → no marker.
  const markerPath = (worktreePath: string): string =>
    `${worktreePath}.recoder-acp-agent`;
  const readAgentMarker: (worktreePath: string) => string | null =
    deps.readAgentMarker ??
    (worktreePath => {
      const p = markerPath(worktreePath);
      try {
        return exists(p) ? readFileSync(p, 'utf8').trim() || null : null;
      } catch {
        return null;
      }
    });
  const writeAgentMarker: (worktreePath: string, agent: string) => void =
    deps.writeAgentMarker ??
    ((worktreePath, agent) => {
      try {
        writeFileSync(markerPath(worktreePath), agent, 'utf8');
      } catch {
        /* best effort — reattach falls back to the default binary */
      }
    });
  const removeAgentMarker = (worktreePath: string): void => {
    if (deps.writeAgentMarker) return; // injected store: nothing on disk to remove
    try {
      rmSync(markerPath(worktreePath), { force: true });
    } catch {
      /* best effort */
    }
  };

  const present: (bin: string) => Promise<boolean> =
    deps.probe ??
    (async bin => {
      try {
        return Boolean(await which(bin));
      } catch {
        return false;
      }
    });

  function appendOutput(state: AcpRunState, text: string): void {
    if (text === '') return;
    for (const line of text.split('\n')) {
      // Truncate a single pathological (newline-free) line so one huge replayed
      // update can't sit in the buffer unbounded.
      state.output.push(
        line.length > MAX_LINE_BYTES
          ? line.slice(0, MAX_LINE_BYTES) + '…[truncated]'
          : line
      );
    }
    // Bound by line count first (cheap), then by aggregate bytes (drop oldest).
    if (state.output.length > MAX_BUFFER_LINES) {
      state.output.splice(0, state.output.length - MAX_BUFFER_LINES);
    }
    let total = 0;
    for (const l of state.output) total += l.length + 1;
    while (total > MAX_BUFFER_BYTES && state.output.length > 1) {
      total -= (state.output.shift() as string).length + 1;
    }
  }

  /**
   * Drive one agent turn on a live state — used by BOTH launch and continueRun so
   * exit mapping and buffering are identical. Fires in the background (the poller
   * tails `capture` for progress) and records the turn on `state.turn` so teardown
   * can await a cancelled turn. Only an explicit `end_turn` is success (0); any
   * other stop reason (incl. `unknown` from an off-spec reply) is a truthful 1.
   */
  function driveTurn(state: AcpRunState, instruction: string): void {
    state.done = false;
    state.exit = null;
    state.turn = state.driver
      .prompt(state.sessionId, instruction)
      .then(stopReason => {
        state.done = true;
        state.exit = stopReason === 'end_turn' ? 0 : 1;
        appendOutput(state, `\n[acp: turn ended — ${stopReason}]`);
      })
      .catch(err => {
        state.done = true;
        state.exit = 1;
        appendOutput(state, `\n[acp: turn failed — ${message(err)}]`);
      });
  }

  /** Build the agent→client request handler bound to a worktree (permission + fs). */
  function makeOnRequest(workspaceId: string, worktreePath: string) {
    return createAcpClientRequestHandler({
      workspaceId,
      workspaceRoot: worktreePath,
      ...(deps.resolvePermission
        ? { resolvePermission: deps.resolvePermission }
        : {}),
      warn: (m, meta) => logger.warn(m, { workspaceId, meta }),
    });
  }

  /**
   * Re-establish a workspace's ACP session after a backend restart (the in-memory
   * `byRef` map is gone). Spawns a FRESH agent, handshakes, and `session/load`s the
   * persisted sessionId — GATED on the agent advertising `loadSession`. Returns the
   * rehydrated state, or `null` when reattach is impossible (no sessionId, worktree
   * removed, agent/git absent, or the agent can't reload) — truthfully "lost", never
   * a fabricated live handle. Called ONLY from `continueRun` (an EXPLICIT resume) —
   * the read-only probes (capture/alive/exitCode) never spawn — so an idle restarted
   * workspace stays truthfully "no live session" and a passive reconcile/UI poll
   * cannot boot or leak an agent. The interrupted prior turn is NOT resumed.
   */
  async function reattach(
    handle: SubstrateHandle
  ): Promise<AcpRunState | null> {
    const sessionId = handle.sessionName;
    const worktreePath = handle.worktreePath;
    // Reattach needs the persisted ACP sessionId (carried as sessionName) AND the
    // worktree it ran in; without either there is nothing to reload.
    if (!sessionId || !worktreePath) return null;
    if (!exists(worktreePath)) return null;
    // Re-spawn the SAME agent binary the launch used (the handle carries no env),
    // recovered from the per-worktree marker; default when none was recorded.
    const agentBin = readAgentMarker(worktreePath) ?? command;
    const [git, agent] = await Promise.all([present('git'), present(agentBin)]);
    if (!git || !agent) return null;

    const state: AcpRunState = {
      driver: null as unknown as AcpAgentDriver,
      output: [],
      repoPath: '',
      worktreePath,
      sessionId,
      done: true, // the prior turn died with the old process — nothing is running
      exit: undefined, // its outcome is genuinely unknown — NEVER a fabricated 0
    };
    const driver = new AcpAgentDriver({
      // Same secret-stripped base env as launch (input.env isn't persisted across a
      // restart, so it can't be restored here — see recoder-x4n1 follow-up).
      spawn: () =>
        spawnProcess({
          command: agentBin,
          cwd: worktreePath,
          env: agentBaseEnv(),
        }),
      onNotification: (n: AcpNotification) => {
        // `session/load` replays the conversation history as session/update
        // notifications — the same buffering as a live turn restores the transcript.
        appendOutput(state, extractUpdateText(n.params));
        appendOutput(state, structuredUpdateLine(n.params));
      },
      onRequest: makeOnRequest(handle.ref, worktreePath),
      warn: m => logger.warn(m, { workspaceId: handle.ref }),
    });
    (state as { driver: AcpAgentDriver }).driver = driver;

    try {
      const { loadSession } = await driver.start();
      if (!loadSession) {
        driver.stop();
        logger.warn(
          'acp reattach unsupported — agent has no loadSession capability',
          {
            workspaceId: handle.ref,
          }
        );
        return null;
      }
      // Best-effort: recover the owning repo so teardown can `git worktree remove`
      // (else it degrades to an rm of the worktree dir).
      try {
        const r = await exec('git', [
          '-C',
          worktreePath,
          'rev-parse',
          '--path-format=absolute',
          '--git-common-dir',
        ]);
        const commonDir = r.stdout.trim();
        if (commonDir) state.repoPath = path.dirname(commonDir);
      } catch {
        /* leave repoPath empty — teardown degrades to a directory remove */
      }
      await driver.loadSession(sessionId, worktreePath);
      // If teardown ran while we were spawning, do NOT install a live agent it can
      // never stop — honor the tombstone and clean up ourselves.
      if (tornDown.has(handle.ref)) {
        driver.stop();
        return null;
      }
      byRef.set(handle.ref, state);
      logger.info('acp workspace reattached via session/load', {
        workspaceId: handle.ref,
        sessionId,
        worktreePath,
      });
      return state;
    } catch (err) {
      try {
        driver.stop();
      } catch {
        /* best effort */
      }
      logger.warn('acp reattach failed (best effort)', {
        workspaceId: handle.ref,
        err: message(err),
      });
      return null;
    }
  }

  /**
   * Resolve the live state for continueRun: the in-memory entry, or — after a
   * restart emptied `byRef` — a reattached session, deduped so concurrent
   * continueRun callers trigger ONE re-spawn.
   */
  async function reattachOnce(
    handle: SubstrateHandle
  ): Promise<AcpRunState | null> {
    const live = byRef.get(handle.ref);
    if (live) return live;
    let inflight = reattaching.get(handle.ref);
    if (!inflight) {
      inflight = reattach(handle).finally(() => reattaching.delete(handle.ref));
      reattaching.set(handle.ref, inflight);
    }
    return inflight;
  }

  return {
    id: 'acp',

    capabilities(): SubstrateCapabilities {
      return {
        remote: false,
        // ACP is JSON-RPC over stdio, NOT a PTY — no live keystroke injection.
        supportsPty: false,
        supportsInteractiveKeys: false,
        // Output is streamed into a buffer and read by the polling tailer.
        capturesByPolling: true,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      };
    },

    async available(): Promise<SubstrateAvailability> {
      const [git, agent] = await Promise.all([
        present('git'),
        present(command),
      ]);
      if (git && agent) return { available: true };
      const missing = [!git && 'git', !agent && command]
        .filter(Boolean)
        .join(', ');
      return {
        available: false,
        reason: `missing: ${missing}`,
        detail: { git, agent, command },
      };
    },

    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      // Per-launch agent binary: the conductor injects `RECODER_ACP_AGENT` (e.g.
      // `codex-acp` for the codex runtime); default is `claude-code-acp`. Probe the
      // RESOLVED binary so a missing non-default agent refuses truthfully.
      const agentBin = input.env?.RECODER_ACP_AGENT?.trim() || command;
      const [gitOk, agentOk] = await Promise.all([
        present('git'),
        present(agentBin),
      ]);
      if (!gitOk || !agentOk) {
        const missing = [!gitOk && 'git', !agentOk && agentBin]
          .filter(Boolean)
          .join(', ');
        throw new Error(`acp unavailable (missing: ${missing})`);
      }
      const branch = input.branch || `recoder/${input.workspaceId}`;
      const name = tmuxNameFor(input.workspaceId);
      const worktreePath = path.join(worktreeRoot, name);

      // Isolated worktree on its own branch — same as tmux, so parallel agents
      // (ACP or PTY) never collide.
      await exec('git', [
        '-C',
        input.repoPath,
        'worktree',
        'add',
        '-B',
        branch,
        worktreePath,
        input.baseRef || 'HEAD',
      ]);

      // Persist a NON-default binary so reattach re-spawns the same agent after a
      // restart (the default needs no marker — reattach falls back to it).
      if (agentBin !== command) writeAgentMarker(worktreePath, agentBin);

      const state: AcpRunState = {
        driver: null as unknown as AcpAgentDriver,
        output: [],
        repoPath: input.repoPath,
        worktreePath,
        sessionId: '',
        done: false,
        exit: null,
      };
      // The agent→client request handler, bound to THIS workspace's worktree:
      // permission decisions (policy or injected gate) + path-CONTAINED fs reads/
      // writes (the agent may delegate them per the advertised fs capabilities).
      const onRequest = makeOnRequest(input.workspaceId, worktreePath);
      const driver = new AcpAgentDriver({
        spawn: () =>
          spawnProcess({
            command: agentBin,
            cwd: worktreePath,
            // Secret-stripped base env + the workspace's own env (BYOK keys,
            // RECODER_* markers). Always passed, so no spawn path falls back to the
            // raw process.env default.
            env: { ...agentBaseEnv(), ...(input.env ?? {}) },
          }),
        onNotification: (n: AcpNotification) => {
          // Streaming text goes into the buffer verbatim; a DISCRETE structured
          // update (tool-call lifecycle / plan) additionally appends a one-line
          // marker, so the transcript shows WHAT the agent is doing, not just its
          // prose. Both ride the existing poll-tailer (which carries run context).
          appendOutput(state, extractUpdateText(n.params));
          appendOutput(state, structuredUpdateLine(n.params));
        },
        onRequest,
        warn: m => logger.warn(m, { workspaceId: input.workspaceId }),
      });
      (state as { driver: AcpAgentDriver }).driver = driver;

      // Handshake + open the session BEFORE registering the state. Leak-safety: if
      // the handshake or session/new throws (agent crash, no sessionId, unsupported
      // version), stop the spawned agent and remove the just-created worktree, then
      // rethrow — nothing is orphaned and no half-open session sits in `byRef`.
      try {
        await driver.start();
        state.sessionId = await driver.newSession(worktreePath);
      } catch (err) {
        try {
          driver.stop();
        } catch {
          /* best effort */
        }
        await removeIsolation(input.repoPath, worktreePath);
        throw err;
      }
      tornDown.delete(input.workspaceId); // a fresh launch clears any stale tombstone
      byRef.set(input.workspaceId, state);
      // Fire the task prompt in the BACKGROUND so launch returns a handle promptly
      // (the poller tails `capture` for progress).
      driveTurn(state, input.command);

      logger.info('acp workspace launched', {
        workspaceId: input.workspaceId,
        worktreePath,
        branch,
        sessionId: state.sessionId,
      });
      // Carry the agent's sessionId as `sessionName` — the engine persists it to the
      // workspace record, so it survives a restart and drives `session/load` on reattach.
      return {
        ref: input.workspaceId,
        worktreePath,
        sessionName: state.sessionId,
      };
    },

    async continueRun(
      handle: SubstrateHandle,
      input: ContinueRunInput
    ): Promise<SubstrateHandle> {
      // continueRun is the EXPLICIT resume: it reattaches after a restart (the
      // read-only probes never do). This is the only path that may re-spawn.
      const state = await reattachOnce(handle);
      if (!state)
        throw new Error(
          'acp continueRun requires a live or reattachable session'
        );
      // Don't overlap turns: a second prompt on a live turn's session would race
      // two `.then`s onto shared done/exit and fabricate a terminal state for a
      // still-running turn. Refuse truthfully instead.
      if (!state.done)
        throw new Error('acp continueRun: a turn is already in flight');
      // ACP is in-process style — it accepts a rendered `prompt`; fall back to the
      // shell `command` field so either launch shape can drive the next turn.
      const instruction = input.prompt ?? input.command;
      if (!instruction)
        throw new Error('acp continueRun requires a prompt or command');
      // Reuse the SAME session (the prior turn's worktree changes are intact).
      driveTurn(state, instruction);
      return {
        ref: handle.ref,
        worktreePath: state.worktreePath,
        sessionName: handle.sessionName ?? state.sessionId,
      };
    },

    // The probes are strictly READ-ONLY: they consult the in-memory `byRef` map and
    // NEVER reattach/spawn. After a restart an unresumed workspace truthfully reads
    // "no live session" (capture null / alive false / exitCode null), so a passive
    // reconcile or UI poll cannot boot — or leak — an agent process.
    async capture(
      handle: SubstrateHandle,
      lines = 200
    ): Promise<string | null> {
      const state = byRef.get(handle.ref);
      if (!state) return null;
      const tail = state.output.slice(-lines).join('\n').trimEnd();
      return tail ? tail + '\n' : '';
    },

    async alive(handle: SubstrateHandle): Promise<boolean> {
      const state = byRef.get(handle.ref);
      return state ? !state.done : false;
    },

    async exitCode(
      handle: SubstrateHandle
    ): Promise<number | null | undefined> {
      const state = byRef.get(handle.ref);
      if (!state)
        // No live session in THIS process (probes never spawn). A handle carrying a
        // persisted ACP sessionId WAS a real run whose outcome the restart made
        // genuinely unknown → `undefined` (interrupted), so reconcile finalizes it
        // as failed, never a fabricated completed/exit-0. A handle with no session
        // id never ran → `null` (gone).
        return handle.sessionName ? undefined : null;
      if (!state.done) return undefined; // still running — unknown, NEVER 0
      return state.exit;
    },

    async diff(
      handle: SubstrateHandle,
      baseRef: string
    ): Promise<SubstrateDiff> {
      if (!handle.worktreePath)
        throw new Error('acp diff requires a worktree path');
      const cwd = handle.worktreePath;
      const base = baseRef || 'HEAD';
      const [stat, patch, status] = await Promise.all([
        exec('git', ['-C', cwd, '--no-pager', 'diff', '--stat', base]),
        exec('git', ['-C', cwd, '--no-pager', 'diff', base]),
        exec('git', ['-C', cwd, 'status', '--porcelain']),
      ]);
      return buildSubstrateDiff({
        stat: stat.stdout,
        patch: patch.stdout,
        status: status.stdout,
      });
    },

    async teardown(
      handle: SubstrateHandle,
      options?: { removeIsolation?: boolean }
    ): Promise<void> {
      // Tombstone FIRST so an in-flight reattach won't install a live agent we can
      // no longer stop; then await + stop any reattach already spawning.
      tornDown.add(handle.ref);
      const pending = reattaching.get(handle.ref);
      if (pending) {
        try {
          (await pending)?.driver.stop();
        } catch {
          /* best effort */
        }
      }
      const state = byRef.get(handle.ref);
      if (state) {
        // Graceful: if a turn is still running, ask the agent to cancel it (ACP
        // `session/cancel`) and give it a bounded window to wind down its own
        // in-flight file writes before the hard kill.
        if (!state.done && state.sessionId) {
          try {
            state.driver.cancel(state.sessionId);
          } catch {
            /* the process may already be gone — fall straight to stop */
          }
          if (state.turn) {
            await Promise.race([
              state.turn.catch(() => {}),
              delay(cancelGraceMs),
            ]);
          }
        }
        try {
          state.driver.stop();
        } catch {
          /* best effort */
        }
      }
      if (options?.removeIsolation !== false) {
        const wtPath =
          handle.worktreePath ??
          state?.worktreePath ??
          path.join(worktreeRoot, tmuxNameFor(handle.ref));
        await removeIsolation(state?.repoPath, wtPath);
        removeAgentMarker(wtPath); // drop the sibling agent-binary marker
      }
      byRef.delete(handle.ref);
      logger.info('acp workspace torn down', { ref: handle.ref });
    },
  };

  /**
   * Remove a workspace's isolation: `git worktree remove --force` when the owning
   * repo is known, else a best-effort directory remove (a reattached state may not
   * have recovered its repo). Best-effort throughout — never throws.
   */
  async function removeIsolation(
    repo: string | undefined,
    wtPath: string
  ): Promise<void> {
    if (repo) {
      try {
        await exec('git', [
          '-C',
          repo,
          'worktree',
          'remove',
          '--force',
          wtPath,
        ]);
      } catch (err) {
        logger.warn('acp worktree remove failed (best effort)', {
          err: message(err),
        });
      }
    } else if (exists(wtPath)) {
      try {
        rmSync(wtPath, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
}

/** A cancellable-free bounded delay (unref'd so it never keeps the loop alive). */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    (t as { unref?: () => void }).unref?.();
  });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
