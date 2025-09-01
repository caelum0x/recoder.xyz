'use client';

import React, { useState, useEffect } from 'react';
import TabManager from '@/components/editor/TabManager';
import MonacoCodeEditor, { getMonacoLanguage } from '@/components/editor/MonacoCodeEditor';
//import ComponentLibrary from '@/components/editor/ComponentLibrary';
import { 
  Code2, Save, Download, Upload, Settings, Search, 
  ZoomIn, ZoomOut, Play, Terminal, FileText, Folder, 
  FolderOpen, Plus, X, ChevronRight, ChevronDown,
  RefreshCw, Monitor, Smartphone, Tablet, Maximize,
  Wand2, Bot, Send, Loader2, Copy, Check, Users,
  Rocket, BarChart3, Globe, GitBranch, Box, Package,
  Brain
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollaboration } from '@/hooks/use-collaboration';
import { useDeployment } from '@/hooks/use-deployment';
import { useGit } from '@/hooks/use-git';
import { usePackageManager } from '@/hooks/use-package-manager';
import { useProjectSettings } from '@/hooks/use-project-settings';
import ComponentLibrary from '@/components/component-library';
import AIPoweredCodeAssist from '@/components/editor/AIPoweredCodeAssist';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  size?: number;
  lastModified?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  framework: string;
  createdAt: string;
}

interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  isDirty: boolean;
  content: string;
  fileType?: string;
}

