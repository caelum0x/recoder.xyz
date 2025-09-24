'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  TrendingUp,
  Activity,
  Users,
  Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  currentStep?: string;
  progress: number;
  duration?: number;
  error?: string;
  userId: string;
  userName?: string;
  logs: WorkflowLog[];
  variables: Record<string, any>;
  stepResults: Record<string, any>;
}

interface WorkflowLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  step?: string;
  message: string;
  data?: any;
}

interface WorkflowStats {
  totalExecutions: number;
  runningExecutions: number;
  successRate: number;
  averageDuration: number;
  executionsToday: number;
  topWorkflows: Array<{
    id: string;
    name: string;
    executions: number;
    successRate: number;
  }>;
}

export default function WorkflowMonitoring() {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshInterval, setRefreshInterval] = useState<number>(5000);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchExecutions();
    fetchStats();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchExecutions();
        fetchStats();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [autoRefresh, refreshInterval, statusFilter, workflowFilter, searchQuery]);

  const fetchExecutions = async () => {
    try {
      const params = new URLSearchParams({
        status: statusFilter !== 'all' ? statusFilter : '',
        workflow: workflowFilter !== 'all' ? workflowFilter : '',
        search: searchQuery,
        limit: '50'
      });

      const response = await fetch(`/api/workflow/executions?${params}`);
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
      }
    } catch (error) {
      console.error('Error fetching executions:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/workflow/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const cancelExecution = async (executionId: string) => {
    try {
      const response = await fetch(`/api/workflow/execution/${executionId}/cancel`, {
        method: 'POST'
      });
      
      if (response.ok) {
        fetchExecutions();
      }
    } catch (error) {
      console.error('Error cancelling execution:', error);
    }
  };

  const retryExecution = async (executionId: string) => {
    try {
      const response = await fetch(`/api/workflow/execution/${executionId}/retry`, {
        method: 'POST'
      });
      
      if (response.ok) {
        fetchExecutions();
      }
    } catch (error) {
      console.error('Error retrying execution:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'queued':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'cancelled':
        return <Square className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      running: { variant: 'default', className: 'bg-blue-100 text-blue-800' },
      completed: { variant: 'default', className: 'bg-green-100 text-green-800' },
      failed: { variant: 'destructive' },
      queued: { variant: 'default', className: 'bg-yellow-100 text-yellow-800' },
      cancelled: { variant: 'secondary' }
    };
    
    return (
      <Badge {...variants[status] || { variant: 'secondary' }}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const filteredExecutions = executions.filter(execution => {
    const matchesStatus = statusFilter === 'all' || execution.status === statusFilter;
    const matchesWorkflow = workflowFilter === 'all' || execution.workflowId === workflowFilter;
    const matchesSearch = !searchQuery || 
      execution.workflowName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      execution.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesWorkflow && matchesSearch;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflow Monitoring</h1>
          <p className="text-gray-600 mt-1">Monitor and manage workflow executions</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">Auto Refresh:</label>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          <Select value={refreshInterval.toString()} onValueChange={(value) => setRefreshInterval(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">1s</SelectItem>
              <SelectItem value="5000">5s</SelectItem>
              <SelectItem value="10000">10s</SelectItem>
              <SelectItem value="30000">30s</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalExecutions}</div>
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <TrendingUp className="w-3 h-3 mr-1" />
                {stats.executionsToday} today
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Running Now</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.runningExecutions}</div>
              <div className="flex items-center text-xs text-blue-500 mt-1">
                <Activity className="w-3 h-3 mr-1 animate-pulse" />
                Active workflows
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.successRate}%</div>
              <Progress value={stats.successRate} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDuration(stats.averageDuration)}</div>
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <Timer className="w-3 h-3 mr-1" />
                Per execution
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {stats.topWorkflows[0]?.name || 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.topWorkflows[0]?.executions || 0} executions
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-lg border">
        <div className="flex-1 min-w-64">
          <Input
            placeholder="Search executions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by workflow" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Workflows</SelectItem>
            {/* Add workflow options dynamically */}
          </SelectContent>
        </Select>
      </div>

      {/* Executions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExecutions.map((execution) => (
                <TableRow key={execution.id} className="cursor-pointer hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(execution.status)}
                      {getStatusBadge(execution.status)}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div>
                      <div className="font-medium">{execution.workflowName}</div>
                      <div className="text-xs text-gray-500">{execution.id}</div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="space-y-1">
                      <Progress value={execution.progress} className="w-20" />
                      <div className="text-xs text-gray-500">{execution.progress}%</div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      {new Date(execution.startedAt).toLocaleString()}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {formatDuration(execution.duration)}
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Users className="w-3 h-3" />
                      <span className="text-sm">{execution.userName || 'Unknown'}</span>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedExecution(execution)}
                          >
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>Execution Details</DialogTitle>
                          </DialogHeader>
                          <ExecutionDetails execution={selectedExecution} />
                        </DialogContent>
                      </Dialog>
                      
                      {execution.status === 'running' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelExecution(execution.id)}
                        >
                          <Pause className="w-3 h-3" />
                        </Button>
                      )}
                      
                      {execution.status === 'failed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryExecution(execution.id)}
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {filteredExecutions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No executions found matching the current filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Execution Details Component
function ExecutionDetails({ execution }: { execution: WorkflowExecution | null }) {
  if (!execution) return null;

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
        <TabsTrigger value="variables">Variables</TabsTrigger>
        <TabsTrigger value="results">Results</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Execution Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">ID:</span>
                <span className="font-mono text-sm">{execution.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Workflow:</span>
                <span>{execution.workflowName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Status:</span>
                {getStatusBadge(execution.status)}
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Progress:</span>
                <span>{execution.progress}%</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Current Step:</span>
                <span>{execution.currentStep || 'N/A'}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">Started:</span>
                <span>{new Date(execution.startedAt).toLocaleString()}</span>
              </div>
              {execution.completedAt && (
                <div className="flex justify-between">
                  <span className="font-medium">Completed:</span>
                  <span>{new Date(execution.completedAt).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-medium">Duration:</span>
                <span>{formatDuration(execution.duration)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {execution.error && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-red-600">Error Details</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-red-50 p-3 rounded border text-red-800 whitespace-pre-wrap">
                {execution.error}
              </pre>
            </CardContent>
          </Card>
        )}
      </TabsContent>
      
      <TabsContent value="logs">
        <Card>
          <CardHeader>
            <CardTitle>Execution Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {execution.logs.map((log, index) => (
                  <div 
                    key={index} 
                    className={`p-2 rounded text-sm border-l-4 ${
                      log.level === 'error' ? 'bg-red-50 border-red-400 text-red-800' :
                      log.level === 'warn' ? 'bg-yellow-50 border-yellow-400 text-yellow-800' :
                      log.level === 'debug' ? 'bg-gray-50 border-gray-400 text-gray-600' :
                      'bg-blue-50 border-blue-400 text-blue-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <div className="flex items-center space-x-2">
                        <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'}>
                          {log.level.toUpperCase()}
                        </Badge>
                        {log.step && (
                          <Badge variant="outline" className="text-xs">
                            {log.step}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>{log.message}</div>
                    {log.data && (
                      <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="variables">
        <Card>
          <CardHeader>
            <CardTitle>Execution Variables</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-gray-50 p-4 rounded border overflow-x-auto">
              {JSON.stringify(execution.variables, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="results">
        <Card>
          <CardHeader>
            <CardTitle>Step Results</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-gray-50 p-4 rounded border overflow-x-auto">
              {JSON.stringify(execution.stepResults, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function getStatusBadge(status: string) {
  const variants: Record<string, any> = {
    running: { variant: 'default', className: 'bg-blue-100 text-blue-800' },
    completed: { variant: 'default', className: 'bg-green-100 text-green-800' },
    failed: { variant: 'destructive' },
    queued: { variant: 'default', className: 'bg-yellow-100 text-yellow-800' },
    cancelled: { variant: 'secondary' }
  };
  
  return (
    <Badge {...variants[status] || { variant: 'secondary' }}>
      {status.toUpperCase()}
    </Badge>
  );
}

function formatDuration(ms?: number) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
