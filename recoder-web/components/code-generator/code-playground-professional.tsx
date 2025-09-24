'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { Monaco } from '@monaco-editor/react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, 
  Square, 
  Save, 
  Share2, 
  Settings, 
  Download, 
  Upload,
  Copy,
  Users,
  MessageSquare,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RotateCcw,
  Trash2,
  Clock,
  Zap,
  Cpu,
  MemoryStick,
  Terminal,
  FileText,
  Bug,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Plus,
  X
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import dynamic from 'next/dynamic';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center">Loading editor...</div>
});

interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  stderr?: string;
  executionTime: number;
  memoryUsed: number;
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

interface Language {
  id: string;
  name: string;
  extension: string;
  template: string;
  packages?: string[];
}

const LANGUAGES: Language[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    extension: 'js',
    template: `// JavaScript Playground
console.log('Hello, World!');

// Example: Calculate fibonacci numbers
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log('Fibonacci 10:', fibonacci(10));

// Example: Array manipulation
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log('Doubled:', doubled);`,
    packages: ['lodash', 'axios', 'moment']
  },
  {
    id: 'python',
    name: 'Python',
    extension: 'py',
    template: `# Python Playground
print("Hello, World!")

# Example: Calculate fibonacci numbers
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(f"Fibonacci 10: {fibonacci(10)}")

# Example: List comprehension
numbers = [1, 2, 3, 4, 5]
doubled = [n * 2 for n in numbers]
print(f"Doubled: {doubled}")`,
    packages: ['requests', 'numpy', 'pandas']
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    extension: 'ts',
    template: `// TypeScript Playground
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com'
};

console.log('User:', user);

// Example: Generic function
function identity<T>(arg: T): T {
  return arg;
}

console.log('Identity string:', identity('hello'));
console.log('Identity number:', identity(42));`,
    packages: ['@types/node']
  }
];

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  cursor?: { line: number; column: number };
  selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
}

