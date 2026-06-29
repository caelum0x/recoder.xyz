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
import { loadA2AAgentRegistryState, saveA2AAgentRegistryState } from './a2a-persistence';
import { getHeartbeatTracker } from './heartbeat-tracker.service';

const logger = createLogger('a2a-agent-registry');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentHeartbeat {
  lastHeartbeat: string;
  online: boolean;
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
  lifecycle: AgentLifecycleMetadata;
}

export interface AgentLifecycleMetadata {
  firstRegisteredAt: string;
  lastRegisteredAt: string;
  lastSeenAt: string;
  reconnectCount: number;
  registrationCount: number;
  lastInstanceId?: string;
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
  recoder_app: {
    protocol: 'rest',
    tier: 'tier1',
    status: 'supported',
    description: 'Recoder App application',
    defaultSkills: [
      { id: 'workspace-ui', name: 'Workspace UI', description: 'Human-facing workspace and agent control UI', tags: ['workspace', 'ui'] },
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
    id: 'recoder-app',
    name: 'Recoder App',
    platform: 'recoder_app',
    description: 'Human-facing workspace surface for tasks, artifacts, and approvals',
    url: process.env.RECODER_WEB_URL || 'https://recoder.xyz',
    skills: [
      { id: 'workspace-ui', name: 'Workspace UI', description: 'Human-facing workspace and task management', tags: ['workspace', 'ui'] },
      { id: 'task-visibility', name: 'Task Visibility', description: 'Surface task, artifact, and approval state', tags: ['tasks', 'visibility'] },
    ],
    tags: ['workspace', 'web', 'core'],
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

// ---------------------------------------------------------------------------
// Heartbeat configuration
// ---------------------------------------------------------------------------

/** Agents are considered offline if no heartbeat within this window (ms). */
const HEARTBEAT_TIMEOUT_MS = Number(
  process.env.RECODER_A2A_HEARTBEAT_TIMEOUT_MS || 5 * 60 * 1000,
);

function buildTrackerMetadata(agent: RegisteredAgent): Record<string, unknown> {
  return {
    source: 'registry',
    platform: agent.identity.platform,
    tier: agent.tier,
    url: agent.card.url,
    tagCount: agent.tags.length,
    skillCount: agent.card.skills.length,
    ...(agent.identity.instanceId ? { instanceId: agent.identity.instanceId } : {}),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentRegistryService {
  private readonly registry: InMemoryAgentRegistry;
  private readonly heartbeats = new Map<string, string>();
  private readonly lifecycle = new Map<string, AgentLifecycleMetadata>();

  constructor(registry?: InMemoryAgentRegistry) {
    this.registry = registry ?? new InMemoryAgentRegistry();
    this.hydratePersistedState();
  }

  private hydratePersistedState(): void {
    const persisted = loadA2AAgentRegistryState();

    for (const [, agent] of persisted.agents) {
      this.registry.register(agent);
    }
    for (const [agentId, heartbeat] of persisted.heartbeats) {
      this.heartbeats.set(agentId, heartbeat);
    }
    for (const [agentId, metadata] of persisted.lifecycle) {
      this.lifecycle.set(agentId, metadata);
    }

    // Backfill lifecycle metadata for older persisted snapshots that only had
    // agents + heartbeats so reconnect visibility survives upgrades.
    for (const [agentId, agent] of persisted.agents) {
      if (this.lifecycle.has(agentId)) continue;
      const timestamp = this.heartbeats.get(agentId) || new Date().toISOString();
      this.lifecycle.set(agentId, {
        firstRegisteredAt: timestamp,
        lastRegisteredAt: timestamp,
        lastSeenAt: timestamp,
        reconnectCount: 0,
        registrationCount: 1,
        ...(agent.identity.instanceId ? { lastInstanceId: agent.identity.instanceId } : {}),
      });
    }

    if (persisted.agents.size > 0 || persisted.heartbeats.size > 0 || persisted.lifecycle.size > 0) {
      logger.info(
        {
          persistedAgents: persisted.agents.size,
          persistedHeartbeats: persisted.heartbeats.size,
          persistedLifecycle: persisted.lifecycle.size,
        },
        'Loaded persisted agent registry state',
      );
    }
  }

  private persist(): void {
    const agents = new Map(
      this.registry.list().map((agent) => [agent.identity.id, agent] as const),
    );
    saveA2AAgentRegistryState({
      agents,
      heartbeats: new Map(this.heartbeats),
      lifecycle: new Map(this.lifecycle),
    });
  }

  // -- Registration ---------------------------------------------------------

  register(input: RegisterAgentInput): RegisteredAgent {
    const now = new Date().toISOString();
    const agent: RegisteredAgent = {
      identity: input.identity,
      card: input.card,
      protocol: input.protocol,
      tier: input.tier,
      status: 'supported',
      tags: input.tags,
    };
    const previousLifecycle = this.lifecycle.get(agent.identity.id);
    this.registry.register(agent);
    this.heartbeats.set(agent.identity.id, now);
    this.lifecycle.set(agent.identity.id, {
      firstRegisteredAt: previousLifecycle?.firstRegisteredAt || now,
      lastRegisteredAt: now,
      lastSeenAt: now,
      reconnectCount: previousLifecycle ? previousLifecycle.reconnectCount + 1 : 0,
      registrationCount: (previousLifecycle?.registrationCount || 0) + 1,
      ...(input.identity.instanceId
        ? { lastInstanceId: input.identity.instanceId }
        : previousLifecycle?.lastInstanceId
          ? { lastInstanceId: previousLifecycle.lastInstanceId }
          : {}),
    });
    getHeartbeatTracker().recordHeartbeat(agent.identity.id, 'healthy', buildTrackerMetadata(agent));
    this.persist();
    logger.info(
      {
        agentId: agent.identity.id,
        platform: agent.identity.platform,
        reconnectCount: this.lifecycle.get(agent.identity.id)?.reconnectCount ?? 0,
      },
      'Agent registered',
    );
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
      this.lifecycle.delete(agentId);
      getHeartbeatTracker().removeAgent(agentId);
      this.persist();
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
    const lifecycle = this.getLifecycle(agentId);
    if (!lifecycle) return undefined;
    return { ...agent, health: this.getHealth(agentId), lifecycle };
  }

  list(): RegisteredAgent[] {
    return this.registry.list();
  }

  // -- Discovery ------------------------------------------------------------

  discover(query: AgentDiscoveryQuery = {}): RegisteredAgent[] {
    return this.registry.discover(query);
  }

  discoverWithHealth(query: AgentDiscoveryQuery = {}): AgentWithHealth[] {
    return this.registry.discover(query).flatMap((agent) => {
      const enriched = this.getWithHealth(agent.identity.id);
      return enriched ? [enriched] : [];
    });
  }

  // -- Health / Heartbeat ---------------------------------------------------

  recordHeartbeat(agentId: string): boolean {
    const agent = this.registry.get(agentId);
    if (!agent) return false;
    const now = new Date().toISOString();
    this.heartbeats.set(agentId, now);
    const existingLifecycle = this.lifecycle.get(agentId);
    this.lifecycle.set(agentId, {
      firstRegisteredAt: existingLifecycle?.firstRegisteredAt || now,
      lastRegisteredAt: existingLifecycle?.lastRegisteredAt || now,
      lastSeenAt: now,
      reconnectCount: existingLifecycle?.reconnectCount || 0,
      registrationCount: existingLifecycle?.registrationCount || 1,
      ...(agent.identity.instanceId
        ? { lastInstanceId: agent.identity.instanceId }
        : existingLifecycle?.lastInstanceId
          ? { lastInstanceId: existingLifecycle.lastInstanceId }
        : {}),
    });
    getHeartbeatTracker().recordHeartbeat(agentId, 'healthy', buildTrackerMetadata(agent));
    this.persist();
    return true;
  }

  getHealth(agentId: string): AgentHeartbeat {
    const tracker = getHeartbeatTracker();
    const trackerRecord = tracker.getRecord(agentId);
    if (trackerRecord) {
      return {
        lastHeartbeat: new Date(trackerRecord.lastHeartbeatAt).toISOString(),
        online: tracker.isAgentOnline(agentId),
      };
    }

    const lastHeartbeat = this.heartbeats.get(agentId);
    if (!lastHeartbeat) {
      return { lastHeartbeat: '', online: false };
    }
    const lastMs = new Date(lastHeartbeat).getTime();
    const online = Date.now() - lastMs < HEARTBEAT_TIMEOUT_MS;
    return { lastHeartbeat, online };
  }

  getLifecycle(agentId: string): AgentLifecycleMetadata | undefined {
    const existing = this.lifecycle.get(agentId);
    if (existing) return existing;

    const agent = this.registry.get(agentId);
    if (!agent) return undefined;

    const timestamp = this.heartbeats.get(agentId) || new Date().toISOString();
    return {
      firstRegisteredAt: timestamp,
      lastRegisteredAt: timestamp,
      lastSeenAt: timestamp,
      reconnectCount: 0,
      registrationCount: 1,
      ...(agent.identity.instanceId ? { lastInstanceId: agent.identity.instanceId } : {}),
    };
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
