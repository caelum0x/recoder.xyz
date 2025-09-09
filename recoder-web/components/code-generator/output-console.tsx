'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  MemoryStick, 
  Loader2,
  Copy,
  Trash2,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

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
}

interface OutputConsoleProps {
  result: ExecutionResult | null;
  history: ExecutionResult[];
  isExecuting: boolean;
  className?: string;
}

export function OutputConsole({
  result,
  history,
  isExecuting,
  className = ''
}: OutputConsoleProps) {
  const [selectedTab, setSelectedTab] = useState('output');
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [result]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const downloadOutput = (result: ExecutionResult) => {
    const content = `Execution Result - ${result.language}\n` +
                   `Timestamp: ${new Date(result.timestamp).toLocaleString()}\n` +
                   `Execution Time: ${result.executionTime}ms\n` +
                   `Memory Used: ${result.memoryUsed}MB\n` +
                   `Exit Code: ${result.exitCode}\n` +
                   `Success: ${result.success}\n\n` +
                   `--- OUTPUT ---\n${result.output || 'No output'}\n\n` +
                   (result.error ? `--- ERROR ---\n${result.error}\n\n` : '') +
                   (result.warnings?.length ? `--- WARNINGS ---\n${result.warnings.join('\n')}\n` : '');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-${result.executionId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStatusIcon = (success: boolean, isExecuting: boolean) => {
    if (isExecuting) {
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
    return success ? 
      <CheckCircle className="w-4 h-4 text-green-500" /> : 
      <XCircle className="w-4 h-4 text-red-500" />;
  };

  const renderOutput = (text: string, type: 'output' | 'error' = 'output') => {
    if (!text) return <div className="text-muted-foreground italic">No output</div>;
    
    return (
      <pre className={`whitespace-pre-wrap font-mono text-sm leading-relaxed ${
        type === 'error' ? 'text-red-400' : 'text-foreground'
      }`}>
        {text}
      </pre>
    );
  };

  return (
    <div className={`output-console h-full flex flex-col ${className}`}>
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
          <TabsTrigger value="output" className="flex items-center gap-2">
            Output
            {result && getStatusIcon(result.success, isExecuting)}
          </TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="history">
            History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {history.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Output Tab */}
        <TabsContent value="output" className="flex-1 m-0">
          <div className="h-full flex flex-col">
            {/* Status Bar */}
            {(result || isExecuting) && (
              <div className="border-b p-3 bg-muted/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result?.success || false, isExecuting)}
                    <span className="text-sm font-medium">
                      {isExecuting ? 'Executing...' : 
                       result?.success ? 'Execution completed' : 'Execution failed'}
                    </span>
                    {result && (
                      <Badge variant={result.success ? 'default' : 'destructive'}>
                        Exit code: {result.exitCode}
                      </Badge>
                    )}
                  </div>
                  
                  {result && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(result.output || result.error || '')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadOutput(result)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                
                {result && (
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{result.executionTime}ms</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MemoryStick className="w-3 h-3" />
                      <span>{result.memoryUsed}MB</span>
                    </div>
                    <span>{formatTimestamp(result.timestamp)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Output Content */}
            <ScrollArea className="flex-1">
              <div ref={outputRef} className="p-4">
                {isExecuting ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Running your code...</span>
                  </div>
                ) : result ? (
                  <div className="space-y-4">
                    {/* Warnings */}
                    {result.warnings && result.warnings.length > 0 && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Warnings
                          </span>
                        </div>
                        <div className="text-sm text-yellow-700 dark:text-yellow-300">
                          {result.warnings.map((warning, index) => (
                            <div key={index}>{warning}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Main Output */}
                    {result.success ? (
                      <div>
                        <div className="text-sm font-medium text-green-600 mb-2">Output:</div>
                        {renderOutput(result.output || result.stdout || '')}
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-medium text-red-600 mb-2">Error:</div>
                        {renderOutput(result.error || result.stderr || '', 'error')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <div className="text-lg mb-2">Ready to run code</div>
                    <div className="text-sm">Click "Run Code" or press Ctrl+Enter to execute</div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="stats" className="flex-1 m-0">
          <div className="p-4">
            {result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Execution Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{result.executionTime}ms</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Memory Usage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{result.memoryUsed}MB</div>
                    </CardContent>
                  </Card>
                </div>

                {result.stats && (
                  <div className="grid grid-cols-1 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Code Statistics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span>Lines of Code:</span>
                          <span className="font-mono">{result.stats.linesOfCode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Characters:</span>
                          <span className="font-mono">{result.stats.characters}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Peak Memory:</span>
                          <span className="font-mono">{result.stats.peakMemory}MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span>CPU Time:</span>
                          <span className="font-mono">{result.stats.cpuTime}ms</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <div className="text-lg mb-2">No execution data</div>
                <div className="text-sm">Run some code to see statistics</div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((execution, index) => (
                    <Card key={execution.executionId} className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      result?.executionId === execution.executionId ? 'ring-2 ring-primary' : ''
                    }`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(execution.success, false)}
                            <Badge variant="outline" className="text-xs">
                              {execution.language}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(execution.timestamp)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{execution.executionTime}ms</span>
                            <span>{execution.memoryUsed}MB</span>
                          </div>
                        </div>
                        
                        <div className="text-sm truncate">
                          {execution.success ? 
                            (execution.output || 'No output') : 
                            (execution.error || 'Unknown error')
                          }
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <div className="text-lg mb-2">No execution history</div>
                  <div className="text-sm">Your previous runs will appear here</div>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