export default function RealCodeEditor({ params }: { params: { projectId: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  // Multi-file tab management
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [engineConnected, setEngineConnected] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPid, setPreviewPid] = useState<number | null>(null);
  const [terminalCommand, setTerminalCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('vercel');
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showPackagePanel, setShowPackagePanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showComponentLibrary, setShowComponentLibrary] = useState(false);
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [packageSearchQuery, setPackageSearchQuery] = useState('');
  
  // AI Code Assistant state
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 0, column: 0 });

  const { projectId } = params;

  // Use collaboration hook for real-time collaboration
  const {
    collaborators,
    isConnected: collaborationConnected,
    sendCursorMove,
    sendTextChange,
    sendFileChange,
    startTyping,
    stopTyping
  } = useCollaboration({
    projectId,
    user: {
      id: 'current-user', // This should come from auth
      name: 'Anonymous User',
      email: 'user@example.com'
    },
    onTextUpdate: (changes, version) => {
      // Handle incoming text changes from other collaborators
      console.log('Text update from collaborator:', changes);
    },
    onFileUpdate: (filePath, content, version) => {
      // Handle incoming file changes from other collaborators
      if (activeFile === filePath) {
        setFileContent(content);
      }
    }
  });

  // Use deployment hook for deployment management
  const {
    deploymentStatus,
    startDeployment: deployProject,
    resetDeployment,
    getDeploymentUrl,
    isDeploying,
    isDeployed,
    hasFailed
  } = useDeployment(projectId);

  // Use git hook for version control
  const {
    repository,
    status: gitStatus,
    loading: gitLoading,
    initRepository,
    commit,
    push,
    pull,
    getStatus: getGitStatus,
    addFiles,
    createBranch,
    switchBranch,
    hasChanges,
    isClean
  } = useGit(projectId);

  // Use package manager hook for dependency management
  const {
    packageInfo,
    dependencies,
    operations: packageOperations,
    loading: packageLoading,
    installPackage,
    uninstallPackage,
    updatePackage,
    runScript,
    searchPackages
  } = usePackageManager(projectId);

  // Use project settings hook for configuration management
  const {
    settings,
    loading: settingsLoading,
    updateSettings,
    resetSettings,
    exportSettings,
    importSettings
  } = useProjectSettings(projectId);

  // Load project data and files
  useEffect(() => {
    if (projectId) {
      loadProject();
      loadFiles();
      loadCollaboration();
      loadAnalytics();
    }
  }, [projectId]);

  const loadProject = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (data.success) {
        const foundProject = data.data.projects.find((p: Project) => p.id === projectId);
        if (foundProject) {
          setProject(foundProject);
        }
      }
    } catch (error) {
      console.error('Error loading project:', error);
    }
  };

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/files`);
      const data = await response.json();
      if (data.success) {
        setFiles(data.data.files);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFileContent = async (filePath: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/files/${filePath}`);
      const data = await response.json();
      if (data.success) {
        setFileContent(data.data.content);
        setActiveFile(filePath);
      }
    } catch (error) {
      console.error('Error loading file content:', error);
    }
  };

  const saveFile = async () => {
    if (!activeFile) return;
    
    try {
      setSaving(true);
      const response = await fetch(`/api/projects/${projectId}/files/${activeFile}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: fileContent }),
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('File saved successfully');
      }
    } catch (error) {
      console.error('Error saving file:', error);
    } finally {
      setSaving(false);
    }
  };

  const createNewFile = async () => {
    const fileName = prompt('Enter file name:');
    if (!fileName) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fileName,
          content: '',
          filePath: 'src' // Create in src folder by default
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadFiles(); // Refresh file tree
      }
    } catch (error) {
      console.error('Error creating file:', error);
    }
  };

  // Tab Management Functions
  const generateTabId = (filePath: string): string => {
    return `tab-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
  };

  const getFileType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension || 'text';
  };

  const openFileInTab = async (filePath: string) => {
    const tabId = generateTabId(filePath);
    const fileName = filePath.split('/').pop() || filePath;
    
    // Check if tab is already open
    const existingTab = openTabs.find(tab => tab.id === tabId);
    if (existingTab) {
      setActiveTabId(tabId);
      setActiveFile(filePath);
      setFileContent(existingTab.content);
      return;
    }

    // Load file content
    try {
      const response = await fetch(`/api/projects/${projectId}/files/${filePath}`);
      const data = await response.json();
      if (data.success) {
        const newTab: EditorTab = {
          id: tabId,
          filePath,
          fileName,
          isDirty: false,
          content: data.data.content,
          fileType: getFileType(fileName)
        };

        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabId(tabId);
        setActiveFile(filePath);
        setFileContent(data.data.content);
      }
    } catch (error) {
      console.error('Error loading file content:', error);
    }
  };

  const closeTab = (tabId: string) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab?.isDirty) {
      const shouldClose = confirm('File has unsaved changes. Close anyway?');
      if (!shouldClose) return;
    }

    const newTabs = openTabs.filter(t => t.id !== tabId);
    setOpenTabs(newTabs);

    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        const nextTab = newTabs[0];
        setActiveTabId(nextTab.id);
        setActiveFile(nextTab.filePath);
        setFileContent(nextTab.content);
      } else {
        setActiveTabId(null);
        setActiveFile(null);
        setFileContent('');
      }
    }
  };

  const selectTab = (tabId: string) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      setActiveFile(tab.filePath);
      setFileContent(tab.content);
    }
  };

  const reorderTabs = (fromIndex: number, toIndex: number) => {
    const newTabs = [...openTabs];
    const [removed] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, removed);
    setOpenTabs(newTabs);
  };

  const saveTab = async (tabId: string) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (!tab) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/projects/${projectId}/files/${tab.filePath}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: tab.content }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Mark tab as clean (not dirty)
        setOpenTabs(prev => prev.map(t => 
          t.id === tabId ? { ...t, isDirty: false } : t
        ));
        console.log('File saved successfully');
      }
    } catch (error) {
      console.error('Error saving file:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateTabContent = (content: string) => {
    setFileContent(content);
    
    if (activeTabId) {
      setOpenTabs(prev => prev.map(tab => 
        tab.id === activeTabId 
          ? { ...tab, content, isDirty: tab.content !== content }
          : tab
      ));
    }
  };

  // Handle component insertion from ComponentLibrary
  const handleInsertComponent = (component: any) => {
    if (!activeFile || !activeTabId) {
      alert('Please open a file first to insert the component');
      return;
    }

    // Insert component code at current cursor position or at the end
    const insertCode = `\n\n${component.code}\n`;
    const newContent = fileContent + insertCode;
    
    updateTabContent(newContent);
    
    // Show success feedback
    console.log(`Inserted component: ${component.name}`);
  };

  // Update existing loadFileContent to use tab system
  const loadFileContentLegacy = async (filePath: string) => {
    await openFileInTab(filePath);
  };

  const testEngineConnection = async () => {
    try {
      const response = await fetch('http://localhost:8001/health');
      setEngineConnected(response.ok);
    } catch (error) {
      setEngineConnected(false);
    }
  };

  const generateCode = async () => {
    if (!aiPrompt.trim()) return;

    try {
      setAiLoading(true);
      setAiResponse('');

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          projectId,
          fileContext: activeFile ? {
            fileName: activeFile,
            content: fileContent,
            framework: project?.framework
          } : null
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAiResponse(data.data.generatedCode);
      } else {
        setAiResponse(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error generating code:', error);
      setAiResponse('Error generating code. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const applyGeneratedCode = () => {
    if (aiResponse && activeFile) {
      setFileContent(aiResponse);
      setAiResponse('');
      setAiPrompt('');
    }
  };

  const copyToClipboard = async () => {
    if (aiResponse) {
      await navigator.clipboard.writeText(aiResponse);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const startPreview = async () => {
    try {
      setPreviewLoading(true);
      const response = await fetch(`/api/projects/${projectId}/preview`, {
        method: 'POST',
      });

      const data = await response.json();
      if (data.success) {
        setPreviewUrl(data.data.previewUrl);
        setPreviewPid(data.data.pid);
      } else {
        console.error('Failed to start preview:', data.error);
      }
    } catch (error) {
      console.error('Error starting preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const stopPreview = async () => {
    if (previewPid) {
      try {
        await fetch(`/api/projects/${projectId}/preview`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pid: previewPid }),
        });
        setPreviewUrl(null);
        setPreviewPid(null);
      } catch (error) {
        console.error('Error stopping preview:', error);
      }
    }
  };

  const executeCommand = async (command: string) => {
    if (!command.trim()) return;

    try {
      setTerminalLoading(true);
      setTerminalOutput(prev => [...prev, `$ ${command}`]);

      const response = await fetch(`/api/projects/${projectId}/terminal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      const data = await response.json();
      if (data.success) {
        const output = data.data.output + data.data.errorOutput;
        setTerminalOutput(prev => [...prev, output || '(no output)']);
      } else {
        setTerminalOutput(prev => [...prev, `Error: ${data.error}`]);
      }
    } catch (error) {
      setTerminalOutput(prev => [...prev, `Error: ${error}`]);
    } finally {
      setTerminalLoading(false);
    }
  };

  const handleTerminalKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !terminalLoading) {
      executeCommand(terminalCommand);
      setTerminalCommand('');
    }
  };

  const loadCollaboration = async () => {
    // This is now handled by the useCollaboration hook
    console.log('Collaboration handled by hook');
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/analytics`);
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.data.metrics);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const startDeployment = async (platform: string) => {
    deployProject(platform);
    setShowDeployModal(false);
  };

  // AI Code Assistant Functions
  const handleAICodeInsert = (code: string, position?: { line: number; column: number }) => {
    if (!activeFile) return;
    
    let updatedContent: string;
    
    if (position) {
      // Insert at specific position
      const lines = fileContent.split('\n');
      const beforeLines = lines.slice(0, position.line);
      const afterLines = lines.slice(position.line);
      
      // Insert code at the specified line
      beforeLines.push(code);
      updatedContent = [...beforeLines, ...afterLines].join('\n');
    } else {
      // Insert at cursor position (end of current content for now)
      updatedContent = fileContent + '\n' + code;
    }
    
    setFileContent(updatedContent);
    
    // Update the tab content
    setOpenTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, content: updatedContent, isDirty: true }
        : tab
    ));
    
    // Notify collaborators of the change
    sendTextChange(updatedContent, Date.now());
  };

  const handleAICodeReplace = (startLine: number, endLine: number, newCode: string) => {
    if (!activeFile) return;
    
    const lines = fileContent.split('\n');
    const beforeLines = lines.slice(0, startLine);
    const afterLines = lines.slice(endLine + 1);
    const codeLines = newCode.split('\n');
    
    const updatedContent = [...beforeLines, ...codeLines, ...afterLines].join('\n');
    
    setFileContent(updatedContent);
    
    // Update the tab content
    setOpenTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, content: updatedContent, isDirty: true }
        : tab
    ));
    
    // Notify collaborators of the change
    sendTextChange(updatedContent, Date.now());
  };

  const handleCursorPositionChange = (line: number, column: number) => {
    setCursorPosition({ line, column });
  };

  useEffect(() => {
    testEngineConnection();
    const interval = setInterval(testEngineConnection, 30000); // Check every 30 seconds
    
    // Cleanup function to stop preview on unmount
    return () => {
      clearInterval(interval);
      if (previewPid) {
        fetch(`/api/projects/${projectId}/preview`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pid: previewPid }),
        }).catch(console.error);
      }
    };
  }, [previewPid, projectId]);

  // File tree rendering function
  const renderFileTree = (nodes: FileNode[], depth = 0): React.ReactNode => {
    return nodes.map((node) => (
      <div key={node.path} style={{ paddingLeft: `${depth * 16}px` }}>
        <div
          className={`flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded ${
            activeFile === node.path ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          }`}
          onClick={() => {
            if (node.type === 'file') {
              openFileInTab(node.path);
            }
          }}
        >
          {node.type === 'folder' ? (
            <FolderOpen className="w-4 h-4 text-blue-600" />
          ) : (
            <FileText className="w-4 h-4 text-gray-600" />
          )}
          <span className="text-sm">{node.name}</span>
          {node.size && (
            <span className="text-xs text-gray-500 ml-auto">
              {Math.round(node.size / 1024)}KB
            </span>
          )}
        </div>
        {node.children && node.children.length > 0 && (
          <div>{renderFileTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  // Update the content change handler for Monaco Editor
  const handleContentChange = (content: string) => {
    updateTabContent(content);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <Code2 className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold">{project?.name || 'Untitled Project'}</h1>
            <p className="text-sm text-gray-600">{project?.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Engine Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${engineConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              Engine {engineConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Collaboration Status */}
          {collaborators.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-600">
                {collaborators.length} collaborator{collaborators.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Deployment Status */}
          {(isDeploying || isDeployed || hasFailed) && (
            <div className="flex items-center gap-2">
              <Rocket className={`w-4 h-4 ${
                isDeployed ? 'text-green-600' : 
                isDeploying ? 'text-yellow-600' : 'text-red-600'
              }`} />
              <span className="text-sm text-gray-600 capitalize">
                {deploymentStatus.status}
              </span>
            </div>
          )}

          <Button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            variant={aiPanelOpen ? "default" : "outline"}
            className="gap-2"
          >
            <Wand2 className="w-4 h-4" />
            AI Assistant
          </Button>

          <Button
            onClick={() => setShowAIAssistant(!showAIAssistant)}
            variant={showAIAssistant ? "default" : "outline"}
            className="gap-2"
          >
            <Brain className="w-4 h-4" />
            Smart AI
          </Button>

          <Button
            onClick={() => setShowComponentLibrary(!showComponentLibrary)}
            variant={showComponentLibrary ? "default" : "outline"}
            className="gap-2"
          >
            <Package className="w-4 h-4" />
            Components
          </Button>

          <Button
            onClick={() => setShowGitPanel(!showGitPanel)}
            variant={showGitPanel ? "default" : "outline"}
            className="gap-2"
          >
            <GitBranch className="w-4 h-4" />
            Git
          </Button>

          <Button
            onClick={() => setShowPackagePanel(!showPackagePanel)}
            variant={showPackagePanel ? "default" : "outline"}
            className="gap-2"
          >
            <Box className="w-4 h-4" />
            Packages
          </Button>

          <Button
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            variant={showSettingsPanel ? "default" : "outline"}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>

          <Button
            onClick={() => setShowDeployModal(true)}
            disabled={isDeploying}
            variant="outline"
            className="gap-2"
          >
            <Rocket className="w-4 h-4" />
            Deploy
          </Button>

          {analytics && (
            <Button
              onClick={() => window.open(`/analytics/${projectId}`, '_blank')}
              variant="outline"
              className="gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Analytics
            </Button>
          )}

          <Button
            onClick={saveFile}
            disabled={!activeFile || saving}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>

          <Button onClick={createNewFile} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" />
            New File
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-64 bg-white dark:bg-gray-800 border-r flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Project Files
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {renderFileTree(files)}
            </div>
            
            {/* Collaboration Section */}
            {collaborators.length > 0 && (
              <div className="border-t p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Online ({collaborators.length})
                </h3>
                <div className="space-y-2">
                  {collaborators.map((collaborator) => (
                    <div key={collaborator.id} className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                        {collaborator.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {collaborator.name}
                      </span>
                      <div className="w-2 h-2 bg-green-500 rounded-full ml-auto" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Editor */}
        <div className="flex-1 flex flex-col">
          {/* Tab Manager */}
          {openTabs.length > 0 && (
            <TabManager
              tabs={openTabs}
              activeTabId={activeTabId || ''}
              onTabSelect={selectTab}
              onTabClose={closeTab}
              onTabReorder={reorderTabs}
              onSaveTab={saveTab}
              maxVisibleTabs={8}
            />
          )}

          {/* Code Editor */}
          <div className="flex-1 flex">
            <div className="flex-1">
              {activeFile ? (
                <MonacoCodeEditor
                  value={fileContent}
                  onChange={handleContentChange}
                  language={activeTabId ? getMonacoLanguage(openTabs.find(t => t.id === activeTabId)?.fileName || '') : 'typescript'}
                  theme="vs-dark"
                  className="h-full"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 bg-gray-900">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                    <p className="text-gray-400">Select a file to start editing</p>
                    <Button 
                      onClick={createNewFile}
                      className="mt-4 gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create New File
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Component Library Panel */}
            {showComponentLibrary && (
              <div className="w-80 border-l bg-white dark:bg-gray-800 flex flex-col">
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-purple-600" />
                      <h3 className="text-sm font-semibold">Component Library</h3>
                    </div>
                    <X 
                      className="w-4 h-4 cursor-pointer hover:text-red-500" 
                      onClick={() => setShowComponentLibrary(false)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  <ComponentLibrary
                    onComponentSelect={handleInsertComponent}
                    framework={project?.framework}
                  />
                </div>
              </div>
            )}

            {/* AI Assistant Panel */}
            {aiPanelOpen && (
              <div className="w-96 border-l bg-white dark:bg-gray-800 flex flex-col">
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="w-5 h-5 text-blue-600" />
                      <h3 className="text-sm font-semibold">AI Assistant</h3>
                    </div>
                    <X 
                      className="w-4 h-4 cursor-pointer hover:text-red-500" 
                      onClick={() => setAiPanelOpen(false)}
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col">
                  {/* AI Prompt Input */}
                  <div className="p-4 border-b">
                    <Textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Describe what code you want to generate..."
                      className="w-full h-24 text-sm resize-none"
                    />
                    <Button
                      onClick={generateCode}
                      disabled={!aiPrompt.trim() || aiLoading || !engineConnected}
                      className="w-full mt-3 gap-2"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {aiLoading ? 'Generating...' : 'Generate Code'}
                    </Button>
                  </div>

                  {/* AI Response */}
                  <div className="flex-1 p-4">
                    {aiResponse ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Generated Code:</h4>
                          <div className="flex gap-2">
                            <Button
                              onClick={copyToClipboard}
                              variant="outline"
                              size="sm"
                              className="gap-1"
                            >
                              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {copied ? 'Copied' : 'Copy'}
                            </Button>
                            {activeFile && (
                              <Button
                                onClick={applyGeneratedCode}
                                size="sm"
                                className="gap-1"
                              >
                                <Code2 className="w-3 h-3" />
                                Apply
                              </Button>
                            )}
                          </div>
                        </div>
                        <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded text-xs overflow-auto max-h-64">
                          <code>{aiResponse}</code>
                        </pre>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 mt-8">
                        <Wand2 className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-sm">AI-generated code will appear here</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Preview Panel */}
            <div className="w-96 border-l bg-white dark:bg-gray-800 flex flex-col">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Live Preview</h3>
                  <div className="flex gap-2">
                    {previewUrl ? (
                      <Button
                        onClick={stopPreview}
                        variant="outline"
                        size="sm"
                        className="gap-1"
                      >
                        <X className="w-3 h-3" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        onClick={startPreview}
                        disabled={previewLoading}
                        size="sm"
                        className="gap-1"
                      >
                        {previewLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        {previewLoading ? 'Starting...' : 'Start'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 p-4">
                {previewUrl ? (
                  <div className="h-full">
                    <iframe
                      src={previewUrl}
                      className="w-full h-full border rounded"
                      title="Live Preview"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <Monitor className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">
                        {previewLoading 
                          ? 'Starting preview server...' 
                          : 'Click Start to preview your project'
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal */}
      {terminalOpen && (
        <div className="h-48 bg-black text-green-400 font-mono text-sm flex flex-col">
          <div className="flex items-center gap-2 p-2 border-b border-gray-700">
            <Terminal className="w-4 h-4" />
            <span>Terminal - {project?.name}</span>
            <X 
              className="w-4 h-4 ml-auto cursor-pointer hover:text-red-400" 
              onClick={() => setTerminalOpen(false)}
            />
          </div>
          
          <div className="flex-1 p-2 overflow-y-auto">
            {terminalOutput.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
            {terminalLoading && (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Executing...</span>
              </div>
            )}
          </div>
          
          <div className="p-2 border-t border-gray-700 flex items-center gap-2">
            <span>$</span>
            <Input
              value={terminalCommand}
              onChange={(e) => setTerminalCommand(e.target.value)}
              onKeyPress={handleTerminalKeyPress}
              placeholder="Enter command..."
              className="bg-transparent border-none text-green-400 placeholder-gray-500 focus:ring-0"
              disabled={terminalLoading}
            />
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <div className="flex items-center justify-between p-2 border-t bg-white dark:bg-gray-800 text-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hover:text-blue-600"
          >
            Files
          </button>
          <button 
            onClick={() => setTerminalOpen(!terminalOpen)}
            className="hover:text-blue-600"
          >
            Terminal
          </button>
          <button 
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className={`hover:text-blue-600 ${aiPanelOpen ? 'text-blue-600' : ''}`}
          >
            AI Assistant
          </button>
          <button 
            onClick={() => setShowComponentLibrary(!showComponentLibrary)}
            className={`hover:text-purple-600 ${showComponentLibrary ? 'text-purple-600' : ''}`}
          >
            Components
          </button>
          <button 
            onClick={() => setShowGitPanel(!showGitPanel)}
            className={`hover:text-orange-600 ${showGitPanel ? 'text-orange-600' : ''}`}
          >
            Git
          </button>
          <button 
            onClick={() => setShowPackagePanel(!showPackagePanel)}
            className={`hover:text-purple-600 ${showPackagePanel ? 'text-purple-600' : ''}`}
          >
            Packages
          </button>
          <button 
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            className={`hover:text-blue-600 ${showSettingsPanel ? 'text-blue-600' : ''}`}
          >
            Settings
          </button>
        </div>
        
        <div className="flex items-center gap-4 text-gray-600">
          <span>Framework: {project?.framework}</span>
          {analytics && (
            <span>Lines: {analytics.linesOfCode || 0}</span>
          )}
          {analytics && (
            <span>Files: {analytics.fileCount || 0}</span>
          )}
          <span>Project ID: {projectId}</span>
        </div>
      </div>

      {/* Deployment Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-96">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold">Deploy Project</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                Select a platform to deploy your project.
              </p>

              {/* Platform Selection */}
              <div className="flex gap-2 mb-4">
                <Button
                  onClick={() => setSelectedPlatform('vercel')}
                  variant={selectedPlatform === 'vercel' ? 'default' : 'outline'}
                  className="flex-1"
                >
                  Vercel
                </Button>
                <Button
                  onClick={() => setSelectedPlatform('netlify')}
                  variant={selectedPlatform === 'netlify' ? 'default' : 'outline'}
                  className="flex-1"
                >
                  Netlify
                </Button>
              </div>

              {/* Deployment Progress */}
              {isDeploying && (
                <div className="flex items-center gap-2 mb-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-gray-600">
                    Deploying to {selectedPlatform}... {deploymentStatus.progress || 0}%
                  </span>
                </div>
              )}

              {/* Success Message */}
              {isDeployed && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md mb-4">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-800">
                      Successfully deployed to {selectedPlatform}!
                    </span>
                  </div>
                  {deploymentStatus.url && (
                    <Button
                      onClick={() => window.open(deploymentStatus.url, '_blank')}
                      variant="link"
                      className="p-0 h-auto text-blue-600 mt-2"
                    >
                      <Globe className="w-3 h-3 mr-1" />
                      View Deployment
                    </Button>
                  )}
                </div>
              )}

              {/* Error Message */}
              {hasFailed && (
                <div className="text-sm text-red-600 mb-4">
                  {deploymentStatus.error || 'Error deploying project. Please try again.'}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setShowDeployModal(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => startDeployment(selectedPlatform)}
                  disabled={isDeploying}
                >
                  {isDeploying ? 'Deploying...' : 'Deploy'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Git Panel */}
      {showGitPanel && (
        <div className="fixed top-16 right-4 w-96 h-96 bg-white dark:bg-gray-800 shadow-xl rounded-lg border z-40">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-orange-600" />
              <h3 className="font-semibold">Version Control</h3>
            </div>
            <X 
              className="w-4 h-4 cursor-pointer hover:text-red-500" 
              onClick={() => setShowGitPanel(false)}
            />
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            {repository ? (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <div className="text-sm font-medium">{repository.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Branch: {repository.branch}
                  </div>
                </div>
                
                {gitStatus && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Changes:</h4>
                    {gitStatus.modified.length > 0 && (
                      <div className="text-xs">
                        <span className="text-yellow-600">Modified: </span>
                        {gitStatus.modified.join(', ')}
                      </div>
                    )}
                    {gitStatus.untracked.length > 0 && (
                      <div className="text-xs">
                        <span className="text-green-600">Untracked: </span>
                        {gitStatus.untracked.join(', ')}
                      </div>
                    )}
                    
                    {hasChanges && (
                      <div className="space-y-2 mt-4">
                        <Input
                          value={gitCommitMessage}
                          onChange={(e) => setGitCommitMessage(e.target.value)}
                          placeholder="Commit message..."
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => addFiles(['.'])}
                            disabled={gitLoading}
                            size="sm"
                            variant="outline"
                          >
                            Stage All
                          </Button>
                          <Button
                            onClick={() => commit(gitCommitMessage)}
                            disabled={gitLoading || !gitCommitMessage.trim()}
                            size="sm"
                          >
                            Commit
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <GitBranch className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 mb-4">Initialize Git repository</p>
                <Button
                  onClick={() => initRepository()}
                  disabled={gitLoading}
                  size="sm"
                >
                  Initialize Git
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Package Manager Panel */}
      {showPackagePanel && (
        <div className="fixed top-16 right-4 w-96 h-96 bg-white dark:bg-gray-800 shadow-xl rounded-lg border z-40">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Box className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold">Package Manager</h3>
            </div>
            <X 
              className="w-4 h-4 cursor-pointer hover:text-red-500" 
              onClick={() => setShowPackagePanel(false)}
            />
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            {packageInfo ? (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <div className="text-sm font-medium">{packageInfo.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    v{packageInfo.version}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Dependencies</h4>
                    <Button
                      onClick={() => setPackageSearchQuery('')}
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  
                  <Input
                    value={packageSearchQuery}
                    onChange={(e) => setPackageSearchQuery(e.target.value)}
                    placeholder="Search packages..."
                    className="text-sm"
                  />
                  
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dependencies.map((dep) => (
                      <div key={dep.name} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                        <div>
                          <span className="font-medium">{dep.name}</span>
                          <span className="text-gray-500 ml-1">v{dep.version}</span>
                        </div>
                        <Button
                          onClick={() => uninstallPackage(dep.name)}
                          disabled={packageLoading}
                          size="sm"
                          variant="outline"
                          className="h-6 px-2"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                
                {packageInfo.scripts && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Scripts</h4>
                    <div className="space-y-1">
                      {Object.entries(packageInfo.scripts).map(([name, script]) => (
                        <div key={name} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                          <div>
                            <span className="font-medium">{name}</span>
                            <div className="text-gray-500 truncate">{script}</div>
                          </div>
                          <Button
                            onClick={() => runScript(name)}
                            disabled={packageLoading}
                            size="sm"
                            variant="outline"
                            className="h-6 px-2"
                          >
                            Run
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Box className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">No package.json found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project Settings Panel */}
      {showSettingsPanel && (
        <div className="fixed top-16 right-4 w-96 h-96 bg-white dark:bg-gray-800 shadow-xl rounded-lg border z-40">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold">Project Settings</h3>
            </div>
            <X 
              className="w-4 h-4 cursor-pointer hover:text-red-500" 
              onClick={() => setShowSettingsPanel(false)}
            />
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            {settings ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="project-name" className="text-sm font-medium">
                    Project Name
                  </Label>
                  <Input
                    id="project-name"
                    value={settings.general.name}
                    onChange={(e) => updateSettings({
                      ...settings,
                      general: { ...settings.general, name: e.target.value }
                    })}
                    className="text-sm"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="project-desc" className="text-sm font-medium">
                    Description
                  </Label>
                  <Textarea
                    id="project-desc"
                    value={settings.general.description}
                    onChange={(e) => updateSettings({
                      ...settings,
                      general: { ...settings.general, description: e.target.value }
                    })}
                    className="text-sm h-20"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Development</Label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.development.autoSave}
                        onChange={(e) => updateSettings({
                          ...settings,
                          development: { ...settings.development, autoSave: e.target.checked }
                        })}
                      />
                      <span className="text-sm">Auto Save</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.development.autoFormat}
                        onChange={(e) => updateSettings({
                          ...settings,
                          development: { ...settings.development, autoFormat: e.target.checked }
                        })}
                      />
                      <span className="text-sm">Auto Format</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.development.linting}
                        onChange={(e) => updateSettings({
                          ...settings,
                          development: { ...settings.development, linting: e.target.checked }
                        })}
                      />
                      <span className="text-sm">Enable Linting</span>
                    </label>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Collaboration</Label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.collaboration.enabled}
                        onChange={(e) => updateSettings({
                          ...settings,
                          collaboration: { ...settings.collaboration, enabled: e.target.checked }
                        })}
                      />
                      <span className="text-sm">Enable Collaboration</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.collaboration.realTimeEditing}
                        onChange={(e) => updateSettings({
                          ...settings,
                          collaboration: { ...settings.collaboration, realTimeEditing: e.target.checked }
                        })}
                      />
                      <span className="text-sm">Real-time Editing</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Settings className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">Loading settings...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI-Powered Code Assistant */}
      <AIPoweredCodeAssist
        currentCode={fileContent}
        filePath={activeFile || ''}
        language={activeTabId ? getMonacoLanguage(openTabs.find(t => t.id === activeTabId)?.fileName || '') : 'typescript'}
        cursorPosition={cursorPosition}
        onCodeInsert={handleAICodeInsert}
        onCodeReplace={handleAICodeReplace}
        isVisible={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
      />
    </div>
  );
}
