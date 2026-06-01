/**
 * @module agent-registry.service
 *
 * Service layer for the Agent Registry REST API.
 *
 * Wraps the shared `InMemoryAgentRegistry` with:
 * - Heartbeat tracking (last-seen timestamps, online/offline status)
 * - Self-registration convenience (auto-generates card from platform defaults)
 * - Pre-registration of default Recoder agents on startup
 * - Singleton access via `getAgentRegistryService()`
 */

import {
  InMemoryAgentRegistry,
  type RegisteredAgent,
  type AgentDiscoveryQuery,
  type A2AProtocolKind,
  type ConnectorTier,
  type ConnectorStatus,
} from '@recoder/shared/a2a';
import type {
  RecoderAgentIdentity,
  RecoderAgentCard,
  RecoderAgentPlatform,
  RecoderAgentSkill,
} from '@recoder/shared/a2a';
import { createLogger } from '../logger';
import {
  loadA2ADurableIdentities,
  saveA2ADurableIdentities,
} from './a2a-persistence';

const logger = createLogger('a2a-agent-registry');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentHeartbeat {
  lastHeartbeat: string;
  online: boolean;
}

/**
 * Durable identity + membership metadata that survives reconnects.
 *
 * Tracked separately from the (overwritable) registry card so that a
 * reconnecting external/bridge agent keeps a stable identity, accumulated
 * workspace membership, and a first-seen anchor instead of appearing as a
 * brand-new registration each time it pairs.
 */
export interface AgentDurableIdentity {
  /** Stable agent id this identity is keyed by. */
  agentId: string;
  /** First time this agent id was ever observed (ISO). */
  firstSeenAt: string;
  /** Most recent reconnect/pairing time (ISO). */
  lastReconnectAt: string;
  /** Number of times this agent has paired/reconnected after the first registration. */
  reconnectCount: number;
  /** Workspaces this agent is a member of (accumulated, de-duplicated). */
  workspaceIds: string[];
  /** Most recently reported capability identifiers. */
  capabilities: string[];
}

/**
 * Input for reconnect-safe session reconciliation.
 *
 * Carries the stable identity plus the live session context (workspace,
 * project, capabilities) that a bridge/external agent reports on pairing or
 * heartbeat.
 */
export interface ReconcileSessionInput {
  agentId: string;
  name?: string;
  platform?: RecoderAgentPlatform;
  url?: string;
  description?: string;
  version?: string;
  tags?: string[];
  skills?: RecoderAgentSkill[];
  workspaceId?: string;
  projectId?: string;
  capabilities?: string[];
  /**
   * Whether the caller is admin-level (e.g. authenticated with the admin
   * token rather than only a bridge token). Non-admin callers are forbidden
   * from claiming an `agentId` that collides with a pre-registered default
   * agent (see {@link RESERVED_DEFAULT_AGENT_IDS}). Defaults to `false` so the
   * untrusted bridge/heartbeat path is locked down unless explicitly trusted.
   */
  callerIsAdmin?: boolean;
}

/** Raised when a reconcile attempts to claim a reserved default agent id. */
export class ReservedAgentIdError extends Error {
  constructor(public readonly agentId: string) {
    super(
      `agentId "${agentId}" collides with a pre-registered default agent and ` +
        `cannot be claimed by a non-admin caller`,
    );
    this.name = 'ReservedAgentIdError';
  }
}

export interface ReconcileSessionResult {
  agent: RegisteredAgent;
  durable: AgentDurableIdentity;
  health: AgentHeartbeat;
  /** True when this reconciliation created a brand-new registry entry. */
  isNew: boolean;
}

export interface RegisterAgentInput {
  identity: RecoderAgentIdentity;
  card: RecoderAgentCard;
  protocol: A2AProtocolKind;
  tier: ConnectorTier;
  tags: string[];
}

