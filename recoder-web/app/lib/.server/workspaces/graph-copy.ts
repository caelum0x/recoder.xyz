/**
 * Workspace Graph Copy Utility
 *
 * Deep-copies a workspace graph (nodes + connections) with fresh IDs.
 * Recursively remaps all node/connection references embedded in node data.
 */

interface GraphNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GraphConnection {
  id: string;
  source?: string;
  target?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceHandle?: string;
  targetHandle?: string;
  sourceOutputId?: string;
  targetInputId?: string;
  [key: string]: unknown;
}

export interface WorkspaceGraph {
  nodes: GraphNode[];
  connections: GraphConnection[];
  metadata?: Record<string, unknown>;
}

export interface CopiedWorkspaceGraph {
  nodes: GraphNode[];
  connections: GraphConnection[];
  metadata: Record<string, unknown>;
  idMap: {
    nodeIdMap: Record<string, string>;
    connectionIdMap: Record<string, string>;
  };
}

function generateNodeId(): string {
  return `nd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateConnectionId(): string {
  return `con_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Recursively remap all string values that match an ID in one of the provided maps.
 */
function remapIds(value: unknown, maps: Array<Map<string, string> | Record<string, string>>): unknown {
  if (typeof value === 'string') {
    for (const mapLike of maps) {
      if (mapLike instanceof Map) {
        const mapped = mapLike.get(value);
        if (mapped) return mapped;
      } else if (mapLike[value]) {
        return mapLike[value];
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapIds(item, maps));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      next[k] = remapIds(v, maps);
    }
    return next;
  }
  return value;
}

/**
 * Deep-copy a workspace graph with fresh node and connection IDs.
 *
 * All ID references within node data and connection endpoints are recursively
 * remapped so the copied graph is self-consistent.
 */
export function copyWorkspaceGraph(source: WorkspaceGraph): CopiedWorkspaceGraph {
  const nodeIdMap = new Map<string, string>();
  for (const node of source.nodes) {
    nodeIdMap.set(node.id, generateNodeId());
  }

  const connectionIdMap = new Map<string, string>();
  for (const connection of source.connections) {
    connectionIdMap.set(connection.id, generateConnectionId());
  }

  const copiedNodes = source.nodes.map((node) => ({
    ...node,
    id: nodeIdMap.get(node.id) || node.id,
    data: (node.data ? remapIds(node.data, [nodeIdMap]) : node.data) as Record<string, unknown> | undefined,
  }));

  const copiedConnections = source.connections.map((connection) => ({
    ...connection,
    id: connectionIdMap.get(connection.id) || connection.id,
    // Support both naming conventions for source/target
    ...(connection.source ? { source: nodeIdMap.get(connection.source) || connection.source } : {}),
    ...(connection.target ? { target: nodeIdMap.get(connection.target) || connection.target } : {}),
    ...(connection.sourceNodeId ? { sourceNodeId: nodeIdMap.get(connection.sourceNodeId) || connection.sourceNodeId } : {}),
    ...(connection.targetNodeId ? { targetNodeId: nodeIdMap.get(connection.targetNodeId) || connection.targetNodeId } : {}),
  }));

  return {
    nodes: copiedNodes,
    connections: copiedConnections,
    metadata: {
      ...(source.metadata || {}),
      copiedFromGraph: true,
      graphCopiedAt: new Date().toISOString(),
    },
    idMap: {
      nodeIdMap: Object.fromEntries(nodeIdMap.entries()),
      connectionIdMap: Object.fromEntries(connectionIdMap.entries()),
    },
  };
}

/**
 * Validate a workspace graph payload from untrusted input.
 * Returns null if the input is not a valid graph structure.
 */
export function validateWorkspaceGraph(input: unknown): WorkspaceGraph | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;

  const nodes = obj.nodes;
  const connections = obj.connections;

  if (!Array.isArray(nodes) || !Array.isArray(connections)) return null;

  // Validate nodes have string IDs
  for (const node of nodes) {
    if (!node || typeof node !== 'object') return null;
    if (typeof (node as Record<string, unknown>).id !== 'string') return null;
  }

  // Validate connections have string IDs
  for (const connection of connections) {
    if (!connection || typeof connection !== 'object') return null;
    if (typeof (connection as Record<string, unknown>).id !== 'string') return null;
  }

  // Enforce reasonable size limits
  if (nodes.length > 500) return null;
  if (connections.length > 2000) return null;

  return {
    nodes: nodes as GraphNode[],
    connections: connections as GraphConnection[],
    metadata: typeof obj.metadata === 'object' && !Array.isArray(obj.metadata)
      ? (obj.metadata as Record<string, unknown>)
      : undefined,
  };
}
