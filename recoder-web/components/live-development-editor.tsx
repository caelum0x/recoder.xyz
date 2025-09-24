'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, Users, Code, Globe, Eye, Copy, Settings, Zap, 
  Terminal, Save, Share, Download, GitBranch, Cloud, 
  Monitor, Smartphone, Server, Sparkles, Layers, Clock,
  CheckCircle, AlertCircle, Loader2, X, RefreshCw, Plus
} from 'lucide-react';

// 🚀 LIVE DEVELOPMENT EDITOR - BOLT.NEW DESTROYER
// Real-time collaborative development with AI-powered features

interface LiveProject {
  id: string;
  name: string;
  type: 'web' | 'mobile' | 'fullstack';
  framework: string;
  files: Map<string, LiveFile>;
  preview: {
    url: string;
    status: 'building' | 'ready' | 'error';
    buildTime: number;
  };
  collaboration: {
    activeUsers: Array<{
      id: string;
      name: string;
      cursor: { file: string; line: number; column: number };
      color: string;
    }>;
    changes: Array<{
      timestamp: string;
      userId: string;
      action: 'edit' | 'create' | 'delete' | 'rename';
      file: string;
      content?: string;
    }>;
  };
  deployment: {
    provider: 'vercel' | 'netlify' | 'railway';
    url?: string;
    status: 'idle' | 'deploying' | 'deployed' | 'failed';
    lastDeploy: string;
  };
  ai: {
    suggestions: Array<{
      file: string;
      line: number;
      type: 'improvement' | 'bug' | 'optimization' | 'feature';
      message: string;
      code?: string;
    }>;
    autoComplete: boolean;
    codeGeneration: boolean;
  };
}

interface LiveFile {
  path: string;
  content: string;
  language: string;
  lastModified: string;
  size: number;
  collaborative: {
    cursors: Array<{
      userId: string;
      line: number;
      column: number;
    }>;
    selections: Array<{
      userId: string;
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    }>;
  };
}

interface CodeCompletion {
  completions: string[];
  suggestions: Array<{
    type: 'improvement' | 'bug' | 'optimization' | 'feature';
    line: number;
    message: string;
    code?: string;
  }>;
}

