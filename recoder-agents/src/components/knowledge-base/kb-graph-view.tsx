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
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { useKbGraph, useCreateRelationship, useDeleteRelationship } from '@/hooks/knowledge/use-kb-relationships';
import type { KbGraphNode, KbGraphEdge } from '@/lib/api/kb-relationships';

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_RADIUS = 28;
const LABEL_OFFSET = 38;

const TYPE_COLORS: Record<string, string> = {
  pdf: '#ef4444',
  doc: '#3b82f6',
  docx: '#3b82f6',
  txt: '#8b5cf6',
  md: '#10b981',
  csv: '#f59e0b',
  json: '#06b6d4',
  default: '#6b7280',
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  related: '#6b7280',
  depends_on: '#ef4444',
  references: '#3b82f6',
  contradicts: '#f59e0b',
  extends: '#10b981',
};

// ── Types ────────────────────────────────────────────────────────────────────

interface SimNode extends KbGraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Props {
  className?: string;
}

// ── Force simulation ─────────────────────────────────────────────────────────

function initializePositions(nodes: KbGraphNode[], width: number, height: number): SimNode[] {
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

function simulate(
  nodes: SimNode[],
  edges: KbGraphEdge[],
  width: number,
  height: number,
): SimNode[] {
  const REPULSION = 5000;
  const ATTRACTION = 0.005;
  const DAMPING = 0.85;
  const IDEAL_LENGTH = 160;
  const cx = width / 2;
  const cy = height / 2;

  // Reset forces
  for (const node of nodes) {
    node.vx *= DAMPING;
    node.vy *= DAMPING;
  }

  // Repulsion (all pairs)
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

  // Attraction (edges)
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
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

  // Centering force
  for (const node of nodes) {
    node.vx += (cx - node.x) * 0.001;
    node.vy += (cy - node.y) * 0.001;
  }

  // Apply velocities
  for (const node of nodes) {
    node.x += node.vx;
    node.y += node.vy;
    // Keep in bounds
    node.x = Math.max(NODE_RADIUS + 10, Math.min(width - NODE_RADIUS - 10, node.x));
    node.y = Math.max(NODE_RADIUS + 10, Math.min(height - NODE_RADIUS - 10, node.y));
  }

  return nodes;
}

// ── Component ────────────────────────────────────────────────────────────────

export function KbGraphView({ className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: graph, isLoading, error } = useKbGraph();
  const createRelMutation = useCreateRelationship();
  const deleteRelMutation = useDeleteRelationship();

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
  const [selectedEdge, setSelectedEdge] = useState<KbGraphEdge | null>(null);
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

  // Initialize simulation when graph data arrives
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
  }, [simNodes.length, graph, dimensions.width, dimensions.height]);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).closest('.graph-bg')) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.2, Math.min(3, z * delta)));
  }, []);

  // Node click
  const handleNodeClick = useCallback(
    (node: SimNode) => {
      if (linkMode) {
        if (!linkSource) {
          setLinkSource(node);
        } else if (linkSource.id !== node.id) {
          // Create the relationship
          createRelMutation.mutate(
            {
              source_entry_id: linkSource.id,
              target_entry_id: node.id,
              relationship_type: 'related',
              strength: 0.5,
            },
            {
              onSuccess: () => {
                toast.success('Relationship created');
                setLinkMode(false);
                setLinkSource(null);
              },
              onError: (err: any) => {
                toast.error(err.message || 'Failed to create relationship');
              },
            }
          );
        }
      } else {
        setSelectedNode(node);
        setSelectedEdge(null);
      }
    },
    [linkMode, linkSource, createRelMutation]
  );

  // Edge click
  const handleEdgeClick = useCallback((edge: KbGraphEdge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const handleDeleteEdge = useCallback(() => {
    if (!selectedEdge) return;
    deleteRelMutation.mutate(selectedEdge.id, {
      onSuccess: () => {
        toast.success('Relationship deleted');
        setSelectedEdge(null);
      },
      onError: (err: any) => {
        toast.error(err.message || 'Failed to delete relationship');
      },
    });
  }, [selectedEdge, deleteRelMutation]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Build node lookup for edges
  const nodeMap = useMemo(() => {
    const map = new Map<string, SimNode>();
    for (const n of simNodes) map.set(n.id, n);
    return map;
  }, [simNodes]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">
        Failed to load graph data.
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Info className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No knowledge base entries to display.
        </p>
        <p className="text-xs text-muted-foreground">
          Upload files to your knowledge base to see the graph view.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative w-full h-[600px] border rounded-xl bg-background overflow-hidden ${className || ''}`}>
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))}
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={resetView}
          title="Reset view"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          variant={linkMode ? 'default' : 'outline'}
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={() => {
            setLinkMode(!linkMode);
            setLinkSource(null);
          }}
          title={linkMode ? 'Cancel linking' : 'Add relationship'}
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Link mode indicator */}
      {linkMode && (
        <div className="absolute top-3 left-3 z-10">
          <Badge variant="default" className="gap-1.5 text-xs">
            <Link2 className="h-3 w-3" />
            {linkSource
              ? `Click target node (source: ${linkSource.title?.slice(0, 20)}...)`
              : 'Click source node'}
          </Badge>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 max-w-[300px]">
        {Object.entries(RELATIONSHIP_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
            {type.replace('_', ' ')}
          </div>
        ))}
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className={isPanning ? 'cursor-grabbing' : 'cursor-grab'}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <rect
          className="graph-bg"
          x={0}
          y={0}
          width={dimensions.width}
          height={dimensions.height}
          fill="transparent"
        />
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {graph.edges.map((edge) => {
            const sn = nodeMap.get(edge.source);
            const tn = nodeMap.get(edge.target);
            if (!sn || !tn) return null;

            const isSelected = selectedEdge?.id === edge.id;
            const color = RELATIONSHIP_COLORS[edge.relationship_type] || RELATIONSHIP_COLORS.related;
            const strokeWidth = 1 + edge.strength * 3;

            // Midpoint for label
            const mx = (sn.x + tn.x) / 2;
            const my = (sn.y + tn.y) / 2;

            return (
              <g key={edge.id}>
                <line
                  x1={sn.x}
                  y1={sn.y}
                  x2={tn.x}
                  y2={tn.y}
                  stroke={isSelected ? '#fff' : color}
                  strokeWidth={isSelected ? strokeWidth + 1 : strokeWidth}
                  strokeOpacity={0.6}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdgeClick(edge);
                  }}
                />
                <text
                  x={mx}
                  y={my - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="currentColor"
                  className="text-muted-foreground pointer-events-none select-none"
                  opacity={0.7}
                >
                  {edge.relationship_type.replace('_', ' ')}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {simNodes.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            const isLinkSource = linkSource?.id === node.id;
            const isHovered = hoveredNode === node.id;
            const ext = (node.file_type || 'default').toLowerCase();
            const fillColor = TYPE_COLORS[ext] || TYPE_COLORS.default;

            return (
              <g
                key={node.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(node);
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Selection ring */}
                {(isSelected || isLinkSource) && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 4}
                    fill="none"
                    stroke={isLinkSource ? '#3b82f6' : '#fff'}
                    strokeWidth={2}
                    strokeDasharray={isLinkSource ? '4 2' : 'none'}
                  />
                )}
                {/* Node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS}
                  fill={fillColor}
                  fillOpacity={isHovered ? 0.9 : 0.7}
                  stroke={isHovered ? '#fff' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={isHovered ? 2 : 1}
                />
                {/* File extension label inside circle */}
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#fff"
                  className="pointer-events-none select-none"
                >
                  {ext.toUpperCase().slice(0, 4)}
                </text>
                {/* Title below */}
                <text
                  x={node.x}
                  y={node.y + LABEL_OFFSET}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="text-foreground pointer-events-none select-none"
                >
                  {(node.title || '').length > 18
                    ? node.title.slice(0, 16) + '...'
                    : node.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Node detail panel */}
      {selectedNode && !linkMode && (
        <div className="absolute top-3 left-3 z-10 w-64 bg-card/95 backdrop-blur-sm border rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium truncate pr-2">{selectedNode.title}</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setSelectedNode(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>
              <span className="font-medium">Type:</span>{' '}
              {selectedNode.file_type || 'Unknown'}
            </p>
            {selectedNode.created_at && (
              <p>
                <span className="font-medium">Created:</span>{' '}
                {new Date(selectedNode.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Edge detail panel */}
      {selectedEdge && (
        <div className="absolute top-3 left-3 z-10 w-64 bg-card/95 backdrop-blur-sm border rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Relationship</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setSelectedEdge(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
            <p>
              <span className="font-medium">Type:</span>{' '}
              {selectedEdge.relationship_type.replace('_', ' ')}
            </p>
            <p>
              <span className="font-medium">Strength:</span>{' '}
              {(selectedEdge.strength * 100).toFixed(0)}%
            </p>
            {selectedEdge.auto_detected && (
              <Badge variant="outline" className="text-[10px]">
                Auto-detected
              </Badge>
            )}
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="w-full gap-1.5 h-7 text-xs"
            onClick={handleDeleteEdge}
            disabled={deleteRelMutation.isPending}
          >
            {deleteRelMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Delete Relationship
          </Button>
        </div>
      )}
    </div>
  );
}
