/**
 * Pure, total composers for the openfang agent-runtime introspection capabilities.
 *
 * These build RICHER views by COMPOSING the existing openfang napi reads — no new
 * native export, no rebuild of the `.node`:
 *   - `composeHandIntrospection` joins `listHandDefinitions` (each Hand's tools /
 *     skills / MCP allowlist) with `listActiveHands` (live instances) into one
 *     "hands + their tools + who's running them" view.
 *   - `composeAgentRunStatus` folds `listAgents` (state) + `contextReport` +
 *     `sessionUsageCost` + `listAgentSessions` into a single run-status snapshot
 *     for one agent, degrading each sub-read independently.
 *
 * Every function is TOTAL: it accepts the already-parsed (possibly malformed)
 * napi reply as `unknown` and never throws — a missing/failed sub-read becomes a
 * truthful `{ available: false, reason }` slice, never a fabricated value. The
 * adapter owns the native calls + degrade-safe seam; this module owns only the
 * shape of the composed result and is unit-testable without a `.node`.
 */

// ---------------------------------------------------------------------------
// Loose extractors over the untrusted parsed napi replies
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNum(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Filter an unknown into a `string[]` (drops non-strings; `[]` when absent). */
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Read a `{ ok, <key>: [...] }` napi list reply into a plain array (never throws). */
function listOf(reply: unknown, key: string): unknown[] {
  if (!isRecord(reply)) return [];
  const arr = reply[key];
  return Array.isArray(arr) ? arr : [];
}

/**
 * A HandStatus serializes as `"Active"` / `"Paused"` / `"Inactive"` or
 * `{ Error: "msg" }`. Normalize any of those into a display string.
 */
function handStatus(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    const [tag, detail] = Object.entries(value)[0] ?? ['unknown', undefined];
    return typeof detail === 'string' ? `${tag}: ${detail}` : tag;
  }
  return 'unknown';
}

/** An `agent_id` may serialize as a bare uuid string or a `{ "0": uuid }`-ish object. */
function agentIdOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  if (isRecord(value)) return asStr(value['0']) ?? asStr(value.id);
  return undefined;
}

// ---------------------------------------------------------------------------
// Hand + tool introspection
// ---------------------------------------------------------------------------

/** One live instance of a Hand (from `listActiveHands`), flattened for the view. */
export interface HandInstanceView {
  readonly instanceId: string;
  readonly instanceName?: string;
  readonly status: string;
  readonly agentId?: string;
  readonly agentName?: string;
}

/** A Hand definition joined with its tool/skill surface and any live instances. */
export interface HandToolView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category?: string;
  readonly icon?: string;
  /** Tools the Hand's agent is granted (the "list hands + their tools" payload). */
  readonly tools: string[];
  readonly skills: string[];
  readonly mcpServers: string[];
  readonly settingsCount: number;
  readonly requiresCount: number;
  readonly activeInstances: HandInstanceView[];
}

/** The composed hand-introspection reply the adapter returns. */
export interface HandIntrospection {
  readonly ok: true;
  readonly hands: HandToolView[];
  readonly totals: {
    readonly definitions: number;
    readonly activeInstances: number;
    readonly distinctTools: number;
  };
}

function toInstanceView(raw: unknown): HandInstanceView | undefined {
  if (!isRecord(raw)) return undefined;
  const instanceId = asStr(raw.instance_id) ?? asStr(raw.instanceId);
  if (!instanceId) return undefined;
  return {
    instanceId,
    ...(asStr(raw.instance_name) ? { instanceName: asStr(raw.instance_name) } : {}),
    status: handStatus(raw.status),
    ...(agentIdOf(raw.agent_id) ? { agentId: agentIdOf(raw.agent_id) } : {}),
    ...(asStr(raw.agent_name) ? { agentName: asStr(raw.agent_name) } : {}),
  };
}

function toHandView(raw: unknown, instancesByHand: Map<string, HandInstanceView[]>): HandToolView | undefined {
  if (!isRecord(raw)) return undefined;
  const id = asStr(raw.id);
  if (!id) return undefined;
  const tools = strList(raw.tools);
  return {
    id,
    name: asStr(raw.name) ?? id,
    description: asStr(raw.description) ?? '',
    ...(asStr(raw.category) ? { category: asStr(raw.category) } : {}),
    ...(asStr(raw.icon) ? { icon: asStr(raw.icon) } : {}),
    tools,
    skills: strList(raw.skills),
    mcpServers: strList(raw.mcp_servers),
    settingsCount: Array.isArray(raw.settings) ? raw.settings.length : 0,
    requiresCount: Array.isArray(raw.requires) ? raw.requires.length : 0,
    activeInstances: instancesByHand.get(id) ?? [],
  };
}

