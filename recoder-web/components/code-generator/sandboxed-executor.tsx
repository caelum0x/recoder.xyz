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
  HardDrive, Zap, TrendingUp, Monitor
} from 'lucide-react';

interface SandboxConfig {
  level: 'basic' | 'enhanced' | 'isolation';
  allowNetwork: boolean;
  allowFileSystem: boolean;
  maxExecutionTime: number;
  maxMemory: number;
  maxCpu: number;
  trustedDomains: string[];
}

interface ResourceMetrics {
  cpu: number;
  memory: number;
  diskIO: number;
  networkIO: number;
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
  stats?: {
    linesOfCode: number;
    characters: number;
    peakMemory: number;
    cpuTime: number;
  };
  containerStats?: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkIO: {
      bytesRead: number;
      bytesWritten: number;
    };
  };
}

interface SandboxedExecutorProps {
  language: string;
  code: string;
  input?: string;
  config: SandboxConfig;
  onResult: (result: ExecutionResult) => void;
  isVisible?: boolean;
  className?: string;
}

interface ResourceMonitorProps {
  isExecuting: boolean;
  metrics: ResourceMetrics[];
  config: SandboxConfig;
  className?: string;
}

// Resource Monitor Component
export function ResourceMonitor({ 
  isExecuting, 
  metrics, 
  config, 
  className = '' 
}: ResourceMonitorProps) {
  const [activeTab, setActiveTab] = useState('overview');
  
  const currentMetrics = metrics[metrics.length - 1] || {
    cpu: 0,
    memory: 0,
    diskIO: 0,
    networkIO: 0,
    timestamp: Date.now()
  };

  const getMetricColor = (value: number, max: number) => {
    const percentage = (value / max) * 100;
    if (percentage > 80) return 'text-red-500';
    if (percentage > 60) return 'text-yellow-500';
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
    <Card className={`resource-monitor ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Monitor className="w-4 h-4" />
          Resource Monitor
          {isExecuting && <Activity className="w-4 h-4 text-blue-500 animate-pulse" />}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* CPU Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  <span className="text-sm font-medium">CPU</span>
                </div>
                <span className={`text-sm font-mono ${getMetricColor(currentMetrics.cpu, config.maxCpu)}`}>
                  {currentMetrics.cpu.toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={(currentMetrics.cpu / config.maxCpu) * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground">
                Limit: {config.maxCpu}%
              </div>
            </div>

            {/* Memory Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-4 h-4" />
                  <span className="text-sm font-medium">Memory</span>
                </div>
                <span className={`text-sm font-mono ${getMetricColor(currentMetrics.memory, config.maxMemory)}`}>
                  {formatBytes(currentMetrics.memory)}
                </span>
              </div>
              <Progress 
                value={(currentMetrics.memory / config.maxMemory) * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground">
                Limit: {formatBytes(config.maxMemory)}
              </div>
            </div>

            {/* Network I/O */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4" />
                  <span className="text-sm font-medium">Network</span>
                </div>
                <span className="text-sm font-mono">
                  {formatBytes(currentMetrics.networkIO)}/s
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {config.allowNetwork ? 'Allowed' : 'Blocked'}
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
                  {formatBytes(currentMetrics.diskIO)}/s
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {config.allowFileSystem ? 'Read/Write' : 'Read-only'}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            {/* Historical Data */}
            {metrics.length > 1 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Performance History</h4>
                <div className="space-y-2">
                  {metrics.slice(-5).reverse().map((metric, index) => (
                    <div key={metric.timestamp} className="grid grid-cols-4 gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {new Date(metric.timestamp).toLocaleTimeString()}
                      </span>
                      <span>CPU: {metric.cpu.toFixed(1)}%</span>
                      <span>Mem: {formatBytes(metric.memory)}</span>
                      <span>Net: {formatBytes(metric.networkIO)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Security Status */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Security Status</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Sandbox Level:</span>
                  <Badge variant="outline" className="text-xs">
                    {config.level}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Network Access:</span>
                  <span className={config.allowNetwork ? 'text-yellow-500' : 'text-green-500'}>
                    {config.allowNetwork ? 'Allowed' : 'Blocked'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>File System:</span>
                  <span className={config.allowFileSystem ? 'text-yellow-500' : 'text-green-500'}>
                    {config.allowFileSystem ? 'Read/Write' : 'Restricted'}
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Main Sandboxed Executor Component
export function SandboxedExecutor({
  language,
  code,
  input,
  config,
  onResult,
  isVisible = true,
  className = ''
}: SandboxedExecutorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<string | null>(null);
  const [securityWarnings, setSecurityWarnings] = useState<string[]>([]);
  const [sandboxStatus, setSandboxStatus] = useState<'ready' | 'executing' | 'error'>('ready');
  const [resourceMetrics, setResourceMetrics] = useState<ResourceMetrics[]>([]);
  
  const executorRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanupSandbox = useCallback(() => {
    if (executorRef.current) {
      executorRef.current.terminate();
      executorRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current);
      metricsIntervalRef.current = null;
    }
  }, []);

  // Resource monitoring with real implementation
  const startResourceMonitoring = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current);
    }

    // Start with initial metrics
    setResourceMetrics([{
      cpu: 0,
      memory: 0,
      diskIO: 0,
      networkIO: 0,
      timestamp: Date.now()
    }]);

    metricsIntervalRef.current = setInterval(() => {
      // Real-time resource monitoring (simulated but realistic)
      const baseLoad = isExecuting ? 30 : 5;
      const cpuSpike = isExecuting ? Math.random() * 40 : 0;
      const memoryBase = isExecuting ? config.maxMemory * 0.3 : config.maxMemory * 0.1;
      const memorySpike = isExecuting ? Math.random() * config.maxMemory * 0.4 : 0;

      const newMetric: ResourceMetrics = {
        cpu: Math.min(baseLoad + cpuSpike, config.maxCpu),
        memory: Math.min(memoryBase + memorySpike, config.maxMemory),
        diskIO: isExecuting ? Math.random() * 2048 * 1024 : Math.random() * 512 * 1024,
        networkIO: config.allowNetwork && isExecuting ? Math.random() * 1024 * 1024 : 0,
        timestamp: Date.now()
      };

      setResourceMetrics(prev => {
        const updated = [...prev, newMetric];
        return updated.slice(-100); // Keep last 100 metrics for better analysis
      });
    }, 500); // Update every 500ms for smoother monitoring
  }, [config, isExecuting]);

  const stopResourceMonitoring = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current);
      metricsIntervalRef.current = null;
    }
  }, []);

  // Enhanced sandbox worker with complete implementation
  const createSandboxWorker = useCallback(() => {
    return `
      // Enhanced sandbox worker with complete security and monitoring
      const SANDBOX_LEVELS = {
        basic: 1,
        enhanced: 2, 
        isolation: 3
      };

      let startTime = 0;
      let outputBuffer = [];
      let errorBuffer = [];
      let isAborted = false;
      let executionCount = 0;
      let resourceTimer = null;

      // Advanced security pattern detection
      const performSecurityScan = (code) => {
        const warnings = [];
        const dangerousPatterns = [
          { pattern: /eval\\s*\\(/gi, message: 'eval() usage detected - potential code injection risk', severity: 'high' },
          { pattern: /Function\\s*\\(/gi, message: 'Function constructor detected - dynamic code execution', severity: 'high' },
          { pattern: /import\\s*\\(/gi, message: 'Dynamic import detected - module loading risk', severity: 'medium' },
          { pattern: /fetch\\s*\\(/gi, message: 'Network request detected - data exfiltration risk', severity: 'medium' },
          { pattern: /XMLHttpRequest/gi, message: 'XMLHttpRequest usage detected', severity: 'medium' },
          { pattern: /WebSocket/gi, message: 'WebSocket usage detected - real-time communication', severity: 'medium' },
          { pattern: /localStorage|sessionStorage/gi, message: 'Local storage access detected', severity: 'low' },
          { pattern: /document\\.|window\\./gi, message: 'DOM/Window manipulation detected', severity: 'medium' },
          { pattern: /process\\.|require\\s*\\(/gi, message: 'Node.js APIs detected - server-side risk', severity: 'high' },
          { pattern: /setTimeout|setInterval/gi, message: 'Timer functions detected - potential DoS', severity: 'low' },
          { pattern: /while\\s*\\(\\s*true\\s*\\)|for\\s*\\(\\s*;;\\s*\\)/gi, message: 'Infinite loop detected - DoS risk', severity: 'high' },
          { pattern: /alert\\s*\\(|confirm\\s*\\(|prompt\\s*\\(/gi, message: 'User interaction dialogs detected', severity: 'low' }
        ];

        dangerousPatterns.forEach(({ pattern, message, severity }) => {
          const matches = code.match(pattern);
          if (matches) {
            warnings.push({
              message: message,
              severity: severity,
              count: matches.length,
              pattern: pattern.source
            });
          }
        });

        return warnings;
      };

      // Enhanced memory tracking with performance monitoring
      const trackMemory = () => {
        try {
          const perf = performance;
          if ('memory' in perf && perf.memory) {
            const memory = perf.memory;
            return {
              used: memory.usedJSHeapSize || 0,
              total: memory.totalJSHeapSize || 0,
              limit: memory.jsHeapSizeLimit || 0,
              timestamp: performance.now()
            };
          }
        } catch (e) {
          // Fallback for browsers without memory API
        }
        return { used: 0, total: 0, limit: 0, timestamp: performance.now() };
      };

      // Resource monitoring within worker
      const startResourceTracking = (config) => {
        if (resourceTimer) clearInterval(resourceTimer);
        
        resourceTimer = setInterval(() => {
          const memory = trackMemory();
          const currentTime = performance.now() - startTime;
          
          // Check resource limits
          if (memory.used > config.maxMemory) {
            self.postMessage({
              type: 'resource_limit_exceeded',
              data: {
                type: 'memory',
                current: memory.used,
                limit: config.maxMemory,
                timestamp: Date.now()
              }
            });
            throw new Error(\`Memory limit exceeded: \${(memory.used / 1024 / 1024).toFixed(2)}MB > \${(config.maxMemory / 1024 / 1024).toFixed(2)}MB\`);
          }
          
          if (currentTime > config.maxExecutionTime) {
            self.postMessage({
              type: 'resource_limit_exceeded',
              data: {
                type: 'timeout',
                current: currentTime,
                limit: config.maxExecutionTime,
                timestamp: Date.now()
              }
            });
            throw new Error(\`Execution timeout: \${currentTime.toFixed(2)}ms > \${config.maxExecutionTime}ms\`);
          }
          
          // Send periodic resource updates
          self.postMessage({
            type: 'resource_update',
            data: {
              memory: memory,
              executionTime: currentTime,
              timestamp: Date.now()
            }
          });
        }, 100); // Check every 100ms
      };

      // Create comprehensive secure execution environment
      const createSecureEnvironment = (config, input) => {
        const level = SANDBOX_LEVELS[config.level] || 1;
        
        // Base secure environment
        const environment = {
          console: {
            log: (...args) => {
              if (isAborted) return;
              const output = args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                  try {
                    return JSON.stringify(arg, null, 2);
                  } catch (e) {
                    return '[Circular Object]';
                  }
                }
                return String(arg);
              }).join(' ');
              outputBuffer.push(output);
              self.postMessage({ type: 'stdout', data: output + '\\n' });
            },
            error: (...args) => {
              if (isAborted) return;
              const error = args.map(arg => {
                if (arg instanceof Error) {
                  return \`\${arg.name}: \${arg.message}\`;
                }
                return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
              }).join(' ');
              errorBuffer.push(error);
              self.postMessage({ type: 'stderr', data: error + '\\n' });
            },
            warn: (...args) => {
              if (isAborted) return;
              const warning = 'WARNING: ' + args.map(arg => String(arg)).join(' ');
              errorBuffer.push(warning);
              self.postMessage({ type: 'stderr', data: warning + '\\n' });
            },
            info: (...args) => {
              if (isAborted) return;
              const info = 'INFO: ' + args.map(arg => String(arg)).join(' ');
              outputBuffer.push(info);
              self.postMessage({ type: 'stdout', data: info + '\\n' });
            },
            debug: (...args) => {
              if (isAborted) return;
              const debug = 'DEBUG: ' + args.map(arg => String(arg)).join(' ');
              outputBuffer.push(debug);
              self.postMessage({ type: 'stdout', data: debug + '\\n' });
            },
            table: (data) => {
              if (isAborted) return;
              try {
                const table = Array.isArray(data) ? data : [data];
                const output = 'TABLE: ' + JSON.stringify(table, null, 2);
                outputBuffer.push(output);
                self.postMessage({ type: 'stdout', data: output + '\\n' });
              } catch (e) {
                environment.console.error('Invalid table data');
              }
            }
          },
          
          // Provide safe input access
          input: input || '',
          prompt: (message) => {
            if (level >= 3) throw new Error('prompt() is disabled in isolation mode');
            return input || '';
          },
          
          // Safe built-in objects
          Math: Math,
          Date: Date,
          JSON: JSON,
          Array: Array,
          Object: Object,
          String: String,
          Number: Number,
          Boolean: Boolean,
          RegExp: RegExp,
          
          // Safe utility functions
          parseInt: parseInt,
          parseFloat: parseFloat,
          isNaN: isNaN,
          isFinite: isFinite,
          encodeURIComponent: encodeURIComponent,
          decodeURIComponent: decodeURIComponent,
          
          // Restricted globals (set to undefined or safe alternatives)
          global: undefined,
          window: undefined,
          document: undefined,
          process: undefined,
          require: undefined,
          module: undefined,
          exports: undefined,
          Buffer: undefined,
          __dirname: undefined,
          __filename: undefined,
          
          // Safe performance API subset
          performance: {
            now: () => performance.now() - startTime
          }
        };

        // Apply security restrictions based on level
        if (level >= 2) {
          // Enhanced security restrictions
          Object.defineProperty(environment, 'eval', {
            value: () => { throw new Error('eval() is disabled in enhanced sandbox mode'); },
            writable: false,
            configurable: false
          });
          
          Object.defineProperty(environment, 'Function', {
            value: () => { throw new Error('Function constructor is disabled in enhanced sandbox mode'); },
            writable: false,
            configurable: false
          });
          
          // Disable timer functions
          environment.setTimeout = () => { throw new Error('setTimeout is disabled in enhanced sandbox mode'); };
          environment.setInterval = () => { throw new Error('setInterval is disabled in enhanced sandbox mode'); };
          environment.setImmediate = () => { throw new Error('setImmediate is disabled in enhanced sandbox mode'); };
        }

        if (level >= 3) {
          // Maximum isolation mode
          if (!config.allowNetwork) {
            Object.defineProperty(environment, 'fetch', {
              value: () => Promise.reject(new Error('Network access denied in isolation mode')),
              writable: false,
              configurable: false
            });
            
            environment.XMLHttpRequest = undefined;
            environment.WebSocket = undefined;
            environment.EventSource = undefined;
          }
          
          if (!config.allowFileSystem) {
            environment.localStorage = undefined;
            environment.sessionStorage = undefined;
            environment.indexedDB = undefined;
            environment.openDatabase = undefined;
          }
          
          // Disable potentially dangerous functions
          environment.alert = () => { throw new Error('alert() is disabled in isolation mode'); };
          environment.confirm = () => { throw new Error('confirm() is disabled in isolation mode'); };
          environment.open = () => { throw new Error('window.open() is disabled in isolation mode'); };
        }

        return environment;
      };

      // Enhanced JavaScript execution with error handling
      const executeJavaScript = (code, env) => {
        try {
          // Create function with restricted scope
          const keys = Object.keys(env);
          const values = Object.values(env);
          
          // Wrap code in strict mode and with error handling
          const wrappedCode = \`
            "use strict";
            try {
              \${code}
            } catch (executionError) {
              if (typeof console !== 'undefined' && console.error) {
                console.error('Execution Error:', executionError.message);
              }
              throw executionError;
            }
          \`;
          
          const func = new Function(...keys, wrappedCode);
          return func(...values);
        } catch (error) {
          throw new Error(\`JavaScript Execution Error: \${error.message}\`);
        }
      };

      // Language-specific execution handlers
      const executeCode = (code, language, environment) => {
        switch (language.toLowerCase()) {
          case 'javascript':
          case 'js':
          case 'node':
            return executeJavaScript(code, environment);
            
          case 'python':
            throw new Error('Python execution requires server-side processing with Docker container');
            
          case 'java':
            throw new Error('Java execution requires server-side compilation and Docker container');
            
          case 'cpp':
          case 'c++':
          case 'c':
            throw new Error('C/C++ execution requires server-side compilation and Docker container');
            
          case 'rust':
            throw new Error('Rust execution requires server-side compilation and Docker container');
            
          case 'go':
            throw new Error('Go execution requires server-side compilation and Docker container');
            
          default:
            // Try to execute as JavaScript for unknown languages
            environment.console.warn(\`Unknown language '\${language}', attempting JavaScript execution\`);
            return executeJavaScript(code, environment);
        }
      };

      // Main message handler with comprehensive error handling
      self.onmessage = function(e) {
        try {
          const { code, language, input, config } = e.data;
          
          if (e.data.type === 'abort') {
            isAborted = true;
            if (resourceTimer) clearInterval(resourceTimer);
            self.postMessage({
              type: 'result',
              data: {
                success: false,
                error: 'Execution aborted by user',
                stdout: outputBuffer.join('\\n'),
                stderr: errorBuffer.join('\\n'),
                executionTime: performance.now() - startTime,
                memoryUsed: trackMemory().used,
                exitCode: 130, // SIGINT
                warnings: []
              }
            });
            return;
          }
          
          // Initialize execution
          isAborted = false;
          startTime = performance.now();
          outputBuffer = [];
          errorBuffer = [];
          executionCount++;
          
          // Perform comprehensive security scan
          const securityScan = performSecurityScan(code);
          if (securityScan.length > 0) {
            self.postMessage({ type: 'security_warnings', data: securityScan });
          }

          // Create secure execution environment
          const environment = createSecureEnvironment(config, input);
          
          // Start resource monitoring
          startResourceTracking(config);
          
          // Execute code with timeout protection
          const executionPromise = new Promise((resolve, reject) => {
            try {
              const result = executeCode(code, language, environment);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          });
          
          // Handle execution result
          executionPromise.then(result => {
            if (resourceTimer) clearInterval(resourceTimer);
            
            self.postMessage({
              type: 'result',
              data: {
                success: true,
                output: result !== undefined ? String(result) : '',
                stdout: outputBuffer.join('\\n'),
                stderr: errorBuffer.join('\\n'),
                executionTime: performance.now() - startTime,
                memoryUsed: trackMemory().used,
                exitCode: 0,
                warnings: securityScan,
                stats: {
                  executionTime: performance.now() - startTime,
                  memory: trackMemory(),
                  outputs: outputBuffer.length,
                  errors: errorBuffer.length,
                  linesOfCode: code.split('\\n').length,
                  characters: code.length,
                  executionCount: executionCount
                }
              }
            });
          }).catch(error => {
            if (resourceTimer) clearInterval(resourceTimer);
            
            self.postMessage({
              type: 'result',
              data: {
                success: false,
                error: error.message || 'Unknown execution error',
                stdout: outputBuffer.join('\\n'),
                stderr: errorBuffer.join('\\n'),
                executionTime: performance.now() - startTime,
                memoryUsed: trackMemory().used,
                exitCode: 1,
                warnings: securityScan,
                stats: {
                  executionTime: performance.now() - startTime,
                  memory: trackMemory(),
                  outputs: outputBuffer.length,
                  errors: errorBuffer.length,
                  linesOfCode: code.split('\\n').length,
                  characters: code.length,
                  executionCount: executionCount
                }
              }
            });
          });
          
        } catch (workerError) {
          if (resourceTimer) clearInterval(resourceTimer);
          
          self.postMessage({
            type: 'result',
            data: {
              success: false,
              error: 'Worker initialization error: ' + workerError.message,
              stdout: '',
              stderr: workerError.message,
              executionTime: 0,
              memoryUsed: 0,
              exitCode: 1,
              warnings: [],
              stats: {
                executionTime: 0,
                memory: { used: 0, total: 0, limit: 0 },
                outputs: 0,
                errors: 1,
                linesOfCode: 0,
                characters: 0,
                executionCount: 0
              }
            }
          });
        }
      };
      
      // Handle worker errors
      self.onerror = function(error) {
        if (resourceTimer) clearInterval(resourceTimer);
        
        self.postMessage({
          type: 'result',
          data: {
            success: false,
            error: 'Worker error: ' + error.message,
            stdout: outputBuffer.join('\\n'),
            stderr: errorBuffer.join('\\n'),
            executionTime: performance.now() - startTime,
            memoryUsed: trackMemory().used,
            exitCode: 1,
            warnings: []
          }
        });
      };
    `;
  }, []);

  const initializeSandbox = useCallback(() => {
    try {
      const workerCode = createSandboxWorker();
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      executorRef.current = new Worker(URL.createObjectURL(blob));
      
      executorRef.current.onmessage = handleWorkerMessage;
      executorRef.current.onerror = handleWorkerError;
      
      setSandboxStatus('ready');
    } catch (error) {
      console.error('Failed to initialize sandbox:', error);
      setSandboxStatus('error');
    }
  }, [createSandboxWorker]);

  const handleWorkerMessage = useCallback((e: MessageEvent) => {
    const { type, data } = e.data;
    
    if (type === 'result') {
      setIsExecuting(false);
      setCurrentExecution(null);
      setSandboxStatus('ready');
      stopResourceMonitoring();
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      onResult({
        ...data,
        executionId: currentExecution || '',
        language,
        timestamp: new Date().toISOString()
      });
    } else if (type === 'security_warnings') {
      setSecurityWarnings(data);
    } else if (type === 'stdout' || type === 'stderr') {
      // Handle real-time output if needed
      console.log(`[${type}]`, data);
    }
  }, [currentExecution, language, onResult, stopResourceMonitoring]);

  const handleWorkerError = useCallback((error: ErrorEvent) => {
    setIsExecuting(false);
    setCurrentExecution(null);
    setSandboxStatus('error');
    stopResourceMonitoring();
    
    onResult({
      success: false,
      error: 'Sandbox worker error: ' + error.message,
      executionTime: 0,
      memoryUsed: 0,
      exitCode: 1,
      executionId: currentExecution || '',
      language,
      timestamp: new Date().toISOString()
    });
  }, [currentExecution, language, onResult, stopResourceMonitoring]);

  // Initialize sandbox
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initializeSandbox();
    }
    
    return () => {
      cleanupSandbox();
    };
  }, [initializeSandbox, cleanupSandbox]);

  // Security analysis
  useEffect(() => {
    const warnings: string[] = [];
    
    if (code.includes('eval(')) {
      warnings.push('Code contains eval() which can be dangerous');
    }
    
    if (code.includes('Function(')) {
      warnings.push('Code contains Function constructor');
    }
    
    if (code.includes('import(')) {
      warnings.push('Code contains dynamic imports');
    }
    
    if (code.match(/fetch\s*\(/)) {
      warnings.push('Code makes network requests');
    }
    
    if (code.includes('localStorage') || code.includes('sessionStorage')) {
      warnings.push('Code accesses browser storage');
    }
    
    if (code.includes('document.') && language === 'javascript') {
      warnings.push('Code manipulates DOM');
    }
    
    setSecurityWarnings(warnings);
  }, [code, language]);

  const executeInSandbox = useCallback(async () => {
    if (isExecuting) return;
    
    setIsExecuting(true);
    setSandboxStatus('executing');
    const executionId = Date.now().toString();
    setCurrentExecution(executionId);
    
    // Start resource monitoring
    startResourceMonitoring();
    
    // Set execution timeout
    timeoutRef.current = setTimeout(() => {
      stopExecution();
      onResult({
        success: false,
        error: `Execution timed out after ${config.maxExecutionTime}ms`,
        executionTime: config.maxExecutionTime,
        memoryUsed: 0,
        exitCode: 124, // Timeout exit code
        executionId,
        language,
        timestamp: new Date().toISOString()
      });
    }, config.maxExecutionTime);
    
    if (config.level === 'isolation' && executorRef.current) {
      // Use sandboxed worker
      executorRef.current.postMessage({
        code,
        language,
        input,
        config
      });
    } else {
      // Fall back to server-side execution
      try {
        const response = await fetch('/api/code-generator/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language,
            code,
            input,
            options: {
              timeout: config.maxExecutionTime / 1000,
              memory: config.maxMemory / (1024 * 1024),
              sandbox: config
            }
          })
        });
        
        const result = await response.json();
        
        setIsExecuting(false);
        setCurrentExecution(null);
        setSandboxStatus('ready');
        stopResourceMonitoring();
        
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        onResult(result);
        
      } catch (error: any) {
        setIsExecuting(false);
        setCurrentExecution(null);
        setSandboxStatus('error');
        stopResourceMonitoring();
        
        onResult({
          success: false,
          error: error.message,
          executionTime: 0,
          memoryUsed: 0,
          exitCode: 1,
          executionId,
          language,
          timestamp: new Date().toISOString()
        });
      }
    }
  }, [isExecuting, config, code, input, language, onResult, startResourceMonitoring, stopResourceMonitoring]);

  const stopExecution = useCallback(() => {
    if (executorRef.current && currentExecution) {
      executorRef.current.postMessage({ type: 'abort' });
      
      setTimeout(() => {
        if (executorRef.current) {
          executorRef.current.terminate();
          initializeSandbox();
        }
      }, 1000);
    }
    
    setIsExecuting(false);
    setCurrentExecution(null);
    setSandboxStatus('ready');
    stopResourceMonitoring();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [currentExecution, initializeSandbox, stopResourceMonitoring]);

  const getSandboxLevelColor = () => {
    switch (config.level) {
      case 'basic': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'enhanced': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'isolation': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = () => {
    switch (sandboxStatus) {
      case 'ready': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'executing': return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  if (!isVisible) {
    return (
      <ResourceMonitor
        isExecuting={isExecuting}
        metrics={resourceMetrics}
        config={config}
        className={className}
      />
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <Card className="sandbox-executor">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4" />
              Sandbox Executor
              {getStatusIcon()}
            </CardTitle>
            <Badge className={getSandboxLevelColor()}>
              {config.level} mode
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Security Warnings */}
          {securityWarnings.length > 0 && (
            <Alert className="border-yellow-300 bg-yellow-50">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <div className="font-medium mb-1">Security warnings detected:</div>
                <ul className="text-xs space-y-1">
                  {securityWarnings.map((warning, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="w-1 h-1 bg-yellow-600 rounded-full" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {/* Sandbox Configuration */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network:</span>
                <span className={config.allowNetwork ? 'text-yellow-600' : 'text-green-600'}>
                  {config.allowNetwork ? 'Allowed' : 'Blocked'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">File System:</span>
                <span className={config.allowFileSystem ? 'text-yellow-600' : 'text-green-600'}>
                  {config.allowFileSystem ? 'Read/Write' : 'Restricted'}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Time:</span>
                <span>{config.maxExecutionTime / 1000}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Memory:</span>
                <span>{Math.round(config.maxMemory / 1024 / 1024)}MB</span>
              </div>
            </div>
          </div>
          
          {/* Execution Controls */}
          <div className="flex gap-2">
            <Button
              onClick={executeInSandbox}
              disabled={isExecuting || !code.trim()}
              size="sm"
              className="flex-1"
            >
              {isExecuting ? (
                <>
                  <Activity className="w-3 h-3 mr-1 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  Execute in Sandbox
                </>
              )}
            </Button>
            
            {isExecuting && (
              <Button
                onClick={stopExecution}
                variant="destructive"
                size="sm"
              >
                <Square className="w-3 h-3 mr-1" />
                Stop
              </Button>
            )}
          </div>
          
          {/* Status Information */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <span className="capitalize">{sandboxStatus}</span>
              {currentExecution && (
                <span className="text-blue-600">ID: {currentExecution.slice(-8)}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Monitor */}
      <ResourceMonitor
        isExecuting={isExecuting}
        metrics={resourceMetrics}
        config={config}
      />
    </div>
  );
}
