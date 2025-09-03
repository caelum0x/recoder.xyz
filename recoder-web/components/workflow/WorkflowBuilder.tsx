'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Play, Save, Settings, Trash2, Copy, Link, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'parallel' | 'delay' | 'webhook' | 'ai_process' | 'media_process';
  name: string;
  description?: string;
  config: Record<string, any>;
  position: { x: number; y: number };
  connections: string[];
}

interface WorkflowCanvas {
  nodes: WorkflowNode[];
  connections: Array<{ from: string; to: string; condition?: string }>;
}

const NODE_TYPES = {
  trigger: { icon: '⚡', color: 'bg-green-100 border-green-300', label: 'Trigger' },
  action: { icon: '⚙️', color: 'bg-blue-100 border-blue-300', label: 'Action' },
  condition: { icon: '🔀', color: 'bg-yellow-100 border-yellow-300', label: 'Condition' },
  parallel: { icon: '🔄', color: 'bg-purple-100 border-purple-300', label: 'Parallel' },
  delay: { icon: '⏱️', color: 'bg-gray-100 border-gray-300', label: 'Delay' },
  webhook: { icon: '🌐', color: 'bg-indigo-100 border-indigo-300', label: 'Webhook' },
  ai_process: { icon: '🤖', color: 'bg-pink-100 border-pink-300', label: 'AI Process' },
  media_process: { icon: '🎬', color: 'bg-orange-100 border-orange-300', label: 'Media Process' }
};