export default function CodePlaygroundProfessional() {
  const { toast } = useToast();
  
  // Editor and execution state
  const [code, setCode] = useState(LANGUAGES[0].template);
  const [language, setLanguage] = useState<Language>(LANGUAGES[0]);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionResult[]>([]);
  
  // Editor configuration
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(true);
  const [minimap, setMinimap] = useState(true);
  
  // UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  
  // Collaboration state
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const [isCollaborationEnabled, setIsCollaborationEnabled] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ user: string; message: string; timestamp: Date }>>([]);
  
  // Packages and libraries
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [customPackage, setCustomPackage] = useState('');
  
  // Performance monitoring
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    lastExecution?: number;
    avgExecutionTime?: number;
    memoryUsage?: number;
    executionCount: number;
  }>({ executionCount: 0 });
  
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const handleEditorDidMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Configure editor
    editor.updateOptions({
      fontSize,
      wordWrap: wordWrap ? 'on' : 'off',
      minimap: { enabled: minimap },
      lineNumbers: showLineNumbers ? 'on' : 'off',
      scrollBeyondLastLine: false,
      automaticLayout: true,
    });

    // Add custom keybindings
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeCode();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveCode();
    });

    // Setup collaboration features
    if (isCollaborationEnabled) {
      setupCollaboration(editor, monaco);
    }
  }, [fontSize, wordWrap, minimap, showLineNumbers, isCollaborationEnabled]);

  const setupCollaboration = (editor: any, monaco: any) => {
    // Track cursor position
    editor.onDidChangeCursorPosition((e: any) => {
      // Emit cursor position to collaborators
      const position = { line: e.position.lineNumber, column: e.position.column };
      // WebSocket emission would go here
    });

    // Track selection changes
    editor.onDidChangeCursorSelection((e: any) => {
      const selection = {
        startLine: e.selection.startLineNumber,
        startColumn: e.selection.startColumn,
        endLine: e.selection.endLineNumber,
        endColumn: e.selection.endColumn
      };
      // WebSocket emission would go here
    });

    // Add decorations for other users' cursors
    collaborators.forEach(user => {
      if (user.cursor) {
        const decoration = [{
          range: new monaco.Range(user.cursor.line, user.cursor.column, user.cursor.line, user.cursor.column + 1),
          options: {
            className: `collaboration-cursor-${user.id}`,
            hoverMessage: { value: user.name },
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
          }
        }];
        editor.deltaDecorations([], decoration);
      }
    });
  };

  const executeCode = async () => {
    if (isExecuting) return;
    
    setIsExecuting(true);
    setOutput('Executing...');
    
    const startTime = Date.now();
    
    try {
      const response = await fetch('/api/code-generator/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: language.id,
          code,
          input,
          options: {
            timeout: 30,
            memory: 256,
            libraries: selectedPackages,
            debug: false
          }
        }),
      });

      const result: ExecutionResult = await response.json();
      
      setExecutionResult(result);
      setOutput(result.success ? result.output || '' : result.error || 'Execution failed');
      
      if (result.success) {
        toast({
          title: "Code executed successfully",
          description: `Completed in ${result.executionTime}ms`,
        });
      } else {
        toast({
          title: "Execution failed",
          description: result.error,
          variant: "destructive",
        });
      }
      
      // Add to history
      setExecutionHistory(prev => [result, ...prev.slice(0, 9)]);
      
      // Update performance metrics
      const executionTime = Date.now() - startTime;
      setPerformanceMetrics(prev => ({
        lastExecution: executionTime,
        avgExecutionTime: prev.executionCount === 0 
          ? executionTime 
          : ((prev.avgExecutionTime || 0) * prev.executionCount + executionTime) / (prev.executionCount + 1),
        memoryUsage: result.memoryUsed,
        executionCount: prev.executionCount + 1
      }));
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setOutput(`Error: ${errorMessage}`);
      toast({
        title: "Execution error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const saveCode = () => {
    const codeData = {
      code,
      language: language.id,
      timestamp: new Date().toISOString(),
      packages: selectedPackages
    };
    
    localStorage.setItem(`code-playground-${language.id}`, JSON.stringify(codeData));
    toast({
      title: "Code saved",
      description: "Code has been saved to local storage",
    });
  };

  const loadCode = () => {
    const saved = localStorage.getItem(`code-playground-${language.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setCode(data.code);
        setSelectedPackages(data.packages || []);
        toast({
          title: "Code loaded",
          description: "Previously saved code has been loaded",
        });
      } catch (error) {
        toast({
          title: "Load failed",
          description: "Failed to load saved code",
          variant: "destructive",
        });
      }
    }
  };

  const shareCode = () => {
    const shareData = {
      code,
      language: language.id,
      packages: selectedPackages
    };
    
    const shareUrl = `${window.location.origin}/code-playground?shared=${btoa(JSON.stringify(shareData))}`;
    navigator.clipboard.writeText(shareUrl);
    
    toast({
      title: "Share link copied",
      description: "Share link has been copied to clipboard",
    });
    
    setIsShareDialogOpen(false);
  };

  const resetCode = () => {
    setCode(language.template);
    setInput('');
    setOutput('');
    setExecutionResult(null);
    setSelectedPackages([]);
    toast({
      title: "Code reset",
      description: "Code has been reset to template",
    });
  };

  const changeLanguage = (newLanguage: Language) => {
    setLanguage(newLanguage);
    setCode(newLanguage.template);
    setSelectedPackages([]);
    setOutput('');
    setExecutionResult(null);
  };

  const addPackage = () => {
    if (customPackage && !selectedPackages.includes(customPackage)) {
      setSelectedPackages([...selectedPackages, customPackage]);
      setCustomPackage('');
    }
  };

  const removePackage = (pkg: string) => {
    setSelectedPackages(selectedPackages.filter(p => p !== pkg));
  };

  const downloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${language.extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatCode = () => {
    if (editorRef.current && monacoRef.current) {
      editorRef.current.getAction('editor.action.formatDocument').run();
      toast({
        title: "Code formatted",
        description: "Code has been automatically formatted",
      });
    }
  };

  useEffect(() => {
    // Load saved code when language changes
    loadCode();
  }, [language.id]);

  return (
    <div className={`h-screen flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Code Playground</h1>
          <Select value={language.id} onValueChange={(value) => {
            const lang = LANGUAGES.find(l => l.id === value);
            if (lang) changeLanguage(lang);
          }}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(lang => (
                <SelectItem key={lang.id} value={lang.id}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {/* Performance Metrics */}
          {performanceMetrics.executionCount > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground border rounded-md px-3 py-1">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {performanceMetrics.lastExecution}ms
              </div>
              <div className="flex items-center gap-1">
                <MemoryStick className="h-3 w-3" />
                {Math.round((performanceMetrics.memoryUsage || 0) / 1024)}KB
              </div>
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {performanceMetrics.executionCount} runs
              </div>
            </div>
          )}

          {/* Collaboration Status */}
          {isCollaborationEnabled && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <Badge variant="secondary">{collaborators.length + 1}</Badge>
            </div>
          )}

          {/* Action Buttons */}
          <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
          
          <Button variant="outline" size="sm" onClick={saveCode}>
            <Save className="h-4 w-4" />
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => setIsShareDialogOpen(true)}>
            <Share2 className="h-4 w-4" />
          </Button>
          
          <Button variant="outline" size="sm" onClick={downloadCode}>
            <Download className="h-4 w-4" />
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          
          <Button 
            onClick={executeCode} 
            disabled={isExecuting}
            className="min-w-[100px]"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <Allotment defaultSizes={[60, 40]}>
          {/* Left Panel - Code Editor */}
          <Allotment.Pane minSize={300}>
            <div className="h-full flex flex-col">
              {/* Editor Toolbar */}
              <div className="flex items-center justify-between p-2 border-b bg-muted/50">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{language.name}</Badge>
                  {executionResult && (
                    <Badge variant={executionResult.success ? "default" : "destructive"}>
                      {executionResult.success ? (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      ) : (
                        <XCircle className="h-3 w-3 mr-1" />
                      )}
                      {executionResult.success ? 'Success' : 'Error'}
                    </Badge>
                  )}
                  {executionResult?.warnings && executionResult.warnings.length > 0 && (
                    <Badge variant="secondary">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {executionResult.warnings.length} warnings
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={formatCode}>
                    Format
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetCode}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Monaco Editor */}
              <div className="flex-1">
                <MonacoEditor
                  height="100%"
                  language={language.id === 'typescript' ? 'typescript' : language.id}
                  theme={editorTheme}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  onMount={handleEditorDidMount}
                  options={{
                    fontSize,
                    wordWrap: wordWrap ? 'on' : 'off',
                    minimap: { enabled: minimap },
                    lineNumbers: showLineNumbers ? 'on' : 'off',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    bracketPairColorization: { enabled: true },
                    guides: { indentation: true },
                    hover: { enabled: true },
                    contextmenu: true,
                    folding: true,
                    renderLineHighlight: 'all',
                    occurrencesHighlight: 'singleFile',
                    selectionHighlight: true,
                  }}
                />
              </div>
            </div>
          </Allotment.Pane>

          {/* Right Panel */}
          <Allotment.Pane minSize={300}>
            <Allotment vertical defaultSizes={[30, 70]}>
              {/* Top Right - Input/Packages */}
              <Allotment.Pane minSize={200}>
                <Tabs defaultValue="input" className="h-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="input">Input</TabsTrigger>
                    <TabsTrigger value="packages">Packages</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="input" className="h-full">
                    <Card className="h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Standard Input</CardTitle>
                        <CardDescription className="text-xs">
                          Input data for your program
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <Textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="Enter input data here..."
                          className="h-full resize-none"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="packages" className="h-full">
                    <Card className="h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Packages & Libraries</CardTitle>
                        <CardDescription className="text-xs">
                          Add external packages to your code
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Add custom package */}
                        <div className="flex gap-2">
                          <Input
                            value={customPackage}
                            onChange={(e) => setCustomPackage(e.target.value)}
                            placeholder="Package name..."
                            className="text-sm"
                          />
                          <Button size="sm" onClick={addPackage}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        
                        {/* Popular packages for current language */}
                        {language.packages && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">Popular packages:</Label>
                            <div className="flex flex-wrap gap-1">
                              {language.packages.map(pkg => (
                                <Button
                                  key={pkg}
                                  variant={selectedPackages.includes(pkg) ? "default" : "outline"}
                                  size="sm"
                                  className="text-xs h-6"
                                  onClick={() => {
                                    if (selectedPackages.includes(pkg)) {
                                      removePackage(pkg);
                                    } else {
                                      setSelectedPackages([...selectedPackages, pkg]);
                                    }
                                  }}
                                >
                                  {pkg}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Selected packages */}
                        {selectedPackages.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">Selected packages:</Label>
                            <div className="space-y-1">
                              {selectedPackages.map(pkg => (
                                <div key={pkg} className="flex items-center justify-between text-xs">
                                  <span className="font-mono">{pkg}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-4 w-4 p-0"
                                    onClick={() => removePackage(pkg)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="history" className="h-full">
                    <Card className="h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Execution History</CardTitle>
                        <CardDescription className="text-xs">
                          Previous execution results
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-40">
                          {executionHistory.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No executions yet</p>
                          ) : (
                            <div className="space-y-2">
                              {executionHistory.map((result, index) => (
                                <div
                                  key={index}
                                  className="flex items-center justify-between p-2 border rounded text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    {result.success ? (
                                      <CheckCircle className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-red-600" />
                                    )}
                                    <span>{result.executionTime}ms</span>
                                  </div>
                                  <span className="text-muted-foreground">
                                    {result.timestamp ? new Date(result.timestamp).toLocaleTimeString() : 'No timestamp'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </Allotment.Pane>

              {/* Bottom Right - Output */}
              <Allotment.Pane minSize={200}>
                <Card className="h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Output</CardTitle>
                      <div className="flex items-center gap-2">
                        {executionResult && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{executionResult.executionTime}ms</span>
                            <span>{Math.round(executionResult.memoryUsed / 1024)}KB</span>
                          </div>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setOutput('')}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ScrollArea className="h-full">
                      <pre className="text-sm font-mono whitespace-pre-wrap">
                        {output || 'Click "Run" to execute your code...'}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editor Settings</DialogTitle>
            <DialogDescription>
              Customize your coding environment
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Theme</Label>
              <Select value={editorTheme} onValueChange={setEditorTheme}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vs-light">Light</SelectItem>
                  <SelectItem value="vs-dark">Dark</SelectItem>
                  <SelectItem value="hc-black">High Contrast</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Font Size</Label>
              <Input
                type="number"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                min="10"
                max="24"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="wordWrap"
                checked={wordWrap}
                onChange={(e) => setWordWrap(e.target.checked)}
              />
              <Label htmlFor="wordWrap">Word Wrap</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="minimap"
                checked={minimap}
                onChange={(e) => setMinimap(e.target.checked)}
              />
              <Label htmlFor="minimap">Minimap</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="lineNumbers"
                checked={showLineNumbers}
                onChange={(e) => setShowLineNumbers(e.target.checked)}
              />
              <Label htmlFor="lineNumbers">Line Numbers</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="collaboration"
                checked={isCollaborationEnabled}
                onChange={(e) => setIsCollaborationEnabled(e.target.checked)}
              />
              <Label htmlFor="collaboration">Enable Collaboration</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setIsSettingsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Code</DialogTitle>
            <DialogDescription>
              Share your code with others via a link
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will create a shareable link containing your current code, language, and selected packages.
            </p>
            
            <div className="flex items-center gap-2">
              <Button onClick={shareCode} className="flex-1">
                <Copy className="h-4 w-4 mr-2" />
                Copy Share Link
              </Button>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}