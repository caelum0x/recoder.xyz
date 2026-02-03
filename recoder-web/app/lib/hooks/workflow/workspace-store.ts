/**
 * Workspace Store
 * Nanostore-based reactive store for managing workspaces
 */

import { atom, computed, map } from 'nanostores';
import type {
  Workspace,
  WorkspaceId,
  WorkspaceNode,
  WorkspaceConnection,
  WorkspaceSettings,
  NodeId,
  ConnectionId,
} from './types';
import { generateWorkspaceId, generateConnectionId } from './types';

// ============================================================
// Default Settings
// ============================================================

const DEFAULT_SETTINGS: WorkspaceSettings = {
  autoSave: true,
  saveInterval: 30000,
  maxUndoHistory: 50,
  theme: 'system',
};

// ============================================================
// Atoms for workspace state
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
export const $workspaceSettings = atom<WorkspaceSettings>({ ...DEFAULT_SETTINGS });

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

/**
 * Selected nodes
 */
export const $selectedNodeIds = atom<NodeId[]>([]);

/**
 * Selected connections
 */
export const $selectedConnectionIds = atom<ConnectionId[]>([]);

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
 * All workspaces as array (sorted by updatedAt)
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

/**
 * Nodes by ID for the current workspace
 */
export const $nodesById = computed($currentNodes, (nodes) => {
  const byId: Record<NodeId, WorkspaceNode> = {};
  for (const node of nodes) {
    byId[node.id] = node;
  }
  return byId;
});

/**
 * Connections by ID for the current workspace
 */
export const $connectionsById = computed($currentConnections, (connections) => {
  const byId: Record<ConnectionId, WorkspaceConnection> = {};
  for (const conn of connections) {
    byId[conn.id] = conn;
  }
  return byId;
});

/**
 * Selected nodes
 */
export const $selectedNodes = computed(
  [$nodesById, $selectedNodeIds],
  (byId, ids) => ids.map((id) => byId[id]).filter(Boolean) as WorkspaceNode[]
);

/**
 * Selected connections
 */
export const $selectedConnections = computed(
  [$connectionsById, $selectedConnectionIds],
  (byId, ids) =>
    ids.map((id) => byId[id]).filter(Boolean) as WorkspaceConnection[]
);

/**
 * Get connections for a node
 */
export function getNodeConnections(nodeId: NodeId): {
  incoming: WorkspaceConnection[];
  outgoing: WorkspaceConnection[];
} {
  const connections = $currentConnections.get();
  return {
    incoming: connections.filter((c) => c.targetNodeId === nodeId),
    outgoing: connections.filter((c) => c.sourceNodeId === nodeId),
  };
}

// ============================================================
// Workspace Actions
// ============================================================

/**
 * Create a new workspace
 */
export function createWorkspace(
  name: string,
  metadata?: Record<string, unknown>
): Workspace {
  const id = generateWorkspaceId();
  const now = Date.now();

  const workspace: Workspace = {
    id,
    name,
    nodes: [],
    connections: [],
    createdAt: now,
    updatedAt: now,
    metadata,
  };

  $workspacesById.setKey(id, workspace);
  return workspace;
}

/**
 * Set the current workspace
 */
export function setCurrentWorkspace(workspace: Workspace | null): void {
  $currentWorkspace.set(workspace);
  $workspaceDirty.set(false);
  $selectedNodeIds.set([]);
  $selectedConnectionIds.set([]);
  $workspaceError.set(null);
}

/**
 * Load a workspace by ID
 */
export function loadWorkspace(workspaceId: WorkspaceId): Workspace | null {
  const workspace = $workspacesById.get()[workspaceId];
  if (workspace) {
    setCurrentWorkspace(workspace);
    return workspace;
  }
  return null;
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
 * Rename a workspace
 */
export function renameWorkspace(workspaceId: WorkspaceId, name: string): void {
  updateWorkspace(workspaceId, { name });
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
 * Duplicate a workspace
 */
export function duplicateWorkspace(workspaceId: WorkspaceId): Workspace | null {
  const original = $workspacesById.get()[workspaceId];
  if (!original) return null;

  const newWorkspace = createWorkspace(`${original.name} (copy)`, original.metadata);

  // Deep copy nodes and connections
  updateWorkspace(newWorkspace.id, {
    nodes: original.nodes.map((n) => ({ ...n })),
    connections: original.connections.map((c) => ({ ...c })),
  });

  return $workspacesById.get()[newWorkspace.id];
}

// ============================================================
// Node Actions
// ============================================================

/**
 * Add a node to the workspace
 */
export function addNode(
  workspaceId: WorkspaceId,
  node: WorkspaceNode
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    nodes: [...workspace.nodes, node],
  });
}

/**
 * Add multiple nodes
 */
export function addNodes(
  workspaceId: WorkspaceId,
  nodes: WorkspaceNode[]
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    nodes: [...workspace.nodes, ...nodes],
  });
}

/**
 * Update a node
 */
