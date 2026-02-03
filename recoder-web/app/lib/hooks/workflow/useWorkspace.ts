/**
 * useWorkspace Hook
 * Provides workspace context and management
 */

import { useCallback, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import type {
  Workspace,
  WorkspaceId,
  WorkspaceNode,
  WorkspaceConnection,
  WorkspaceSettings,
  NodeId,
  ConnectionId,
  Generation,
  Task,
} from './types';
import {
  $currentWorkspace,
  $workspaces,
  $currentNodes,
  $currentConnections,
  $workspaceLoading,
  $workspaceError,
  $workspaceDirty,
  $workspaceSettings,
  $selectedNodeIds,
  $selectedConnectionIds,
  $selectedNodes,
  $selectedConnections,
  $nodesById,
  $connectionsById,
  createWorkspace as createWorkspaceAction,
  setCurrentWorkspace as setCurrentWorkspaceAction,
  updateWorkspace as updateWorkspaceAction,
  deleteWorkspace as deleteWorkspaceAction,
  addNode as addNodeAction,
  removeNode as removeNodeAction,
  addConnection as addConnectionAction,
  removeConnection as removeConnectionAction,
  updateSettings as updateSettingsAction,
  markWorkspaceSaved,
  selectNode as selectNodeAction,
  deselectNode as deselectNodeAction,
  selectConnection as selectConnectionAction,
  deselectConnection as deselectConnectionAction,
  clearSelection,
  selectAllNodes,
  updateNode as updateNodeAction,
} from './workspace-store';
import { $generations, getGenerationsForNode } from './generation-store';
import { $tasks, $activeTask, setCurrentWorkspace } from './task-store';
import { $effectiveWorkflowFeatureFlags } from './feature-flags-store';

// ============================================================
// Types
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
  /** Nodes by ID */
  nodesById: Record<NodeId, WorkspaceNode>;
  /** Connections by ID */
  connectionsById: Record<ConnectionId, WorkspaceConnection>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Has unsaved changes */
  isDirty: boolean;
  /** Workspace settings */
  settings: WorkspaceSettings;
  /** Feature flags for the workspace */
  featureFlags: ReturnType<typeof useStore<typeof $effectiveWorkflowFeatureFlags>>;
  /** Generations in this workspace */
  generations: Generation[];
  /** Tasks in this workspace */
  tasks: Task[];
  /** Active task */
  activeTask: Task | undefined;
  /** Selected nodes */
  selectedNodes: WorkspaceNode[];
  /** Selected connections */
  selectedConnections: WorkspaceConnection[];
  /** Create a new workspace */
  createWorkspace: (name: string) => Workspace;
  /** Set the current workspace */
  setWorkspace: (workspace: Workspace | null) => void;
  /** Update workspace */
  updateWorkspace: (updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>) => void;
  /** Add a node */
  addNode: (node: WorkspaceNode) => void;
  /** Update a node */
  updateNode: (nodeId: NodeId, updates: Partial<Omit<WorkspaceNode, 'id'>>) => void;
  /** Remove a node */
  removeNode: (nodeId: NodeId) => void;
  /** Add a connection */
  addConnection: (connection: Omit<WorkspaceConnection, 'id'>) => void;
  /** Remove a connection */
  removeConnection: (connectionId: ConnectionId) => void;
  /** Delete workspace */
  deleteWorkspace: () => void;
  /** Update settings */
  updateSettings: (updates: Partial<WorkspaceSettings>) => void;
  /** Get generations for a node */
  getNodeGenerations: (nodeId: NodeId) => Generation[];
  /** Mark workspace as saved */
  markSaved: () => void;
  /** Select a node */
  selectNode: (nodeId: NodeId, additive?: boolean) => void;
  /** Deselect a node */
  deselectNode: (nodeId: NodeId) => void;
  /** Select a connection */
  selectConnection: (connectionId: ConnectionId, additive?: boolean) => void;
  /** Deselect a connection */
  deselectConnection: (connectionId: ConnectionId) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select all nodes */
  selectAllNodes: () => void;
}

// ============================================================
// Hook Implementation
// ============================================================

/**
 * Main workspace hook
 */
