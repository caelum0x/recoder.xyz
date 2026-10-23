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
 *   3. runAgent(agentId, prompt) for the turn. `runAgent` is a genuine napi
 *      `async fn` on the Rust side (openfang-napi/src/lib.rs) — the call
 *      returns a real Promise and the agent-loop turn runs on the addon's
 *      own worker pool, so it does NOT hold the Node event loop for the
 *      full turn. (Previously this used a synchronous `Runtime::block_on`
 *      that stalled every other `#[napi]` call on this engine handle for
 *      the turn's whole duration — fixed 2026-10-24.)
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
import { createLogger } from '../../shared/logger.js';
import { getOpenfangEngine, type OpenfangEngineInstance } from './openfang-native.js';

const logger = createLogger('conductor:openfang-runtime');

/**
 * Map a terminal RunEvent's message to friendly, user-facing copy (pure).
 * Ported from the conductor run-tailer so this in-process driver stays free of
 * the tmux/substrate tail machinery it does not use. Non-terminal events and
 * already-friendly messages pass through untouched; the technical detail is
 * preserved on `data.technicalMessage` for the audit trail.
 */
function friendlyTerminalMessage(event: RunEvent): string | undefined {
  if (event.type === 'completed') return 'Agent finished';
  if (event.type === 'failed') {
    const code =
      typeof event.data?.exitCode === 'number' ? (event.data.exitCode as number) : undefined;
    if (event.data?.reason === 'max_duration') return 'Agent stopped (took too long)';
    return code !== undefined && code !== 0
      ? `Agent stopped (error, exit ${code})`
      : 'Agent stopped (error)';
  }
  return undefined;
}

/** Return a copy of the event with a friendlier user-facing message, when applicable. */
export function withFriendlyMessage(event: RunEvent): RunEvent {
  const friendly = friendlyTerminalMessage(event);
  if (!friendly || friendly === event.message) return event;
  return {
    ...event,
    message: friendly,
    data: { ...(event.data ?? {}), technicalMessage: event.message },
  };
}

/** Minimal sink contract — structurally identical to @recoder/substrate's RunEventSink. */
export interface OpenfangRunEventSink {
  append(event: RunEvent): Promise<void> | void;
}

/**
 * Provenance evidence for one spawn attempt, distilled from the engine's
 * `verifySignedManifest`. This is the CROSS-DOMAIN vocabulary the governance gate
 * reasons about — deliberately free of any `@recoder/governance` internals so the
 * engines domain never takes a dependency on the kernel package (the bootstrap
 * wiring bridges this shape to `GovernanceKernelPort.decide`).
 */
export interface OpenfangManifestProvenance {
  /** A signed manifest envelope was supplied for this spawn. */
  readonly signed: boolean;
  /** The engine cryptographically verified the envelope (`false` on absent/failed verify). */
  readonly verified: boolean;
  /** The signer/key identity the engine reported, when the envelope carried one. */
  readonly signer?: string;
  /** Why verification did not succeed (engine error text) — never a secret. */
  readonly reason?: string;
}

/** The decision the {@link OpenfangProvenanceGate} hands back (deny-biased on fault). */
export interface OpenfangProvenanceDecision {
  readonly allow: boolean;
  readonly reason: string;
}

/** The request the gate reasons about before an openfang agent is spawned. */
export interface OpenfangProvenanceRequest {
  /** The governance action — always `agent.spawn` for this seam. */
  readonly action: 'agent.spawn';
  readonly agentName: string;
  readonly workspaceId: string;
  readonly taskId: string;
  readonly runId: string;
  /** Distilled provenance evidence from `verifySignedManifest`. */
  readonly provenance: OpenfangManifestProvenance;
}

/**
 * The governance provenance gate — the seam `launchOpenfangRun` consults BEFORE
 * `spawnAgent`. Bootstrap backs it with `GovernanceKernelPort.decide` (mapping a
 * `deny`/`needs_approval` verdict to `allow:false`). Absent (conductor default,
 * tests) ⇒ the gate is SKIPPED truthfully — provenance is advisory, never a hard
 * block, so an unwired gate can never stall a run. A gate that THROWS is folded
 * deny-biased into a truthful `failed` (never a fabricated allow).
 */
export interface OpenfangProvenanceGate {
  decide(req: OpenfangProvenanceRequest): Promise<OpenfangProvenanceDecision>;
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
  /**
   * OPTIONAL signed manifest provenance envelope (openfang `SignedManifest` JSON).
   * When present it is cryptographically verified via the engine's
   * `verifySignedManifest`, and the distilled provenance rides into the governance
   * gate BEFORE `spawnAgent`. Absent ⇒ provenance is `{ signed:false }` (the gate,
   * if wired, still decides whether an unsigned spawn is permitted).
   */
  signedManifestJson?: string;
}

/** Injectable seams (tests). All optional; production callers pass nothing. */
export interface OpenfangLaunchDeps {
  /** Engine resolver — defaults to the degrade-safe getOpenfangEngine(). */
  engine?: () => OpenfangEngineInstance | undefined;
  /**
   * RunEvent sink. In the composed app the napi adapter threads the bootstrap-
   * injected agent-os bus sink here (recoder-a094); absent any sink the driver
   * warn-logs and DROPS each event (truthful — never a fake persist).
   */
  sink?: OpenfangRunEventSink;
  /** Clock — defaults to `() => new Date()`. */
  now?: () => Date;
  /**
   * OPTIONAL governance provenance gate consulted BEFORE `spawnAgent`. Bootstrap
   * backs it with `GovernanceKernelPort.decide`. Absent ⇒ the provenance gate is
   * skipped truthfully (never blocks a run). Only runs on a FRESH spawn — a
   * reused-by-name agent was already gated at its own spawn.
   */
  governance?: OpenfangProvenanceGate;
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
 * `#[serde(default)]` (backend/engines/rust/openfang/crates/openfang-types/src/agent.rs), so name +
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

/**
 * Distill signed-manifest provenance from the engine's `verifySignedManifest`.
 * Pure over the engine handle; NEVER throws (a napi throw folds into a truthful
 * `verified:false` with the error as `reason`). No envelope ⇒ `{ signed:false }`.
 */
function verifyManifestProvenance(
  engine: OpenfangEngineInstance,
  signedManifestJson: string | undefined,
): OpenfangManifestProvenance {
  if (!signedManifestJson || !signedManifestJson.trim()) {
    return { signed: false, verified: false };
  }
  if (typeof engine.verifySignedManifest !== 'function') {
    return { signed: true, verified: false, reason: 'engine lacks verifySignedManifest' };
  }
  try {
    const parsed = parseEngineJson(engine.verifySignedManifest(signedManifestJson));
    if (parsed.ok === true) {
      const signer = extractSigner(parsed);
      return { signed: true, verified: true, ...(signer ? { signer } : {}) };
    }
    const reason = typeof parsed.error === 'string' ? parsed.error : 'manifest verification failed';
    return { signed: true, verified: false, reason };
  } catch (err) {
    return {
      signed: true,
      verified: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Best-effort signer/key-id extraction from the verified-manifest reply (no throw). */
function extractSigner(parsed: Record<string, unknown>): string | undefined {
  const direct = parsed.signer ?? parsed.key_id ?? parsed.keyId;
  if (typeof direct === 'string' && direct) return direct;
  const manifest = parsed.manifest;
  if (manifest && typeof manifest === 'object') {
    const m = manifest as Record<string, unknown>;
    const nested = m.signer ?? m.key_id ?? m.keyId;
    if (typeof nested === 'string' && nested) return nested;
  }
  return undefined;
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
 * Default sink when the caller injects none. The RunEvent audit-trail sink of
 * record is owned by the agent-os domain repository; this engines-domain driver
 * must NOT reach back into that state directly (domain boundary). Bootstrap
 * closes that gap (recoder-a094): `createEngineRunSink` in
 * `bootstrap/conductor-seams.ts` injects the agent-os RunEvent bus
 * (`source:'engine'`, late-bound after Phase 5a) as the napi adapter's default
 * `runSink` (`EnginesModuleDeps.openfangRunSink` →
 * `OpenfangNapiOptions.runSink`), so composed callers never land here. Reaching
 * THIS fallback therefore means `launchOpenfangRun` was called with NO sink
 * outside the composed app (tests / standalone) — warn loudly that the event is
 * dropped rather than couple to the control-plane repository from inside the
 * engines domain.
 */
function appendToRepositorySink(event: RunEvent): void {
  const friendly = withFriendlyMessage(event);
  logger.warn(
    { type: friendly.type, runId: friendly.runId, taskId: friendly.taskId },
    'openfang RunEvent produced with no injected sink — DROPPED, not persisted (inject runSink to record)',
  );
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
      'Build with: cd backend/engines/rust/openfang && cargo build -p openfang-napi --release';
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
      // PROVENANCE GATE (fresh spawn only — a reused agent was already gated).
      // Verify the signed manifest envelope (when supplied) through the engine,
      // then let governance decide whether this spawn may proceed. Deny-biased on
      // a gate fault; SKIPPED truthfully when no gate is wired (never blocks).
      const provenance = verifyManifestProvenance(engine, input.signedManifestJson);
      if (deps.governance) {
        let decision: OpenfangProvenanceDecision;
        try {
          decision = await deps.governance.decide({
            action: 'agent.spawn',
            agentName,
            workspaceId: input.workspaceId,
            taskId: input.taskId,
            runId: input.runId,
            provenance,
          });
        } catch (gateErr) {
          // A gate that throws is a hard, truthful deny — never a fabricated allow.
          decision = {
            allow: false,
            reason: `provenance gate error: ${gateErr instanceof Error ? gateErr.message : String(gateErr)}`,
          };
        }
        if (!decision.allow) {
          const error = `manifest provenance denied: ${decision.reason}`;
          await emit('failed', `openfang spawn blocked by governance — ${error}`, {
            agentName,
            error,
            signed: provenance.signed,
            verified: provenance.verified,
            ...(provenance.signer ? { signer: provenance.signer } : {}),
          });
          return { available: true, ok: false, error };
        }
        logger.info(
          {
            workspaceId: input.workspaceId,
            taskId: input.taskId,
            agentName,
            signed: provenance.signed,
            verified: provenance.verified,
          },
          'openfang spawn allowed by governance provenance gate',
        );
      } else if (provenance.signed) {
        // Envelope supplied but no gate wired: record the verification outcome so
        // the audit trail still carries provenance, without blocking the spawn.
        logger.debug(
          { agentName, verified: provenance.verified, reason: provenance.reason },
          'openfang signed manifest verified (no governance gate wired — advisory only)',
        );
      }

      const spawned = parseEngineJson(engine.spawnAgent(buildManifestJson(agentName, input)));
      if (spawned.ok !== true || typeof spawned.agent_id !== 'string') {
        const error = typeof spawned.error === 'string' ? spawned.error : 'spawnAgent failed';
        await emit('failed', `openfang spawnAgent failed: ${error}`, { agentName, error });
        return { available: true, ok: false, error };
      }
      agentId = spawned.agent_id;
    }

    // ---- One agent-loop turn. Awaited: the napi call is a genuine async fn
    // (see header) — it does not block the event loop while the turn runs.
    const result = parseEngineJson(await engine.runAgent(agentId, input.prompt));
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
