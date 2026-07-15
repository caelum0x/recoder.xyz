/**
 * `conductor-dispatch` — the `/run …` half of the {@link DispatchPort}. It turns
 * an ADMITTED inbound message into a conductor workspace + Run via the Phase-5
 * `createWorkspace` seam (consumed through a PORT, never a direct import).
 *
 * DEGRADE-SAFE, never a faked run:
 *   - no conductor port wired            ⇒ `error` outcome (conductor unavailable);
 *   - no resolvable target for the chat  ⇒ `error` outcome (unbound chat);
 *   - conductor refuses / faults         ⇒ `error` outcome carrying the reason.
 * A run id is returned ONLY when the conductor genuinely launched one.
 */
import type { DispatchOutcome, InboundEnvelope, ParsedCommand } from '../types.js';

/** The workspace request the conductor seam needs to launch a run. */
export interface ConductorWorkspaceRequest {
  readonly spaceId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly repoPath: string;
  readonly runtimeId: string;
  readonly prompt: string;
  /** The resolved owner principal (never taken from channel content). */
  readonly principal: unknown;
}

/** The narrow conductor seam (bootstrap adapts `conductor.createWorkspace`). */
export interface ConductorDispatchPort {
  createWorkspace(
    req: ConductorWorkspaceRequest,
  ): Promise<{ ok: boolean; runId?: string; workspaceId?: string; reason?: string }>;
}

/** Resolves the conductor target (space/project/repo/runtime/principal) for a chat. */
export interface ConductorTargetResolver {
  /** `null` when the chat has no bound, launchable target (⇒ truthful error). */
  resolve(
    env: InboundEnvelope,
    command: ParsedCommand,
  ): Promise<Omit<ConductorWorkspaceRequest, 'prompt'> | null>;
}

export interface ConductorDispatchDeps {
  /** Optional conductor seam; absent ⇒ every conductor dispatch errors truthfully. */
  readonly conductor?: ConductorDispatchPort;
  /** Resolves the launch target for an admitted chat command. */
  readonly targetResolver: ConductorTargetResolver;
}

function error(reason: string): DispatchOutcome {
  return { kind: 'conductor', error: reason };
}

/** Build the conductor-dispatch half of the DispatchPort. */
export function createConductorDispatch(deps: ConductorDispatchDeps) {
  return async function dispatchToConductor(env: InboundEnvelope, command: ParsedCommand): Promise<DispatchOutcome> {
    if (!deps.conductor) {
      return error('conductor dispatch seam is not wired — cannot launch a run');
    }
    const target = await safe(() => deps.targetResolver.resolve(env, command));
    if (!target) {
      return error(`no launchable target bound for ${env.channel}:${env.chatRef}`);
    }
    const prompt = command.args.length > 0 ? command.args : env.text;
    const res = await safe(() => deps.conductor!.createWorkspace({ ...target, prompt }));
    if (!res || !res.ok) {
      return error(res?.reason ?? 'conductor refused or failed to launch the run');
    }
    return { kind: 'conductor', ...(res.runId ? { runId: res.runId } : {}) };
  };
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
