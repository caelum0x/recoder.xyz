'use client';

import { memo, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  type OnNodesChange,
  type NodeMouseHandler,
  type Node as RFNode,
  type Edge as RFEdge,
  Controls,
  MiniMap,
  ConnectionLineType,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Background } from './Background';
import { WorkflowNodeComponent } from './nodes/WorkflowNode';
import { useEditorStore, useEditorStoreWithEqualityFn, selectCanvasData } from './store';
import { isNodeId, type NodeId } from './types';

// Custom node types
const nodeTypes = {
  workflow: memo(WorkflowNodeComponent),
};

// Edge styling
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: {
    stroke: '#6366f1',
    strokeWidth: 2,
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#6366f1',
  },
};

export function NodeCanvas() {
  // Subscribe to node UI data and edges
  const { nodeUiData, edges } = useEditorStoreWithEqualityFn(
    selectCanvasData,
    (a, b) =>
      JSON.stringify(a.nodeUiData) === JSON.stringify(b.nodeUiData) &&
      JSON.stringify(a.edges) === JSON.stringify(b.edges)
  );

  // Preserve RFNode object identity for unchanged items
  const cacheRef = useRef<Map<NodeId, RFNode>>(new Map());

  const nodes = useMemo(() => {
    const next = new Map<NodeId, RFNode>();
    const arr = nodeUiData
      .map(({ id, position, selected }) => {
        if (!isNodeId(id)) {
          return null;
        }
        const prev = cacheRef.current.get(id);
        if (
          prev &&
          prev.selected === selected &&
          prev.position.x === position.x &&
          prev.position.y === position.y
        ) {
          next.set(id, prev);
          return prev;
        }
        const node: RFNode = {
          id,
          type: 'workflow',
          position,
          selected,
          data: {},
        };
        next.set(id, node);
        return node;
      })
      .filter((node): node is RFNode => node !== null);
    cacheRef.current = next;
    return arr;
  }, [nodeUiData]);

  // Format edges for React Flow
  const formattedEdges = useMemo<RFEdge[]>(() => {
    return edges.map((edge) => ({
      ...edge,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: '#6366f1',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6366f1',
      },
    }));
  }, [edges]);

  // Store actions
  const setNodePosition = useEditorStore((s) => s.setNodePosition);
  const setNodeSelected = useEditorStore((s) => s.setNodeSelected);
  const setInspectedNodeId = useEditorStore((s) => s.setInspectedNodeId);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  // Handle node changes (position, selection)
  const onNodesChange = useCallback<OnNodesChange>(
    (changes) => {
      for (const change of changes) {
        switch (change.type) {
          case 'position': {
            if (isNodeId(change.id) && change.position) {
              setNodePosition(change.id, change.position);
            }
            break;
          }
          case 'select': {
            if (isNodeId(change.id)) {
              setNodeSelected(change.id, !!change.selected);
            }
            break;
          }
          case 'remove': {
            // Handle node removal if needed
            break;
          }
          default:
            break;
        }
      }
    },
    [setNodePosition, setNodeSelected]
  );

  // Handle node click for inspection
  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (isNodeId(node.id)) {
        setInspectedNodeId(node.id);
      }
    },
    [setInspectedNodeId]
  );

  // Handle pane click to clear selection
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={formattedEdges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.5,
        }}
        minZoom={0.1}
        maxZoom={2}
        className="!bg-transparent"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls
          className="!bg-bolt-elements-background-depth-2 !border-bolt-elements-borderColor !rounded-lg !shadow-lg"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-bolt-elements-background-depth-1 !border-bolt-elements-borderColor !rounded-lg"
          nodeColor={(node) => {
            return '#6366f1';
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}