export interface SelfRegisterInput {
  agentId: string;
  name: string;
  platform: RecoderAgentPlatform;
  url?: string;
  description?: string;
  version?: string;
  tags?: string[];
  skills?: RecoderAgentSkill[];
}

export interface AgentWithHealth extends RegisteredAgent {
  health: AgentHeartbeat;
  durable?: AgentDurableIdentity;
}

interface LegacyRegisterAgentInput {
  agent_id: string;
  name: string;
  platform: RecoderAgentPlatform;
  url?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Platform defaults for self-registration
// ---------------------------------------------------------------------------

const PLATFORM_DEFAULTS: Record<
  RecoderAgentPlatform,
  {
    protocol: A2AProtocolKind;
    tier: ConnectorTier;
    status: ConnectorStatus;
    description: string;
    defaultSkills: RecoderAgentSkill[];
  }
> = {
  recoder: {
    protocol: 'rest',
    tier: 'tier1',
    status: 'supported',
    description: 'Legacy Recoder agent',
    defaultSkills: [],
  },
  cursor: {
    protocol: 'jsonrpc',
    tier: 'tier2',
    status: 'experimental',
    description: 'Cursor connector agent',
    defaultSkills: [],
  },
  windsurf: {
    protocol: 'jsonrpc',
    tier: 'tier2',
    status: 'experimental',
    description: 'Windsurf connector agent',
    defaultSkills: [],
  },
  replit: {
    protocol: 'rest',
    tier: 'tier2',
    status: 'experimental',
    description: 'Replit connector agent',
    defaultSkills: [],
  },
  codex: {
    protocol: 'jsonrpc',
    tier: 'tier1',
    status: 'supported',
    description: 'OpenAI Codex agent',
    defaultSkills: [
      { id: 'code-generation', name: 'Code Generation', description: 'Generate and refactor code', tags: ['code', 'generation'] },
    ],
  },
  claude_code: {
    protocol: 'mcp',
    tier: 'tier1',
    status: 'supported',
    description: 'Claude Code agent',
    defaultSkills: [
      { id: 'code-review', name: 'Code Review', description: 'Review code and architecture', tags: ['code', 'review'] },
    ],
  },
  recoder_web: {
    protocol: 'rest',
    tier: 'tier1',
    status: 'supported',
    description: 'Recoder Web application',
    defaultSkills: [
      { id: 'web-interface', name: 'Web Interface', description: 'User-facing web application', tags: ['web', 'ui'] },
    ],
  },
  recoder_pm: {
    protocol: 'rest',
    tier: 'tier1',
    status: 'supported',
    description: 'Recoder Project Manager',
    defaultSkills: [
      { id: 'project-management', name: 'Project Management', description: 'Manage projects and tasks', tags: ['pm', 'management'] },
    ],
  },
  recoder_agency: {
    protocol: 'rest',
    tier: 'tier1',
    status: 'supported',
    description: 'Recoder Agency orchestrator',
    defaultSkills: [
      { id: 'orchestration', name: 'Orchestration', description: 'Multi-agent orchestration', tags: ['orchestration', 'agency'] },
    ],
  },
  recoder_backend: {
    protocol: 'rest',
    tier: 'tier1',
    status: 'supported',
    description: 'Recoder Docker Backend',
    defaultSkills: [
      { id: 'execution', name: 'Execution', description: 'Code execution in sandboxes', tags: ['execution', 'sandbox'] },
    ],
  },
  recoder_desktop: {
    protocol: 'rest',
    tier: 'tier2',
    status: 'experimental',
    description: 'Recoder Desktop application',
    defaultSkills: [
      { id: 'desktop-ide', name: 'Desktop IDE', description: 'Desktop development environment', tags: ['desktop', 'ide'] },
    ],
  },
  custom: {
    protocol: 'rest',
    tier: 'tier2',
    status: 'experimental',
    description: 'Custom agent',
    defaultSkills: [],
  },
};

// ---------------------------------------------------------------------------
// Default Recoder agents to pre-register on startup
// ---------------------------------------------------------------------------

export interface DefaultAgentConfig {
  id: string;
  name: string;
  platform: RecoderAgentPlatform;
  description: string;
  url: string;
  skills: RecoderAgentSkill[];
  tags: string[];
}

export const DEFAULT_AGENTS: DefaultAgentConfig[] = [
  {
    id: 'recoder-web',
    name: 'Recoder Web',
    platform: 'recoder_web',
    description: 'Recoder web application for browser-based coding and AI interaction',
    url: process.env.RECODER_WEB_URL || 'https://recoder.xyz',
    skills: [
      { id: 'web-interface', name: 'Web Interface', description: 'User-facing web application', tags: ['web', 'ui'] },
      { id: 'thread-management', name: 'Thread Management', description: 'Manage conversation threads', tags: ['threads', 'conversations'] },
    ],
    tags: ['web', 'ui', 'core'],
  },
  {
    id: 'recoder-agency',
    name: 'Recoder Agency',
    platform: 'recoder_agency',
    description: 'Multi-agent orchestration layer for coordinating AI agents',
    url: process.env.RECODER_AGENCY_URL || 'https://agency.recoder.xyz',
    skills: [
      { id: 'orchestration', name: 'Orchestration', description: 'Multi-agent orchestration', tags: ['orchestration', 'agency'] },
      { id: 'agent-routing', name: 'Agent Routing', description: 'Route tasks to appropriate agents', tags: ['routing', 'dispatch'] },
    ],
    tags: ['orchestration', 'agency', 'core'],
  },
  {
    id: 'recoder-studio',
    name: 'Recoder Studio',
    platform: 'custom',
    description: 'Visual workflow builder and agent configuration studio',
    url: process.env.RECODER_STUDIO_URL || 'https://studio.recoder.xyz',
    skills: [
      { id: 'workflow-builder', name: 'Workflow Builder', description: 'Visual workflow construction', tags: ['workflow', 'visual'] },
      { id: 'agent-config', name: 'Agent Configuration', description: 'Configure agent behaviors', tags: ['config', 'setup'] },
    ],
    tags: ['studio', 'workflow', 'visual'],
  },
  {
    id: 'recoder-pm',
    name: 'Recoder PM',
    platform: 'recoder_pm',
    description: 'Project management agent for tracking tasks and milestones',
    url: process.env.RECODER_PM_URL || 'https://recoderpm.app',
    skills: [
      { id: 'project-management', name: 'Project Management', description: 'Manage projects and tasks', tags: ['pm', 'management'] },
      { id: 'milestone-tracking', name: 'Milestone Tracking', description: 'Track project milestones', tags: ['milestones', 'tracking'] },
    ],
    tags: ['pm', 'management', 'core'],
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    platform: 'custom',
    description: 'Open-source AI coding agent with autonomous execution capabilities',
    url: process.env.OPENCLAW_URL || 'https://openclaw.recoder.xyz',
    skills: [
      { id: 'autonomous-coding', name: 'Autonomous Coding', description: 'Autonomous code generation and execution', tags: ['coding', 'autonomous'] },
      { id: 'task-execution', name: 'Task Execution', description: 'Execute complex development tasks', tags: ['execution', 'tasks'] },
    ],
    tags: ['openclaw', 'autonomous', 'coding'],
  },
];

/**
 * Ids of the pre-registered default agents. Reconciling against any of these
 * from an untrusted (non-admin) caller is rejected so a leaked/valid bridge
 * token cannot hijack or shadow a core platform agent (e.g. 'recoder-agency').
 */
export const RESERVED_DEFAULT_AGENT_IDS: ReadonlySet<string> = new Set(
  DEFAULT_AGENTS.map((agent) => agent.id),
);

// ---------------------------------------------------------------------------
// Heartbeat configuration
// ---------------------------------------------------------------------------

/** Agents are considered offline if no heartbeat within this window (ms). */
const HEARTBEAT_TIMEOUT_MS = Number(
  process.env.RECODER_A2A_HEARTBEAT_TIMEOUT_MS || 5 * 60 * 1000,
);

/** Merge string lists preserving order, dropping empties and duplicates. */
function mergeUnique(base: readonly string[], extra: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [...base, ...extra]) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentRegistryService {
  private readonly registry: InMemoryAgentRegistry;
  private readonly heartbeats = new Map<string, string>();
  private readonly durableIdentities = new Map<string, AgentDurableIdentity>();

  constructor(registry?: InMemoryAgentRegistry) {
    this.registry = registry ?? new InMemoryAgentRegistry();
    // Hydrate durable identities from disk so firstSeenAt / reconnectCount /
    // workspace membership survive a restart and reconnect-safety holds.
    try {
      const hydrated = loadA2ADurableIdentities();
      for (const [agentId, identity] of hydrated) {
        this.durableIdentities.set(agentId, identity);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to hydrate durable agent identities');
    }
  }

  /** Persist the durable-identity map to disk (best-effort). */
  private persistDurableIdentities(): void {
    try {
      saveA2ADurableIdentities(this.durableIdentities);
    } catch (error) {
      logger.warn({ error }, 'Failed to persist durable agent identities');
    }
  }

  // -- Registration ---------------------------------------------------------

  register(input: RegisterAgentInput): RegisteredAgent {
    const agent: RegisteredAgent = {
      identity: input.identity,
      card: input.card,
      protocol: input.protocol,
      tier: input.tier,
      status: 'supported',
      tags: input.tags,
    };
    this.registry.register(agent);
    this.heartbeats.set(agent.identity.id, new Date().toISOString());
    logger.info({ agentId: agent.identity.id, platform: agent.identity.platform }, 'Agent registered');
    return agent;
  }

  /**
   * Legacy API compatibility: older callers use `registerAgent(...)`.
   */
  registerAgent(input: RegisterAgentInput | LegacyRegisterAgentInput): RegisteredAgent {
    if ('agent_id' in input) {
      return this.selfRegister({
        agentId: input.agent_id,
        name: input.name,
        platform: input.platform,
        url: input.url,
        skills: (input.capabilities ?? []).map((cap) => ({
          id: cap,
          name: cap,
          description: cap,
          tags: [cap],
        })),
      });
    }
    return this.register(input);
  }

  unregister(agentId: string): boolean {
    const deleted = this.registry.unregister(agentId);
    if (deleted) {
      this.heartbeats.delete(agentId);
      if (this.durableIdentities.delete(agentId)) {
        this.persistDurableIdentities();
      }
      logger.info({ agentId }, 'Agent unregistered');
    }
    return deleted;
  }

  // -- Retrieval ------------------------------------------------------------

  get(agentId: string): RegisteredAgent | undefined {
    return this.registry.get(agentId);
  }

  getWithHealth(agentId: string): AgentWithHealth | undefined {
    const agent = this.registry.get(agentId);
    if (!agent) return undefined;
    const durable = this.durableIdentities.get(agentId);
    return {
      ...agent,
      health: this.getHealth(agentId),
      ...(durable ? { durable } : {}),
    };
  }

  /** Returns the durable identity record for an agent, if one exists. */
  getDurableIdentity(agentId: string): AgentDurableIdentity | undefined {
    return this.durableIdentities.get(agentId);
  }

  list(): RegisteredAgent[] {
    return this.registry.list();
  }

  // -- Discovery ------------------------------------------------------------

  discover(query: AgentDiscoveryQuery = {}): RegisteredAgent[] {
    return this.registry.discover(query);
  }

  /**
   * Discover agents, projecting heartbeat health and (when present) the
   * durable identity onto each result.
   *
   * The plain {@link discover} returns bare {@link RegisteredAgent} records
   * with no health/durable metadata, which makes every agent look offline and
   * never-seen to a UI. Operator surfaces should use this variant so the list
   * carries the same `health` + `durable` projection as {@link getWithHealth}.
   */
  discoverWithHealth(query: AgentDiscoveryQuery = {}): AgentWithHealth[] {
    return this.registry.discover(query).map((agent) => {
      const durable = this.durableIdentities.get(agent.identity.id);
      return {
        ...agent,
        health: this.getHealth(agent.identity.id),
        ...(durable ? { durable } : {}),
      };
    });
  }

  // -- Health / Heartbeat ---------------------------------------------------

  recordHeartbeat(agentId: string): boolean {
    const agent = this.registry.get(agentId);
    if (!agent) return false;
    this.heartbeats.set(agentId, new Date().toISOString());
    return true;
  }

  getHealth(agentId: string): AgentHeartbeat {
    const lastHeartbeat = this.heartbeats.get(agentId);
    if (!lastHeartbeat) {
      return { lastHeartbeat: '', online: false };
    }
    const lastMs = new Date(lastHeartbeat).getTime();
    const online = Date.now() - lastMs < HEARTBEAT_TIMEOUT_MS;
    return { lastHeartbeat, online };
  }

  // -- Self-registration ----------------------------------------------------

  selfRegister(input: SelfRegisterInput): RegisteredAgent {
    const defaults = PLATFORM_DEFAULTS[input.platform];
    const card: RecoderAgentCard = {
      name: input.name,
      description: input.description || defaults.description,
      protocolVersion: '0.3.0',
      version: input.version || '1.0.0',
      url: input.url || '',
      skills: input.skills || defaults.defaultSkills,
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
    };

    const identity: RecoderAgentIdentity = {
      id: input.agentId,
      name: input.name,
      platform: input.platform,
    };

    return this.register({
      identity,
      card,
      protocol: defaults.protocol,
      tier: defaults.tier,
      tags: input.tags || [],
    });
  }

  // -- Reconnect-safe session reconciliation --------------------------------

  /**
   * Reconcile a (re)connecting external/bridge agent against the durable
   * registry.
   *
   * Keyed by the stable `agentId`, this:
   * - upserts the registry entry instead of creating a duplicate;
   * - reuses the existing identity/card on reconnect (so name/platform/url
   *   stay stable even if the reconnect payload omits or changes them);
   * - accumulates workspace membership and the latest reported capabilities;
   * - refreshes the heartbeat / last-seen so health reflects the live session;
   * - preserves a `firstSeenAt` anchor and increments `reconnectCount`.
   *
   * @returns the reconciled agent, its durable identity, live health, and
   *          whether this call created a brand-new registry entry.
   */
  reconcileSession(input: ReconcileSessionInput): ReconcileSessionResult {
    const agentId = input.agentId.trim();
    if (!agentId) {
      throw new Error('reconcileSession requires a non-empty agentId');
    }

    // SECURITY: bind the claimed agentId to the caller's trust level. The
    // bridge/heartbeat path lets any holder of a valid bridge token supply an
    // arbitrary agentId; without this guard such a caller could register a
    // phantom agent under a core platform id (e.g. 'recoder-agency') and shadow
    // the real default. Only admin-level callers may (re)claim a reserved
    // default agent id; everyone else is rejected before any upsert.
    if (
      !input.callerIsAdmin &&
      RESERVED_DEFAULT_AGENT_IDS.has(agentId) &&
      !this.durableIdentities.has(agentId)
    ) {
      throw new ReservedAgentIdError(agentId);
    }

    const nowIso = new Date().toISOString();
    const existingAgent = this.registry.get(agentId);
    const existingDurable = this.durableIdentities.get(agentId);
    const isNew = !existingAgent;

    // Reuse existing identity on reconnect; fall back to platform defaults for
    // a first-time pairing.
    const platform: RecoderAgentPlatform =
      existingAgent?.identity.platform ?? input.platform ?? 'custom';
    const defaults = PLATFORM_DEFAULTS[platform];
    const name = existingAgent?.identity.name ?? input.name ?? agentId;

    const card: RecoderAgentCard = existingAgent
      ? {
          ...existingAgent.card,
          // Allow optional refresh of mutable card fields on reconnect.
          ...(input.description ? { description: input.description } : {}),
          ...(input.version ? { version: input.version } : {}),
          ...(input.url ? { url: input.url } : {}),
          ...(input.skills && input.skills.length > 0 ? { skills: input.skills } : {}),
        }
      : {
          name,
          description: input.description || defaults.description,
          protocolVersion: '0.3.0',
          version: input.version || '1.0.0',
          url: input.url || '',
          skills: input.skills && input.skills.length > 0 ? input.skills : defaults.defaultSkills,
          capabilities: { streaming: false, pushNotifications: false },
          defaultInputModes: ['text'],
          defaultOutputModes: ['text'],
        };

    const identity: RecoderAgentIdentity = existingAgent?.identity ?? {
      id: agentId,
      name,
      platform,
    };

    const tags = existingAgent?.tags ?? input.tags ?? [];

    const agent: RegisteredAgent = {
      identity,
      card,
      protocol: existingAgent?.protocol ?? defaults.protocol,
      tier: existingAgent?.tier ?? defaults.tier,
      status: existingAgent?.status ?? 'supported',
      tags,
    };

    // Upsert (overwrite same key — never duplicates).
    this.registry.register(agent);
    this.heartbeats.set(agentId, nowIso);

    // Accumulate workspace membership without duplicates.
    const workspaceIds = mergeUnique(
      existingDurable?.workspaceIds ?? [],
      input.workspaceId ? [input.workspaceId] : [],
    );

    const capabilities =
      input.capabilities && input.capabilities.length > 0
        ? mergeUnique([], input.capabilities)
        : existingDurable?.capabilities ?? [];

    const durable: AgentDurableIdentity = {
      agentId,
      firstSeenAt: existingDurable?.firstSeenAt ?? nowIso,
      lastReconnectAt: nowIso,
      reconnectCount: (existingDurable?.reconnectCount ?? 0) + (existingDurable ? 1 : 0),
      workspaceIds,
      capabilities,
    };
    this.durableIdentities.set(agentId, durable);
    // Persist so reconnect-safety (firstSeenAt / reconnectCount / workspaceIds)
    // survives a process restart.
    this.persistDurableIdentities();

    logger.info(
      {
        agentId,
        isNew,
        reconnectCount: durable.reconnectCount,
        workspaceCount: workspaceIds.length,
        projectId: input.projectId || null,
      },
      isNew ? 'Agent session registered' : 'Agent session reconciled on reconnect',
    );

    return { agent, durable, health: this.getHealth(agentId), isNew };
  }

  // -- Default agent registration -------------------------------------------

  registerDefaults(): void {
    for (const config of DEFAULT_AGENTS) {
      const defaults = PLATFORM_DEFAULTS[config.platform];
      const card: RecoderAgentCard = {
        name: config.name,
        description: config.description,
        protocolVersion: '0.3.0',
        version: '1.0.0',
        url: config.url,
        skills: config.skills,
        capabilities: { streaming: false, pushNotifications: false },
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
      };

      const identity: RecoderAgentIdentity = {
        id: config.id,
        name: config.name,
        platform: config.platform,
      };

      this.register({
        identity,
        card,
        protocol: defaults.protocol,
        tier: defaults.tier,
        tags: config.tags,
      });
    }
    logger.info({ count: DEFAULT_AGENTS.length }, 'Default agents registered');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: AgentRegistryService | null = null;

export function getAgentRegistryService(): AgentRegistryService {
  if (!instance) {
    instance = new AgentRegistryService();
    instance.registerDefaults();
  }
  return instance;
}

export function resetAgentRegistryService(): void {
  instance = null;
}
