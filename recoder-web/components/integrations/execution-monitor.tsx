'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, 
  Square, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Activity,
  AlertTriangle,
  RotateCcw,
  Eye,
  Download,
  Filter,
  Search,
  ArrowRight
} from 'lucide-react';

interface ExecutionMonitorProps {
  executions: ExecutionLog[];
  selectedWorkflow: any;
}

interface ExecutionLog {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  logs: LogEntry[];
  variables?: Record<string, any>;
  currentNode?: string;
}

interface LogEntry {
  timestamp: string;
  nodeId: string;
  nodeType: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  data?: any;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  duration?: number;
}

const statusIcons = {
  running: <Play className="h-4 w-4 text-blue-600" />,
  completed: <CheckCircle className="h-4 w-4 text-green-600" />,
  failed: <XCircle className="h-4 w-4 text-red-600" />,
  paused: <Square className="h-4 w-4 text-yellow-600" />
};

const statusColors = {
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  paused: 'bg-yellow-100 text-yellow-800 border-yellow-200'
};

const logLevelColors = {
  info: 'text-blue-600',
  warning: 'text-yellow-600',
  error: 'text-red-600'
};

export function ExecutionMonitor({ executions, selectedWorkflow }: ExecutionMonitorProps) {
  const [selectedExecution, setSelectedExecution] = useState<ExecutionLog | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  // Filter executions
  const filteredExecutions = executions.filter(execution => {
    if (filter === 'all') return true;
    return execution.status === filter;
  });

  // Get real-time execution stats
  const runningExecutions = executions.filter(e => e.status === 'running').length;
  const completedExecutions = executions.filter(e => e.status === 'completed').length;
  const failedExecutions = executions.filter(e => e.status === 'failed').length;

  // Auto-select latest execution if none selected
  useEffect(() => {
    if (!selectedExecution && filteredExecutions.length > 0) {
      setSelectedExecution(filteredExecutions[0]);
    }
  }, [filteredExecutions, selectedExecution]);

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000);
    
    if (duration < 60) {
      return `${duration}s`;
    } else if (duration < 3600) {
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    } else {
      return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
    }
  };

  const getExecutionProgress = (execution: ExecutionLog) => {
    if (!selectedWorkflow?.nodes) return 0;
    
    const totalNodes = selectedWorkflow.nodes.length;
    const completedNodes = execution.logs.filter(log => 
      log.status === 'completed' || log.status === 'failed'
    ).length;
    
    return Math.floor((completedNodes / totalNodes) * 100);
  };

  const exportExecutionLogs = (execution: ExecutionLog) => {
    const logData = {
      execution_id: execution.id,
      workflow_id: execution.workflowId,
      status: execution.status,
      started_at: execution.startedAt,
      completed_at: execution.completedAt,
      duration: formatDuration(execution.startedAt, execution.completedAt),
      logs: execution.logs,
      variables: execution.variables
    };
    
    const blob = new Blob([JSON.stringify(logData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-${execution.id}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const retryExecution = async (execution: ExecutionLog) => {
    try {
      const response = await fetch('/api/integrations/workflow-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_workflow',
          workflow_id: execution.workflowId
        })
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('Workflow retry initiated:', data.result.id);
      }
    } catch (error) {
      console.error('Failed to retry workflow:', error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header Stats */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Execution Monitor</h3>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <Play className="h-3 w-3 text-blue-600" />
              <span className="text-xs font-medium text-blue-900">{runningExecutions}</span>
            </div>
            <p className="text-xs text-blue-600">Running</p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-600" />
              <span className="text-xs font-medium text-green-900">{completedExecutions}</span>
            </div>
            <p className="text-xs text-green-600">Completed</p>
          </div>
          
          <div className="bg-red-50 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-600" />
              <span className="text-xs font-medium text-red-900">{failedExecutions}</span>
            </div>
            <p className="text-xs text-red-600">Failed</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1">
            {(['all', 'running', 'completed', 'failed'] as const).map((status) => (
              <Button
                key={status}
                variant={filter === status ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilter(status)}
                className="h-7 text-xs capitalize"
              >
                {status} ({executions.filter(e => status === 'all' || e.status === status).length})
              </Button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="h-7 text-xs"
            >
              <Activity className={`h-3 w-3 mr-1 ${autoRefresh ? 'animate-pulse text-green-600' : 'text-gray-400'}`} />
              Auto Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Execution List */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Execution List */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {filteredExecutions.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No executions found</p>
                  <p className="text-xs text-gray-400">
                    {filter !== 'all' ? `No ${filter} executions` : 'Execute a workflow to see logs'}
                  </p>
                </div>
              ) : (
                filteredExecutions.map(execution => (
                  <Card 
                    key={execution.id} 
                    className={`p-3 cursor-pointer transition-all ${
                      selectedExecution?.id === execution.id 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedExecution(execution)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {statusIcons[execution.status]}
                        <Badge variant="secondary" className={`text-xs ${statusColors[execution.status]}`}>
                          {execution.status}
                        </Badge>
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        {formatDuration(execution.startedAt, execution.completedAt)}
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-600 mb-2">
                      Started: {new Date(execution.startedAt).toLocaleString()}
                    </div>
                    
                    {execution.status === 'running' && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{getExecutionProgress(execution)}%</span>
                        </div>
                        <Progress value={getExecutionProgress(execution)} className="h-1" />
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500">
                      {execution.logs.length} log entries
                      {execution.currentNode && (
                        <span> • Current: {execution.currentNode}</span>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Execution Details */}
        <div className="w-1/2 flex flex-col">
          {selectedExecution ? (
            <>
              {/* Execution Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-900">
                    Execution Details
                  </h4>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => exportExecutionLogs(selectedExecution)}
                      className="h-7 text-xs"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Export
                    </Button>
                    
                    {selectedExecution.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => retryExecution(selectedExecution)}
                        className="h-7 text-xs"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-xs text-gray-600">
                  <div className="flex items-center gap-1">
                    {statusIcons[selectedExecution.status]}
                    <span className="capitalize">{selectedExecution.status}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(selectedExecution.startedAt, selectedExecution.completedAt)}</span>
                  </div>
                  
                  <div>{selectedExecution.logs.length} steps</div>
                </div>
              </div>

              {/* Execution Logs */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {selectedExecution.logs.length === 0 ? (
                    <div className="text-center py-8">
                      <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No logs available</p>
                    </div>
                  ) : (
                    selectedExecution.logs.map((log, index) => (
                      <div key={index} className="relative">
                        {/* Timeline connector */}
                        {index < selectedExecution.logs.length - 1 && (
                          <div className="absolute left-4 top-8 w-px h-6 bg-gray-200"></div>
                        )}
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            {log.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                            {log.status === 'failed' && <XCircle className="h-4 w-4 text-red-600" />}
                            {log.status === 'started' && <Play className="h-4 w-4 text-blue-600" />}
                            {log.status === 'skipped' && <ArrowRight className="h-4 w-4 text-gray-600" />}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {log.nodeType}: {log.nodeId}
                                </span>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {log.status}
                                </Badge>
                                {log.level !== 'info' && (
                                  <Badge variant="outline" className={`text-xs ${logLevelColors[log.level]}`}>
                                    {log.level}
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="text-xs text-gray-500">
                                {new Date(log.timestamp).toLocaleTimeString()}
                                {log.duration && <span> • {log.duration}ms</span>}
                              </div>
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-2">
                              {log.message}
                            </p>
                            
                            {log.data && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                                  View data
                                </summary>
                                <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                                  {JSON.stringify(log.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Variables Panel */}
              {selectedExecution.variables && Object.keys(selectedExecution.variables).length > 0 && (
                <div className="border-t border-gray-200 p-4">
                  <h5 className="text-sm font-medium text-gray-900 mb-2">Execution Variables</h5>
                  <div className="bg-gray-50 rounded p-3 text-xs">
                    <pre className="overflow-x-auto">
                      {JSON.stringify(selectedExecution.variables, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Eye className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Select an execution to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}