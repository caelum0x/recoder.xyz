'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useWorkflow } from '@/hooks/workflows/use-workflows';
import { useAddNode, useAddEdge } from '@/hooks/workflows/use-workflows';
import type { WorkflowNode, WorkflowEdge } from '@/lib/api/workflows';
import { AgentNode, ConditionNode, GenericNode } from './nodes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowCanvasProps {
  workflowId: string;
  onNodeSelect?: (nodeId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers: map backend models to React Flow models
// ---------------------------------------------------------------------------

function toFlowNode(wn: WorkflowNode): Node {
  return {
    id: wn.id,
    type: wn.node_type,
    position: { x: wn.position_x, y: wn.position_y },
    data: {
      label: wn.label,
      config: wn.config,
      nodeType: wn.node_type,
    },
  };
}

function toFlowEdge(we: WorkflowEdge): Edge {
  return {
    id: we.id,
    source: we.source_node_id,
    target: we.target_node_id,
    ...(we.condition ? { data: { condition: we.condition } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Registered node types (stable reference)
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  tool: GenericNode,
  loop: GenericNode,
  parallel: GenericNode,
  delay: GenericNode,
  approval: GenericNode,
  input: GenericNode,
  output: GenericNode,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowCanvas({ workflowId, onNodeSelect }: WorkflowCanvasProps) {
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const addNodeMutation = useAddNode(workflowId);
  const addEdgeMutation = useAddEdge(workflowId);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync backend data into React Flow state when it arrives / changes
  useEffect(() => {
    if (!workflow) return;
    setNodes(workflow.nodes.map(toFlowNode));
    setEdges(workflow.edges.map(toFlowEdge));
  }, [workflow, setNodes, setEdges]);

  // ------ Connection handling ------
  const onConnect = useCallback(
    (connection: Connection) => {
      // Optimistically add edge locally
      setEdges((eds) => addEdge(connection, eds));

      // Persist to backend
      if (connection.source && connection.target) {
        addEdgeMutation.mutate({
          source_node_id: connection.source,
          target_node_id: connection.target,
        });
      }
    },
    [setEdges, addEdgeMutation],
  );

  // ------ Drag & drop from palette ------
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const label =
        nodeType.charAt(0).toUpperCase() + nodeType.slice(1) + ' Node';

      addNodeMutation.mutate({
        node_type: nodeType as WorkflowNode['node_type'],
        label,
        config: {},
        position_x: position.x,
        position_y: position.y,
      });
    },
    [addNodeMutation, screenToFlowPosition],
  );

  // ------ Node click ------
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // ------ Loading skeleton ------
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" />
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading workflow...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange<Node>}
        onEdgesChange={onEdgesChange as OnEdgesChange<Edge>}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          className="!bottom-4 !right-4"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
}
