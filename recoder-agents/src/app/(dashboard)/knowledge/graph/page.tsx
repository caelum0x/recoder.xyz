'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Network,
  Search,
  Sparkles,
  Trash2,
  X,
  Bot,
  MessageSquare,
  Wrench,
  BookOpen,
  FileText,
  GitBranch,
  Tag,
  Database,
  BarChart3,
  Loader2,
  Info,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useKnowledgeGraph,
  useAddNode,
  useAddEdge,
  useRemoveNode,
  useRemoveEdge,
  useAutoDiscover,
  useGraphStats,
  useNodeConnections,
} from '@/hooks/knowledge/use-knowledge-graph';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '@/lib/api/knowledge-graph';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_TYPES = [
  'agent', 'thread', 'tool', 'knowledge_base',
  'prompt', 'workflow', 'tag', 'data_source',
] as const;

const NODE_TYPE_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  agent:          { color: '#6366f1', icon: Bot,            label: 'Agent' },
  thread:         { color: '#f59e0b', icon: MessageSquare,  label: 'Thread' },
  tool:           { color: '#10b981', icon: Wrench,         label: 'Tool' },
  knowledge_base: { color: '#3b82f6', icon: BookOpen,       label: 'Knowledge Base' },
  prompt:         { color: '#ec4899', icon: FileText,       label: 'Prompt' },
  workflow:       { color: '#8b5cf6', icon: GitBranch,      label: 'Workflow' },
  tag:            { color: '#f97316', icon: Tag,             label: 'Tag' },
  data_source:    { color: '#14b8a6', icon: Database,        label: 'Data Source' },
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  uses:       '#6366f1',
  produces:   '#10b981',
  depends_on: '#ef4444',
  related_to: '#8b5cf6',
  contains:   '#3b82f6',
  triggers:   '#f59e0b',
  references: '#64748b',
};

// ---------------------------------------------------------------------------
// Simple force-directed layout
// ---------------------------------------------------------------------------

