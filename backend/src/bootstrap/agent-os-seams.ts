/**
 * Agent-OS composition-root seams — the small, PURE pieces of the bootstrap →
 * agent-os wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts} / {@link ./interop-wire-seams.ts} /
 * {@link ./memory-seams.ts}):
 *
 *   - {@link parseSquadSeedEnv} — parse the OPT-IN squad seed from env into the
 *     agent-os {@link SquadSeed} shape (bootstrap is the sole sanctioned env read;
 *     agent-os OWNS the actual seed — this only shapes config). Validated by the
 *     agent-os `squadSeedSchema`, so no drift is possible. Absent / malformed ⇒
 *     `null` ⇒ byte-identical pass-through (seed OFF), never a fabricated squad.
 *   - {@link createSquadAutopilotDispatch} — the NARROW {@link SquadConductorPort}
 *     the autopilot launches ready bd issues through, adapting the real conductor
 *     module's `createWorkspace` behind it (agent-os never imports the conductor
 *     module). A refused/faulted launch surfaces as a truthful `ok:false` — never
 *     a fabricated workspace/run.
 *
 * Neither owns cross-domain state; the dispatch seam reads no `process.env` (the
 * env-derived repo root is folded in by the composition root).
 */
import type { EnvSource } from './config.js';
import { squadSeedSchema, type SquadSeed } from '../domains/agent-os/config.js';
import type { SquadConductorPort } from '../domains/agent-os/ports/squad-autopilot.port.js';
import type { Principal } from '../domains/identity/types.js';
import { childLogger } from '../shared/logger.js';

/**
 * Parse the OPT-IN squad seed from env (bootstrap is the sole sanctioned env
 * read; agent-os OWNS the actual seed — this only shapes config). Two truthful
 * forms, JSON preferred:
 *   - `RECODER_SQUAD_DEF` = a full {@link SquadSeed} JSON object.
 *   - `RECODER_SQUAD_ID` + `RECODER_SQUAD_MEMBERS` (csv of `agentId[:weight]`),
 *     with optional `RECODER_SQUAD_LEADER` / `RECODER_SQUAD_NAME` /
 *     `RECODER_SQUAD_STRATEGY` / `RECODER_SQUAD_SPACE`.
 * Absent ⇒ `null` ⇒ byte-identical pass-through (the default, seed OFF). A
 * malformed / incomplete env ⇒ `null` + a truthful warn — NEVER a fabricated
 * squad; agent-os then leaves the autopilot un-routed (flat pass-through), it
 * never skips every dispatch. Validated by the agent-os `squadSeedSchema` (the
 * single source of truth for the seed shape), so no drift is possible.
 */
export function parseSquadSeedEnv(env: EnvSource): SquadSeed | null {
  const rawJson = env.RECODER_SQUAD_DEF?.trim();
  const squadId = env.RECODER_SQUAD_ID?.trim();
  const membersCsv = env.RECODER_SQUAD_MEMBERS?.trim();
  // Nothing configured ⇒ opt-out. A bare RECODER_SQUAD_ID (no members) also
  // yields null here — agent-os then warns and routes flat, never skip-all.
  if (!rawJson && !(squadId && membersCsv)) return null;
  try {
    if (rawJson) {
      return squadSeedSchema.parse(JSON.parse(rawJson));
    }
    const leaderAgentId = env.RECODER_SQUAD_LEADER?.trim();
    const members = membersCsv!
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [agentId, weightRaw] = entry.split(':').map((part) => part.trim());
        const weight = weightRaw ? Number(weightRaw) : undefined;
        return {
          agentId,
          ...(leaderAgentId && agentId === leaderAgentId ? { role: 'leader' as const } : {}),
          ...(weight !== undefined && Number.isFinite(weight) ? { weight } : {}),
        };
      });
    return squadSeedSchema.parse({
      squadId,
      displayName: env.RECODER_SQUAD_NAME?.trim() || squadId,
      ...(env.RECODER_SQUAD_SPACE?.trim() ? { spaceId: env.RECODER_SQUAD_SPACE.trim() } : {}),
      ...(leaderAgentId ? { leaderAgentId } : {}),
      ...(env.RECODER_SQUAD_STRATEGY?.trim()
        ? { routingStrategy: env.RECODER_SQUAD_STRATEGY.trim() }
        : {}),
      members,
    });
  } catch (err) {
    childLogger('bootstrap').warn(
      { err: err instanceof Error ? err.message : String(err) },
      'bootstrap: malformed squad seed env — squad routing OFF (autopilot routes flat, not skip-all)',
    );
    return null;
  }
}

