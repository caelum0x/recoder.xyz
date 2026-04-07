"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
exports.getWorkspaceService = getWorkspaceService;
exports.resetWorkspaceService = resetWorkspaceService;
const uuid_1 = require("uuid");
const collaboration_service_1 = require("./collaboration.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const a2a_persistence_1 = require("./a2a-persistence");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-workspace');
// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
    autoRouting: false,
    approvalRequired: false,
    worktreeIsolation: false,
    maxConcurrentTasks: 5,
    defaultOrchestrationPattern: 'direct',
};
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class WorkspaceService {
    workspaces;
    constructor() {
        this.workspaces = (0, a2a_persistence_1.loadA2AWorkspaces)();
        logger.info({ count: this.workspaces.size }, 'loaded persisted workspaces');
    }
    persist() {
        (0, a2a_persistence_1.saveA2AWorkspaces)(this.workspaces);
    }
    // -- CRUD -----------------------------------------------------------------
    create(input) {
        const workspaceId = `ws_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`;
        const now = new Date().toISOString();
        // Auto-create #general channel via collaboration service
        const collab = (0, collaboration_service_1.getCollaborationSvc)();
        const generalChannel = collab.createChannel({
            name: 'general',
            scope: 'channel',
            memberAgentIds: input.memberAgentIds ?? [],
        });
        const workspace = {
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
        logger.info({ workspaceId, name: input.name, projectId: input.projectId }, 'workspace created');
        // Publish workspace event
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.WorkspaceCreated,
            timestamp: now,
            data: { workspace },
        });
        return workspace;
    }
    get(workspaceId) {
        return this.workspaces.get(workspaceId);
    }
    list(ownerId) {
        const all = [...this.workspaces.values()];
        if (ownerId) {
            return all.filter((ws) => ws.ownerId === ownerId);
        }
        return all;
    }
    update(workspaceId, input) {
        const ws = this.workspaces.get(workspaceId);
        if (!ws)
            return undefined;
        const updated = {
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
    delete(workspaceId) {
        const existed = this.workspaces.delete(workspaceId);
        if (existed) {
            this.persist();
            logger.info({ workspaceId }, 'workspace deleted');
        }
        return existed;
    }
    // -- Agent membership -----------------------------------------------------
    addAgent(workspaceId, agentId) {
        const ws = this.workspaces.get(workspaceId);
        if (!ws)
            return undefined;
        if (ws.memberAgentIds.includes(agentId)) {
            return ws; // already a member
        }
        ws.memberAgentIds.push(agentId);
        ws.updatedAt = new Date().toISOString();
        this.persist();
        // Also add to the default channel
        try {
            (0, collaboration_service_1.getCollaborationSvc)().addMember(ws.defaultChannelId, agentId);
        }
        catch {
            // Channel member add might fail if already present - that's fine
        }
        logger.info({ workspaceId, agentId }, 'agent added to workspace');
        return ws;
    }
    removeAgent(workspaceId, agentId) {
        const ws = this.workspaces.get(workspaceId);
        if (!ws)
            return undefined;
        ws.memberAgentIds = ws.memberAgentIds.filter((id) => id !== agentId);
        ws.updatedAt = new Date().toISOString();
        this.persist();
        // Also remove from the default channel
        try {
            (0, collaboration_service_1.getCollaborationSvc)().removeMember(ws.defaultChannelId, agentId);
        }
        catch {
            // ignore
        }
        logger.info({ workspaceId, agentId }, 'agent removed from workspace');
        return ws;
    }
    listAgents(workspaceId) {
        const ws = this.workspaces.get(workspaceId);
        if (!ws)
            return undefined;
        return [...ws.memberAgentIds];
    }
    // -- Workspace queries ----------------------------------------------------
    findByProject(projectId) {
        for (const ws of this.workspaces.values()) {
            if (ws.projectId === projectId)
                return ws;
        }
        return undefined;
    }
    getChannels(workspaceId) {
        const ws = this.workspaces.get(workspaceId);
        if (!ws)
            return [];
        // Return all channels - workspace-scoped filtering is by membership
        return (0, collaboration_service_1.getCollaborationSvc)().listChannels();
    }
}
exports.WorkspaceService = WorkspaceService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
function getWorkspaceService() {
    if (!_instance) {
        _instance = new WorkspaceService();
    }
    return _instance;
}
function resetWorkspaceService() {
    _instance = null;
}
