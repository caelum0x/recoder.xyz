'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  ConnectionMode,
  Panel,
  Connection,
  NodeChange,
  EdgeChange,
  ReactFlowProvider,
  ReactFlowInstance,
  OnConnect,
  OnNodesChange,
  OnEdgesChange,
  NodeTypes,
  EdgeTypes
} from 'reactflow';
import { useDrop } from 'react-dnd';

import { TriggerNode } from './nodes/trigger-node';
import { ActionNode } from './nodes/action-node';
import { ConditionNode } from './nodes/condition-node';
import { TransformNode } from './nodes/transform-node';
import { DelayNode } from './nodes/delay-node';
import { CustomEdge } from './edges/custom-edge';
import { NodeConfigPanel } from './node-config-panel';

import 'reactflow/dist/style.css';

// Define custom node types
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  transform: TransformNode,
  delay: DelayNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

interface WorkflowCanvasProps {
  workflow: any;
  onWorkflowChange: (workflow: any) => void;
  integrations: any[];
  executionLogs: any[];
}

interface DroppedNode {
  type: string;
  provider: string;
  operation: string;
  label: string;
  position: { x: number; y: number };
}

export function WorkflowCanvas({ 
  workflow, 
  onWorkflowChange, 
  integrations,
  executionLogs 
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // Initialize nodes and edges from workflow
  const initialNodes: Node[] = useMemo(() => {
    return workflow?.nodes?.map((node: any) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        ...node.data,
        provider: node.provider,
        operation: node.operation,
        onEdit: (nodeId: string) => {
          const node = nodes.find(n => n.id === nodeId);
          if (node) {
            setSelectedNode(node);
            setShowConfigPanel(true);
          }
        },
        onDelete: (nodeId: string) => {
          onNodesChange([{ type: 'remove', id: nodeId }]);
        }
      },
    })) || [];
  }, [workflow?.nodes]);

  const initialEdges: Edge[] = useMemo(() => {
    return workflow?.edges?.map((edge: any) => ({
      ...edge,
      type: 'custom',
      animated: true,
    })) || [];
  }, [workflow?.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update workflow when nodes or edges change
  useEffect(() => {
    if (workflow) {
      const updatedWorkflow = {
        ...workflow,
        nodes: nodes.map(node => ({
          id: node.id,
          type: node.type,
          provider: node.data.provider,
          operation: node.data.operation,
          position: node.position,
          data: node.data,
          connections: edges
            .filter(edge => edge.source === node.id)
            .map(edge => edge.target)
        })),
        edges: edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        }))
      };
      
      onWorkflowChange(updatedWorkflow);
    }
  }, [nodes, edges, onWorkflowChange]);

  // Handle node drag over
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'integration-node',
    drop: (item: DroppedNode, monitor) => {
      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: clientOffset.x - reactFlowBounds.left,
        y: clientOffset.y - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `${item.type}-${Date.now()}`,
        type: item.type,
        position,
        data: {
          label: item.label,
          provider: item.provider,
          operation: item.operation,
          config: {},
          status: 'idle',
          onEdit: (nodeId: string) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
              setSelectedNode(node);
              setShowConfigPanel(true);
            }
          },
          onDelete: (nodeId: string) => {
            setNodes(nds => nds.filter(n => n.id !== nodeId));
          }
        },
      };

      setNodes(nds => [...nds, newNode]);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }), [reactFlowInstance, nodes]);

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      const edge: Edge = {
        ...params,
        id: `edge-${params.source}-${params.target}`,
        type: 'custom',
        animated: true,
      };
      setEdges(eds => addEdge(edge, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setShowConfigPanel(true);
  }, []);

  // Handle execution status updates
  useEffect(() => {
    if (executionLogs.length > 0) {
      const latestExecution = executionLogs[executionLogs.length - 1];
      
      if (latestExecution.status === 'running') {
        // Update node status based on execution log
        setNodes(nodes => 
          nodes.map(node => {
            const logEntry = latestExecution.execution_log?.find(
              (log: any) => log.node_id === node.id
            );
            
            if (logEntry) {
              return {
                ...node,
                data: {
                  ...node.data,
                  status: logEntry.status === 'completed' ? 'success' : 
                          logEntry.status === 'failed' ? 'error' : 'running'
                }
              };
            }
            
            return node;
          })
        );
      } else {
        // Reset all node statuses
        setNodes(nodes => 
          nodes.map(node => ({
            ...node,
            data: { ...node.data, status: 'idle' }
          }))
        );
      }
    }
  }, [executionLogs, setNodes]);

  const handleNodeConfigSave = useCallback((nodeId: string, config: any) => {
    setNodes(nodes => 
      nodes.map(node => 
        node.id === nodeId 
          ? { ...node, data: { ...node.data, config } }
          : node
      )
    );
    setShowConfigPanel(false);
    setSelectedNode(null);
  }, [setNodes]);

  const handleNodeConfigCancel = useCallback(() => {
    setShowConfigPanel(false);
    setSelectedNode(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNode) {
          setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
          setSelectedNode(null);
        }
      }
      
      if (event.key === 'Escape') {
        setSelectedNode(null);
        setShowConfigPanel(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, setNodes]);

  const panOnDrag = [1, 2]; // Allow panning with left and middle mouse buttons

  return (
    <div className="h-full w-full relative" ref={reactFlowWrapper}>
      <div 
        ref={drop} 
        className={`h-full ${isOver ? 'bg-blue-50' : ''}`}
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            panOnDrag={panOnDrag}
            attributionPosition="bottom-left"
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={20} 
              size={1}
              color="#e5e7eb"
            />
            
            <Controls 
              position="top-left"
              showInteractive={false}
              className="bg-white border border-gray-200 rounded-lg"
            />
            
            <MiniMap 
              position="top-right"
              className="bg-white border border-gray-200 rounded-lg"
              nodeColor={(node) => {
                switch (node.type) {
                  case 'trigger': return '#10b981';
                  case 'action': return '#3b82f6';
                  case 'condition': return '#f59e0b';
                  case 'transform': return '#8b5cf6';
                  case 'delay': return '#6b7280';
                  default: return '#9ca3af';
                }
              }}
            />

            {/* Instructions Panel */}
            {nodes.length === 0 && (
              <Panel position="center">
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-lg max-w-md">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Start Building Your Workflow
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Drag integration nodes from the sidebar to create your automation workflow.
                  </p>
                  <div className="space-y-2 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      <span>Trigger nodes start the workflow</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span>Action nodes perform operations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                      <span>Condition nodes add logic</span>
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* Execution Status Panel */}
            {executionLogs.length > 0 && (
              <Panel position="bottom-center">
                <div className="bg-white px-4 py-2 rounded-full border border-gray-200 shadow-sm">
                  {executionLogs[executionLogs.length - 1].status === 'running' ? (
                    <div className="flex items-center gap-2 text-blue-600">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium">Workflow Executing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">
                        Last execution: {executionLogs[executionLogs.length - 1].status}
                      </span>
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* Node Configuration Panel */}
      {showConfigPanel && selectedNode && (
        <div className="absolute top-0 right-0 w-96 h-full bg-white border-l border-gray-200 shadow-lg z-50">
          <NodeConfigPanel
            node={selectedNode}
            integrations={integrations}
            onSave={handleNodeConfigSave}
            onCancel={handleNodeConfigCancel}
          />
        </div>
      )}
      
      {/* Drop Zone Overlay */}
      {isOver && (
        <div className="absolute inset-0 bg-blue-100 bg-opacity-50 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none z-10">
          <div className="text-blue-600 text-xl font-semibold">
            Drop here to add node
          </div>
        </div>
      )}
    </div>
  );
}