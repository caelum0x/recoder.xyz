/**
 * useWorkspace Hook
 * Manages workspace state and provides workspace context
 */

import { atom, computed, map } from 'nanostores';
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo } from 'react';
import type { WorkspaceId, NodeId, Generation, Task } from './types';
import { generateWorkspaceId } from './types';
import { $generations, getGenerationsForNode } from './generation-store';
import { $tasks, $activeTask, setCurrentWorkspace } from './task-store';
import { $effectiveGiselleFeatureFlags } from './feature-flags-store';

// ============================================================
// Workspace Types
// ============================================================

export interface WorkspaceNode {
  id: NodeId;
  type: 'operation' | 'variable';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkspaceConnection {
  id: string;
  sourceNodeId: NodeId;
  sourceOutputId: string;
  targetNodeId: NodeId;
  targetInputId: string;
}

export interface Workspace {
  id: WorkspaceId;
  name: string;
  nodes: WorkspaceNode[];
  connections: WorkspaceConnection[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceSettings {
  autoSave: boolean;
  saveInterval: number;
  maxUndoHistory: number;
}

// ============================================================
// Workspace Store
// ============================================================

/**
 * Current workspace
 */
export const $currentWorkspace = atom<Workspace | null>(null);

/**
 * All workspaces by ID
 */
export const $workspacesById = map<Record<WorkspaceId, Workspace>>({});

/**
 * Workspace settings
 */
export const $workspaceSettings = atom<WorkspaceSettings>({
  autoSave: true,
  saveInterval: 30000,
  maxUndoHistory: 50,
});

/**
 * Loading state
 */
export const $workspaceLoading = atom<boolean>(false);

/**
 * Error state
 */
export const $workspaceError = atom<Error | null>(null);

/**
 * Dirty state (unsaved changes)
 */
export const $workspaceDirty = atom<boolean>(false);

// ============================================================
// Computed Values
// ============================================================

/**
 * Current workspace ID
 */
export const $currentWorkspaceId = computed(
  $currentWorkspace,
  (workspace) => workspace?.id ?? null
);

/**
 * All workspaces as array
 */
export const $workspaces = computed($workspacesById, (byId) =>
  Object.values(byId).sort((a, b) => b.updatedAt - a.updatedAt)
);

/**
 * Current workspace nodes
 */
export const $currentNodes = computed(
  $currentWorkspace,
  (workspace) => workspace?.nodes ?? []
);

/**
 * Current workspace connections
 */
export const $currentConnections = computed(
  $currentWorkspace,
  (workspace) => workspace?.connections ?? []
);

// ============================================================
// Workspace Actions
// ============================================================

/**
 * Create a new workspace
 */
export function createWorkspace(name: string): Workspace {
  const id = generateWorkspaceId();
  const now = Date.now();

  const workspace: Workspace = {
    id,
    name,
    nodes: [],
    connections: [],
    createdAt: now,
    updatedAt: now,
  };

  $workspacesById.setKey(id, workspace);
  return workspace;
}

/**
 * Set the current workspace
 */
export function setWorkspace(workspace: Workspace | null): void {
  $currentWorkspace.set(workspace);
  setCurrentWorkspace(workspace?.id ?? null);
  $workspaceDirty.set(false);
}

/**
 * Update workspace data
 */
export function updateWorkspace(
  workspaceId: WorkspaceId,
  updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>
): void {
  const existing = $workspacesById.get()[workspaceId];
  if (!existing) {
    console.warn(`Workspace ${workspaceId} not found`);
    return;
  }

  const updated: Workspace = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  $workspacesById.setKey(workspaceId, updated);

  if ($currentWorkspace.get()?.id === workspaceId) {
    $currentWorkspace.set(updated);
  }

  $workspaceDirty.set(true);
}

/**
 * Add a node to the workspace
 */
export function addNode(workspaceId: WorkspaceId, node: WorkspaceNode): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    nodes: [...workspace.nodes, node],
  });
}

/**
 * Remove a node from the workspace
 */
export function removeNode(workspaceId: WorkspaceId, nodeId: NodeId): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    nodes: workspace.nodes.filter((n) => n.id !== nodeId),
    connections: workspace.connections.filter(
      (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
    ),
  });
}

/**
 * Add a connection
 */
export function addConnection(
  workspaceId: WorkspaceId,
  connection: WorkspaceConnection
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    connections: [...workspace.connections, connection],
  });
}

/**
 * Remove a connection
 */
export function removeConnection(
  workspaceId: WorkspaceId,
  connectionId: string
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    connections: workspace.connections.filter((c) => c.id !== connectionId),
  });
}

/**
 * Delete a workspace
 */
export function deleteWorkspace(workspaceId: WorkspaceId): void {
  const { [workspaceId]: removed, ...rest } = $workspacesById.get();
  $workspacesById.set(rest);

  if ($currentWorkspace.get()?.id === workspaceId) {
    $currentWorkspace.set(null);
  }
}

/**
 * Update settings
 */
export function updateSettings(
  updates: Partial<WorkspaceSettings>
): void {
  $workspaceSettings.set({
    ...$workspaceSettings.get(),
    ...updates,
  });
}

// ============================================================
// Hook Implementation
// ============================================================