export function useWorkspace(): UseWorkspaceResult {
  const workspace = useStore($currentWorkspace);
  const workspaces = useStore($workspaces);
  const nodes = useStore($currentNodes);
  const connections = useStore($currentConnections);
  const nodesById = useStore($nodesById);
  const connectionsById = useStore($connectionsById);
  const isLoading = useStore($workspaceLoading);
  const error = useStore($workspaceError);
  const isDirty = useStore($workspaceDirty);
  const settings = useStore($workspaceSettings);
  const featureFlags = useStore($effectiveWorkflowFeatureFlags);
  const allGenerations = useStore($generations);
  const tasks = useStore($tasks);
  const activeTask = useStore($activeTask);
  const selectedNodes = useStore($selectedNodes);
  const selectedConnections = useStore($selectedConnections);

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
    return createWorkspaceAction(name);
  }, []);

  const handleSetWorkspace = useCallback((ws: Workspace | null) => {
    setCurrentWorkspaceAction(ws);
    setCurrentWorkspace(ws?.id ?? null);
  }, []);

  const handleUpdateWorkspace = useCallback(
    (updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>) => {
      if (workspaceId) {
        updateWorkspaceAction(workspaceId, updates);
      }
    },
    [workspaceId]
  );

  const handleAddNode = useCallback(
    (node: WorkspaceNode) => {
      if (workspaceId) {
        addNodeAction(workspaceId, node);
      }
    },
    [workspaceId]
  );

  const handleUpdateNode = useCallback(
    (nodeId: NodeId, updates: Partial<Omit<WorkspaceNode, 'id'>>) => {
      if (workspaceId) {
        updateNodeAction(workspaceId, nodeId, updates);
      }
    },
    [workspaceId]
  );

  const handleRemoveNode = useCallback(
    (nodeId: NodeId) => {
      if (workspaceId) {
        removeNodeAction(workspaceId, nodeId);
      }
    },
    [workspaceId]
  );

  const handleAddConnection = useCallback(
    (connection: Omit<WorkspaceConnection, 'id'>) => {
      if (workspaceId) {
        addConnectionAction(workspaceId, connection);
      }
    },
    [workspaceId]
  );

  const handleRemoveConnection = useCallback(
    (connectionId: ConnectionId) => {
      if (workspaceId) {
        removeConnectionAction(workspaceId, connectionId);
      }
    },
    [workspaceId]
  );

  const handleDeleteWorkspace = useCallback(() => {
    if (workspaceId) {
      deleteWorkspaceAction(workspaceId);
    }
  }, [workspaceId]);

  const handleUpdateSettings = useCallback(
    (updates: Partial<WorkspaceSettings>) => {
      updateSettingsAction(updates);
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
    markWorkspaceSaved();
  }, []);

  const handleSelectNode = useCallback(
    (nodeId: NodeId, additive: boolean = false) => {
      selectNodeAction(nodeId, additive);
    },
    []
  );

  const handleDeselectNode = useCallback((nodeId: NodeId) => {
    deselectNodeAction(nodeId);
  }, []);

  const handleSelectConnection = useCallback(
    (connectionId: ConnectionId, additive: boolean = false) => {
      selectConnectionAction(connectionId, additive);
    },
    []
  );

  const handleDeselectConnection = useCallback((connectionId: ConnectionId) => {
    deselectConnectionAction(connectionId);
  }, []);

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, []);

  const handleSelectAllNodes = useCallback(() => {
    selectAllNodes();
  }, []);

  return {
    workspace,
    workspaceId,
    workspaces,
    nodes,
    connections,
    nodesById,
    connectionsById,
    isLoading,
    error,
    isDirty,
    settings,
    featureFlags,
    generations,
    tasks,
    activeTask,
    selectedNodes,
    selectedConnections,
    createWorkspace: handleCreateWorkspace,
    setWorkspace: handleSetWorkspace,
    updateWorkspace: handleUpdateWorkspace,
    addNode: handleAddNode,
    updateNode: handleUpdateNode,
    removeNode: handleRemoveNode,
    addConnection: handleAddConnection,
    removeConnection: handleRemoveConnection,
    deleteWorkspace: handleDeleteWorkspace,
    updateSettings: handleUpdateSettings,
    getNodeGenerations: handleGetNodeGenerations,
    markSaved: handleMarkSaved,
    selectNode: handleSelectNode,
    deselectNode: handleDeselectNode,
    selectConnection: handleSelectConnection,
    deselectConnection: handleDeselectConnection,
    clearSelection: handleClearSelection,
    selectAllNodes: handleSelectAllNodes,
  };
}

/**
 * Hook to get just the workspace ID
 */
export function useWorkspaceId(): WorkspaceId | null {
  const workspace = useStore($currentWorkspace);
  return workspace?.id ?? null;
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

/**
 * Hook to get workspace loading state
 */
export function useWorkspaceLoading(): boolean {
  return useStore($workspaceLoading);
}

/**
 * Hook to get workspace error
 */
export function useWorkspaceError(): Error | null {
  return useStore($workspaceError);
}

/**
 * Hook to get selected node IDs
 */
export function useSelectedNodeIds(): NodeId[] {
  return useStore($selectedNodeIds);
}

/**
 * Hook to get selected connection IDs
 */
export function useSelectedConnectionIds(): ConnectionId[] {
  return useStore($selectedConnectionIds);
}

/**
 * Hook to get a specific node
 */
export function useNode(nodeId: NodeId): WorkspaceNode | undefined {
  const nodesById = useStore($nodesById);
  return nodesById[nodeId];
}

/**
 * Hook to get a specific connection
 */
export function useConnection(
  connectionId: ConnectionId
): WorkspaceConnection | undefined {
  const connectionsById = useStore($connectionsById);
  return connectionsById[connectionId];
}
