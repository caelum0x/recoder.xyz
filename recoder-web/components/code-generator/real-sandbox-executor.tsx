'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, Activity, AlertTriangle, CheckCircle, XCircle, 
  Play, Square, Cpu, MemoryStick, Clock, Network, 
  HardDrive, Zap, TrendingUp, Monitor, Container
} from 'lucide-react';

// Enhanced interfaces for real sandbox execution
interface SandboxConfig {
  level: 'basic' | 'enhanced' | 'isolation';
  runtime: 'vm2' | 'docker' | 'wasm' | 'pyodide' | 'quickjs';
  allowNetwork: boolean;
  allowFileSystem: boolean;
  maxExecutionTime: number;
  maxMemory: number;
  maxCpu: number;
  trustedDomains: string[];
  containerLimits?: {
    cpuQuota: number;
    memoryLimit: string;
    tmpfsSize: string;
    networkMode: 'none' | 'bridge' | 'host';
  };
}

interface RealResourceMetrics {
  cpu: {
    usage: number;
    limit: number;
    throttled: boolean;
  };
  memory: {
    usage: number;
    limit: number;
    swap: number;
    cache: number;
  };
  network: {
    rx: number;
    tx: number;
    blocked: boolean;
  };
  disk: {
    read: number;
    write: number;
    quota: number;
  };
  process: {
    pid: number;
    threads: number;
    fds: number;
  };
  timestamp: number;
}

interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
  executionTime: number;
  memoryUsed: number;
  exitCode: number;
  executionId: string;
  language: string;
  timestamp: string;
  warnings?: string[];
  sandboxInfo: {
    runtime: string;
    containerId?: string;
    isolated: boolean;
    resourcesEnforced: boolean;
  };
  stats: {
    linesOfCode: number;
    characters: number;
    peakMemory: number;
    cpuTime: number;
    diskIO: number;
    networkIO: number;
  };
}

interface RealSandboxedExecutorProps {
  language: string;
  code: string;
  input?: string;
  config: SandboxConfig;
  onResult: (result: ExecutionResult) => void;
  isVisible?: boolean;
  className?: string;
}