export interface UseWorkspaceResult {
  /** Current workspace */
  workspace: Workspace | null;
  /** Current workspace ID */
  workspaceId: WorkspaceId | null;
  /** All workspaces */
  workspaces: Workspace[];
  /** Current nodes */
  nodes: WorkspaceNode[];
  /** Current connections */
  connections: WorkspaceConnection[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Has unsaved changes */
  isDirty: boolean;
  /** Workspace settings */
  settings: WorkspaceSettings;
  /** Feature flags for the workspace */
  featureFlags: ReturnType<typeof useStore<typeof $effectiveGiselleFeatureFlags>>;
  /** Generations in this workspace */
  generations: Generation[];
  /** Tasks in this workspace */
  tasks: Task[];
  /** Active task */
  activeTask: Task | undefined;
  /** Create a new workspace */
  createWorkspace: (name: string) => Workspace;
  /** Set the current workspace */
  setWorkspace: (workspace: Workspace | null) => void;
  /** Update workspace */
  updateWorkspace: (updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>) => void;
  /** Add a node */
  addNode: (node: WorkspaceNode) => void;
  /** Remove a node */
  removeNode: (nodeId: NodeId) => void;
  /** Add a connection */
  addConnection: (connection: WorkspaceConnection) => void;
  /** Remove a connection */
  removeConnection: (connectionId: string) => void;
  /** Delete workspace */
  deleteWorkspace: () => void;
  /** Update settings */
  updateSettings: (updates: Partial<WorkspaceSettings>) => void;
  /** Get generations for a node */
  getNodeGenerations: (nodeId: NodeId) => Generation[];
  /** Mark workspace as saved */
  markSaved: () => void;
}

/**
 * Main workspace hook
 */
export function useWorkspace(): UseWorkspaceResult {
  const workspace = useStore($currentWorkspace);
  const workspaces = useStore($workspaces);
  const nodes = useStore($currentNodes);
  const connections = useStore($currentConnections);
  const isLoading = useStore($workspaceLoading);
  const error = useStore($workspaceError);
  const isDirty = useStore($workspaceDirty);
  const settings = useStore($workspaceSettings);
  const featureFlags = useStore($effectiveGiselleFeatureFlags);
  const allGenerations = useStore($generations);
  const tasks = useStore($tasks);
  const activeTask = useStore($activeTask);

  const workspaceId = workspace?.id ?? null;

  // Filter generations for current workspace
  const generations = useMemo(() => {
    if (!workspaceId) return [];
    return allGenerations.filter(
      (g) =>
        g.context.origin.type === 'studio' &&
        g.context.origin.workspaceId === workspaceId
    );
  }, [allGenerations, workspaceId]);

  // Callbacks
  const handleCreateWorkspace = useCallback((name: string) => {
    return createWorkspace(name);
  }, []);

  const handleSetWorkspace = useCallback((ws: Workspace | null) => {
    setWorkspace(ws);
  }, []);

  const handleUpdateWorkspace = useCallback(
    (updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>) => {
      if (workspaceId) {
        updateWorkspace(workspaceId, updates);
      }
    },
    [workspaceId]
  );

  const handleAddNode = useCallback(
    (node: WorkspaceNode) => {
      if (workspaceId) {
        addNode(workspaceId, node);
      }
    },
    [workspaceId]
  );

  const handleRemoveNode = useCallback(
    (nodeId: NodeId) => {
      if (workspaceId) {
        removeNode(workspaceId, nodeId);
      }
    },
    [workspaceId]
  );

  const handleAddConnection = useCallback(
    (connection: WorkspaceConnection) => {
      if (workspaceId) {
        addConnection(workspaceId, connection);
      }
    },
    [workspaceId]
  );

  const handleRemoveConnection = useCallback(
    (connectionId: string) => {
      if (workspaceId) {
        removeConnection(workspaceId, connectionId);
      }
    },
    [workspaceId]
  );

  const handleDeleteWorkspace = useCallback(() => {
    if (workspaceId) {
      deleteWorkspace(workspaceId);
    }
  }, [workspaceId]);

  const handleUpdateSettings = useCallback(
    (updates: Partial<WorkspaceSettings>) => {
      updateSettings(updates);
    },
    []
  );

  const handleGetNodeGenerations = useCallback(
    (nodeId: NodeId): Generation[] => {
      if (!workspaceId) return [];
      return getGenerationsForNode(nodeId, {
        type: 'studio',
        workspaceId,
      });
    },
    [workspaceId]
  );

  const handleMarkSaved = useCallback(() => {
    $workspaceDirty.set(false);
  }, []);

  return {
    workspace,
    workspaceId,
    workspaces,
    nodes,
    connections,
    isLoading,
    error,
    isDirty,
    settings,
    featureFlags,
    generations,
    tasks,
    activeTask,
    createWorkspace: handleCreateWorkspace,
    setWorkspace: handleSetWorkspace,
    updateWorkspace: handleUpdateWorkspace,
    addNode: handleAddNode,
    removeNode: handleRemoveNode,
    addConnection: handleAddConnection,
    removeConnection: handleRemoveConnection,
    deleteWorkspace: handleDeleteWorkspace,
    updateSettings: handleUpdateSettings,
    getNodeGenerations: handleGetNodeGenerations,
    markSaved: handleMarkSaved,
  };
}

/**
 * Hook to get just the workspace ID
 */
export function useWorkspaceId(): WorkspaceId | null {
  return useStore($currentWorkspaceId);
}

/**
 * Hook to check if workspace has unsaved changes
 */
export function useWorkspaceDirty(): boolean {
  return useStore($workspaceDirty);
}

/**
 * Hook to get workspace settings
 */
export function useWorkspaceSettings(): WorkspaceSettings {
  return useStore($workspaceSettings);
}
