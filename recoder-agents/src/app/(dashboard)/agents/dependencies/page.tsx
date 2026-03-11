'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  GitBranch,
  Link2,
  Loader2,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  ArrowRight,
  Target,
  BarChart3,
  Ghost,
  RotateCw,
  Info,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDependencyGraph,
  useAddDependency,
  useRemoveDependency,
  useImpactAnalysis,
  useDependencyStats,
} from '@/hooks/agents/use-agent-dependency-graph';
import type {
  GraphNode,
  GraphEdge,
  DependencyGraph,
  DependencyStats,
  ImpactAnalysis,
} from '@/lib/api/agent-dependency-graph';

// ============================================================================
// Constants
// ============================================================================

const TYPE_COLORS: Record<string, string> = {
  calls: '#3b82f6',
  triggers: '#10b981',
  shares_data: '#f59e0b',
  requires: '#ef4444',
  extends: '#8b5cf6',
  // Legacy types from existing data
  chains_to: '#8b5cf6',
  shares_kb: '#10b981',
  shares_tools: '#f59e0b',
  cloned_from: '#6b7280',
};

const TYPE_LABELS: Record<string, string> = {
  calls: 'Calls',
  triggers: 'Triggers',
  shares_data: 'Shares Data',
  requires: 'Requires',
  extends: 'Extends',
  chains_to: 'Chains to',
  shares_kb: 'Shares KB',
  shares_tools: 'Shares Tools',
  cloned_from: 'Cloned from',
};

const DEP_TYPE_OPTIONS = [
  { value: 'calls', label: 'Calls' },
  { value: 'triggers', label: 'Triggers' },
  { value: 'shares_data', label: 'Shares Data' },
  { value: 'requires', label: 'Requires' },
  { value: 'extends', label: 'Extends' },
];

// ============================================================================
// Layout helper: assign nodes to columns by dependency depth (topological)
// ============================================================================

interface LayoutNode extends GraphNode {
  col: number;
  row: number;
  x: number;
  y: number;
}

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  containerWidth: number,
  containerHeight: number
): LayoutNode[] {
  if (nodes.length === 0) return [];

  // Build adjacency (source -> targets)
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  // Topological sort to assign columns (BFS from roots)
  const depth = new Map<string, number>();
  const queue: string[] = [];

  for (const n of nodes) {
    if ((inDegree.get(n.id) || 0) === 0) {
      queue.push(n.id);
      depth.set(n.id, 0);
    }
  }

  // BFS
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentDepth = depth.get(current) || 0;
    for (const target of adj.get(current) || []) {
      const newDepth = currentDepth + 1;
      if (!depth.has(target) || depth.get(target)! < newDepth) {
        depth.set(target, newDepth);
      }
      // Only add to queue if all incoming edges are processed
      const remaining = (inDegree.get(target) || 0) - 1;
      inDegree.set(target, remaining);
      if (remaining <= 0 && !queue.includes(target)) {
        queue.push(target);
      }
    }
  }

  // Assign depth 0 to any unvisited nodes (cycles)
  for (const n of nodes) {
    if (!depth.has(n.id)) {
      depth.set(n.id, 0);
    }
  }

  // Group by column
  const columns = new Map<number, GraphNode[]>();
  let maxCol = 0;
  for (const n of nodes) {
    const col = depth.get(n.id) || 0;
    maxCol = Math.max(maxCol, col);
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(n);
  }

  // Position nodes
  const numCols = maxCol + 1;
  const colWidth = Math.max(180, containerWidth / Math.max(numCols, 1));
  const paddingX = 80;
  const paddingY = 60;
  const nodeHeight = 56;
  const nodeGap = 20;

  const layoutNodes: LayoutNode[] = [];

  for (let col = 0; col < numCols; col++) {
    const colNodes = columns.get(col) || [];
    const totalHeight = colNodes.length * nodeHeight + (colNodes.length - 1) * nodeGap;
    const startY = Math.max(paddingY, (containerHeight - totalHeight) / 2);

    colNodes.forEach((n, row) => {
      layoutNodes.push({
        ...n,
        col,
        row,
        x: paddingX + col * colWidth,
        y: startY + row * (nodeHeight + nodeGap),
      });
    });
  }

  return layoutNodes;
}

