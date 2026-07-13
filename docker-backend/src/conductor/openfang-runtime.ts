/**
 * openfang-runtime — in-process conductor runtime driver for the openfang engine
 * (Wave G3).
 *
 * The 8 headless CLIs in RUNTIME_SPECS are subprocesses: resolveRuntimeCommand
 * builds a shell line, the substrate launches it, and the run-tailer polls the
 * pane into RunEvents. openfang is different: the engine is a native `.node`
 * addon fused into THIS process (see openfang-native.ts), so a "launch" is a
 * direct method call — no bin on PATH, no tmux pane, no tailer poll loop.
 *
 * This driver is the in-process equivalent of "launch + tail" in one call:
 *   1. getOpenfangEngine() — degrade-safe; absent/boot-failed => truthful
 *      `{ available: false, reason }` with NO events and NO fake success.
 *   2. Reuse an existing openfang agent by name, else spawnAgent() from a
 *      minimal manifest (openfang's AgentManifest is fully serde-defaulted;
 *      `workspace` is pointed at the conductor worktree so the agent's file
 *      tools operate inside the isolated worktree).
 *   3. runAgent(agentId, prompt) for the turn. CAVEAT: the napi call is
 *      SYNCHRONOUS AND BLOCKING (Rust `block_on`) — it holds the Node event
 *      loop for the full agent turn. This matches the accepted precedent in
 *      openfang-daemon.ts (runAgent on the Express thread).
 *   4. Emit honest started / log(response) / completed (or failed) RunEvents
 *      through the SAME sink of record the run-tailer uses:
 *      agentOsContainer.repository.appendEvent(withFriendlyMessage(event)).
 *      The sink is injectable for tests; the default resolves lazily so
 *      importing this module never boots the agent-os container.
 *
 * RunEvent conventions mirrored from @recoder/substrate's run-tailer:
 *   - eventId: `event_<runId>_<type>_<ms>`
 *   - WorkspaceEngine.listWorkspaceEvents filters `runId === "run_" + workspaceId`,
 *     so callers that want events visible on the workspace timeline must pass
 *     that runId shape (the driver uses whatever runId it is given — the
 *     convention is the caller's contract, same as startRunTail).
 *
 * NOT wired into resolveRuntimeCommand: ConductorRuntimeId is a CLOSED union in
 * @recoder/substrate and a RuntimeSpec is definitionally a subprocess CLI.
 * Instead runtime-commands.ts exports IN_PROCESS_RUNTIME_SPECS pointing here,
 * so a launcher can dispatch `openfang` to this driver explicitly.
 */
import type { RunEvent, RunEventType } from '@recoder/agent-os';
import { createLogger } from '../logger.js';
import { getOpenfangEngine, type OpenfangEngineInstance } from './openfang-native.js';

const logger = createLogger('conductor:openfang-runtime');

/** Minimal sink contract — structurally identical to @recoder/substrate's RunEventSink. */
export interface OpenfangRunEventSink {
  append(event: RunEvent): Promise<void> | void;
}

export interface OpenfangLaunchInput {
  /** Conductor workspace id (events land on its timeline when runId is `run_<workspaceId>`). */
  workspaceId: string;
  taskId: string;
  runId: string;
  /** The message for this agent turn (the "prompt" a CLI runtime would get). */
  prompt: string;
  /** openfang agent name — reused across turns when it already exists. */
  agentName?: string;
  /** Conductor worktree path — becomes the openfang agent's `workspace` dir. */
  worktreePath?: string;
}

/** Injectable seams (tests). All optional; production callers pass nothing. */
export interface OpenfangLaunchDeps {
  /** Engine resolver — defaults to the degrade-safe getOpenfangEngine(). */
  engine?: () => OpenfangEngineInstance | undefined;
  /** RunEvent sink — defaults to the run-tailer's repository sink (lazy). */
  sink?: OpenfangRunEventSink;
  /** Clock — defaults to `() => new Date()`. */
  now?: () => Date;
}

export type OpenfangLaunchResult =
  /** Engine absent or failed to boot — truthful degrade, no events emitted. */
  | { available: false; reason: string }
  /** Turn completed; `response` is the agent's answer for this turn. */
  | {
      available: true;
      ok: true;
      agentId: string;
      response: string;
      iterations?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  /** Engine present but the spawn/run failed — a `failed` RunEvent was emitted. */
  | { available: true; ok: false; error: string };

/** openfang agent names: lowercase alnum with `-`/`_` (manifest-safe). */
function sanitizeAgentName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'recoder-agent';
}

/**
 * Build the minimal AgentManifest JSON. openfang's AgentManifest is fully
 * `#[serde(default)]` (crates/openfang-types/src/agent.rs), so name +
 * description + workspace + metadata is a complete, valid manifest — module
 * defaults to `builtin:chat`, model to the kernel default.
 */
function buildManifestJson(name: string, input: OpenfangLaunchInput): string {
  return JSON.stringify({
    name,
    description: `Recoder conductor agent for task ${input.taskId}`,
    ...(input.worktreePath ? { workspace: input.worktreePath } : {}),
    metadata: {
      recoder_workspace_id: input.workspaceId,
      recoder_task_id: input.taskId,
      recoder_run_id: input.runId,
    },
  });
}

/** Parse an engine JSON reply; a parse failure becomes a truthful error value. */
function parseEngineJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { ok: false, error: `engine returned non-object JSON: ${raw.slice(0, 200)}` };
  } catch {
    return { ok: false, error: `engine returned invalid JSON: ${raw.slice(0, 200)}` };
  }
}

