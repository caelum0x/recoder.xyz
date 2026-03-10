'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Link2,
  X,
  Trash2,
  Loader2,
  Wand2,
  GitBranch,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import {
  useAgentDependencyGraph,
  useCreateDependency,
  useDeleteDependency,
  useAutoDetectDependencies,
} from '@/hooks/agents/use-agent-dependencies';
import type { GraphNode, GraphEdge, DependencyGraph } from '@/lib/api/agent-dependencies';

// ============================================================================
// Constants
// ============================================================================

const NODE_RADIUS = 30;
const LABEL_OFFSET = 42;

const EDGE_COLORS: Record<string, string> = {
  calls: '#3b82f6',        // blue
  chains_to: '#8b5cf6',    // purple
  shares_kb: '#10b981',    // green
  shares_tools: '#f59e0b', // amber
  cloned_from: '#6b7280',  // gray
};

const EDGE_LABELS: Record<string, string> = {
  calls: 'Calls',
  chains_to: 'Chains to',
  shares_kb: 'Shares KB',
  shares_tools: 'Shares Tools',
  cloned_from: 'Cloned from',
};

const HEALTH_COLORS = {
  good: '#10b981',
  warning: '#f59e0b',
  bad: '#ef4444',
  unknown: '#6b7280',
};

function getHealthColor(score: number | null): string {
  if (score === null) return HEALTH_COLORS.unknown;
  if (score >= 70) return HEALTH_COLORS.good;
  if (score >= 40) return HEALTH_COLORS.warning;
  return HEALTH_COLORS.bad;
}

// ============================================================================
// Force simulation types & helpers
// ============================================================================

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function initializePositions(nodes: GraphNode[], width: number, height: number): SimNode[] {
  const cx = width / 2;
  const cy = height / 2;
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    const r = Math.min(width, height) * 0.3;
    return {
      ...node,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });
}

function simulate(nodes: SimNode[], edges: GraphEdge[], width: number, height: number): SimNode[] {
  const REPULSION = 6000;
  const ATTRACTION = 0.004;
  const DAMPING = 0.85;
  const IDEAL_LENGTH = 180;
  const cx = width / 2;
  const cy = height / 2;

  for (const node of nodes) {
    node.vx *= DAMPING;
    node.vy *= DAMPING;
  }

  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx += fx;
      nodes[i].vy += fy;
      nodes[j].vx -= fx;
      nodes[j].vy -= fy;
    }
  }

  // Attraction
  const nodeIndex = new Map(nodes.map((n, i) => [n.agent_id, i]));
  for (const edge of edges) {
    const si = nodeIndex.get(edge.source);
    const ti = nodeIndex.get(edge.target);
    if (si === undefined || ti === undefined) continue;
    const s = nodes[si];
    const t = nodes[ti];
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = ATTRACTION * (dist - IDEAL_LENGTH);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  // Centering
  for (const node of nodes) {
    node.vx += (cx - node.x) * 0.001;
    node.vy += (cy - node.y) * 0.001;
  }

  // Apply
  for (const node of nodes) {
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(NODE_RADIUS + 10, Math.min(width - NODE_RADIUS - 10, node.x));
    node.y = Math.max(NODE_RADIUS + 10, Math.min(height - NODE_RADIUS - 10, node.y));
  }

  return nodes;
}

// ============================================================================
// Component
// ============================================================================

