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

// ---------------------------------------------------------------------------
// Heartbeat configuration
// ---------------------------------------------------------------------------

/** Agents are considered offline if no heartbeat within this window (ms). */
const HEARTBEAT_TIMEOUT_MS = Number(
  process.env.RECODER_A2A_HEARTBEAT_TIMEOUT_MS || 5 * 60 * 1000,
);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentRegistryService {
  private readonly registry: InMemoryAgentRegistry;
  private readonly heartbeats = new Map<string, string>();

  constructor(registry?: InMemoryAgentRegistry) {
    this.registry = registry ?? new InMemoryAgentRegistry();
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
    return { ...agent, health: this.getHealth(agentId) };
  }

  list(): RegisteredAgent[] {
    return this.registry.list();
  }

  // -- Discovery ------------------------------------------------------------

  discover(query: AgentDiscoveryQuery = {}): RegisteredAgent[] {
    return this.registry.discover(query);
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
