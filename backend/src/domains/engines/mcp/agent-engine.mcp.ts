/**
 * agent-engine MCP tools — the gated agent surface over the openfang Hands
 * lifecycle + event bridge on the {@link AgentEngineService} facet
 * (docs/RECODER-MODULES.md AGENT-ENGINE: supervised autonomous background
 * capabilities). Every call passes the interop `authorize → risk → policy →
 * audit` chain at the MCP host boundary (bound via the collision-safe
 * `registerDomainTools` bridge), so these handlers stay thin and truthful over
 * the facet.
 *
 *  - `agent_engine_hands_list`      — READ: composed hand defs ⋈ live instances.
 *  - `agent_engine_hand_activate`   — WRITE: spawn a background hand instance.
 *  - `agent_engine_hand_pause`      — WRITE: pause a live hand instance.
 *  - `agent_engine_hand_resume`     — WRITE: resume a paused hand instance.
 *  - `agent_engine_hand_deactivate` — WRITE: stop + remove a hand instance.
 *  - `agent_engine_publish_event`   — WRITE: publish onto the kernel event bus,
 *    firing any matching triggers (messages delivered to agents).
 *
 * IDENTITY: every MUTATING tool requires the host-authorized {@link McpToolCaller}
 * (the registrar's `callerFromInput`, never spoofable model output) — an absent
 * identity refuses with `AUTH_REQUIRED` before the facet is touched, mirroring the
 * conductor engine's `requireCaller`. The host boundary already runs
 * authorize → risk → execute → audit; this gate keeps the handler itself inert
 * for an unauthenticated call. `hands_list` is a pure read and stays open to any
 * host-authorized route.
 *
 * DEGRADE-SAFE: a null facet (openfang engine undeclared or its `.node`
 * unbuilt) yields a truthful `{ ok:false, reason }` — never a throw, never a
 * fabricated hand or instance. Bad input degrades the same way (`handId
 * required` style), matching the service's own conventions; the service is
 * never invoked for invalid input.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { AgentEngineService } from '../ports/agent-engine.port.js';

/** The in-proc MCP server id for the agent-engine tools. */
export const AGENT_ENGINE_MCP_SERVER_ID = 'agent-engine';

/** The truthful degrade reason when the facet is unbound. */
export const AGENT_ENGINE_UNAVAILABLE =
  'openfang agent-engine unavailable (engine undeclared or .node unbuilt)';

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** A plain (non-array) record, or `null`. */
function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Require an authorized caller identity for a MUTATING verb (these tools are
 * edge-exposed through the interop MCP host). Absent ⇒ `AUTH_REQUIRED` — the
 * handler never executes for an unauthenticated call.
 */
function requireCaller(caller: McpToolCaller | undefined): McpToolCaller {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'agent-engine: no authorized caller identity');
  }
  return caller;
}

/** The truthful degrade object for an unbound facet. */
function unavailable(): { ok: false; reason: string } {
  return { ok: false, reason: AGENT_ENGINE_UNAVAILABLE };
}

/** A truthful input-validation refusal (service never invoked). */
function badInput(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

/** Read one required trimmed-string arg from the raw tool input. */
function stringArg(raw: unknown, key: string): string | undefined {
  return str(rec(raw)?.[key]);
}

/**
 * Present one boolean lifecycle write truthfully: `{ ok:true }` on success, a
 * reasoned `{ ok:false }` on refusal (the service logs the precise cause).
 */
function presentBool(ok: boolean): { ok: boolean; reason?: string } {
  return ok ? { ok: true } : { ok: false, reason: 'engine refused or unavailable — nothing changed' };
}

/**
 * Build the agent-engine MCP tool registrations over the LAZY facet getter (the
 * engines composer memoizes the facet; resolving per call keeps a late-bound
 * engine reachable and an unbound one truthfully degraded).
 */
export function buildAgentEngineMcpTools(
  agentEngine: () => AgentEngineService | null,
): readonly McpToolRegistration[] {
  return [
    {
      name: 'agent_engine_hands_list',
      description:
        'READ-ONLY: list the openfang background Hands — every hand definition plus its live ' +
        'active instances (the composed defs ⋈ instances view). Returns { ok:false, reason } ' +
        'truthfully when the openfang agent-engine is unavailable.',
      handler: async () => {
        const engine = agentEngine();
        if (!engine) return unavailable();
        const view = await engine.hands();
        return { ok: true, hands: view.hands, active: view.active };
      },
    },
    {
      name: 'agent_engine_hand_activate',
      description:
        'WRITE: activate one openfang background Hand (args.handId) — spawns a supervised ' +
        'autonomous instance and returns its instanceId. Requires an authorized caller. ' +
        'Truthful { ok:false, reason } when the engine is unavailable or the hand is unknown.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const engine = agentEngine();
        if (!engine) return unavailable();
        const handId = stringArg(raw, 'handId');
        if (!handId) return badInput('handId required');
        return engine.activateHand(handId);
      },
    },
    {
      name: 'agent_engine_hand_pause',
      description:
        'WRITE: pause one live openfang Hand instance (args.instanceId) — the background worker ' +
        'stops firing until resumed. Requires an authorized caller. Truthful { ok:false, reason } ' +
        'when the engine is unavailable or the instance is unknown.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const engine = agentEngine();
        if (!engine) return unavailable();
        const instanceId = stringArg(raw, 'instanceId');
        if (!instanceId) return badInput('instanceId required');
        return presentBool(await engine.pauseHand(instanceId));
      },
    },
    {
      name: 'agent_engine_hand_resume',
      description:
        'WRITE: resume one paused openfang Hand instance (args.instanceId) — the background ' +
        'worker starts firing again. Requires an authorized caller. Truthful { ok:false, reason } ' +
        'when the engine is unavailable or the instance is unknown.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const engine = agentEngine();
        if (!engine) return unavailable();
        const instanceId = stringArg(raw, 'instanceId');
        if (!instanceId) return badInput('instanceId required');
        return presentBool(await engine.resumeHand(instanceId));
      },
    },
    {
      name: 'agent_engine_hand_deactivate',
      description:
        'WRITE: deactivate one openfang Hand instance (args.instanceId) — stops and removes the ' +
        'background worker. Requires an authorized caller. Truthful { ok:false, reason } when the ' +
        'engine is unavailable or the instance is unknown.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const engine = agentEngine();
        if (!engine) return unavailable();
        const instanceId = stringArg(raw, 'instanceId');
        if (!instanceId) return badInput('instanceId required');
        return presentBool(await engine.deactivateHand(instanceId));
      },
    },
    {
      name: 'agent_engine_publish_event',
      description:
        'WRITE: publish one event object (args.event) onto the openfang kernel event bus — any ' +
        'matching agent triggers FIRE and deliver messages to their agents. Requires an authorized ' +
        'caller. Returns the fired { agentId, message } list; truthful { ok:false, reason } when ' +
        'the engine is unavailable.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const engine = agentEngine();
        if (!engine) return unavailable();
        const event = rec(rec(raw)?.event);
        if (!event) return badInput('event object required');
        const fired = await engine.publishEvent(event);
        return { ok: true, fired, count: fired.length };
      },
    },
  ];
}