export default function AgentDependenciesPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: graph, isLoading, error } = useAgentDependencyGraph();
  const createDep = useCreateDependency();
  const deleteDep = useDeleteDependency();
  const autoDetect = useAutoDetectDependencies();

  // View transform
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Simulation state
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const animRef = useRef<number>(0);
  const iterRef = useRef(0);

  // Interaction state
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<SimNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Initialize simulation
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) {
      setSimNodes([]);
      return;
    }
    const initial = initializePositions(graph.nodes, dimensions.width, dimensions.height);
    setSimNodes(initial);
    iterRef.current = 0;
  }, [graph, dimensions.width, dimensions.height]);

  // Run simulation
  useEffect(() => {
    if (simNodes.length === 0 || !graph) return;

    const MAX_ITERATIONS = 200;

    const tick = () => {
      if (iterRef.current >= MAX_ITERATIONS) return;
      iterRef.current += 1;
      setSimNodes((prev) => {
        const next = [...prev.map((n) => ({ ...n }))];
        simulate(next, graph.edges, dimensions.width, dimensions.height);
        return next;
      });
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [simNodes.length > 0, graph?.edges.length]);

  // ---- Pan handlers ----
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== svgRef.current && !(e.target as Element).closest('.graph-bg')) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.3, Math.min(3, z + delta)));
  }, []);

  // ---- Node click ----
  const handleNodeClick = useCallback(
    (node: SimNode) => {
      if (linkMode) {
        if (!linkSource) {
          setLinkSource(node);
        } else if (linkSource.agent_id !== node.agent_id) {
          createDep.mutate(
            { source_agent_id: linkSource.agent_id, target_agent_id: node.agent_id, dependency_type: 'calls' },
            {
              onSuccess: () => {
                toast.success('Dependency created');
                setLinkMode(false);
                setLinkSource(null);
              },
              onError: (err) => toast.error(err.message),
            }
          );
        }
      } else {
        setSelectedNode(node);
        setSelectedEdge(null);
      }
    },
    [linkMode, linkSource, createDep]
  );

  // ---- Edge click ----
  const handleEdgeClick = useCallback((edge: GraphEdge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  // ---- Auto-detect ----
  const handleAutoDetect = () => {
    autoDetect.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(`Detected ${result.detected} dependencies`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  // ---- Delete edge ----
  const handleDeleteEdge = (edgeId: string) => {
    deleteDep.mutate(edgeId, {
      onSuccess: () => {
        toast.success('Dependency removed');
        setSelectedEdge(null);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  // ---- Zoom controls ----
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Build edges with source/target coordinates
  const renderedEdges = useMemo(() => {
    if (!graph) return [];
    const nodeMap = new Map(simNodes.map((n) => [n.agent_id, n]));
    return graph.edges.map((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      return { ...edge, sx: source?.x ?? 0, sy: source?.y ?? 0, tx: target?.x ?? 0, ty: target?.y ?? 0 };
    });
  }, [graph, simNodes]);

  // Node details for sidebar
  const nodeEdges = useMemo(() => {
    if (!selectedNode || !graph) return [];
    return graph.edges.filter(
      (e) => e.source === selectedNode.agent_id || e.target === selectedNode.agent_id
    );
  }, [selectedNode, graph]);

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

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Agent Dependency Graph</h1>
          {graph && (
            <Badge variant="secondary" className="text-xs">
              {graph.nodes.length} agents, {graph.edges.length} dependencies
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoDetect}
            disabled={autoDetect.isPending}
          >
            {autoDetect.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-1" />
            )}
            Auto-Detect
          </Button>

          <Button
            variant={linkMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setLinkMode((m) => !m);
              setLinkSource(null);
            }}
          >
            <Link2 className="h-4 w-4 mr-1" />
            {linkMode ? 'Cancel' : 'Add Dependency'}
          </Button>
        </div>
      </div>

      {/* Link mode banner */}
      {linkMode && (
        <div className="bg-primary/10 border-b px-4 py-2 text-sm text-primary flex items-center gap-2">
          <Info className="h-4 w-4" />
          {linkSource
            ? `Click a target agent to create dependency from "${linkSource.name}"`
            : 'Click a source agent node to start creating a dependency'}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Graph area */}
        <div
          ref={containerRef}
          className="flex-1 relative bg-muted/20"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {!hasNodes ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <GitBranch className="h-12 w-12 opacity-30" />
              <p className="text-sm">No agents with dependencies yet.</p>
              <p className="text-xs">Click "Auto-Detect" or "Add Dependency" to get started.</p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              className="cursor-grab active:cursor-grabbing"
              onWheel={handleWheel}
            >
              <defs>
                {Object.entries(EDGE_COLORS).map(([type, color]) => (
                  <marker
                    key={type}
                    id={`arrow-${type}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                  </marker>
                ))}
              </defs>

              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Background for pan detection */}
                <rect
                  className="graph-bg"
                  x={0}
                  y={0}
                  width={dimensions.width}
                  height={dimensions.height}
                  fill="transparent"
                />

                {/* Edges */}
                {renderedEdges.map((edge) => {
                  const color = EDGE_COLORS[edge.dependency_type] || EDGE_COLORS.calls;
                  const isSelected = selectedEdge?.id === edge.id;
                  // Shorten line to not overlap circles
                  const dx = edge.tx - edge.sx;
                  const dy = edge.ty - edge.sy;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const offsetRatio = NODE_RADIUS / Math.max(dist, 1);
                  const x1 = edge.sx + dx * offsetRatio;
                  const y1 = edge.sy + dy * offsetRatio;
                  const x2 = edge.tx - dx * offsetRatio;
                  const y2 = edge.ty - dy * offsetRatio;

                  return (
                    <g key={edge.id} onClick={() => handleEdgeClick(edge)} className="cursor-pointer">
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={color}
                        strokeWidth={isSelected ? 3 : 1.5}
                        strokeDasharray={edge.is_auto_detected ? '5,5' : undefined}
                        markerEnd={`url(#arrow-${edge.dependency_type})`}
                        opacity={isSelected ? 1 : 0.7}
                      />
                      {/* Hit area */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="transparent"
                        strokeWidth={12}
                      />
                      {/* Edge label at midpoint */}
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 6}
                        textAnchor="middle"
                        fontSize={10}
                        fill={color}
                        className="pointer-events-none select-none"
                      >
                        {EDGE_LABELS[edge.dependency_type] || edge.dependency_type}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes */}
                {simNodes.map((node) => {
                  const isSelected = selectedNode?.agent_id === node.agent_id;
                  const isHovered = hoveredNode === node.agent_id;
                  const isLinkSource = linkSource?.agent_id === node.agent_id;
                  const healthColor = getHealthColor(node.health_score);

                  return (
                    <g
                      key={node.agent_id}
                      onClick={() => handleNodeClick(node)}
                      onMouseEnter={() => setHoveredNode(node.agent_id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="cursor-pointer"
                    >
                      {/* Outer ring for health */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS + 3}
                        fill="none"
                        stroke={healthColor}
                        strokeWidth={2}
                        opacity={0.6}
                      />

                      {/* Main circle */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS}
                        fill={isLinkSource ? 'hsl(var(--primary))' : isSelected || isHovered ? 'hsl(var(--accent))' : 'hsl(var(--card))'}
                        stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />

                      {/* Agent initial */}
                      <text
                        x={node.x}
                        y={node.y + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={14}
                        fontWeight="bold"
                        fill={isLinkSource ? 'white' : 'hsl(var(--foreground))'}
                        className="pointer-events-none select-none"
                      >
                        {(node.name || '?').charAt(0).toUpperCase()}
                      </text>

                      {/* Label below */}
                      <text
                        x={node.x}
                        y={node.y + LABEL_OFFSET}
                        textAnchor="middle"
                        fontSize={11}
                        fill="hsl(var(--foreground))"
                        className="pointer-events-none select-none"
                      >
                        {node.name.length > 16 ? node.name.slice(0, 14) + '...' : node.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-1 bg-background/90 backdrop-blur border rounded-lg p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetView}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Legend */}
          <div className="absolute top-4 left-4 bg-background/90 backdrop-blur border rounded-lg p-3">
            <p className="text-xs font-medium mb-2 text-muted-foreground">Edge Types</p>
            <div className="flex flex-col gap-1">
              {Object.entries(EDGE_LABELS).map(([type, label]) => (
                <div key={type} className="flex items-center gap-2">
                  <div
                    className="w-4 h-0.5 rounded-full"
                    style={{ backgroundColor: EDGE_COLORS[type] }}
                  />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side panel */}
        {(selectedNode || selectedEdge) && (
          <div className="w-72 border-l bg-background p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">
                {selectedNode ? 'Agent Details' : 'Dependency'}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setSelectedNode(null);
                  setSelectedEdge(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {selectedNode && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-sm font-medium">{selectedNode.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Agent ID</p>
                  <p className="text-xs font-mono break-all">{selectedNode.agent_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Health Score</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: getHealthColor(selectedNode.health_score) }}
                    />
                    <span className="text-sm">
                      {selectedNode.health_score !== null
                        ? `${selectedNode.health_score}/100`
                        : 'Not calculated'}
                    </span>
                  </div>
                </div>

                {nodeEdges.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Dependencies ({nodeEdges.length})
                    </p>
                    <div className="space-y-1">
                      {nodeEdges.map((e) => {
                        const isSource = e.source === selectedNode.agent_id;
                        const otherName = graph?.nodes.find(
                          (n) => n.agent_id === (isSource ? e.target : e.source)
                        )?.name;
                        return (
                          <div
                            key={e.id}
                            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-muted/50"
                          >
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: EDGE_COLORS[e.dependency_type] }}
                            />
                            <span className="truncate">
                              {isSource ? '' : ''}{EDGE_LABELS[e.dependency_type]}{' '}
                              {isSource ? '' : 'from '}{otherName || e.source}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedEdge && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge
                    style={{ backgroundColor: EDGE_COLORS[selectedEdge.dependency_type] + '20', color: EDGE_COLORS[selectedEdge.dependency_type] }}
                    className="text-xs"
                  >
                    {EDGE_LABELS[selectedEdge.dependency_type]}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="text-sm">
                    {graph?.nodes.find((n) => n.agent_id === selectedEdge.source)?.name || selectedEdge.source}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="text-sm">
                    {graph?.nodes.find((n) => n.agent_id === selectedEdge.target)?.name || selectedEdge.target}
                  </p>
                </div>
                {selectedEdge.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm">{selectedEdge.description}</p>
                  </div>
                )}
                {selectedEdge.is_auto_detected && (
                  <Badge variant="outline" className="text-xs">
                    Auto-detected
                  </Badge>
                )}

                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => handleDeleteEdge(selectedEdge.id)}
                  disabled={deleteDep.isPending}
                >
                  {deleteDep.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Remove Dependency
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