export default function LiveDevelopmentEditor() {
  // Project state
  const [currentProject, setCurrentProject] = useState<LiveProject | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Utility: Copy code to clipboard
  const copyCodeToClipboard = (code: string) => {
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    } else {
      // fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  // Editor state
  const [activeFile, setActiveFile] = useState<string>('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [aiCompletions, setAiCompletions] = useState<CodeCompletion | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Creation form state
  const [projectForm, setProjectForm] = useState({
    name: '',
    type: 'web' as 'web' | 'mobile' | 'fullstack',
    framework: 'nextjs',
    template: 'default',
    userId: 'dev_user',
    userName: 'Developer'
  });

  // Component generation state
  const [componentDialog, setComponentDialog] = useState({
    open: false,
    componentName: '',
    description: '',
    type: 'component' as 'component' | 'page' | 'hook' | 'utility',
    props: [] as string[],
    styling: 'tailwind' as 'tailwind' | 'css' | 'styled-components'
  });

  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  // Auto-save interval
  useEffect(() => {
    if (!currentProject || !activeFile || !editorContent) return;

    const saveTimer = setTimeout(() => {
      handleFileSave();
    }, 1000); // Auto-save after 1 second of inactivity

    return () => clearTimeout(saveTimer);
  }, [editorContent]);

  // Load active file content
  useEffect(() => {
    if (currentProject && activeFile) {
      const file = currentProject.files.get(activeFile);
      if (file) {
        setEditorContent(file.content);
      }
    }
  }, [activeFile, currentProject]);

  // 🚀 CREATE NEW LIVE PROJECT
  const createLiveProject = async () => {
    if (!projectForm.name.trim()) {
      setError('Please provide a project name');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      console.log('🚀 Creating live development project...');
      
      const response = await fetch('/api/live-development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-project',
          ...projectForm
        })
      });

      if (!response.ok) {
        throw new Error(`Project creation failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create live project');
      }

      console.log('✅ Live project created:', data.project);
      setCurrentProject(data.project);
      
      // Set first file as active
      const firstFile = Array.from(data.project.files.keys())[0];
      if (firstFile && typeof firstFile === 'string') {
        setActiveFile(firstFile);
      }

    } catch (error) {
      console.error('❌ Live project creation failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setCreating(false);
    }
  };

  // 💾 SAVE FILE WITH REAL-TIME COLLABORATION
  const handleFileSave = async () => {
    if (!currentProject || !activeFile || !editorContent) return;

    try {
      const response = await fetch('/api/live-development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit-file',
          projectId: currentProject.id,
          filePath: activeFile,
          content: editorContent,
          userId: projectForm.userId,
          cursor: cursorPosition
        })
      });

      if (!response.ok) {
        throw new Error(`File save failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Update project with new data
        const updatedProject = { ...currentProject };
        const file = updatedProject.files.get(activeFile);
        if (file) {
          file.content = editorContent;
          file.lastModified = new Date().toISOString();
          file.size = editorContent.length;
        }
        
        setCurrentProject(updatedProject);
        
        // Update AI suggestions
        if (data.suggestions) {
          setAiCompletions({ 
            completions: [], 
            suggestions: data.suggestions 
          });
        }

        // Refresh preview
        if (previewRef.current && data.preview) {
          previewRef.current.src = data.preview + '?t=' + Date.now();
        }
      }

    } catch (error) {
      console.error('Failed to save file:', error);
      setError('Failed to save file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // 🤖 GET AI CODE COMPLETION
  const getAICompletion = async () => {
    if (!currentProject || !activeFile || !editorContent) return;

    try {
      const response = await fetch('/api/live-development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai-completion',
          projectId: currentProject.id,
          filePath: activeFile,
          content: editorContent,
          cursor: cursorPosition,
          context: 'User requested AI completion'
        })
      });

      if (!response.ok) {
        throw new Error(`AI completion failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setAiCompletions(data);
        setShowSuggestions(true);
      }

    } catch (error) {
      console.error('AI completion failed:', error);
    }
  };

  // 🔨 GENERATE COMPONENT WITH AI
  const generateComponent = async () => {
    if (!currentProject || !componentDialog.componentName) return;

    setLoading(true);

    try {
      const response = await fetch('/api/live-development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-component',
          projectId: currentProject.id,
          ...componentDialog
        })
      });

      if (!response.ok) {
        throw new Error(`Component generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Refresh project data
        const updatedProject = await fetchProjectData(currentProject.id);
        if (updatedProject) {
          setCurrentProject(updatedProject);
          
          // Open first generated file
          if (data.files && data.files.length > 0) {
            setActiveFile(data.files[0].path);
          }
        }

        setComponentDialog({
          open: false,
          componentName: '',
          description: '',
          type: 'component',
          props: [],
          styling: 'tailwind'
        });
      }

    } catch (error) {
      console.error('Component generation failed:', error);
      setError('Failed to generate component: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // 🚀 DEPLOY PROJECT
  const deployProject = async (provider: 'vercel' | 'netlify' | 'railway') => {
    if (!currentProject) return;

    setLoading(true);

    try {
      const response = await fetch('/api/live-development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deploy',
          projectId: currentProject.id,
          provider
        })
      });

      if (!response.ok) {
        throw new Error(`Deployment failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        const updatedProject = { ...currentProject };
        updatedProject.deployment = {
          provider,
          url: data.url,
          status: 'deployed',
          lastDeploy: new Date().toISOString()
        };
        setCurrentProject(updatedProject);
      } else {
        setError('Deployment failed: ' + data.error);
      }

    } catch (error) {
      console.error('Deployment failed:', error);
      setError('Deployment failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // 👥 JOIN PROJECT
  const joinProject = async (projectId: string) => {
    try {
      const response = await fetch('/api/live-development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join-project',
          projectId,
          user: {
            id: projectForm.userId,
            name: projectForm.userName
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Join project failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setCurrentProject(data.project);
        const firstFile = Array.from(data.project.files.keys())[0];
        if (firstFile && typeof firstFile === 'string') {
          setActiveFile(firstFile);
        }
      }

    } catch (error) {
      console.error('Join project failed:', error);
      setError('Failed to join project: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Helper function to fetch project data
  const fetchProjectData = async (projectId: string): Promise<LiveProject | null> => {
    try {
      const response = await fetch(`/api/live-development?projectId=${projectId}&info=project`);
      const data = await response.json();
      return data.success ? data.project : null;
    } catch (error) {
      console.error('Failed to fetch project data:', error);
      return null;
    }
  };

  // Helper functions
  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'html': 'html'
    };
    return languageMap[ext || ''] || 'text';
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorContent(e.target.value);
    
    // Update cursor position
    const textarea = e.target;
    const lines = e.target.value.substr(0, textarea.selectionStart).split('\n');
    setCursorPosition({
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    });
  };

  if (!currentProject) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-3 mb-4">
            <Zap className="w-12 h-12 text-blue-500" />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Live Development Studio
            </span>
          </h1>
          <p className="text-xl text-gray-600">
            🚀 Crushing Bolt.new & Loveable.dev with Real-time Collaboration
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Badge className="bg-green-100 text-green-800">⚡ Instant Preview</Badge>
            <Badge className="bg-blue-100 text-blue-800">👥 Live Collaboration</Badge>
            <Badge className="bg-purple-100 text-purple-800">🤖 AI Powered</Badge>
            <Badge className="bg-pink-100 text-pink-800">🚀 One-Click Deploy</Badge>
          </div>
        </div>

        {/* Project Creation Form */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create Live Development Project
            </CardTitle>
            <CardDescription>
              Start a new project with real-time collaboration and AI assistance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name *</Label>
                <Input
                  id="projectName"
                  placeholder="My Awesome Project"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, name: e.target.value }))}
                  disabled={creating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectType">Project Type</Label>
                <select
                  id="projectType"
                  value={projectForm.type}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, type: e.target.value as any }))}
                  disabled={creating}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="web">Web Application</option>
                  <option value="mobile">Mobile App</option>
                  <option value="fullstack">Full-Stack App</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="framework">Framework</Label>
                <select
                  id="framework"
                  value={projectForm.framework}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, framework: e.target.value }))}
                  disabled={creating}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="nextjs">Next.js</option>
                  <option value="react">React</option>
                  <option value="vue">Vue.js</option>
                  <option value="svelte">Svelte</option>
                  <option value="vanilla">Vanilla JS</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Template</Label>
                <select
                  id="template"
                  value={projectForm.template}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, template: e.target.value }))}
                  disabled={creating}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="default">Default Starter</option>
                  <option value="blog">Blog Template</option>
                  <option value="dashboard">Dashboard</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="portfolio">Portfolio</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="userId">User ID</Label>
                <Input
                  id="userId"
                  placeholder="dev_user"
                  value={projectForm.userId}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, userId: e.target.value }))}
                  disabled={creating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="userName">Display Name</Label>
                <Input
                  id="userName"
                  placeholder="Developer"
                  value={projectForm.userName}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, userName: e.target.value }))}
                  disabled={creating}
                />
              </div>
            </div>

            <Button 
              onClick={createLiveProject}
              disabled={creating || !projectForm.name.trim()}
              className="w-full"
              size="lg"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Creating Live Project...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Create Live Development Project
                </>
              )}
            </Button>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700">{error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-lg">{currentProject.name}</span>
            <Badge variant="secondary">{currentProject.framework}</Badge>
          </div>
          
          {/* Live Users */}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <div className="flex items-center gap-1">
              {currentProject.collaboration.activeUsers.slice(0, 5).map((user) => (
                <div
                  key={user.id}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-medium"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {currentProject.collaboration.activeUsers.length > 5 && (
                <div className="w-6 h-6 rounded-full bg-gray-500 flex items-center justify-center text-xs text-white">
                  +{currentProject.collaboration.activeUsers.length - 5}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Preview Status */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-100">
            <div className={`w-2 h-2 rounded-full ${
              currentProject.preview.status === 'ready' ? 'bg-green-500' : 
              currentProject.preview.status === 'building' ? 'bg-yellow-500 animate-pulse' : 
              'bg-red-500'
            }`} />
            <span className="text-sm capitalize">{currentProject.preview.status}</span>
          </div>

          {/* Deployment Status */}
          {currentProject.deployment.status === 'deployed' && currentProject.deployment.url && (
            <a 
              href={currentProject.deployment.url} 
              target="_blank"
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
            >
              <Cloud className="w-4 h-4" />
              <span className="text-sm">Live</span>
            </a>
          )}

          {/* Action Buttons */}
          <Button size="sm" variant="outline" onClick={() => setComponentDialog(prev => ({ ...prev, open: true }))}>
            <Plus className="w-4 h-4 mr-1" />
            Component
          </Button>

          <Button size="sm" variant="outline" onClick={getAICompletion}>
            <Sparkles className="w-4 h-4 mr-1" />
            AI Help
          </Button>

          <Button 
            size="sm" 
            onClick={() => deployProject('vercel')}
            disabled={loading || currentProject.deployment.status === 'deploying'}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Cloud className="w-4 h-4 mr-1" />
            )}
            Deploy
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* File Explorer Sidebar */}
        <div className="w-64 bg-white border-r flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-medium text-sm text-gray-700 mb-3">Project Files</h3>
            <div className="space-y-1">
              {Array.from(currentProject.files.entries()).map(([filePath, file]) => (
                <div
                  key={filePath}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                    activeFile === filePath ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveFile(filePath)}
                >
                  <Code className="w-4 h-4" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{filePath.split('/').pop()}</div>
                    <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
                  </div>
                  {file.collaborative.cursors.length > 0 && (
                    <div className="flex items-center gap-1">
                      {file.collaborative.cursors.slice(0, 3).map((cursor, idx) => (
                        <div
                          key={idx}
                          className="w-2 h-2 rounded-full"
                          style={{ 
                            backgroundColor: currentProject.collaboration.activeUsers
                              .find(u => u.id === cursor.userId)?.color || '#gray' 
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* AI Suggestions */}
          {currentProject.ai.suggestions.length > 0 && (
            <div className="p-4 border-b">
              <h3 className="font-medium text-sm text-gray-700 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Suggestions
              </h3>
              <div className="space-y-2">
                {currentProject.ai.suggestions.slice(0, 3).map((suggestion, idx) => (
                  <div key={idx} className="p-2 bg-blue-50 rounded text-xs">
                    <div className="font-medium text-blue-800">{suggestion.type}</div>
                    <div className="text-blue-600">{suggestion.message}</div>
                    <div className="text-blue-500">Line {suggestion.line}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex">
          {/* Code Editor */}
          <div className="flex-1 flex flex-col">
            {/* Editor Header */}
            {activeFile && (
              <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  <span className="font-mono text-sm">{activeFile}</span>
                  <Badge variant="outline" className="text-xs">
                    {getLanguageFromPath(activeFile)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    Ln {cursorPosition.line}, Col {cursorPosition.column}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => handleFileSave()}>
                    <Save className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => copyCodeToClipboard(editorContent)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Code Editor */}
            <div className="flex-1 bg-gray-900">
              {activeFile ? (
                <textarea
                  ref={editorRef}
                  value={editorContent}
                  onChange={handleEditorChange}
                  className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-sm resize-none focus:outline-none"
                  style={{ lineHeight: '1.5' }}
                  placeholder="Start coding..."
                  spellCheck={false}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <Code className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Select a file to start editing</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live Preview Panel */}
          <div className="w-1/2 bg-white border-l flex flex-col">
            <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                <span className="font-medium text-sm">Live Preview</span>
                <Badge variant={currentProject.preview.status === 'ready' ? 'default' : 'secondary'}>
                  {currentProject.preview.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => {
                  if (previewRef.current) {
                    previewRef.current.src = previewRef.current.src;
                  }
                }}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  if (currentProject.preview.url) {
                    window.open(currentProject.preview.url, '_blank');
                  }
                }}>
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1">
              {currentProject.preview.url ? (
                <iframe
                  ref={previewRef}
                  src={currentProject.preview.url}
                  className="w-full h-full border-0"
                  title="Live Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Preview will appear here</p>
                    <p className="text-sm">Start editing to see live changes</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Component Generation Dialog */}
      {componentDialog.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Generate Component
                </CardTitle>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => setComponentDialog(prev => ({ ...prev, open: false }))}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Component Name</Label>
                <Input
                  placeholder="MyComponent"
                  value={componentDialog.componentName}
                  onChange={(e) => setComponentDialog(prev => ({ ...prev, componentName: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="A beautiful button component with animations"
                  value={componentDialog.description}
                  onChange={(e) => setComponentDialog(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    value={componentDialog.type}
                    onChange={(e) => setComponentDialog(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="component">Component</option>
                    <option value="page">Page</option>
                    <option value="hook">Hook</option>
                    <option value="utility">Utility</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Styling</Label>
                  <select
                    value={componentDialog.styling}
                    onChange={(e) => setComponentDialog(prev => ({ ...prev, styling: e.target.value as any }))}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="tailwind">Tailwind CSS</option>
                    <option value="css">CSS Modules</option>
                    <option value="styled-components">Styled Components</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setComponentDialog(prev => ({ ...prev, open: false }))}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={generateComponent}
                  disabled={loading || !componentDialog.componentName || !componentDialog.description}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Generate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Completions Popup */}
      {showSuggestions && aiCompletions && (
        <div className="fixed top-20 right-4 w-80 bg-white border rounded-lg shadow-lg z-40">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Suggestions
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setShowSuggestions(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-4 space-y-3">
            {aiCompletions.completions.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-gray-600">Code Completions</Label>
                <div className="space-y-1 mt-1">
                  {aiCompletions.completions.map((completion, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-gray-50 rounded text-sm font-mono cursor-pointer hover:bg-blue-50"
                      onClick={() => {
                        setEditorContent(prev => prev + completion);
                        setShowSuggestions(false);
                      }}
                    >
                      {completion}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiCompletions.suggestions.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-gray-600">Suggestions</Label>
                <div className="space-y-2 mt-1">
                  {aiCompletions.suggestions.map((suggestion, idx) => (
                    <div key={idx} className="p-2 bg-blue-50 rounded text-xs">
                      <div className="font-medium text-blue-800">{suggestion.type}</div>
                      <div className="text-blue-600">{suggestion.message}</div>
                      {suggestion.code && (
                        <div 
                          className="mt-1 p-1 bg-white rounded font-mono text-xs cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            setEditorContent(suggestion.code || '');
                            setShowSuggestions(false);
                          }}
                        >
                          {suggestion.code}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

}