/**
 * Join `listHandDefinitions` (`defsReply`) with `listActiveHands` (`activeReply`)
 * into a unified hand+tool view. Total: malformed/partial replies yield an empty
 * or partial list, never a throw.
 */
export function composeHandIntrospection(defsReply: unknown, activeReply: unknown): HandIntrospection {
  const instancesByHand = new Map<string, HandInstanceView[]>();
  let activeCount = 0;
  for (const raw of listOf(activeReply, 'hands')) {
    const view = toInstanceView(raw);
    if (!view) continue;
    const handId = isRecord(raw) ? asStr(raw.hand_id) ?? asStr(raw.handId) : undefined;
    if (!handId) continue;
    const bucket = instancesByHand.get(handId) ?? [];
    bucket.push(view);
    instancesByHand.set(handId, bucket);
    activeCount += 1;
  }

  const hands: HandToolView[] = [];
  const distinctTools = new Set<string>();
  for (const raw of listOf(defsReply, 'hands')) {
    const view = toHandView(raw, instancesByHand);
    if (!view) continue;
    hands.push(view);
    for (const tool of view.tools) distinctTools.add(tool);
  }

  return {
    ok: true,
    hands,
    totals: { definitions: hands.length, activeInstances: activeCount, distinctTools: distinctTools.size },
  };
}

// ---------------------------------------------------------------------------
// Agent run-status snapshot
// ---------------------------------------------------------------------------

/** A degrade-safe slice: either the value, or a truthful `{ available:false, reason }`. */
type StatusSlice<T> = ({ readonly available: true } & T) | { readonly available: false; readonly reason: string };

/** The composed run-status snapshot for one agent. */
export interface AgentRunStatus {
  readonly ok: true;
  readonly agentId: string;
  readonly name?: string;
  readonly state?: string;
  readonly context: StatusSlice<{ readonly report: unknown }>;
  readonly usage: StatusSlice<{
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly cost?: number;
  }>;
  readonly sessions: StatusSlice<{ readonly sessions: unknown[]; readonly count: number }>;
}

/** A sub-read succeeded only if it parsed to an object that is not `{ ok:false }`. */
function failedReason(reply: unknown): string | undefined {
  if (!isRecord(reply)) return 'engine returned a non-object reply';
  if (reply.ok === false) return asStr(reply.error) ?? 'engine reported failure';
  return undefined;
}

/**
 * Fold the four per-agent reads into a single run-status snapshot. `agentsReply`
 * is the (global) `listAgents` reply used to resolve the agent's name/state; the
 * other three are the per-agent reads. Each slice degrades independently.
 */
export function composeAgentRunStatus(
  agentId: string,
  agentsReply: unknown,
  contextReply: unknown,
  usageReply: unknown,
  sessionsReply: unknown,
): AgentRunStatus {
  // Resolve name/state from the agent registry list (best-effort).
  let name: string | undefined;
  let state: string | undefined;
  for (const raw of listOf(agentsReply, 'agents')) {
    if (isRecord(raw) && asStr(raw.id) === agentId) {
      name = asStr(raw.name);
      state = asStr(raw.state);
      break;
    }
  }

  const contextReason = failedReason(contextReply);
  const context: AgentRunStatus['context'] = contextReason
    ? { available: false, reason: contextReason }
    : { available: true, report: isRecord(contextReply) ? contextReply.report ?? contextReply : contextReply };

  const usageReason = failedReason(usageReply);
  const usage: AgentRunStatus['usage'] = usageReason
    ? { available: false, reason: usageReason }
    : {
        available: true,
        ...(asNum((usageReply as Record<string, unknown>).input_tokens) !== undefined
          ? { inputTokens: asNum((usageReply as Record<string, unknown>).input_tokens) }
          : {}),
        ...(asNum((usageReply as Record<string, unknown>).output_tokens) !== undefined
          ? { outputTokens: asNum((usageReply as Record<string, unknown>).output_tokens) }
          : {}),
        ...(asNum((usageReply as Record<string, unknown>).cost) !== undefined
          ? { cost: asNum((usageReply as Record<string, unknown>).cost) }
          : {}),
      };

  const sessionsReason = failedReason(sessionsReply);
  const sessionList = listOf(sessionsReply, 'sessions');
  const sessions: AgentRunStatus['sessions'] = sessionsReason
    ? { available: false, reason: sessionsReason }
    : { available: true, sessions: sessionList, count: sessionList.length };

  return {
    ok: true,
    agentId,
    ...(name ? { name } : {}),
    ...(state ? { state } : {}),
    context,
    usage,
    sessions,
  };
}
