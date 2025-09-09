'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Play, Square, Save, Share2, Download, Settings, Zap, PackageOpen, Shield, Users, Maximize2, Minimize2, RotateCcw, HelpCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useHotkeys } from 'react-hotkeys-hook';

import { getAllLanguages, getLanguageConfig } from '@/lib/code-generator/language-configs';
import { CodeEditor, SandpackProvider } from '@codesandbox/sandpack-react';
import { CollaborationPanel } from './collaboration-panel';
import { LanguageSelector } from './language-selector';
import { OutputConsole } from './output-console';
import { CodeEditor as MonacoCodeEditor } from './code-editor';
import { PackageManagerPanel } from './package-manager-panel';
import { SandboxSettings } from './sandbox-settings';

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

interface SandboxSettings {
  timeout: number;
  memory: number;
  cpuLimit: number;
  networkAccess: boolean;
  fileSystemAccess: boolean;
  dockerSecurity: boolean;
}

interface CodePlaygroundProps {
  initialLanguage?: string;
  initialCode?: string;
  collaborationEnabled?: boolean;
  sandboxingEnabled?: boolean;
  packageManagerEnabled?: boolean;
  className?: string;
}

export function CodePlayground({
  initialLanguage = 'javascript',
  initialCode = '',
  collaborationEnabled = false,
  sandboxingEnabled = true,
  packageManagerEnabled = true,
  className = ''
}: CodePlaygroundProps) {
  // State management
  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage);
  const languages = getAllLanguages();
  const currentLanguageConfig = getLanguageConfig(selectedLanguage);
  const [code, setCode] = useState(initialCode || currentLanguageConfig?.defaultCode || '');
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionResult[]>([]);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPackageManager, setShowPackageManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [sandboxSettings, setSandboxSettings] = useState<SandboxSettings>({
    timeout: 30,
    memory: 256,
    cpuLimit: 50,
    networkAccess: false,
    fileSystemAccess: false,
    dockerSecurity: true
  });
  
  // Panel layout state
  const [panelLayout, setPanelLayout] = useState([60, 40]);
  const [rightPanelLayout, setRightPanelLayout] = useState([70, 30]);
  
  // Refs
  const editorRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playgroundRef = useRef<HTMLDivElement>(null);
  
  // Professional keyboard shortcuts with improved UX
  useHotkeys('ctrl+enter, cmd+enter', (e) => {
    e.preventDefault();
    if (!isExecuting) executeCode();
  }, { enableOnFormTags: true });

  useHotkeys('ctrl+s, cmd+s', (e) => {
    e.preventDefault();
    saveCode();
  }, { enableOnFormTags: true });

  useHotkeys('ctrl+shift+f, cmd+shift+f', (e) => {
    e.preventDefault();
    setIsFullscreen(!isFullscreen);
  }, { enableOnFormTags: true });

  useHotkeys('ctrl+shift+p, cmd+shift+p', (e) => {
    e.preventDefault();
    setShowPackageManager(!showPackageManager);
  }, { enableOnFormTags: true });

  useHotkeys('ctrl+shift+c, cmd+shift+c', (e) => {
    e.preventDefault();
    if (collaborationEnabled) setIsCollaborating(!isCollaborating);
  }, { enableOnFormTags: true });

  useHotkeys('escape', (e) => {
    if (isFullscreen) {
      e.preventDefault();
      setIsFullscreen(false);
    }
  }, { enableOnFormTags: true });
  // Handle language change with validation and auto-save
  const handleLanguageChange = useCallback((language: string) => {
    if (language === selectedLanguage) return;
    
    // Auto-save current code if it's been modified
    if (code && code !== currentLanguageConfig?.defaultCode) {
      const autosaveKey = `playground_autosave_${selectedLanguage}`;
      localStorage.setItem(autosaveKey, JSON.stringify({
        code,
        timestamp: Date.now(),
        language: selectedLanguage
      }));
    }
    
    setSelectedLanguage(language);
    const config = getLanguageConfig(language);
    const currentConfig = getLanguageConfig(selectedLanguage);
    
    // Load autosaved code or default
    const autosaveKey = `playground_autosave_${language}`;
    const autosaved = localStorage.getItem(autosaveKey);
    
    if (autosaved) {
      try {
        const { code: savedCode, timestamp } = JSON.parse(autosaved);
        // Use autosaved code if it's less than 24 hours old
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          setCode(savedCode);
          toast.info('Restored previously saved code');
        } else {
          setCode(config?.defaultCode || '');
        }
      } catch {
        setCode(config?.defaultCode || '');
      }
    } else if (config && (!code || code === currentConfig?.defaultCode)) {
      setCode(config.defaultCode);
    }
    
    setExecutionResult(null);
    setInstalledPackages([]); // Reset packages for new language
  }, [selectedLanguage, code, currentLanguageConfig]);

  // Enhanced code execution with advanced sandboxing
  const executeCode = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Please enter some code to execute');
      return;
    }

    if (isExecuting) {
      toast.warning('Execution already in progress');
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);

    // Validate code before execution
    try {
      const validationResponse = await fetch('/api/code-generator/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: selectedLanguage,
          code: code.slice(0, 100000), // Limit code size
        }),
      });

      if (!validationResponse.ok) {
        const validation = await validationResponse.json();
        if (validation.severity === 'error') {
          toast.error(`Code validation failed: ${validation.message}`);
          setIsExecuting(false);
          return;
        } else if (validation.severity === 'warning') {
          toast.warning(`Code validation warning: ${validation.message}`);
        }
      }
    } catch (error) {
      console.warn('Validation service unavailable, proceeding with execution');
    }

    try {
      const startTime = Date.now();
      
      const response = await fetch('/api/code-generator/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: selectedLanguage,
          code,
          input: input.trim() || undefined,
          packages: installedPackages,
          options: {
            ...sandboxSettings,
            executionId: `${selectedLanguage}_${Date.now()}`,
            securityLevel: sandboxingEnabled ? 'strict' : 'normal',
            resourceLimits: {
              timeout: sandboxSettings.timeout * 1000,
              memory: sandboxSettings.memory * 1024 * 1024,
              cpu: sandboxSettings.cpuLimit
            }
          }
        }),
      });

      const result: ExecutionResult = await response.json();
      const actualExecutionTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(result.error || 'Execution failed');
      }

      // Enhance result with client-side timing
      result.executionTime = result.executionTime || actualExecutionTime;

      setExecutionResult(result);
      setExecutionHistory(prev => [result, ...prev.slice(0, 19)]); // Keep last 20 results

      if (result.success) {
        toast.success(`Code executed successfully in ${result.executionTime}ms`, {
          description: `Memory used: ${result.memoryUsed}MB`
        });
      } else {
        toast.error(`Execution failed: ${result.error}`, {
          description: `Exit code: ${result.exitCode}`
        });
      }

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((warning, index) => {
          setTimeout(() => {
            toast.warning(warning);
          }, index * 1000);
        });
      }

      // Auto-save successful executions
      if (result.success) {
        const projectKey = `playground_project_${selectedLanguage}`;
        localStorage.setItem(projectKey, JSON.stringify({
          code,
          result,
          timestamp: Date.now(),
          language: selectedLanguage,
          packages: installedPackages
        }));
      }

    } catch (error: any) {
      console.error('Execution error:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      
      toast.error(`Execution failed: ${errorMessage}`, {
        description: 'Please check your code and try again'
      });
      
      setExecutionResult({
        success: false,
        error: errorMessage,
        executionTime: 0,
        memoryUsed: 0,
        exitCode: 1,
        executionId: `error_${Date.now()}`,
        language: selectedLanguage,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsExecuting(false);
    }
  }, [code, input, selectedLanguage, installedPackages, sandboxSettings, sandboxingEnabled, isExecuting]);

  // Utility functions
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Handle saving code
  const saveCode = useCallback(async () => {
    try {
      // TODO: Implement code saving to user projects
      toast.success('Code saved successfully');
    } catch (error) {
      toast.error('Failed to save code');
    }
  }, [code, selectedLanguage]);

  // Handle sharing code
  const shareCode = useCallback(async () => {
    try {
      // Create shareable link with code and language
      const shareData = {
        language: selectedLanguage,
        code,
        input
      };
      
      const encoded = btoa(JSON.stringify(shareData));
      const shareUrl = `${window.location.origin}/playground?share=${encoded}`;
      
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied to clipboard');
    } catch (error) {
      toast.error('Failed to create share link');
    }
  }, [code, input, selectedLanguage]);

  // Handle downloading code
  const downloadCode = useCallback(() => {
    const filename = `code.${currentLanguageConfig?.fileExtension?.replace('.', '') || 'txt'}`;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Code downloaded as ${filename}`);
  }, [code, currentLanguageConfig]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey)) {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            executeCode();
            break;
          case 's':
            e.preventDefault();
            saveCode();
            break;
          case 'l':
            e.preventDefault();
            // Focus language selector
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeCode, saveCode]);

  // Initialize collaboration if enabled
  useEffect(() => {
    if (collaborationEnabled && !wsRef.current) {
      // TODO: Initialize WebSocket for real-time collaboration
      console.log('Collaboration mode enabled');
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [collaborationEnabled]);

  return (
    <div 
      ref={playgroundRef}
      className={`code-playground h-screen flex flex-col bg-background ${isFullscreen ? 'fixed inset-0 z-50' : ''} ${className}`}
    >
      {/* Professional Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">Code Playground</h1>
              {sandboxingEnabled && (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Sandboxed
                </Badge>
              )}
            </div>
            
            <LanguageSelector
              selectedLanguage={selectedLanguage}
              onLanguageChange={handleLanguageChange}
            />
            
            <Badge variant="outline" className="text-xs">
              {currentLanguageConfig?.version}
            </Badge>
            
            {installedPackages.length > 0 && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <PackageOpen className="w-3 h-3" />
                {installedPackages.length} packages
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {packageManagerEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPackageManager(!showPackageManager)}
                className="flex items-center gap-2"
              >
                <PackageOpen className="w-4 h-4" />
                Packages
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={saveCode}
              disabled={isExecuting}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={shareCode}
              disabled={isExecuting}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCode}
              disabled={isExecuting}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="flex items-center gap-2"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              {isFullscreen ? 'Exit' : 'Fullscreen'}
            </Button>
            
            {collaborationEnabled && (
              <Button
                variant={isCollaborating ? "default" : "outline"}
                size="sm"
                onClick={() => setIsCollaborating(!isCollaborating)}
                className="flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Collaborate
                {collaborators.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {collaborators.length}
                  </Badge>
                )}
              </Button>
            )}
            
            <Button
              onClick={executeCode}
              disabled={isExecuting}
              className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
            >
              {isExecuting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isExecuting ? 'Running...' : 'Run Code'}
            </Button>
          </div>
        </div>
      </div>

      {/* Professional Resizable Panel Layout */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" onLayout={setPanelLayout}>
          {/* Code Editor Panel */}
          <Panel defaultSize={60} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="border-b p-2 bg-muted/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    {currentLanguageConfig?.displayName} Editor
                    {sandboxingEnabled && (
                      <Shield className="w-4 h-4 text-green-600" />
                    )}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{code.length} chars</span>
                    <span>{code.split('\n').length} lines</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCode(currentLanguageConfig?.defaultCode || '');
                        toast.info('Code reset to default');
                      }}
                      className="h-6 px-2"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 relative">
                <MonacoCodeEditor
                  ref={editorRef}
                  language={selectedLanguage}
                  value={code}
                  onChange={setCode}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: code.length > 1000 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    fontSize: 14,
                    fontFamily: "'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                    fontLigatures: true,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    selectOnLineNumbers: true,
                    roundedSelection: false,
                    readOnly: false,
                    cursorStyle: 'line',
                    acceptSuggestionOnCommitCharacter: true,
                    acceptSuggestionOnEnter: 'on',
                    accessibilitySupport: 'auto',
                    autoIndent: 'advanced',
                    colorDecorators: true,
                    contextmenu: true,
                    copyWithSyntaxHighlighting: true,
                    detectIndentation: true,
                    dragAndDrop: true,
                    folding: true,
                    foldingHighlight: true,
                    formatOnPaste: true,
                    formatOnType: true,
                    hover: { enabled: true },
                    links: true,
                    mouseWheelZoom: true,
                    multiCursorModifier: 'alt',
                    parameterHints: { enabled: true },
                    quickSuggestions: true,
                    renderWhitespace: 'selection',
                    showFoldingControls: 'mouseover',
                    smoothScrolling: true,
                    suggest: { showKeywords: true },
                    suggestOnTriggerCharacters: true,
                    tabCompletion: 'on',
                    useTabStops: true,
                    bracketPairColorization: { enabled: true }
                  }}
                />
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-2 bg-border hover:bg-border/80 active:bg-border/60 transition-colors" />

          {/* Right Panel */}
          <Panel defaultSize={40} minSize={25}>
            <PanelGroup direction="vertical" onLayout={setRightPanelLayout}>
              {/* Output/Console Panel */}
              <Panel defaultSize={70} minSize={30}>
                <Tabs defaultValue="output" className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-4 rounded-none border-b">
                    <TabsTrigger value="output">Output</TabsTrigger>
                    <TabsTrigger value="input">Input</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    {collaborationEnabled && (
                      <TabsTrigger value="collaboration">
                        Collaborate
                        {collaborators.length > 0 && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {collaborators.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="output" className="flex-1 m-0">
                    <OutputConsole
                      result={executionResult}
                      history={executionHistory}
                      isExecuting={isExecuting}
                    />
                  </TabsContent>

                  <TabsContent value="input" className="flex-1 m-0 p-4">
                    <div className="h-full flex flex-col">
                      <label className="text-sm font-medium mb-2">Program Input</label>
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Enter input for your ${currentLanguageConfig?.displayName} program...`}
                        className="flex-1 p-3 border rounded-md resize-none font-mono text-sm bg-background"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        This input will be provided to your program via stdin
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="flex-1 m-0 p-4">
                    <div className="h-full flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium">Execution History</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setExecutionHistory([]);
                            toast.info('Execution history cleared');
                          }}
                          disabled={executionHistory.length === 0}
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="flex-1 overflow-auto space-y-2">
                        {executionHistory.length === 0 ? (
                          <div className="text-center text-muted-foreground py-8">
                            No execution history yet
                          </div>
                        ) : (
                          executionHistory.map((result, index) => (
                            <Card key={result.executionId} className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {result.success ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-600" />
                                  )}
                                  <span className="text-sm font-medium">{result.language}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatTimestamp(result.timestamp)}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {result.executionTime}ms • {result.memoryUsed}MB
                              </div>
                            </Card>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {collaborationEnabled && (
                    <TabsContent value="collaboration" className="flex-1 m-0">
                      <CollaborationPanel
                        collaborators={collaborators}
                        isActive={isCollaborating}
                        onToggle={setIsCollaborating}
                      />
                    </TabsContent>
                  )}
                </Tabs>
              </Panel>

              {/* Package Manager Panel (collapsible) */}
              {showPackageManager && packageManagerEnabled && (
                <>
                  <PanelResizeHandle className="h-2 bg-border hover:bg-border/80 active:bg-border/60 transition-colors" />
                  <Panel defaultSize={30} minSize={20}>
                    <PackageManagerPanel
                      language={selectedLanguage}
                      installedPackages={installedPackages}
                      onPackageInstall={(pkg) => {
                        setInstalledPackages(prev => [...prev, pkg]);
                        toast.success(`Package ${pkg} installed`);
                      }}
                      onPackageUninstall={(pkg) => {
                        setInstalledPackages(prev => prev.filter(p => p !== pkg));
                        toast.info(`Package ${pkg} uninstalled`);
                      }}
                    />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Enhanced Status Bar */}
      <div className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Language: {currentLanguageConfig?.displayName}</span>
            {executionResult && (
              <>
                <span>•</span>
                <span>Execution Time: {executionResult.executionTime}ms</span>
                <span>•</span>
                <span>Memory: {executionResult.memoryUsed}MB</span>
                <span>•</span>
                <span className={executionResult.success ? 'text-green-600' : 'text-red-600'}>
                  {executionResult.success ? 'Success' : 'Failed'}
                </span>
              </>
            )}
            {sandboxingEnabled && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Secure Sandbox
                </span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <span>⌘+Enter to run</span>
            <span>•</span>
            <span>⌘+S to save</span>
            <span>•</span>
            <span>⌘+⇧+F fullscreen</span>
            <span>•</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 px-1 text-xs"
              onClick={() => {
                toast.info('Keyboard Shortcuts', {
                  description: '⌘+Enter: Run • ⌘+S: Save • ⌘+⇧+F: Fullscreen • ⌘+⇧+P: Packages • ⌘+⇧+C: Collaborate • Esc: Exit fullscreen'
                });
              }}
            >
              <HelpCircle className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SandboxSettings
          settings={sandboxSettings}
          onSettingsChange={setSandboxSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
