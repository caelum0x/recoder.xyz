'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelResizeHandle, Panel, PanelGroup } from 'react-resizable-panels';
import { 
  Play, 
  Square, 
  Save, 
  Share2, 
  Download, 
  Settings, 
  Zap, 
  Code2, 
  Terminal, 
  Users, 
  FileText,
  Maximize2,
  Minimize2,
  RefreshCw,
  Shield,
  Monitor,
  Layers,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { getAllLanguages, getLanguageConfig } from '@/lib/code-generator/language-configs';
import { CollaborationPanel } from './collaboration-panel';
import { LanguageSelector } from './language-selector';
import { OutputConsole } from './output-console';
import { CodeEditor } from './code-editor';
import { ResourceMonitor, SandboxedExecutor } from './sandboxed-executor';

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

interface ProfessionalCodePlaygroundProps {
  initialLanguage?: string;
  initialCode?: string;
  collaborationEnabled?: boolean;
  sandboxLevel?: 'basic' | 'enhanced' | 'isolation';
  theme?: 'dark' | 'light' | 'auto';
  layout?: 'horizontal' | 'vertical' | 'grid';
  className?: string;
}

export function ProfessionalCodePlayground({
  initialLanguage = 'javascript',
  initialCode = '',
  collaborationEnabled = false,
  sandboxLevel = 'enhanced',
  theme = 'dark',
  layout = 'horizontal',
  className = ''
}: ProfessionalCodePlaygroundProps) {
  // Core state
  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage);
  const languages = getAllLanguages();
  const currentLanguageConfig = getLanguageConfig(selectedLanguage);
  const [code, setCode] = useState(initialCode || currentLanguageConfig?.defaultCode || '');
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionResult[]>([]);
  
  // UI state
  const [activeTab, setActiveTab] = useState('editor');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layout_, setLayout] = useState(layout);
  const [showResourceMonitor, setShowResourceMonitor] = useState(true);
  const [showCollaboration, setShowCollaboration] = useState(collaborationEnabled);
  
  // Collaboration state
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  
  // Refs
  const editorRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playgroundRef = useRef<HTMLDivElement>(null);

  // Memoized values
  const sandboxConfig = useMemo(() => ({
    level: sandboxLevel,
    allowNetwork: sandboxLevel === 'basic',
    allowFileSystem: false,
    maxExecutionTime: 30000,
    maxMemory: 128 * 1024 * 1024, // 128MB
    maxCpu: 80, // 80% CPU usage
    trustedDomains: ['localhost', 'recoder.xyz']
  }), [sandboxLevel]);

  // Handle language change
  const handleLanguageChange = useCallback((language: string) => {
    if (language === selectedLanguage) return;
    
    setSelectedLanguage(language);
    const config = getLanguageConfig(language);
    const currentConfig = getLanguageConfig(selectedLanguage);
    if (config && (!code || code === currentConfig?.defaultCode)) {
      setCode(config.defaultCode);
    }
    setExecutionResult(null);
    
    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'language_change', {
        from_language: selectedLanguage,
        to_language: language,
        event_category: 'code_playground'
      });
    }
  }, [selectedLanguage, code]);

  // Enhanced code execution with sandboxing
  const executeCode = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Please enter some code to execute');
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      // Enhanced execution with sandboxing metadata
      const response = await fetch('/api/code-generator/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: selectedLanguage,
          code,
          input: input.trim() || undefined,
          options: {
            timeout: sandboxConfig.maxExecutionTime / 1000,
            memory: sandboxConfig.maxMemory / (1024 * 1024),
            debug: false,
            sandbox: sandboxConfig,
            enableMetrics: true,
            enableProfiling: true
          }
        }),
      });

      const result: ExecutionResult = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Execution failed');
      }

      setExecutionResult(result);
      setExecutionHistory(prev => [result, ...prev.slice(0, 19)]); // Keep last 20 results

      if (result.success) {
        toast.success(`Code executed successfully in ${result.executionTime}ms`, {
          description: `Memory: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB | Exit code: ${result.exitCode}`
        });
      } else {
        toast.error(`Execution failed: ${result.error}`, {
          description: `Exit code: ${result.exitCode}`
        });
      }

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach(warning => {
          toast.warning(warning);
        });
      }

      // Analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'code_execution', {
          language: selectedLanguage,
          success: result.success,
          execution_time: result.executionTime,
          memory_used: result.memoryUsed,
          event_category: 'code_playground'
        });
      }

    } catch (error: any) {
      console.error('Execution error:', error);
      toast.error(error.message || 'Failed to execute code');
      setExecutionResult({
        success: false,
        error: error.message || 'Unknown error occurred',
        executionTime: 0,
        memoryUsed: 0,
        exitCode: 1,
        executionId: '',
        language: selectedLanguage,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsExecuting(false);
    }
  }, [code, input, selectedLanguage, sandboxConfig]);

  // Stop execution
  const stopExecution = useCallback(async () => {
    if (!executionResult?.executionId) return;
    
    try {
      await fetch('/api/code-generator/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId: executionResult.executionId })
      });
      
      setIsExecuting(false);
      toast.info('Execution stopped');
    } catch (error) {
      console.error('Failed to stop execution:', error);
      toast.error('Failed to stop execution');
    }
  }, [executionResult?.executionId]);

  // Save code
  const saveCode = useCallback(async () => {
    try {
      const response = await fetch('/api/code-generator/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLanguage,
          code,
          title: `${selectedLanguage} snippet - ${new Date().toLocaleString()}`
        })
      });

      if (response.ok) {
        const { id } = await response.json();
        toast.success('Code saved successfully', {
          action: {
            label: 'View',
            onClick: () => window.open(`/saved/${id}`, '_blank')
          }
        });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast.error('Failed to save code');
    }
  }, [selectedLanguage, code]);

  // Share code
  const shareCode = useCallback(async () => {
    try {
      const shareData = {
        language: selectedLanguage,
        code,
        timestamp: new Date().toISOString()
      };
      
      const encoded = btoa(JSON.stringify(shareData));
      const shareUrl = `${window.location.origin}/shared/${encoded}`;
      
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied to clipboard');
    } catch (error) {
      toast.error('Failed to create share link');
    }
  }, [selectedLanguage, code]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!playgroundRef.current) return;
    
    if (!isFullscreen) {
      playgroundRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            executeCode();
            break;
          case 's':
            e.preventDefault();
            saveCode();
            break;
          case 'k':
            e.preventDefault();
            setCode('');
            setExecutionResult(null);
            break;
          case 'f':
            e.preventDefault();
            toggleFullscreen();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeCode, saveCode, toggleFullscreen]);

  return (
    <div 
      ref={playgroundRef}
      className={`professional-code-playground ${className} ${isFullscreen ? 'fullscreen' : ''}`}
    >
      <Card className="h-full border-0 shadow-xl bg-gradient-to-br from-slate-900 to-slate-800">
        {/* Header */}
        <CardHeader className="pb-3 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-white">Professional Code Playground</CardTitle>
              </div>
              <Badge variant="outline" className="text-blue-400 border-blue-400">
                {sandboxLevel} sandbox
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Language Selector */}
              <LanguageSelector
                selectedLanguage={selectedLanguage}
                onLanguageChange={handleLanguageChange}
               // variant="compact"
              />
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* Action Buttons */}
              <Button
                onClick={isExecuting ? stopExecution : executeCode}
                disabled={!code.trim()}
                className={isExecuting ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
                size="sm"
              >
                {isExecuting ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run
                  </>
                )}
              </Button>
              
              <Button onClick={saveCode} variant="outline" size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              
              <Button onClick={shareCode} variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* View Controls */}
              <Button
                onClick={() => setShowResourceMonitor(!showResourceMonitor)}
                variant={showResourceMonitor ? "default" : "outline"}
                size="sm"
              >
                <Activity className="h-4 w-4" />
              </Button>
              
              <Button
                onClick={() => setShowCollaboration(!showCollaboration)}
                variant={showCollaboration ? "default" : "outline"}
                size="sm"
              >
                <Users className="h-4 w-4" />
              </Button>
              
              <Button onClick={toggleFullscreen} variant="outline" size="sm">
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Main Content */}
        <CardContent className="p-0 h-[calc(100vh-10rem)]">
          <PanelGroup direction={layout_ === 'vertical' ? 'vertical' : 'horizontal'}>
            {/* Main Editor Panel */}
            <Panel defaultSize={60} minSize={30}>
              <div className="h-full flex flex-col">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                  <div className="px-4 py-2 border-b border-slate-700">
                    <TabsList className="bg-slate-800">
                      <TabsTrigger value="editor" className="flex items-center gap-2">
                        <Code2 className="h-4 w-4" />
                        Editor
                      </TabsTrigger>
                      <TabsTrigger value="input" className="flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        Input
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="editor" className="flex-1 m-0">
                    <CodeEditor
                      language={selectedLanguage}
                      value={code}
                      onChange={setCode}
                      theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                      className="h-full"
                      ref={editorRef}
                    />
                  </TabsContent>
                  
                  <TabsContent value="input" className="flex-1 m-0 p-4">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Enter input for your program..."
                      className="w-full h-full bg-slate-900 text-white border border-slate-600 rounded-md p-3 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </Panel>

            <PanelResizeHandle className="bg-slate-600 hover:bg-slate-500 transition-colors" />

            {/* Side Panel */}
            <Panel defaultSize={40} minSize={25}>
              <PanelGroup direction="vertical">
                {/* Output Console */}
                <Panel defaultSize={showResourceMonitor ? 60 : 80} minSize={30}>
                  <OutputConsole
                    result={executionResult}
                    isExecuting={isExecuting}
                    history={executionHistory}
                    className="h-full border-0"
                  />
                </Panel>

                {showResourceMonitor && (
                  <>
                    <PanelResizeHandle className="bg-slate-600 hover:bg-slate-500 transition-colors" />
                    
                    {/* Resource Monitor */}
                    <Panel defaultSize={40} minSize={20}>
                      <ResourceMonitor
                                              // executionResult={executionResult}
                                              isExecuting={isExecuting}
                                              // sandboxConfig={sandboxConfig}
                                              className="h-full" metrics={[]} config={sandboxConfig}                      />
                    </Panel>
                  </>
                )}

                {showCollaboration && (
                  <>
                    <PanelResizeHandle className="bg-slate-600 hover:bg-slate-500 transition-colors" />
                    
                    {/* Collaboration Panel */}
                    <Panel defaultSize={30} minSize={20}>
                      <CollaborationPanel
                                              // isCollaborating={isCollaborating}
                                              collaborators={collaborators}
                                              //onToggleCollaboration={setIsCollaborating}
                                              className="h-full border-0" isActive={false} onToggle={function (active: boolean): void {
                                                  throw new Error('Function not implemented.');
                                              } }                      />
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </CardContent>
      </Card>

      {/* Sandboxed Executor (Hidden) */}
      <SandboxedExecutor
        language={selectedLanguage}
        code={code}
        input={input}
        config={sandboxConfig}
        onResult={setExecutionResult}
        isVisible={false}
      />
    </div>
  );
}