export function updateNode(
  workspaceId: WorkspaceId,
  nodeId: NodeId,
  updates: Partial<Omit<WorkspaceNode, 'id'>>
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    nodes: workspace.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...updates } : n
    ),
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

  // Also remove from selection
  $selectedNodeIds.set($selectedNodeIds.get().filter((id) => id !== nodeId));
}

/**
 * Remove multiple nodes
 */
export function removeNodes(
  workspaceId: WorkspaceId,
  nodeIds: NodeId[]
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  const nodeIdSet = new Set(nodeIds);

  updateWorkspace(workspaceId, {
    nodes: workspace.nodes.filter((n) => !nodeIdSet.has(n.id)),
    connections: workspace.connections.filter(
      (c) => !nodeIdSet.has(c.sourceNodeId) && !nodeIdSet.has(c.targetNodeId)
    ),
  });

  $selectedNodeIds.set($selectedNodeIds.get().filter((id) => !nodeIdSet.has(id)));
}

// ============================================================
// Connection Actions
// ============================================================

/**
 * Add a connection
 */
export function addConnection(
  workspaceId: WorkspaceId,
  connection: Omit<WorkspaceConnection, 'id'> & { id?: ConnectionId }
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  const newConnection: WorkspaceConnection = {
    ...connection,
    id: connection.id ?? generateConnectionId(),
  };

  updateWorkspace(workspaceId, {
    connections: [...workspace.connections, newConnection],
  });
}

/**
 * Remove a connection
 */
export function removeConnection(
  workspaceId: WorkspaceId,
  connectionId: ConnectionId
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    connections: workspace.connections.filter((c) => c.id !== connectionId),
  });

  $selectedConnectionIds.set(
    $selectedConnectionIds.get().filter((id) => id !== connectionId)
  );
}

/**
 * Remove connections by node
 */
export function removeConnectionsForNode(
  workspaceId: WorkspaceId,
  nodeId: NodeId
): void {
  const workspace = $workspacesById.get()[workspaceId];
  if (!workspace) return;

  updateWorkspace(workspaceId, {
    connections: workspace.connections.filter(
      (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
    ),
  });
}

// ============================================================
// Selection Actions
// ============================================================

/**
 * Select a node
 */
export function selectNode(nodeId: NodeId, additive: boolean = false): void {
  if (additive) {
    const current = $selectedNodeIds.get();
    if (!current.includes(nodeId)) {
      $selectedNodeIds.set([...current, nodeId]);
    }
  } else {
    $selectedNodeIds.set([nodeId]);
    $selectedConnectionIds.set([]);
  }
}

/**
 * Deselect a node
 */
export function deselectNode(nodeId: NodeId): void {
  $selectedNodeIds.set($selectedNodeIds.get().filter((id) => id !== nodeId));
}

/**
 * Select a connection
 */
export function selectConnection(
  connectionId: ConnectionId,
  additive: boolean = false
): void {
  if (additive) {
    const current = $selectedConnectionIds.get();
    if (!current.includes(connectionId)) {
      $selectedConnectionIds.set([...current, connectionId]);
    }
  } else {
    $selectedConnectionIds.set([connectionId]);
    $selectedNodeIds.set([]);
  }
}

/**
 * Deselect a connection
 */
export function deselectConnection(connectionId: ConnectionId): void {
  $selectedConnectionIds.set(
    $selectedConnectionIds.get().filter((id) => id !== connectionId)
  );
}

/**
 * Clear selection
 */
export function clearSelection(): void {
  $selectedNodeIds.set([]);
  $selectedConnectionIds.set([]);
}

/**
 * Select all nodes
 */
export function selectAllNodes(): void {
  const nodes = $currentNodes.get();
  $selectedNodeIds.set(nodes.map((n) => n.id));
}

// ============================================================
// Settings Actions
// ============================================================

/**
 * Update settings
 */
export function updateSettings(updates: Partial<WorkspaceSettings>): void {
  $workspaceSettings.set({
    ...$workspaceSettings.get(),
    ...updates,
  });
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): void {
  $workspaceSettings.set({ ...DEFAULT_SETTINGS });
}

// ============================================================
// State Management
// ============================================================

/**
 * Mark workspace as saved
 */
export function markWorkspaceSaved(): void {
  $workspaceDirty.set(false);
}

/**
 * Mark workspace as dirty
 */
export function markWorkspaceDirty(): void {
  $workspaceDirty.set(true);
}

/**
 * Set loading state
 */
export function setWorkspaceLoading(loading: boolean): void {
  $workspaceLoading.set(loading);
}

/**
 * Set error state
 */
export function setWorkspaceError(error: Error | null): void {
  $workspaceError.set(error);
}

/**
 * Clear all workspaces
 */
export function clearWorkspaces(): void {
  $workspacesById.set({});
  $currentWorkspace.set(null);
  $workspaceDirty.set(false);
  $selectedNodeIds.set([]);
  $selectedConnectionIds.set([]);
}
