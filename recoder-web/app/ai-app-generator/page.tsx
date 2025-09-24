'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Play,
  Save,
  Download,
  Share2,
  Code,
  Eye,
  Split,
  Terminal,
  Folder,
  Plus,
  X,
  FileText,
  Image,
  Zap,
  Bot,
  Send,
  RefreshCw,
  Settings,
  ExternalLink,
  GitBranch,
  Users,
  Clock
} from 'lucide-react';
import { Monaco } from '@monaco-editor/react';
import JSZip from 'jszip';
import { useRouter } from 'next/navigation';

// Dynamic Monaco Editor with no SSR
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { 
    ssr: false,
    loading: () => <div className="h-full flex items-center justify-center">Loading editor...</div>
  }
);

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
  isOpen?: boolean;
  isActive?: boolean;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    fileChanges?: string[];
    codeBlocks?: { language: string; code: string }[];
    suggestions?: string[];
  };
}

interface GenerationSession {
  id: string;
  name: string;
  description: string;
  framework: string;
  files: FileNode[];
  chat: ChatMessage[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function AIAppGenerator() {
  // Core state
  const [session, setSession] = useState<GenerationSession | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // UI state
  const [layout, setLayout] = useState<'code' | 'preview' | 'split'>('split');
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [chatInput, setChatInput] = useState('');
  const [showTerminal, setShowTerminal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<Monaco | null>(null);
  
  const router = useRouter();

  // Initialize session
  useEffect(() => {
    initializeSession();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chat]);

  const initializeSession = async () => {
    // Create new session or load existing one
    const newSession: GenerationSession = {
      id: `session_${Date.now()}`,
      name: 'New AI App',
      description: 'AI-generated application',
      framework: 'react',
      files: getDefaultFiles(),
      chat: [
        {
          id: `msg_${Date.now()}`,
          type: 'system',
          content: "Welcome to AI App Generator! Describe the app you want to build and I'll help you create it with real, working code.",
          timestamp: new Date()
        }
      ],
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setSession(newSession);
    setFiles(newSession.files);
    setChat(newSession.chat);
    setActiveFile(newSession.files[0]);
  };

  const getDefaultFiles = (): FileNode[] => [
    {
      id: 'src',
      name: 'src',
      type: 'folder',
      isOpen: true,
      children: [
        {
          id: 'app.tsx',
          name: 'App.tsx',
          type: 'file',
          language: 'typescript',
          isActive: true,
          content: `import React from 'react';
import './App.css';

function App() {
  return (
    <div className=\"App\">
      <header className=\"App-header\">
        <h1>Welcome to your AI-generated app!</h1>
        <p>Tell me what you want to build and I'll help you create it.</p>
      </header>
  );
}

export default App;`
        },
        {
          id: 'app.css',
          name: 'App.css',
          type: 'file',
          language: 'css',
          content: `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.App-header h1 {
  margin-bottom: 16px;
}

.App-header p {
  font-size: 18px;
}`
        }
      ]
    },
    {
      id: 'package.json',
      name: 'package.json',
      type: 'file',
      language: 'json',
      content: `{
  \"name\": \"ai-generated-app\",
  \"version\": \"0.1.0\",
  \"private\": true,
  \"dependencies\": {
    \"react\": \"^18.2.0\",
    \"react-dom\": \"^18.2.0\",
    \"typescript\": \"^4.9.5\"
  },
  \"scripts\": {
    \"start\": \"react-scripts start\",
    \"build\": \"react-scripts build\",
    \"test\": \"react-scripts test\",
    \"eject\": \"react-scripts eject\"
  }
}`
    }
  ];

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      type: 'user',
      content: chatInput.trim(),
      timestamp: new Date()
    };

    setChat(prev => [...prev, userMessage]);
    setChatInput('');
    setIsGenerating(true);

    try {
      // Send request to AI generation API
      const response = await fetch('/api/ai-app-generator/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage.content,
          currentFiles: files,
          activeFile: activeFile?.id,
          sessionId: session?.id,
          framework: session?.framework
        })
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Add AI response to chat
      const aiMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        type: 'assistant',
        content: result.message,
        timestamp: new Date(),
        metadata: {
          fileChanges: result.fileChanges,
          codeBlocks: result.codeBlocks,
          suggestions: result.suggestions
        }
      };

      setChat(prev => [...prev, aiMessage]);

      // Update files if changes were made
      if (result.updatedFiles) {
        setFiles(result.updatedFiles);
        
        // Update preview
        if (result.previewUrl) {
          setPreviewUrl(result.previewUrl);
        }
      }

    } catch (error) {
      console.error('Generation error:', error);
      console.error('Failed to generate code. Please try again.');
      
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        type: 'system',
        content: 'Sorry, I encountered an error while generating your code. Please try again.',
        timestamp: new Date()
      };
      
      setChat(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileSelect = (file: FileNode) => {
    setActiveFile(file);
    updateFileActiveState(files, file.id);
  };

  const updateFileActiveState = (fileList: FileNode[], activeId: string): FileNode[] => {
    return fileList.map(file => ({
      ...file,
      isActive: file.id === activeId,
      children: file.children ? updateFileActiveState(file.children, activeId) : undefined
    }));
  };

  const handleCodeChange = (value: string | undefined) => {
    if (!activeFile || !value) return;

    // Update the active file's content
    const updateFileContent = (fileList: FileNode[]): FileNode[] => {
      return fileList.map(file => {
        if (file.id === activeFile.id) {
          return { ...file, content: value };
        }
        if (file.children) {
          return { ...file, children: updateFileContent(file.children) };
        }
        return file;
      });
    };

    const updatedFiles = updateFileContent(files);
    setFiles(updatedFiles);
    setActiveFile({ ...activeFile, content: value });
  };

  const handleRunCode = async () => {
    try {
      setIsGenerating(true);
      
      const response = await fetch('/api/ai-app-generator/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files,
          framework: session?.framework
        })
      });

      if (!response.ok) {
        throw new Error('Preview generation failed');
      }

      const result = await response.json();
      setPreviewUrl(result.previewUrl);
      console.log('Preview updated!');

    } catch (error) {
      console.error('Preview error:', error);
      console.error('Failed to update preview');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveProject = async () => {
    if (!session) return;

    try {
      const response = await fetch('/api/ai-app-generator/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...session,
          files,
          chat
        })
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      console.log('Project saved!');
    } catch (error) {
      console.error('Save error:', error);
      console.error('Failed to save project');
    }
  };