export default function WorkflowBuilder() {
  const [workflow, setWorkflow] = useState<WorkflowCanvas>({
    nodes: [],
    connections: []
  });
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<any[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const addNode = useCallback((type: string, position?: { x: number; y: number }) => {
    const nodeType = NODE_TYPES[type as keyof typeof NODE_TYPES];
    if (!nodeType) return;

    const newNode: WorkflowNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: type as any,
      name: `${nodeType.label} ${workflow.nodes.length + 1}`,
      config: getDefaultConfig(type),
      position: position || { x: 100, y: 100 + workflow.nodes.length * 120 },
      connections: []
    };

    setWorkflow(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  }, [workflow.nodes.length]);

  const getDefaultConfig = (type: string) => {
    switch (type) {
      case 'trigger':
        return { type: 'manual', config: {} };
      case 'action':
        return { action: 'http_request', parameters: {} };
      case 'condition':
        return { condition: '', trueStep: '', falseStep: '' };
      case 'delay':
        return { duration: 1000 };
      case 'webhook':
        return { url: '', method: 'POST' };
      case 'ai_process':
        return { operation: 'text_generation', parameters: {} };
      case 'media_process':
        return { operation: 'video_process', parameters: {} };
      default:
        return {};
    }
  };

  const updateNodeConfig = (nodeId: string, config: Record<string, any>) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === nodeId ? { ...node, config } : node
      )
    }));
  };

  const updateNodePosition = (nodeId: string, position: { x: number; y: number }) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === nodeId ? { ...node, position } : node
      )
    }));
  };

  const deleteNode = (nodeId: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.filter(node => node.id !== nodeId),
      connections: prev.connections.filter(conn => 
        conn.from !== nodeId && conn.to !== nodeId
      )
    }));
    setSelectedNode(null);
  };

  const connectNodes = (fromId: string, toId: string) => {
    setWorkflow(prev => ({
      ...prev,
      connections: [...prev.connections, { from: fromId, to: toId }]
    }));
  };

  const saveWorkflow = async () => {
    if (!workflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    try {
      const workflowDefinition = {
        version: '1.0',
        name: workflowName,
        description: workflowDescription,
        triggers: workflow.nodes
          .filter(node => node.type === 'trigger')
          .map(node => ({
            type: node.config.type,
            config: node.config.config
          })),
        steps: workflow.nodes
          .filter(node => node.type !== 'trigger')
          .map(node => ({
            id: node.id,
            type: node.type,
            name: node.name,
            description: node.description,
            config: node.config,
            dependencies: workflow.connections
              .filter(conn => conn.to === node.id)
              .map(conn => conn.from)
          }))
      };

      const response = await fetch('/api/workflow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowDefinition)
      });

      if (response.ok) {
        toast.success('Workflow saved successfully!');
      } else {
        throw new Error('Failed to save workflow');
      }
    } catch (error) {
      toast.error('Failed to save workflow');
      console.error(error);
    }
  };

  const executeWorkflow = async () => {
    if (workflow.nodes.length === 0) {
      toast.error('Please add nodes to the workflow');
      return;
    }

    setIsExecuting(true);
    setExecutionLog([]);

    try {
      // First save the workflow
      await saveWorkflow();

      // Then execute it
      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'temp', // For test execution
          variables: {}
        })
      });

      if (response.ok) {
        const { executionId } = await response.json();
        toast.success('Workflow execution started!');
        
        // Monitor execution progress
        monitorExecution(executionId);
      } else {
        throw new Error('Failed to start workflow execution');
      }
    } catch (error) {
      toast.error('Failed to execute workflow');
      console.error(error);
    } finally {
      setIsExecuting(false);
    }
  };

  const monitorExecution = async (executionId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/workflow/execution/${executionId}`);
        if (response.ok) {
          const execution = await response.json();
          setExecutionLog(execution.logs || []);
          
          if (execution.status === 'completed' || execution.status === 'failed') {
            clearInterval(interval);
            toast.success(`Workflow ${execution.status}!`);
          }
        }
      } catch (error) {
        console.error('Error monitoring execution:', error);
        clearInterval(interval);
      }
    }, 1000);
  };

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    setDraggedNode(nodeId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedNode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    updateNodePosition(draggedNode, { x, y });
    setDraggedNode(null);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <Input
              placeholder="Workflow Name"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="font-semibold text-lg"
            />
            <Input
              placeholder="Description (optional)"
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              className="mt-1 text-sm text-gray-600"
            />
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={saveWorkflow}>
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
          <Button 
            onClick={executeWorkflow} 
            disabled={isExecuting}
            className="bg-green-600 hover:bg-green-700"
          >
            <Play className="w-4 h-4 mr-2" />
            {isExecuting ? 'Executing...' : 'Execute'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Node Palette */}
        <div className="w-64 bg-white border-r p-4">
          <h3 className="font-semibold mb-4">Workflow Nodes</h3>
          <div className="space-y-2">
            {Object.entries(NODE_TYPES).map(([type, info]) => (
              <Button
                key={type}
                variant="outline"
                className="w-full justify-start"
                onClick={() => addNode(type)}
              >
                <span className="mr-2">{info.icon}</span>
                {info.label}
              </Button>
            ))}
          </div>

          {/* Quick Templates */}
          <div className="mt-8">
            <h4 className="font-medium mb-3">Quick Templates</h4>
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => {
                  // Add a simple CI/CD template
                  addNode('trigger', { x: 50, y: 50 });
                  addNode('action', { x: 50, y: 200 });
                  addNode('condition', { x: 50, y: 350 });
                }}
              >
                CI/CD Pipeline
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => {
                  // Add a media processing template
                  addNode('trigger', { x: 50, y: 50 });
                  addNode('media_process', { x: 50, y: 200 });
                  addNode('webhook', { x: 50, y: 350 });
                }}
              >
                Media Pipeline
              </Button>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <div
            ref={canvasRef}
            className="absolute inset-0 bg-gray-50"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-20">
              {Array.from({ length: 50 }).map((_, i) => (
                <div key={i} className="flex">
                  {Array.from({ length: 50 }).map((_, j) => (
                    <div
                      key={j}
                      className="w-8 h-8 border-gray-200 border-r border-b"
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Connection Lines */}
            <svg className="absolute inset-0 pointer-events-none">
              {workflow.connections.map((connection, index) => {
                const fromNode = workflow.nodes.find(n => n.id === connection.from);
                const toNode = workflow.nodes.find(n => n.id === connection.to);
                
                if (!fromNode || !toNode) return null;
                
                return (
                  <line
                    key={index}
                    x1={fromNode.position.x + 100}
                    y1={fromNode.position.y + 30}
                    x2={toNode.position.x + 100}
                    y2={toNode.position.y + 30}
                    stroke="#3b82f6"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                  />
                );
              })}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3.5, 0 7"
                    fill="#3b82f6"
                  />
                </marker>
              </defs>
            </svg>

            {/* Workflow Nodes */}
            {workflow.nodes.map((node) => {
              const nodeInfo = NODE_TYPES[node.type];
              return (
                <Card
                  key={node.id}
                  className={`absolute w-48 cursor-move ${nodeInfo.color} ${
                    selectedNode?.id === node.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  style={{
                    left: node.position.x,
                    top: node.position.y
                  }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.id)}
                  onClick={() => setSelectedNode(node)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{nodeInfo.icon}</span>
                        <CardTitle className="text-sm">{node.name}</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNode(node.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Badge variant="secondary" className="text-xs">
                      {nodeInfo.label}
                    </Badge>
                    {node.description && (
                      <p className="text-xs text-gray-600 mt-1">
                        {node.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Properties Panel */}
        {selectedNode && (
          <div className="w-80 bg-white border-l p-4 overflow-y-auto">
            <NodePropertiesPanel
              node={selectedNode}
              onUpdate={(config) => updateNodeConfig(selectedNode.id, config)}
              onConnect={(targetId) => connectNodes(selectedNode.id, targetId)}
              availableNodes={workflow.nodes.filter(n => n.id !== selectedNode.id)}
            />
          </div>
        )}
      </div>

      {/* Execution Log */}
      {executionLog.length > 0 && (
        <div className="h-48 bg-white border-t p-4">
          <h3 className="font-semibold mb-2">Execution Log</h3>
          <div className="h-32 overflow-y-auto font-mono text-sm">
            {executionLog.map((log, index) => (
              <div key={index} className={`mb-1 ${
                log.level === 'error' ? 'text-red-600' : 
                log.level === 'warn' ? 'text-yellow-600' : 
                'text-gray-700'
              }`}>
                <span className="text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {log.step && <span className="text-blue-600 ml-2">[{log.step}]</span>}
                <span className="ml-2">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Node Properties Panel Component
function NodePropertiesPanel({ 
  node, 
  onUpdate, 
  onConnect, 
  availableNodes 
}: {
  node: WorkflowNode;
  onUpdate: (config: Record<string, any>) => void;
  onConnect: (targetId: string) => void;
  availableNodes: WorkflowNode[];
}) {
  const [config, setConfig] = useState(node.config);

  useEffect(() => {
    setConfig(node.config);
  }, [node.config]);

  const handleConfigChange = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdate(newConfig);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Node Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onUpdate({ ...config, name: e.target.value })}
        />
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          value={node.description || ''}
          onChange={(e) => onUpdate({ ...config, description: e.target.value })}
          placeholder="Optional description"
        />
      </div>

      {/* Type-specific configuration */}
      {node.type === 'action' && (
        <ActionNodeConfig config={config} onChange={handleConfigChange} />
      )}
      
      {node.type === 'condition' && (
        <ConditionNodeConfig config={config} onChange={handleConfigChange} />
      )}
      
      {node.type === 'delay' && (
        <DelayNodeConfig config={config} onChange={handleConfigChange} />
      )}
      
      {node.type === 'webhook' && (
        <WebhookNodeConfig config={config} onChange={handleConfigChange} />
      )}
      
      {node.type === 'ai_process' && (
        <AINodeConfig config={config} onChange={handleConfigChange} />
      )}
      
      {node.type === 'media_process' && (
        <MediaNodeConfig config={config} onChange={handleConfigChange} />
      )}

      {/* Connections */}
      <div>
        <Label>Connect to</Label>
        <Select onValueChange={onConnect}>
          <SelectTrigger>
            <SelectValue placeholder="Select target node" />
          </SelectTrigger>
          <SelectContent>
            {availableNodes.map((targetNode) => (
              <SelectItem key={targetNode.id} value={targetNode.id}>
                {targetNode.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Configuration components for different node types
function ActionNodeConfig({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Action Type</Label>
        <Select value={config.action} onValueChange={(value) => onChange('action', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http_request">HTTP Request</SelectItem>
            <SelectItem value="file_operation">File Operation</SelectItem>
            <SelectItem value="deploy_project">Deploy Project</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {config.action === 'http_request' && (
        <>
          <div>
            <Label>URL</Label>
            <Input
              value={config.parameters?.url || ''}
              onChange={(e) => onChange('parameters', { ...config.parameters, url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
            />
          </div>
          <div>
            <Label>Method</Label>
            <Select 
              value={config.parameters?.method || 'GET'} 
              onValueChange={(value) => onChange('parameters', { ...config.parameters, method: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}

function ConditionNodeConfig({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Condition</Label>
        <Input
          value={config.condition || ''}
          onChange={(e) => onChange('condition', e.target.value)}
          placeholder="e.g., status === 'success'"
        />
      </div>
    </div>
  );
}

function DelayNodeConfig({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div>
      <Label>Duration (ms)</Label>
      <Input
        type="number"
        value={config.duration || 1000}
        onChange={(e) => onChange('duration', parseInt(e.target.value))}
      />
    </div>
  );
}

function WebhookNodeConfig({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>URL</Label>
        <Input
          value={config.url || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://webhook.example.com"
        />
      </div>
      <div>
        <Label>Method</Label>
        <Select value={config.method || 'POST'} onValueChange={(value) => onChange('method', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AINodeConfig({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Operation</Label>
        <Select value={config.operation} onValueChange={(value) => onChange('operation', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text_generation">Text Generation</SelectItem>
            <SelectItem value="code_generation">Code Generation</SelectItem>
            <SelectItem value="analysis">Analysis</SelectItem>
            <SelectItem value="optimization">Optimization</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function MediaNodeConfig({ config, onChange }: { config: any; onChange: (key: string, value: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Operation</Label>
        <Select value={config.operation} onValueChange={(value) => onChange('operation', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="video_process">Video Processing</SelectItem>
            <SelectItem value="audio_process">Audio Processing</SelectItem>
            <SelectItem value="image_process">Image Processing</SelectItem>
            <SelectItem value="thumbnail_generate">Generate Thumbnail</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Input Path</Label>
        <Input
          value={config.inputPath || ''}
          onChange={(e) => onChange('inputPath', e.target.value)}
          placeholder="/path/to/input/file"
        />
      </div>
    </div>
  );
}