/**
 * The narrow conductor surface the squad-autopilot dispatch seam consumes
 * (structural — the real `ConductorModuleSurface.createWorkspace` fits without a
 * cross-domain import).
 */
export interface SquadAutopilotLauncher {
  createWorkspace(
    input: {
      readonly spaceId: string;
      readonly projectId: string;
      readonly taskId: string;
      readonly repoPath: string;
      readonly runtimeId: string;
      readonly prompt?: string;
      readonly metadata?: Record<string, unknown>;
    },
    principal: Principal,
  ): Promise<{
    readonly ok: boolean;
    readonly reason?: string;
    readonly value?: { readonly workspaceId: string; readonly runId?: string } | null;
  }>;
}

/** Deps for the squad-autopilot → conductor dispatch seam. */
export interface SquadAutopilotDispatchDeps {
  /** The real conductor launcher — adapted behind the narrow `SquadConductorPort`. */
  readonly conductor: SquadAutopilotLauncher;
  /** The worktree parent each autopilot run runs in (the sanctioned repo root). */
  readonly repoRoot: string;
}

/** The fixed internal-service identity every autopilot launch runs under. */
const SQUAD_AUTOPILOT_PRINCIPAL: Principal = {
  userId: 'squad-autopilot',
  scopes: ['internal', 'write'],
  kind: 'internal',
  isAnonymous: false,
  raw: null,
};

/**
 * Build the squad-autopilot → conductor dispatch seam: the autopilot pulls ready
 * bd issues and launches each through the real governed `createWorkspace` path
 * under a fixed internal-service principal. A refused/faulted launch surfaces as a
 * truthful `ok:false` — never a fabricated workspace/run. The squad-routed agent
 * (multica's leader-first / weighted selection) is carried onto the workspace
 * record metadata so the launch reflects WHICH member the work was routed to;
 * absent (no squad configured) ⇒ omitted (flat default dispatch, unchanged).
 */
export function createSquadAutopilotDispatch(
  deps: SquadAutopilotDispatchDeps,
): SquadConductorPort {
  const { conductor, repoRoot } = deps;
  return {
    async dispatch(req) {
      const res = await conductor.createWorkspace(
        {
          spaceId: 'space-default',
          projectId: 'squad-autopilot',
          taskId: req.taskId, // the bd issue id — the issue-graph tracker claims it
          repoPath: repoRoot,
          runtimeId: 'claude_code',
          prompt: req.prompt,
          // Carry the squad-routed agent (multica's leader-first / weighted
          // selection) onto the workspace record so the launch reflects WHICH
          // squad member the work was routed to. Absent (no squad configured)
          // ⇒ omitted; the flat default dispatch is unchanged.
          ...(req.routedAgentId ? { metadata: { routedAgentId: req.routedAgentId } } : {}),
        },
        SQUAD_AUTOPILOT_PRINCIPAL,
      );
      if (!res.ok || !res.value) {
        return { ok: false, reason: res.reason ?? 'conductor refused workspace.create' };
      }
      return {
        ok: true,
        workspaceId: res.value.workspaceId,
        ...(res.value.runId ? { runId: res.value.runId } : {}),
      };
    },
  };
}