  const handleDownloadProject = () => {
    // Create and download zip file of the project
    const zip = new JSZip();
    
    const addFilesToZip = (fileList: FileNode[], path = '') => {
      fileList.forEach(file => {
        const fullPath = path ? `${path}/${file.name}` : file.name;
        
        if (file.type === 'file' && file.content) {
          zip.file(fullPath, file.content);
        } else if (file.type === 'folder' && file.children) {
          addFilesToZip(file.children, fullPath);
        }
      });
    };

    addFilesToZip(files);
    
    zip.generateAsync({ type: 'blob' }).then(content => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${session?.name || 'ai-app'}.zip`;
      link.click();
    });
  };

  const renderFileTree = (fileList: FileNode[], level = 0) => {
    return fileList.map(file => (
      <div key={file.id} style={{ marginLeft: level * 16 }}>
        <div
          className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-100 rounded ${
            file.isActive ? 'bg-blue-100 text-blue-700' : ''
          }`}
          onClick={() => file.type === 'file' && handleFileSelect(file)}
        >
          {file.type === 'folder' ? (
            <Folder className="w-4 h-4" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          <span className="text-sm">{file.name}</span>
        </div>
        {file.type === 'folder' && file.isOpen && file.children && (
          <div>{renderFileTree(file.children, level + 1)}</div>
        )}
      </div>
    ));
  };

  const renderChatMessage = (message: ChatMessage) => (
    <div key={message.id} className={`mb-4 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
      <div className={`inline-block max-w-[80%] p-3 rounded-lg ${
        message.type === 'user' 
          ? 'bg-blue-500 text-white' 
          : message.type === 'system'
          ? 'bg-gray-100 text-gray-700'
          : 'bg-gray-50 text-gray-900'
      }`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.metadata?.fileChanges && (
          <div className="mt-2 text-xs opacity-75">
            Files changed: {message.metadata.fileChanges.join(', ')}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {message.timestamp.toLocaleTimeString()}
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-bold">{session?.name || 'AI App Generator'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLayout('code')}
              className={`p-2 rounded ${layout === 'code' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLayout('split')}
              className={`p-2 rounded ${layout === 'split' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
            >
              <Split className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLayout('preview')}
              className={`p-2 rounded ${layout === 'preview' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunCode}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
          >
            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run
          </button>
          <button
            onClick={handleSaveProject}
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={handleDownloadProject}
            className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - File Explorer */}
        <div className="bg-white border-r border-gray-200" style={{ width: sidebarWidth }}>
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Files</h3>
              <button className="p-1 hover:bg-gray-100 rounded">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {renderFileTree(files)}
            </div>
          </div>
          
          {/* AI Chat */}
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-gray-900">AI Assistant</h3>
              </div>
            </div>
            
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              style={{ maxHeight: 'calc(100vh - 400px)' }}
            >
              {chat.map(renderChatMessage)}
              {isGenerating && (
                <div className="flex items-center gap-2 text-gray-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>AI is thinking...</span>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleChatSubmit()}
                  placeholder="Describe what you want to build..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isGenerating}
                />
                <button
                  onClick={handleChatSubmit}
                  disabled={!chatInput.trim() || isGenerating}
                  className="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Code Editor / Preview */}
        <div className={'flex-1 flex'}>
          {(layout === 'code' || layout === 'split') && (
            <div className={`${layout === 'split' ? 'w-1/2' : 'w-full'} border-r border-gray-200`}>
              <div className="h-full bg-white">
                {activeFile ? (
                  <MonacoEditor
                    height="100%"
                    language={activeFile.language || 'typescript'}
                    value={activeFile.content || ''}
                    onChange={handleCodeChange}
                    theme="vs-light"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      automaticLayout: true
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    Select a file to edit
                  </div>
                )}
              </div>
            </div>
          )}
          
          {(layout === 'preview' || layout === 'split') && (
            <div className={`${layout === 'split' ? 'w-1/2' : 'w-full'} bg-white`}>
              <div className="h-full">
                {previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full border-0"
                    title="App Preview"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <Eye className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>Run your code to see the preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}