/** Reuse-by-name: find an existing openfang agent id, degrade to spawn on any failure. */
function findExistingAgentId(engine: OpenfangEngineInstance, name: string): string | undefined {
  try {
    const parsed = parseEngineJson(engine.listAgents());
    if (parsed.ok !== true || !Array.isArray((parsed as { agents?: unknown }).agents)) {
      return undefined;
    }
    const agents = (parsed as { agents: Array<{ id?: unknown; name?: unknown }> }).agents;
    const hit = agents.find((a) => a?.name === name && typeof a?.id === 'string');
    return hit ? (hit.id as string) : undefined;
  } catch (err) {
    logger.warn({ err }, 'openfang listAgents failed during reuse lookup — will spawn fresh');
    return undefined;
  }
}

/**
 * Default sink: the SAME sink of record the run-tailer uses — the agent-os
 * repository, with the run-tailer's friendly terminal-message mapping applied.
 * Resolved lazily so importing this module never boots the service container.
 */
async function appendToRepositorySink(event: RunEvent): Promise<void> {
  const [{ agentOsContainer }, { withFriendlyMessage }] = await Promise.all([
    import('../agent-os/service-container.js'),
    import('./run-tailer.js'),
  ]);
  await agentOsContainer.repository.appendEvent(withFriendlyMessage(event));
}

/**
 * Run one openfang agent turn in-process and emit honest RunEvents.
 *
 * Degrade-safe end to end: engine absent => `{ available: false }` (no events);
 * spawn/run failures (value-level `{ok:false}` OR a thrown napi error) => one
 * honest `failed` event + `{ available: true, ok: false }`. Never throws.
 */
export async function launchOpenfangRun(
  input: OpenfangLaunchInput,
  deps: OpenfangLaunchDeps = {},
): Promise<OpenfangLaunchResult> {
  const engine = deps.engine ? deps.engine() : getOpenfangEngine();
  if (!engine) {
    const reason =
      'openfang native engine unavailable — addon not built or kernel boot failed. ' +
      'Build with: cd crates/openfang && cargo build -p openfang-napi --release';
    logger.info({ workspaceId: input.workspaceId, taskId: input.taskId }, reason);
    return { available: false, reason };
  }

  const sink: OpenfangRunEventSink = deps.sink ?? { append: appendToRepositorySink };
  const now = deps.now ?? ((): Date => new Date());
  const agentName = sanitizeAgentName(input.agentName ?? `recoder-${input.workspaceId}`);

  const emit = async (
    type: RunEventType,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> => {
    const at = now();
    const event: RunEvent = {
      eventId: `event_${input.runId}_${type}_${at.getTime()}`,
      type,
      taskId: input.taskId,
      runId: input.runId,
      agentId: 'openfang',
      message,
      createdAt: at.toISOString(),
      data: { engine: 'openfang', native: true, workspaceId: input.workspaceId, ...(data ?? {}) },
    };
    try {
      await sink.append(event);
    } catch (err) {
      // The sink is the audit trail, not the run: a persistence hiccup must not
      // kill an in-flight agent turn. Same policy as the package run-tailer.
      logger.warn({ err, workspaceId: input.workspaceId, type }, 'openfang RunEvent append failed');
    }
  };

  await emit('started', `openfang agent run started (in-process, agent "${agentName}")`, {
    agentName,
  });

  try {
    // ---- Resolve the agent: reuse by name, else spawn from a minimal manifest.
    let agentId = findExistingAgentId(engine, agentName);
    if (!agentId) {
      const spawned = parseEngineJson(engine.spawnAgent(buildManifestJson(agentName, input)));
      if (spawned.ok !== true || typeof spawned.agent_id !== 'string') {
        const error = typeof spawned.error === 'string' ? spawned.error : 'spawnAgent failed';
        await emit('failed', `openfang spawnAgent failed: ${error}`, { agentName, error });
        return { available: true, ok: false, error };
      }
      agentId = spawned.agent_id;
    }

    // ---- One agent-loop turn. NOTE: synchronous, blocks the event loop (see header).
    const result = parseEngineJson(engine.runAgent(agentId, input.prompt));
    if (result.ok !== true) {
      const error = typeof result.error === 'string' ? result.error : 'runAgent failed';
      await emit('failed', `openfang runAgent failed: ${error}`, {
        openfangAgentId: agentId,
        error,
      });
      return { available: true, ok: false, error };
    }

    const response = typeof result.response === 'string' ? result.response : '';
    const iterations = typeof result.iterations === 'number' ? result.iterations : undefined;
    const inputTokens = typeof result.input_tokens === 'number' ? result.input_tokens : undefined;
    const outputTokens =
      typeof result.output_tokens === 'number' ? result.output_tokens : undefined;

    await emit('log', response, { openfangAgentId: agentId, source: 'openfang' });
    await emit('completed', 'openfang agent turn completed (in-process)', {
      openfangAgentId: agentId,
      iterations,
      inputTokens,
      outputTokens,
      exitCode: 0,
    });
    return { available: true, ok: true, agentId, response, iterations, inputTokens, outputTokens };
  } catch (err) {
    // The napi boundary itself can throw (not just return {ok:false}) — fold it
    // into one honest failed event, mirroring openfang-daemon's try/catch.
    const reason = err instanceof Error ? err.message : String(err);
    await emit('failed', `openfang engine threw: ${reason}`, { error: reason });
    return { available: true, ok: false, error: reason };
  }
}