// ============================================================================
// Add Dependency Dialog
// ============================================================================

function AddDependencyDialog({
  nodes,
  onAdd,
  isAdding,
  onClose,
}: {
  nodes: GraphNode[];
  onAdd: (sourceId: string, targetId: string, depType: string) => void;
  isAdding: boolean;
  onClose: () => void;
}) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [depType, setDepType] = useState('calls');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Dependency
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Source Agent (depends on...)
            </label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            >
              <option value="">Select source agent</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Target Agent (...this agent)
            </label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            >
              <option value="">Select target agent</option>
              {nodes
                .filter((n) => n.id !== sourceId)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Dependency Type
            </label>
            <select
              value={depType}
              onChange={(e) => setDepType(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            >
              {DEP_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => onAdd(sourceId, targetId, depType)}
            disabled={!sourceId || !targetId || isAdding}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isAdding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Stats Section
// ============================================================================

function StatsSection({ stats }: { stats: DependencyStats | undefined }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      {/* Most Depended On */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Most Depended On
        </h4>
        {stats.most_depended_on.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dependencies yet</p>
        ) : (
          <div className="space-y-2">
            {stats.most_depended_on.map((agent) => {
              const maxCount = stats.most_depended_on[0]?.dependent_count || 1;
              const pct = (agent.dependent_count / maxCount) * 100;
              return (
                <div key={agent.agent_id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="truncate font-medium">{agent.name}</span>
                    <span className="text-muted-foreground ml-2">
                      {agent.dependent_count}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Orphan Agents */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
          <Ghost className="h-4 w-4 text-muted-foreground" />
          Orphan Agents ({stats.orphan_agents.length})
        </h4>
        {stats.orphan_agents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            All agents have at least one dependency
          </p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {stats.orphan_agents.map((agent) => (
              <div
                key={agent.agent_id}
                className="text-xs px-2 py-1 rounded bg-muted/50 truncate"
                title={agent.name}
              >
                {agent.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Circular Dependencies */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
          <RotateCw className="h-4 w-4 text-muted-foreground" />
          Circular Dependencies
        </h4>
        {stats.circular_dependencies.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            No circular dependencies detected
          </div>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {stats.circular_dependencies.map((chain, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 flex-wrap"
              >
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                {chain.cycle.map((id, j) => (
                  <React.Fragment key={j}>
                    <span className="font-mono truncate max-w-20" title={id}>
                      {id.slice(0, 8)}
                    </span>
                    {j < chain.cycle.length - 1 && (
                      <ChevronRight className="h-3 w-3 flex-shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Side Panel
// ============================================================================

function SidePanel({
  selectedNode,
  graph,
  impact,
  impactLoading,
  onRemoveDep,
  isRemoving,
  onClose,
}: {
  selectedNode: GraphNode;
  graph: DependencyGraph;
  impact: ImpactAnalysis | undefined;
  impactLoading: boolean;
  onRemoveDep: (agentId: string, depId: string) => void;
  isRemoving: boolean;
  onClose: () => void;
}) {
  // Get edges where this node is source or target
  const outgoing = graph.edges.filter((e) => e.source === selectedNode.id);
  const incoming = graph.edges.filter((e) => e.target === selectedNode.id);
  const nodeNameMap = Object.fromEntries(graph.nodes.map((n) => [n.id, n.name]));

  return (
    <div className="w-80 border-l border-border bg-background p-4 overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">{selectedNode.name}</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground font-mono mb-4 break-all">
        {selectedNode.id}
      </p>

      {/* Outgoing (depends on) */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">
          Depends On ({outgoing.length})
        </h4>
        {outgoing.length === 0 ? (
          <p className="text-xs text-muted-foreground">None</p>
        ) : (
          <div className="space-y-1.5">
            {outgoing.map((e, i) => (
              <div
                key={`out-${i}`}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/50"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[e.type] || '#888' }}
                />
                <span className="truncate flex-1">
                  {nodeNameMap[e.target] || e.target.slice(0, 8)}
                </span>
                <span
                  className="text-[10px] px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: (TYPE_COLORS[e.type] || '#888') + '20',
                    color: TYPE_COLORS[e.type] || '#888',
                  }}
                >
                  {TYPE_LABELS[e.type] || e.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming (depended upon by) */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">
          Depended Upon By ({incoming.length})
        </h4>
        {incoming.length === 0 ? (
          <p className="text-xs text-muted-foreground">None</p>
        ) : (
          <div className="space-y-1.5">
            {incoming.map((e, i) => (
              <div
                key={`in-${i}`}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/50"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[e.type] || '#888' }}
                />
                <span className="truncate flex-1">
                  {nodeNameMap[e.source] || e.source.slice(0, 8)}
                </span>
                <span
                  className="text-[10px] px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: (TYPE_COLORS[e.type] || '#888') + '20',
                    color: TYPE_COLORS[e.type] || '#888',
                  }}
                >
                  {TYPE_LABELS[e.type] || e.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Impact Analysis */}
      <div className="border-t border-border pt-4 mt-4">
        <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Impact Analysis
        </h4>
        {impactLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing...
          </div>
        ) : impact && impact.total_affected > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-amber-500">
              {impact.total_affected} agent{impact.total_affected > 1 ? 's' : ''} affected
              if this agent changes
            </p>
            {impact.affected_agents.map((a) => (
              <div
                key={a.agent_id}
                className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-amber-500/5"
              >
                <span className="text-[10px] text-muted-foreground w-6">
                  L{a.depth}
                </span>
                <span className="truncate">{a.name}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span
                  className="text-[10px] px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: (TYPE_COLORS[a.dependency_type] || '#888') + '20',
                    color: TYPE_COLORS[a.dependency_type] || '#888',
                  }}
                >
                  {TYPE_LABELS[a.dependency_type] || a.dependency_type}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No downstream agents would be affected
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AgentDependencyGraphPage() {
  const { data: graph, isLoading, error, refetch } = useDependencyGraph();
  const { data: stats } = useDependencyStats();
  const addDep = useAddDependency();
  const removeDep = useRemoveDependency();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedNodeId) || null,
    [graph, selectedNodeId]
  );

  const { data: impact, isLoading: impactLoading } = useImpactAnalysis(
    selectedNodeId || ''
  );

  // Layout
  const containerWidth = 900;
  const containerHeight = 500;

  const layoutNodes = useMemo(() => {
    if (!graph) return [];
    return computeLayout(graph.nodes, graph.edges, containerWidth, containerHeight);
  }, [graph, containerWidth, containerHeight]);

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of layoutNodes) {
      map.set(n.id, { x: n.x, y: n.y });
    }
    return map;
  }, [layoutNodes]);

  // Click handler: highlight connected nodes
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      if (!graph) return;
      const connected = new Set<string>();
      connected.add(nodeId);
      for (const e of graph.edges) {
        if (e.source === nodeId) connected.add(e.target);
        if (e.target === nodeId) connected.add(e.source);
      }
      setHighlightedIds(connected);
    },
    [graph]
  );

  const handleAddDependency = useCallback(
    (sourceId: string, targetId: string, depType: string) => {
      addDep.mutate(
        {
          agentId: sourceId,
          data: {
            depends_on_agent_id: targetId,
            dependency_type: depType,
          },
        },
        {
          onSuccess: () => {
            setShowAddDialog(false);
          },
        }
      );
    },
    [addDep]
  );

  const handleRemoveDep = useCallback(
    (agentId: string, depId: string) => {
      removeDep.mutate({ agentId, depId });
    },
    [removeDep]
  );

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightedIds(new Set());
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-muted-foreground">Failed to load dependency graph.</p>
      </div>
    );
  }

  const hasNodes = graph && graph.nodes.length > 0;
  const nodeCardWidth = 140;
  const nodeCardHeight = 48;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Agent Dependency Graph
          </h1>
          {graph && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {graph.nodes.length} agents, {graph.edges.length} dependencies
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Dependency
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph Area */}
        <div className="flex-1 overflow-auto p-6">
          {!hasNodes ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <GitBranch className="h-12 w-12 opacity-30" />
              <p className="text-sm">No agents with dependencies yet.</p>
              <p className="text-xs">Click "Add Dependency" to create relationships between agents.</p>
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">Legend:</span>
                {Object.entries(TYPE_LABELS).map(([type, label]) => {
                  // Only show types that actually appear in edges
                  if (!graph!.edges.some((e) => e.type === type)) return null;
                  return (
                    <span key={type} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="h-2 w-6 rounded-sm"
                        style={{ backgroundColor: TYPE_COLORS[type] }}
                      />
                      {label}
                    </span>
                  );
                })}
              </div>

              {/* CSS-positioned graph with SVG edges */}
              <div className="relative border border-border rounded-xl bg-muted/20 overflow-hidden"
                style={{ width: containerWidth, height: containerHeight, minHeight: 400 }}>
                {/* SVG for edges */}
                <svg
                  width={containerWidth}
                  height={containerHeight}
                  className="absolute inset-0 pointer-events-none"
                >
                  <defs>
                    {Object.entries(TYPE_COLORS).map(([type, color]) => (
                      <marker
                        key={type}
                        id={`arrow-v2-${type}`}
                        viewBox="0 0 10 10"
                        refX="10"
                        refY="5"
                        markerWidth="8"
                        markerHeight="8"
                        orient="auto"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                      </marker>
                    ))}
                  </defs>
                  {graph!.edges.map((edge, i) => {
                    const sPos = nodePositions.get(edge.source);
                    const tPos = nodePositions.get(edge.target);
                    if (!sPos || !tPos) return null;

                    const sx = sPos.x + nodeCardWidth;
                    const sy = sPos.y + nodeCardHeight / 2;
                    const tx = tPos.x;
                    const ty = tPos.y + nodeCardHeight / 2;

                    const color = TYPE_COLORS[edge.type] || '#888';
                    const isHighlighted =
                      highlightedIds.has(edge.source) && highlightedIds.has(edge.target);

                    // Bezier curve for nicer lines
                    const midX = (sx + tx) / 2;
                    const path = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;

                    return (
                      <path
                        key={`edge-${i}`}
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={isHighlighted ? 2.5 : 1.5}
                        strokeOpacity={
                          highlightedIds.size === 0 || isHighlighted ? 0.8 : 0.15
                        }
                        markerEnd={`url(#arrow-v2-${edge.type})`}
                      />
                    );
                  })}
                </svg>

                {/* Node cards */}
                {layoutNodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const isHighlighted =
                    highlightedIds.size === 0 || highlightedIds.has(node.id);

                  return (
                    <div
                      key={node.id}
                      onClick={() => handleNodeClick(node.id)}
                      className={cn(
                        'absolute cursor-pointer rounded-lg border px-3 py-2 transition-all select-none',
                        'hover:shadow-md',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                          : 'border-border bg-card',
                        !isHighlighted && 'opacity-20'
                      )}
                      style={{
                        left: node.x,
                        top: node.y,
                        width: nodeCardWidth,
                        height: nodeCardHeight,
                      }}
                    >
                      <div className="flex items-center gap-2 h-full">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(node.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium truncate">
                          {node.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stats */}
              <StatsSection stats={stats} />
            </>
          )}
        </div>

        {/* Side Panel */}
        {selectedNode && graph && (
          <SidePanel
            selectedNode={selectedNode}
            graph={graph}
            impact={impact}
            impactLoading={impactLoading}
            onRemoveDep={handleRemoveDep}
            isRemoving={removeDep.isPending}
            onClose={clearSelection}
          />
        )}
      </div>

      {/* Add Dependency Dialog */}
      {showAddDialog && graph && (
        <AddDependencyDialog
          nodes={graph.nodes}
          onAdd={handleAddDependency}
          isAdding={addDep.isPending}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