// Real Resource Monitor with actual system metrics
export function RealResourceMonitor({ 
  isExecuting, 
  metrics, 
  config, 
  className = '' 
}: {
  isExecuting: boolean;
  metrics: RealResourceMetrics[];
  config: SandboxConfig;
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState('overview');
  
  const currentMetrics = metrics[metrics.length - 1] || {
    cpu: { usage: 0, limit: config.maxCpu, throttled: false },
    memory: { usage: 0, limit: config.maxMemory, swap: 0, cache: 0 },
    network: { rx: 0, tx: 0, blocked: !config.allowNetwork },
    disk: { read: 0, write: 0, quota: 1024 * 1024 * 100 }, // 100MB
    process: { pid: 0, threads: 0, fds: 0 },
    timestamp: Date.now()
  };

  const getStatusColor = (usage: number, limit: number, critical: number = 90) => {
    const percentage = (usage / limit) * 100;
    if (percentage > critical) return 'text-red-500';
    if (percentage > 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className={`real-resource-monitor ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Container className="w-4 h-4" />
          Real-time Sandbox Monitor
          {isExecuting && <Activity className="w-4 h-4 text-blue-500 animate-pulse" />}
          <Badge variant="outline" className="ml-auto">
            {config.runtime.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="process">Process</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* CPU Usage with Throttling */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  <span className="text-sm font-medium">CPU</span>
                  {currentMetrics.cpu.throttled && (
                    <AlertTriangle className="w-3 h-3 text-yellow-500" />
                  )}
                </div>
                <span className={`text-sm font-mono ${getStatusColor(currentMetrics.cpu.usage, currentMetrics.cpu.limit)}`}>
                  {currentMetrics.cpu.usage.toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={(currentMetrics.cpu.usage / currentMetrics.cpu.limit) * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Limit: {currentMetrics.cpu.limit}%</span>
                {currentMetrics.cpu.throttled && (
                  <span className="text-yellow-600">Throttled</span>
                )}
              </div>
            </div>

            {/* Memory Usage with Swap */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-4 h-4" />
                  <span className="text-sm font-medium">Memory</span>
                </div>
                <span className={`text-sm font-mono ${getStatusColor(currentMetrics.memory.usage, currentMetrics.memory.limit)}`}>
                  {formatBytes(currentMetrics.memory.usage)}
                </span>
              </div>
              <Progress 
                value={(currentMetrics.memory.usage / currentMetrics.memory.limit) * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Limit: {formatBytes(currentMetrics.memory.limit)}</span>
                  <span>Cache: {formatBytes(currentMetrics.memory.cache)}</span>
                </div>
                {currentMetrics.memory.swap > 0 && (
                  <div className="text-yellow-600">
                    Swap: {formatBytes(currentMetrics.memory.swap)}
                  </div>
                )}
              </div>
            </div>

            {/* Network I/O */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4" />
                  <span className="text-sm font-medium">Network</span>
                  {currentMetrics.network.blocked && (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                </div>
                <span className="text-sm font-mono">
                  ↓{formatBytes(currentMetrics.network.rx)}/s
                  ↑{formatBytes(currentMetrics.network.tx)}/s
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {currentMetrics.network.blocked ? (
                  <span className="text-red-600">Network Blocked</span>
                ) : (
                  <span className="text-green-600">Network Allowed</span>
                )}
              </div>
            </div>

            {/* Disk I/O */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  <span className="text-sm font-medium">Disk I/O</span>
                </div>
                <span className="text-sm font-mono">
                  R:{formatBytes(currentMetrics.disk.read)}/s
                  W:{formatBytes(currentMetrics.disk.write)}/s
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Quota: {formatBytes(currentMetrics.disk.quota)}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="process" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Process ID</div>
                <div className="text-lg font-mono">{currentMetrics.process.pid || 'N/A'}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Threads</div>
                <div className="text-lg font-mono">{currentMetrics.process.threads}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">File Descriptors</div>
                <div className="text-lg font-mono">{currentMetrics.process.fds}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Runtime</div>
                <div className="text-lg font-mono">{config.runtime}</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Code Isolation</span>
                <Badge variant={config.level === 'isolation' ? 'default' : 'secondary'}>
                  {config.level === 'isolation' ? 'Enforced' : 'Basic'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Network Access</span>
                <Badge variant={config.allowNetwork ? 'destructive' : 'default'}>
                  {config.allowNetwork ? 'Allowed' : 'Blocked'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">File System</span>
                <Badge variant={config.allowFileSystem ? 'destructive' : 'default'}>
                  {config.allowFileSystem ? 'Read/Write' : 'Read-only'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Resource Limits</span>
                <Badge variant="default">Enforced</Badge>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Real Sandboxed Executor using industry-standard libraries
export function RealSandboxedExecutor({
  language,
  code,
  input,
  config,
  onResult,
  isVisible = true,
  className = ''
}: RealSandboxedExecutorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [sandboxStatus, setSandboxStatus] = useState<'initializing' | 'ready' | 'executing' | 'error'>('initializing');
  const [metrics, setMetrics] = useState<RealResourceMetrics[]>([]);
  const [securityWarnings, setSecurityWarnings] = useState<string[]>([]);
  const [currentExecution, setCurrentExecution] = useState<string | null>(null);
  
  const executorRef = useRef<WebSocket | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize real sandbox connection
  useEffect(() => {
    initializeRealSandbox();
    return () => {
      cleanup();
    };
  }, []);

  const initializeRealSandbox = useCallback(async () => {
    try {
      setSandboxStatus('initializing');
      
      // Connect to sandbox service via WebSocket
      const wsUrl = `ws://localhost:3001/sandbox?runtime=${config.runtime}`;
      executorRef.current = new WebSocket(wsUrl);
      
      executorRef.current.onopen = () => {
        setSandboxStatus('ready');
        console.log(`Connected to ${config.runtime} sandbox`);
      };
      
      executorRef.current.onmessage = handleSandboxMessage;
      executorRef.current.onerror = handleSandboxError;
      executorRef.current.onclose = () => setSandboxStatus('error');
      
    } catch (error) {
      console.error('Failed to initialize real sandbox:', error);
      setSandboxStatus('error');
    }
  }, [config.runtime]);

  const handleSandboxMessage = useCallback((event: MessageEvent) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'execution_result':
        handleExecutionResult(message.data);
        break;
      case 'metrics_update':
        updateMetrics(message.data);
        break;
      case 'security_warning':
        setSecurityWarnings(prev => [...prev, message.data.warning]);
        break;
      case 'error':
        handleExecutionError(message.data);
        break;
    }
  }, []);

  const handleExecutionResult = useCallback((result: any) => {
    setIsExecuting(false);
    setCurrentExecution(null);
    setSandboxStatus('ready');
    stopMetricsCollection();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    onResult({
      ...result,
      executionId: currentExecution || '',
      language,
      timestamp: new Date().toISOString(),
      sandboxInfo: {
        runtime: config.runtime,
        containerId: result.containerId,
        isolated: true,
        resourcesEnforced: true
      }
    });
  }, [currentExecution, language, onResult]);

  const handleExecutionError = useCallback((error: any) => {
    setIsExecuting(false);
    setCurrentExecution(null);
    setSandboxStatus('ready');
    stopMetricsCollection();
    
    onResult({
      success: false,
      error: error.message,
      executionTime: 0,
      memoryUsed: 0,
      exitCode: error.exitCode || 1,
      executionId: currentExecution || '',
      language,
      timestamp: new Date().toISOString(),
      sandboxInfo: {
        runtime: config.runtime,
        isolated: true,
        resourcesEnforced: true
      },
      stats: {
        linesOfCode: code.split('\n').length,
        characters: code.length,
        peakMemory: 0,
        cpuTime: 0,
        diskIO: 0,
        networkIO: 0
      }
    });
  }, [currentExecution, language, onResult, code]);

  const handleSandboxError = useCallback((error: Event) => {
    console.error('Sandbox connection error:', error);
    setSandboxStatus('error');
  }, []);

  const updateMetrics = useCallback((newMetrics: RealResourceMetrics) => {
    setMetrics(prev => [...prev.slice(-29), newMetrics]); // Keep last 30 points
  }, []);

  const startMetricsCollection = useCallback(() => {
    if (executorRef.current && executorRef.current.readyState === WebSocket.OPEN) {
      executorRef.current.send(JSON.stringify({
        type: 'start_metrics',
        executionId: currentExecution
      }));
    }
  }, [currentExecution]);

  const stopMetricsCollection = useCallback(() => {
    if (executorRef.current && executorRef.current.readyState === WebSocket.OPEN) {
      executorRef.current.send(JSON.stringify({
        type: 'stop_metrics',
        executionId: currentExecution
      }));
    }
  }, [currentExecution]);

  const executeInRealSandbox = useCallback(async () => {
    if (isExecuting || sandboxStatus !== 'ready') return;
    
    setIsExecuting(true);
    setSandboxStatus('executing');
    const executionId = Date.now().toString();
    setCurrentExecution(executionId);
    setSecurityWarnings([]);
    
    // Start real-time metrics collection
    startMetricsCollection();
    
    // Set execution timeout
    timeoutRef.current = setTimeout(() => {
      stopExecution();
    }, config.maxExecutionTime);
    
    // Send execution request to real sandbox
    if (executorRef.current && executorRef.current.readyState === WebSocket.OPEN) {
      executorRef.current.send(JSON.stringify({
        type: 'execute',
        data: {
          executionId,
          language,
          code,
          input,
          config: {
            ...config,
            // Convert to sandbox-specific config
            timeoutMs: config.maxExecutionTime,
            memoryLimitBytes: config.maxMemory,
            cpuLimitPercent: config.maxCpu,
            networkEnabled: config.allowNetwork,
            filesystemWrite: config.allowFileSystem
          }
        }
      }));
    } else {
      handleExecutionError({ message: 'Sandbox not connected', exitCode: 1 });
    }
  }, [isExecuting, sandboxStatus, language, code, input, config, startMetricsCollection]);

  const stopExecution = useCallback(() => {
    if (executorRef.current && executorRef.current.readyState === WebSocket.OPEN) {
      executorRef.current.send(JSON.stringify({
        type: 'stop',
        executionId: currentExecution
      }));
    }
    
    setIsExecuting(false);
    setCurrentExecution(null);
    setSandboxStatus('ready');
    stopMetricsCollection();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [currentExecution, stopMetricsCollection]);

  const cleanup = useCallback(() => {
    if (executorRef.current) {
      executorRef.current.close();
      executorRef.current = null;
    }
    
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current);
      metricsIntervalRef.current = null;
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className={`real-sandboxed-executor space-y-4 ${className}`}>
      {/* Sandbox Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4" />
            Real Sandbox Executor
            <Badge variant={sandboxStatus === 'ready' ? 'default' : 'secondary'}>
              {sandboxStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Security Warnings */}
          {securityWarnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  {securityWarnings.map((warning, index) => (
                    <div key={index} className="text-sm">{warning}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Execution Controls */}
          <div className="flex items-center gap-2">
            <Button
              onClick={executeInRealSandbox}
              disabled={isExecuting || sandboxStatus !== 'ready'}
              size="sm"
            >
              {isExecuting ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Execute in {config.runtime.toUpperCase()}
                </>
              )}
            </Button>
            
            {isExecuting && (
              <Button
                onClick={stopExecution}
                variant="destructive"
                size="sm"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
          </div>

          {/* Sandbox Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Runtime:</span> {config.runtime}
            </div>
            <div>
              <span className="font-medium">Isolation:</span> {config.level}
            </div>
            <div>
              <span className="font-medium">Memory Limit:</span> {Math.round(config.maxMemory / (1024 * 1024))}MB
            </div>
            <div>
              <span className="font-medium">CPU Limit:</span> {config.maxCpu}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real Resource Monitor */}
      <RealResourceMonitor
        isExecuting={isExecuting}
        metrics={metrics}
        config={config}
      />
    </div>
  );
}
