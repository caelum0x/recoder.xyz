/**
 * @module workspace.service
 *
 * Workspace registry for A2A multi-agent collaboration.
 *
 * A workspace groups agents, channels, and tasks into a logical unit
 * tied to a project. Each workspace gets an auto-created #general channel
 * on creation. Follows the existing in-memory singleton pattern.
 *
 * Persistence: In-memory Map (Redis migration planned).
 */

import { v4 as uuid } from 'uuid';
import { getCollaborationSvc } from './collaboration.service';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { loadA2AWorkspaces, saveA2AWorkspaces } from './a2a-persistence';
import { createLogger } from '../logger';

const logger = createLogger('a2a-workspace');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrchestrationPattern = 'direct' | 'fan-out' | 'pipeline' | 'competitive';

export interface WorkspaceSettings {
  /** Enable autonomous @mention routing between agents. */
  autoRouting: boolean;
  /** Require human approval before delegations execute. */
  approvalRequired: boolean;
  /** Create git worktrees for parallel agent work. */
  worktreeIsolation: boolean;
  /** Max concurrent tasks across all agents in this workspace. */
  maxConcurrentTasks: number;
  /** Default orchestration pattern for multi-dispatch. */
  defaultOrchestrationPattern: OrchestrationPattern;
}

export interface A2AWorkspace {
  workspaceId: string;
  name: string;
  projectId: string;
  ownerId: string;
  memberAgentIds: string[];
  defaultChannelId: string;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceInput {
  name: string;
  projectId: string;
  ownerId: string;
  memberAgentIds?: string[];
  settings?: Partial<WorkspaceSettings>;
}

export interface UpdateWorkspaceInput {
  name?: string;
  settings?: Partial<WorkspaceSettings>;
}

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: WorkspaceSettings = {
  autoRouting: false,
  approvalRequired: false,
  worktreeIsolation: false,
  maxConcurrentTasks: 5,
  defaultOrchestrationPattern: 'direct',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WorkspaceService {
  private readonly workspaces: Map<string, A2AWorkspace>;

  constructor() {
    this.workspaces = loadA2AWorkspaces();
    logger.info({ count: this.workspaces.size }, 'loaded persisted workspaces');
  }

  private persist(): void {
    saveA2AWorkspaces(this.workspaces);
  }

  // -- CRUD -----------------------------------------------------------------

  create(input: CreateWorkspaceInput): A2AWorkspace {
    const workspaceId = `ws_${uuid().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    // Auto-create #general channel via collaboration service
    const collab = getCollaborationSvc();
    const generalChannel = collab.createChannel({
      name: 'general',
      scope: 'channel',
      memberAgentIds: input.memberAgentIds ?? [],
    });

    const workspace: A2AWorkspace = {
      workspaceId,
      name: input.name,
      projectId: input.projectId,
      ownerId: input.ownerId,
      memberAgentIds: input.memberAgentIds ?? [],
      defaultChannelId: generalChannel.id,
      settings: { ...DEFAULT_SETTINGS, ...input.settings },
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(workspaceId, workspace);
    this.persist();

    logger.info(
      { workspaceId, name: input.name, projectId: input.projectId },
      'workspace created',
    );

    // Publish workspace event
    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.WorkspaceCreated,
      timestamp: now,
      data: { workspace },
    });

    return workspace;
  }

  get(workspaceId: string): A2AWorkspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  list(ownerId?: string): A2AWorkspace[] {
    const all = [...this.workspaces.values()];
    if (ownerId) {
      return all.filter((ws) => ws.ownerId === ownerId);
    }
    return all;
  }

  update(workspaceId: string, input: UpdateWorkspaceInput): A2AWorkspace | undefined {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return undefined;

    const updated: A2AWorkspace = {
      ...ws,
      name: input.name ?? ws.name,
      settings: input.settings ? { ...ws.settings, ...input.settings } : ws.settings,
      updatedAt: new Date().toISOString(),
    };

    this.workspaces.set(workspaceId, updated);
    this.persist();
    logger.info({ workspaceId }, 'workspace updated');
    return updated;
  }

  delete(workspaceId: string): boolean {
    const existed = this.workspaces.delete(workspaceId);
    if (existed) {
      this.persist();
      logger.info({ workspaceId }, 'workspace deleted');
    }
    return existed;
  }

  // -- Agent membership -----------------------------------------------------

  addAgent(workspaceId: string, agentId: string): A2AWorkspace | undefined {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return undefined;

    if (ws.memberAgentIds.includes(agentId)) {
      return ws; // already a member
    }

    ws.memberAgentIds.push(agentId);
    ws.updatedAt = new Date().toISOString();
    this.persist();

    // Also add to the default channel
    try {
      getCollaborationSvc().addMember(ws.defaultChannelId, agentId);
    } catch {
      // Channel member add might fail if already present - that's fine
    }

    logger.info({ workspaceId, agentId }, 'agent added to workspace');
    return ws;
  }

  removeAgent(workspaceId: string, agentId: string): A2AWorkspace | undefined {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return undefined;

    ws.memberAgentIds = ws.memberAgentIds.filter((id) => id !== agentId);
    ws.updatedAt = new Date().toISOString();
    this.persist();

    // Also remove from the default channel
    try {
      getCollaborationSvc().removeMember(ws.defaultChannelId, agentId);
    } catch {
      // ignore
    }

    logger.info({ workspaceId, agentId }, 'agent removed from workspace');
    return ws;
  }

  listAgents(workspaceId: string): string[] | undefined {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return undefined;
    return [...ws.memberAgentIds];
  }

  // -- Workspace queries ----------------------------------------------------

  findByProject(projectId: string): A2AWorkspace | undefined {
    for (const ws of this.workspaces.values()) {
      if (ws.projectId === projectId) return ws;
    }
    return undefined;
  }

  getChannels(workspaceId: string): ReturnType<typeof getCollaborationSvc>['listChannels'] extends (...args: any[]) => infer R ? R : never {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return [] as any;
    // Return all channels - workspace-scoped filtering is by membership
    return getCollaborationSvc().listChannels();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: WorkspaceService | null = null;

export function getWorkspaceService(): WorkspaceService {
  if (!_instance) {
    _instance = new WorkspaceService();
  }
  return _instance;
}

export function resetWorkspaceService(): void {
  _instance = null;
}
