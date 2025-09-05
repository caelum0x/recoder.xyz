'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowCanvas } from './workflow-canvas';
import { NodePalette } from './node-palette';
import { IntegrationManager } from './integration-manager';
import { ExecutionMonitor } from './execution-monitor';
import { WorkflowSettings } from './workflow-settings';
import { 
  Play, 
  Pause, 
  Square, 
  Save, 
  Settings, 
  Zap, 
  GitBranch,
  Activity,
  Database,
  Key
} from 'lucide-react';

// Types for the integration hub
interface Integration {
  id: string;
  name: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  lastSync?: string;
  config?: any;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'error';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  lastRun?: string;
  runCount: number;
  successRate: number;
}

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'transform' | 'delay';
  provider: string;
  operation: string;
  position: { x: number; y: number };
  data: {
    label: string;
    config: any;
    status?: 'idle' | 'running' | 'success' | 'error';
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface ExecutionLog {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  logs: LogEntry[];
}

interface LogEntry {
  timestamp: string;
  nodeId: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  data?: any;
}

export function IntegrationHub() {
  // Main state management
  const [activeTab, setActiveTab] = useState('canvas');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // Load initial data
  useEffect(() => {
    loadIntegrations();
    loadWorkflows();
    loadExecutionLogs();
  }, []);

  const loadIntegrations = async () => {
    try {
      // Load connected integrations
      const providers = [
        'stripe', 'auth0', 'sendgrid', 'twilio', 'google', 
        'microsoft', 'github', 'slack', 'discord', 'aws'
      ];

      const integrationPromises = providers.map(async (provider) => {
        try {
          const response = await fetch(`/api/integrations/${provider}`);
          const data = await response.json();
          
          return {
            id: provider,
            name: data.service || provider,
            provider,
            status: data.status === 'operational' ? 'connected' : 'disconnected',
            lastSync: new Date().toISOString(),
            config: data
          } as Integration;
        } catch (error) {
          return {
            id: provider,
            name: provider,
            provider,
            status: 'error',
            config: null
          } as Integration;
        }
      });

      const loadedIntegrations = await Promise.all(integrationPromises);
      setIntegrations(loadedIntegrations);
    } catch (error) {
      console.error('Failed to load integrations:', error);
    }
  };

  const loadWorkflows = async () => {
    try {
      const response = await fetch('/api/integrations/workflow-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_workflows' })
      });
      
      const data = await response.json();
      if (data.success) {
        setWorkflows(data.result.workflows || []);
        if (data.result.workflows?.length > 0) {
          setSelectedWorkflow(data.result.workflows[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  };

  const loadExecutionLogs = async () => {
    try {
      const response = await fetch('/api/integrations/workflow-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_executions' })
      });
      
      const data = await response.json();
      if (data.success) {
        setExecutionLogs(data.result.executions || []);
      }
    } catch (error) {
      console.error('Failed to load execution logs:', error);
    }
  };

  // Workflow management functions
  const createNewWorkflow = useCallback(() => {
    const newWorkflow: Workflow = {
      id: crypto.randomUUID(),
      name: `Workflow ${workflows.length + 1}`,
      description: 'New integration workflow',
      status: 'draft',
      nodes: [],
      edges: [],
      runCount: 0,
      successRate: 0
    };

    setWorkflows(prev => [...prev, newWorkflow]);
    setSelectedWorkflow(newWorkflow);
  }, [workflows.length]);

  const saveWorkflow = useCallback(async () => {
    if (!selectedWorkflow) return;

    try {
      const response = await fetch('/api/integrations/workflow-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: selectedWorkflow.id ? 'update_workflow' : 'create_workflow',
          workflow_id: selectedWorkflow.id,
          data: selectedWorkflow
        })
      });

      const data = await response.json();
      if (data.success) {
        // Update local state
        setWorkflows(prev => 
          prev.map(w => w.id === selectedWorkflow.id ? data.result : w)
        );
        setSelectedWorkflow(data.result);
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
    }
  }, [selectedWorkflow]);

  const executeWorkflow = useCallback(async () => {
    if (!selectedWorkflow || isExecuting) return;

    setIsExecuting(true);
    try {
      const response = await fetch('/api/integrations/workflow-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_workflow',
          workflow_id: selectedWorkflow.id
        })
      });

      const data = await response.json();
      if (data.success) {
        // Start monitoring execution
        monitorExecution(data.result.id);
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
    } finally {
      setIsExecuting(false);
    }
  }, [selectedWorkflow, isExecuting]);

  const monitorExecution = useCallback(async (executionId: string) => {
    const pollExecution = async () => {
      try {
        const response = await fetch('/api/integrations/workflow-engine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_execution',
            execution_id: executionId
          })
        });

        const data = await response.json();
        if (data.success) {
          const execution = data.result;
          
          // Update execution logs
          setExecutionLogs(prev => {
            const existing = prev.find(log => log.id === executionId);
            if (existing) {
              return prev.map(log => 
                log.id === executionId ? execution : log
              );
            } else {
              return [...prev, execution];
            }
          });

          // Continue polling if still running
          if (execution.status === 'running') {
            setTimeout(pollExecution, 1000);
          }
        }
      } catch (error) {
        console.error('Failed to monitor execution:', error);
      }
    };

    pollExecution();
  }, []);

  const toggleWorkflowStatus = useCallback(async () => {
    if (!selectedWorkflow) return;

    const action = selectedWorkflow.status === 'active' ? 'pause_workflow' : 'resume_workflow';
    
    try {
      const response = await fetch('/api/integrations/workflow-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          workflow_id: selectedWorkflow.id
        })
      });

      const data = await response.json();
      if (data.success) {
        const newStatus = selectedWorkflow.status === 'active' ? 'paused' : 'active';
        setSelectedWorkflow(prev => prev ? { ...prev, status: newStatus } : null);
        setWorkflows(prev => 
          prev.map(w => w.id === selectedWorkflow.id ? { ...w, status: newStatus } : w)
        );
      }
    } catch (error) {
      console.error('Failed to toggle workflow status:', error);
    }
  }, [selectedWorkflow]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': case 'connected': case 'success': return 'bg-green-500';
      case 'paused': case 'connecting': case 'running': return 'bg-yellow-500';
      case 'error': case 'disconnected': case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar - Node Palette & Integration Manager */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-blue-600" />
              Integration Hub
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Connect and automate your services
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 mx-4 mt-4">
              <TabsTrigger value="palette" className="text-xs">
                <GitBranch className="h-3 w-3 mr-1" />
                Nodes
              </TabsTrigger>
              <TabsTrigger value="integrations" className="text-xs">
                <Key className="h-3 w-3 mr-1" />
                Connections
              </TabsTrigger>
              <TabsTrigger value="monitor" className="text-xs">
                <Activity className="h-3 w-3 mr-1" />
                Monitor
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="palette" className="h-full p-0 m-0">
                <NodePalette integrations={integrations as any} />
              </TabsContent>

              <TabsContent value="integrations" className="h-full p-0 m-0">
                <IntegrationManager 
                  integrations={integrations as any}
                  onIntegrationUpdate={setIntegrations}
                />
              </TabsContent>

              <TabsContent value="monitor" className="h-full p-0 m-0">
                <ExecutionMonitor 
                  executions={executionLogs as any}
                  selectedWorkflow={selectedWorkflow}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Workflow Selector */}
                <select
                  value={selectedWorkflow?.id || ''}
                  onChange={(e) => {
                    const workflow = workflows.find(w => w.id === e.target.value);
                    setSelectedWorkflow(workflow || null);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Workflow</option>
                  {workflows.map(workflow => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>

                <Button 
                  onClick={createNewWorkflow}
                  size="sm"
                  variant="outline"
                >
                  New Workflow
                </Button>

                {selectedWorkflow && (
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="secondary"
                      className={`${getStatusColor(selectedWorkflow.status)} text-white`}
                    >
                      {selectedWorkflow.status}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      Runs: {selectedWorkflow.runCount} | 
                      Success: {selectedWorkflow.successRate}%
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {selectedWorkflow && (
                  <>
                    <Button
                      onClick={executeWorkflow}
                      disabled={isExecuting || selectedWorkflow.status !== 'active'}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      {isExecuting ? 'Running...' : 'Execute'}
                    </Button>

                    <Button
                      onClick={toggleWorkflowStatus}
                      size="sm"
                      variant="outline"
                    >
                      {selectedWorkflow.status === 'active' ? (
                        <><Pause className="h-4 w-4 mr-1" />Pause</>
                      ) : (
                        <><Play className="h-4 w-4 mr-1" />Activate</>
                      )}
                    </Button>

                    <Button
                      onClick={saveWorkflow}
                      size="sm"
                      variant="outline"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab('settings')}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Main Canvas Area */}
          <div className="flex-1 relative">
            {selectedWorkflow ? (
              <WorkflowCanvas
                workflow={selectedWorkflow}
                onWorkflowChange={setSelectedWorkflow}
                integrations={integrations}
                executionLogs={executionLogs.filter(log => log.workflowId === selectedWorkflow.id)}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Database className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Workflow Selected
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Create a new workflow or select an existing one to start building integrations
                  </p>
                  <Button onClick={createNewWorkflow}>
                    Create New Workflow
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="bg-gray-100 border-t border-gray-200 px-4 py-2 text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>Integrations: {integrations.filter(i => i.status === 'connected').length}/{integrations.length}</span>
                <span>Active Workflows: {workflows.filter(w => w.status === 'active').length}</span>
                <span>Recent Executions: {executionLogs.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>System Operational</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}