interface NodePosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function computeLayout(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map();

  const positions = new Map<string, NodePosition>();
  const cx = width / 2;
  const cy = height / 2;

  // Initialize positions in a circle
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const radius = Math.min(width, height) * 0.35;
    positions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    });
  });

  // Simple force simulation (limited iterations for performance)
  const iterations = 80;
  const repulsion = 5000;
  const attraction = 0.005;
  const damping = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    const nodeArr = Array.from(positions.entries());
    for (let i = 0; i < nodeArr.length; i++) {
      for (let j = i + 1; j < nodeArr.length; j++) {
        const [, a] = nodeArr[i];
        const [, b] = nodeArr[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = positions.get(edge.source_node_id);
      const b = positions.get(edge.target_node_id);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const fx = dx * attraction;
      const fy = dy * attraction;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center gravity
    for (const [, pos] of positions) {
      pos.vx += (cx - pos.x) * 0.001;
      pos.vy += (cy - pos.y) * 0.001;
      pos.x += pos.vx;
      pos.y += pos.vy;
      pos.vx *= damping;
      pos.vy *= damping;
      // Clamp
      pos.x = Math.max(40, Math.min(width - 40, pos.x));
      pos.y = Math.max(40, Math.min(height - 40, pos.y));
    }
  }

  const result = new Map<string, { x: number; y: number }>();
  for (const [id, pos] of positions) {
    result.set(id, { x: pos.x, y: pos.y });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KnowledgeGraphPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(NODE_TYPES));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  // New node form state
  const [newNodeType, setNewNodeType] = useState<string>('agent');
  const [newNodeId, setNewNodeId] = useState('');
  const [newNodeLabel, setNewNodeLabel] = useState('');

  // Data hooks
  const { data: graph, isLoading: graphLoading } = useKnowledgeGraph();
  const { data: stats, isLoading: statsLoading } = useGraphStats();
  const { data: connections } = useNodeConnections(selectedNodeId ?? '');
  const addNode = useAddNode();
  const removeNode = useRemoveNode();
  const removeEdge = useRemoveEdge();
  const discover = useAutoDiscover();

  // Filter + search
  const filteredNodes = useMemo(() => {
    if (!graph?.nodes) return [];
    return graph.nodes.filter((n) => {
      if (!activeFilters.has(n.node_type)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return n.label.toLowerCase().includes(q) || n.node_type.includes(q);
      }
      return true;
    });
  }, [graph?.nodes, activeFilters, searchQuery]);

  const filteredEdges = useMemo(() => {
    if (!graph?.edges) return [];
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return graph.edges.filter(
      (e) => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)
    );
  }, [graph?.edges, filteredNodes]);

  // Layout
  const SVG_W = 900;
  const SVG_H = 600;
  const positions = useMemo(
    () => computeLayout(filteredNodes, filteredEdges, SVG_W, SVG_H),
    [filteredNodes, filteredEdges]
  );

  const toggleFilter = useCallback((type: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleAddNode = useCallback(() => {
    if (!newNodeId.trim() || !newNodeLabel.trim()) return;
    addNode.mutate(
      { node_type: newNodeType, node_id: newNodeId.trim(), label: newNodeLabel.trim() },
      {
        onSuccess: () => {
          setShowAddNodeDialog(false);
          setNewNodeId('');
          setNewNodeLabel('');
        },
      }
    );
  }, [addNode, newNodeType, newNodeId, newNodeLabel]);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      removeNode.mutate(nodeId, {
        onSuccess: () => setSelectedNodeId(null),
      });
    },
    [removeNode]
  );

  const selectedNode = useMemo(
    () => filteredNodes.find((n) => n.id === selectedNodeId) ?? null,
    [filteredNodes, selectedNodeId]
  );

  // Reset zoom
  const resetZoom = useCallback(() => setZoom(1), []);

  if (graphLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[500px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Network className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Knowledge Graph</h1>
              <p className="text-sm text-muted-foreground">
                Visualize relationships between agents, threads, tools, and more
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddNodeDialog(true)}
            >
              Add Node
            </Button>
            <Button
              size="sm"
              onClick={() => discover.mutate()}
              disabled={discover.isPending}
            >
              {discover.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              Auto-Discover
            </Button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by label..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NODE_TYPES.map((type) => {
              const cfg = NODE_TYPE_CONFIG[type];
              const active = activeFilters.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleFilter(type)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                    active
                      ? 'border-transparent text-white'
                      : 'border-border text-muted-foreground bg-background hover:bg-muted'
                  )}
                  style={active ? { backgroundColor: cfg.color } : undefined}
                >
                  <cfg.icon className="h-3 w-3" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Graph Canvas */}
          <div className="lg:col-span-3">
            <Card>
              <CardContent className="p-2 relative">
                {/* Zoom controls */}
                <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}>
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}>
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={resetZoom}>
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {filteredNodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground gap-3">
                    <Network className="h-12 w-12 opacity-30" />
                    <p className="text-sm">No nodes to display. Try Auto-Discover to populate the graph.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg" style={{ height: SVG_H }}>
                    <svg
                      ref={svgRef}
                      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                      width="100%"
                      height={SVG_H}
                      className="bg-muted/30"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                    >
                      {/* Edges */}
                      {filteredEdges.map((edge) => {
                        const from = positions.get(edge.source_node_id);
                        const to = positions.get(edge.target_node_id);
                        if (!from || !to) return null;
                        return (
                          <line
                            key={edge.id}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke={EDGE_TYPE_COLORS[edge.edge_type] || '#94a3b8'}
                            strokeWidth={1.5}
                            strokeOpacity={0.5}
                            className="pointer-events-none"
                          />
                        );
                      })}

                      {/* Nodes */}
                      {filteredNodes.map((node) => {
                        const pos = positions.get(node.id);
                        if (!pos) return null;
                        const cfg = NODE_TYPE_CONFIG[node.node_type];
                        const isSelected = node.id === selectedNodeId;
                        return (
                          <g
                            key={node.id}
                            onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                            className="cursor-pointer"
                          >
                            {/* Selection ring */}
                            {isSelected && (
                              <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={22}
                                fill="none"
                                stroke={cfg.color}
                                strokeWidth={2}
                                strokeDasharray="4 2"
                              />
                            )}
                            {/* Node circle */}
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={16}
                              fill={cfg.color}
                              fillOpacity={0.9}
                              stroke="white"
                              strokeWidth={2}
                            />
                            {/* Label */}
                            <text
                              x={pos.x}
                              y={pos.y + 28}
                              textAnchor="middle"
                              fontSize={10}
                              fill="currentColor"
                              className="pointer-events-none select-none"
                            >
                              {node.label.length > 18
                                ? node.label.slice(0, 16) + '...'
                                : node.label}
                            </text>
                            {/* Type initial inside circle */}
                            <text
                              x={pos.x}
                              y={pos.y + 4}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight="bold"
                              fill="white"
                              className="pointer-events-none select-none"
                            >
                              {cfg.label[0]}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground">
              <span className="font-medium">Edge types:</span>
              {Object.entries(EDGE_TYPE_COLORS).map(([type, color]) => (
                <span key={type} className="flex items-center gap-1">
                  <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                  {type.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4" />
                  Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {statsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : stats ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Nodes</span>
                      <span className="font-medium">{stats.total_nodes}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Edges</span>
                      <span className="font-medium">{stats.total_edges}</span>
                    </div>
                    <hr className="my-2" />
                    <p className="text-xs font-medium text-muted-foreground mb-1">Nodes by type</p>
                    {Object.entries(stats.nodes_by_type).map(([type, count]) => {
                      const cfg = NODE_TYPE_CONFIG[type];
                      return (
                        <div key={type} className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: cfg?.color ?? '#94a3b8' }}
                            />
                            {cfg?.label ?? type}
                          </span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">No data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Selected node details */}
            {selectedNode && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Info className="h-4 w-4" />
                      Node Details
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setSelectedNodeId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div>
                    <span className="text-muted-foreground text-xs">Label</span>
                    <p className="font-medium">{selectedNode.label}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Type</span>
                    <div>
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: NODE_TYPE_CONFIG[selectedNode.node_type]?.color + '20',
                          color: NODE_TYPE_CONFIG[selectedNode.node_type]?.color,
                        }}
                      >
                        {NODE_TYPE_CONFIG[selectedNode.node_type]?.label}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">ID</span>
                    <p className="font-mono text-xs truncate">{selectedNode.node_id}</p>
                  </div>

                  {/* Connections */}
                  {connections && connections.connected_nodes.length > 0 && (
                    <div>
                      <span className="text-muted-foreground text-xs">
                        Connections ({connections.connected_nodes.length})
                      </span>
                      <div className="space-y-1 mt-1">
                        {connections.connected_nodes.slice(0, 10).map((cn) => (
                          <button
                            key={cn.id}
                            onClick={() => setSelectedNodeId(cn.id)}
                            className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-muted text-xs"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: NODE_TYPE_CONFIG[cn.node_type]?.color }}
                            />
                            <span className="truncate">{cn.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    disabled={removeNode.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete Node
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Add Node Dialog */}
      <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Node</DialogTitle>
            <DialogDescription>Add a new node to the knowledge graph.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <Select value={newNodeType} onValueChange={setNewNodeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NODE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {NODE_TYPE_CONFIG[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Node ID</label>
              <Input
                placeholder="Unique identifier"
                value={newNodeId}
                onChange={(e) => setNewNodeId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Label</label>
              <Input
                placeholder="Display name"
                value={newNodeLabel}
                onChange={(e) => setNewNodeLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNodeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddNode}
              disabled={!newNodeId.trim() || !newNodeLabel.trim() || addNode.isPending}
            >
              {addNode.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Add Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
